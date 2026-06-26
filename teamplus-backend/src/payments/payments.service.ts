import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { isAdminRole } from "@/auth/constants/chldiv.constants";
import { PaymentWebhookService } from "./services/payment-webhook.service";
import { PaymentCreateService } from "./services/payment-create.service";
import {
  PaymentRefundService,
  RefundRequester,
} from "./services/payment-refund.service";
import { PaymentReceiptService } from "./services/payment-receipt.service";
import { TossPaymentsGateway } from "./toss-payments.gateway";
import { RedisService } from "@/redis/redis.service";
import { CreditDomainService } from "@/credits/credit-domain.service";
import { endOfMonthKst } from "@/common/billing/billing-date.util";
import { NotificationsService } from "@/notifications/notifications.service";
import { Logger } from "@nestjs/common";

export interface InitiatePaymentDto {
  productId: string;
  amount: number;
  paymentMethod?: string;
  quota?: number;
  buyerName?: string;
  buyerEmail?: string;
  buyerPhone?: string;
}

export interface CompletePaymentDto {
  tid: string;
  paymentStatus: string;
}

export interface RefundDto {
  refundAmount?: number;
  refundReason: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhookService: PaymentWebhookService,
    private readonly createService: PaymentCreateService,
    private readonly refundService: PaymentRefundService,
    private readonly receiptService: PaymentReceiptService,
    private readonly tossGateway: TossPaymentsGateway,
    private readonly redisService: RedisService,
    private readonly creditDomain: CreditDomainService, // PR-D 후속 (v0.8): 토스 confirm MemberCredit 발급
    private readonly notificationsService: NotificationsService, // [2026-06-19] 결제 완료 → 감독/코치 알림
  ) {}

  // ────────────────────────────────────────────────────────────────────
  //  토스페이먼츠 결제 승인 / Webhook 처리 (2026-05-13 신규)
  // ────────────────────────────────────────────────────────────────────

  /**
   * 토스 결제 승인.
   *  1) Payment row 조회 (orderId == orderNumber, userId == 학부모)
   *  2) 멱등성 락 — Redis `toss:confirm:{orderId}` 24h
   *  3) 금액 검증 — DB amount 와 paymentKey/amount 일치
   *  4) 토스 승인 API 호출 → response.status === 'DONE'
   *  5) Payment.status='completed' + tid=paymentKey + completedAt + paymentMethod
   *  6) 연결된 Enrollment.status='paid' + ClassRegistration upsert active
   *
   *  실패 시 BadRequestException, Frontend 가 사용자에게 안내 + 재시도 가능.
   */
  async confirmTossPayment(
    userId: string,
    body: { paymentKey: string; orderId: string; amount: number },
  ) {
    const { paymentKey, orderId, amount } = body;
    if (!paymentKey || !orderId || !amount || amount <= 0) {
      throw new BadRequestException(
        "paymentKey/orderId/amount 값이 유효하지 않습니다.",
      );
    }

    // 1) Payment row 조회 — product 정보 함께 select (PR-D 후속: MemberCredit 발급에 필요)
    const payment = await this.prisma.payment.findUnique({
      where: { orderNumber: orderId },
      select: {
        id: true,
        userId: true,
        amount: true,
        paymentStatus: true,
        productId: true,
        product: {
          select: {
            classId: true,
            durationDays: true,
            sessionsPerMonth: true,
            feeType: true,
            billingTiming: true,
          },
        },
      },
    });
    if (!payment) {
      throw new NotFoundException("주문 정보를 찾을 수 없습니다.");
    }
    if (payment.userId !== userId) {
      throw new ForbiddenException("본인 결제만 승인할 수 있습니다.");
    }
    if (payment.paymentStatus === "completed") {
      // 이미 승인된 결제 — 멱등성: 동일 응답 반환
      this.logger.log(
        `토스 confirm 멱등 응답 — orderId=${orderId} already completed`,
      );
      return { success: true, paymentId: payment.id, idempotent: true };
    }
    if (Math.abs(payment.amount - amount) > 0) {
      throw new BadRequestException(
        `결제 금액 불일치 — 주문 ${payment.amount}원, 요청 ${amount}원`,
      );
    }

    // 2) 멱등성 락 (Redis TTL 24h)
    const lockKey = `toss:confirm:${orderId}`;
    const lockTtl = 86400;
    const acquired = await this.redisService.setIfNotExists(
      lockKey,
      "1",
      lockTtl,
    );
    if (!acquired) {
      this.logger.warn(`토스 confirm 동시 호출 차단: orderId=${orderId}`);
      throw new BadRequestException(
        "결제 승인이 이미 진행 중입니다. 잠시 후 다시 시도해주세요.",
      );
    }

    try {
      // 3) 토스 승인 API 호출
      const tossResult = await this.tossGateway.confirm({
        paymentKey,
        orderId,
        amount,
      });

      if (tossResult.status !== "DONE") {
        throw new BadRequestException(
          `토스 결제 상태가 DONE 이 아닙니다: ${tossResult.status}`,
        );
      }
      if (tossResult.totalAmount !== amount) {
        throw new BadRequestException(
          `토스 응답 금액 불일치 — 응답 ${tossResult.totalAmount}원`,
        );
      }

      // 4) DB 갱신 — Payment 완료 + Enrollment paid + ClassRegistration active
      await this.prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            paymentStatus: "completed",
            tid: paymentKey,
            // [수정 2026-05-14] paymentMethod 는 PG 판별용 'toss' 로 유지 — cancel 시
            //   isTossPayment() 가 true 로 분기되어 KG 404 에러를 회피한다.
            //   토스 응답의 method detail(card/간편결제 등) 은 별도 컬럼이 필요해지면 분리 도입.
            paymentMethod: "toss",
            completedAt: new Date(tossResult.approvedAt ?? new Date()),
          },
        });
        // [Phase B-5-4] POSTPAID 후불 청구 라인 paid 처리 (해당 결제가 후불 청구면 — 아니면 no-op).
        await tx.monthlyPostpaidBillingLine.updateMany({
          where: { paymentId: payment.id },
          data: { paymentStatus: "paid" },
        });
        // Payment 와 연결된 enrollment 모두 paid 처리
        const enrollments = await tx.enrollment.findMany({
          where: { paymentId: payment.id },
          select: { id: true, classId: true, childId: true },
        });
        for (const e of enrollments) {
          await tx.enrollment.update({
            where: { id: e.id },
            data: {
              status: "paid",
              paidAt: new Date(tossResult.approvedAt ?? new Date()),
            },
          });
          // ClassRegistration active 보장 (코치가 미리 inactive 로 둔 경우 active 로 복구)
          await tx.classRegistration.upsert({
            where: {
              classId_userId: { classId: e.classId, userId: e.childId },
            },
            update: { status: "active" },
            create: {
              classId: e.classId,
              userId: e.childId,
              status: "active",
            },
          });
        }

        // PR-D 후속 (v0.8): MemberCredit 발급 — 토스 confirm 흐름 버그 수정
        //   - KG이니시스 webhook (payment-webhook.service.ts) 의 발급 로직과 정합
        //   - product 정보 (sessionsPerMonth/durationDays/classId) 가 있을 때만 발급
        //   - 발급 대상자: 첫 enrollment.childId 우선, 없으면 payment.userId (결제자 본인)
        //   - 토스 응답의 approvedAt 을 기준으로 expiresAt 계산
        // [B4 정합] 후불 상품(billingTiming=POSTPAID)은 크레딧 미발급 — 출석 횟수 × feePerSession
        //   으로 월말 정산. BOTH 수업의 후불 선택분이 토스 confirm 으로 오발급되지 않도록 차단.
        const isPostpaidProduct =
          payment.product?.billingTiming === "POSTPAID";

        if (
          payment.product &&
          payment.product.sessionsPerMonth > 0 &&
          !isPostpaidProduct
        ) {
          // [B7] 선불 정액(MONTHLY_FIXED) 수업권 만료 = 결제한 그 달 말일 23:59:59 (약관 §13).
          //   그 외 feeType 은 기존 정책 — durationDays + 미사용 회차 사용 30일.
          const MEMBER_CREDIT_EXTRA_USABLE_DAYS = 30;
          const approvedAt = new Date(tossResult.approvedAt ?? new Date());
          const expiresAt =
            payment.product.feeType === "MONTHLY_FIXED"
              ? endOfMonthKst(approvedAt)
              : (() => {
                  const durationDays = payment.product.durationDays ?? 28;
                  const e = new Date(approvedAt);
                  e.setDate(
                    e.getDate() + durationDays + MEMBER_CREDIT_EXTRA_USABLE_DAYS,
                  );
                  e.setHours(23, 59, 59, 999);
                  return e;
                })();

          const targetUserId = enrollments[0]?.childId ?? payment.userId;

          await this.creditDomain.issueFromPayment(tx, {
            paymentId: payment.id,
            userId: targetUserId,
            classId: payment.product.classId,
            sessions: payment.product.sessionsPerMonth,
            expiresAt,
            sourceLabel: `토스 결제 완료 - 수업권 발급 (주문번호: ${orderId})`,
          });

          this.logger.log(
            `토스 결제 수업권 발급 완료: targetUserId=${targetUserId}, classId=${payment.product.classId}, sessions=${payment.product.sessionsPerMonth}, expiresAt=${expiresAt.toISOString()}`,
          );
        } else if (payment.productId) {
          // product 가 있지만 sessionsPerMonth=0 — 대회 참가비 등 (정상)
          this.logger.log(
            `토스 결제 수업권 발급 skip: productId=${payment.productId} sessionsPerMonth=0 또는 product 없음 (대회 참가비 등)`,
          );
        }
        // [추가 2026-05-15] Payment 와 연결된 TournamentRegistration 모두 PAID 처리.
        //  · 대회 참가 결제 흐름: /tournaments/:id/payment/initiate → 토스 위젯 → confirm.
        //  · 결제 완료 시 학부모 자녀 캘린더에 대회가 자동 노출되도록 PAID 갱신.
        const tRegs = await tx.tournamentRegistration.findMany({
          where: { paymentId: payment.id },
          select: { id: true },
        });
        for (const r of tRegs) {
          await tx.tournamentRegistration.update({
            where: { id: r.id },
            data: { paymentStatus: "PAID" },
          });
        }
      });

      // [2026-06-19 사용자 직접 지시] 결제 완료 → 팀 감독/코치에게 결제 알림 (수업/대회).
      //   best-effort — 실패해도 결제 승인 흐름에 영향 없음.
      void this.notifyManagersOfCompletedPayment(payment.id, Number(amount)).catch(
        (err) =>
          this.logger.warn(
            `결제 완료 감독/코치 알림 실패: paymentId=${payment.id} ${(err as Error).message}`,
          ),
      );

      // 트랜잭션 완료 후 영수증 발급(best-effort) — 실패해도 결제 승인은 유지.
      //   토스 호스팅 영수증 URL(receipt.url)을 함께 저장한다.
      try {
        await this.receiptService.createReceipt(
          payment.id,
          tossResult.receipt?.url ?? null,
        );
      } catch (receiptErr) {
        this.logger.warn(
          `토스 결제 영수증 발급 실패(무시): orderId=${orderId} ${(receiptErr as Error).message}`,
        );
      }

      this.logger.log(
        `토스 결제 승인 완료: orderId=${orderId} amount=${amount} method=${tossResult.method}`,
      );
      return {
        success: true,
        paymentId: payment.id,
        orderId,
        amount,
        method: tossResult.method,
        receiptUrl: tossResult.receipt?.url ?? null,
        approvedAt: tossResult.approvedAt,
      };
    } catch (e) {
      // 승인 실패 시 락 해제 — 사용자 재시도 가능
      await this.redisService.del(lockKey);
      throw e;
    }
  }

  /**
   * [2026-06-19 사용자 직접 지시] 결제 완료 시 담당 감독에게 결제 알림 발송.
   *  - 수업 결제(선불 Enrollment + 후불 MonthlyPostpaidBillingLine) → Class 기준 라우팅:
   *      · 정규 수업(Class.teamId): 팀 감독/코치(notifyTeamManagers).
   *      · 오픈클래스(Class.academyId): 해당 아카데미 감독(ACADEMY_DIRECTOR)에게만 — 정규 감독/코치 제외.
   *  - 대회 결제(선불·후불 TournamentRegistration) → Tournament.teamId 팀 감독/코치.
   *  - notifyTeamManagers/notifyUsers 가 수신거부·실패를 내부 격리하므로 best-effort.
   *  - notificationType 은 'payment_success' (프론트 deriveCategory → '결제' 탭).
   */
  private async notifyManagersOfCompletedPayment(
    paymentId: string,
    amount: number,
  ): Promise<void> {
    const won = `₩${amount.toLocaleString("ko-KR")}`;
    const CLASS_SELECT = {
      select: {
        id: true,
        className: true,
        teamId: true,
        academyId: true,
      },
    } as const;

    // ── 수업 결제 대상 Class 수집 (선불 enrollment + 후불 청구 라인) ──
    const [enrollments, billingLines] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { paymentId },
        select: { class: CLASS_SELECT },
      }),
      this.prisma.monthlyPostpaidBillingLine.findMany({
        where: { paymentId },
        select: { billing: { select: { class: CLASS_SELECT } } },
      }),
    ]);
    const classMap = new Map<
      string,
      { className: string; teamId: string | null; academyId: string | null }
    >();
    for (const e of enrollments) {
      if (e.class) classMap.set(e.class.id, e.class);
    }
    for (const l of billingLines) {
      if (l.billing?.class) classMap.set(l.billing.class.id, l.billing.class);
    }

    for (const cls of classMap.values()) {
      if (cls.teamId) {
        // 정규 수업 → 팀 감독/코치.
        await this.notificationsService.notifyTeamManagers(cls.teamId, {
          notificationType: "payment_success",
          title: "수업 결제 알림",
          message: `"${cls.className}" 수업 결제가 완료되었어요. (${won})`,
        });
      } else if (cls.academyId) {
        // 오픈클래스 → 해당 아카데미 감독(ACADEMY_DIRECTOR)에게만 발송 (정규 감독/코치 제외).
        const academy = await this.prisma.academy.findUnique({
          where: { id: cls.academyId },
          select: { directorId: true },
        });
        if (academy?.directorId) {
          await this.notificationsService.notifyUsers([academy.directorId], {
            notificationType: "payment_success",
            title: "오픈클래스 결제 알림",
            message: `"${cls.className}" 오픈클래스 결제가 완료되었어요. (${won})`,
          });
        }
      }
    }

    // ── 대회 결제(선불·후불) → Tournament.teamId 팀 감독/코치 ──
    const tRegs = await this.prisma.tournamentRegistration.findMany({
      where: { paymentId },
      select: { tournament: { select: { name: true, teamId: true } } },
    });
    const tourTeams = new Map<string, string>(); // teamId -> tournamentName
    for (const r of tRegs) {
      if (r.tournament?.teamId) tourTeams.set(r.tournament.teamId, r.tournament.name);
    }
    for (const [teamId, name] of tourTeams) {
      await this.notificationsService.notifyTeamManagers(teamId, {
        notificationType: "payment_success",
        title: "대회 결제 알림",
        message: `"${name}" 대회 참가비 결제가 완료되었어요. (${won})`,
      });
    }
  }

  /**
   * 토스 Webhook 처리 — eventType 별 결제 상태 동기화.
   *  - PAYMENT_STATUS_CHANGED, CANCELED 등.
   *  webhook 은 보조 수단이므로 confirm 흐름이 주(主), webhook 은 누락 보완용.
   */
  async handleTossWebhook(body: {
    eventType?: string;
    data?: { paymentKey?: string; orderId?: string; status?: string };
  }) {
    const orderId = body.data?.orderId;
    const status = body.data?.status;
    if (!orderId) return;
    const payment = await this.prisma.payment.findUnique({
      where: { orderNumber: orderId },
      select: { id: true, paymentStatus: true },
    });
    if (!payment) {
      this.logger.warn(`토스 webhook: orderId=${orderId} 결제 없음 — 무시`);
      return;
    }
    if (status === "CANCELED" || status === "PARTIAL_CANCELED") {
      if (payment.paymentStatus !== "refunded") {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { paymentStatus: "refunded" },
        });
        this.logger.log(`토스 webhook 처리: orderId=${orderId} → refunded`);
      }
    }
    // DONE 은 confirm 에서 처리하므로 webhook 은 cancel 위주만 반영.
  }

  /**
   * @deprecated Phase B-3 — PaymentCreateService.initiatePayment 위임
   */
  async initiatePayment(
    userId: string,
    productId: string,
    amount: number,
    options?: {
      paymentMethod?: string;
      quota?: number;
      buyerName?: string;
      buyerEmail?: string;
      buyerPhone?: string;
      classId?: string;
      childId?: string;
    },
  ) {
    return this.createService.initiatePayment(
      userId,
      productId,
      amount,
      options,
    );
  }

  /**
   * [제거 2026-05-13] mockCompletePayment — DEV mock 자동 완료 폐기. 실 결제(토스/KG이니시스)만 사용.
   */

  /**
   * 결제 완료 처리 (KG이니시스 웹훅 콜백)
   *
   * Phase B-2 이관 (2026-04-30): PaymentWebhookService.completePayment 위임.
   * 컨트롤러 호환성 유지를 위해 시그니처는 동일.
   */
  async completePayment(webhookData: {
    orderNumber: string;
    tid: string;
    resultCode: string;
    amount: number;
    authCode?: string;
    signature?: string;
  }) {
    return this.webhookService.completePayment(webhookData);
  }

  /**
   * 결제 조회
   * IDOR 방지: ADMIN이 아닌 경우 본인의 결제만 조회 가능
   */
  /**
   * @deprecated Phase B-3 — PaymentCreateService.verifyPayment 위임
   */
  async verifyPayment(userId: string, orderNumber: string) {
    return this.createService.verifyPayment(userId, orderNumber);
  }

  async getPayment(
    paymentId: string,
    requestUserId?: string,
    requestUserType?: string,
  ) {
    // NEW-08 (2026-05-22 v8.1): include → select.
    //   실사용 9개 필드만 (id, userId, orderNumber, amount, paymentStatus,
    //   paymentMethod, tid, createdAt, completedAt + product) — Payment 의 PG 응답
    //   원문(paymentGatewayResponse), webhook 로그, 환불 메모, deletedAt 등 미사용 컬럼 제외.
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        userId: true,
        orderNumber: true,
        amount: true,
        paymentStatus: true,
        paymentMethod: true,
        tid: true,
        createdAt: true,
        completedAt: true,
        product: {
          select: {
            productName: true,
            price: true,
            sessionsPerMonth: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException("결제 기록을 찾을 수 없습니다.");
    }

    // 소유자 검증: ADMIN이 아닌 경우 본인의 결제만 조회 가능
    if (
      requestUserId &&
      requestUserType !== "ADMIN" &&
      payment.userId !== requestUserId
    ) {
      throw new ForbiddenException("해당 결제 정보에 접근할 권한이 없습니다.");
    }

    return {
      id: payment.id,
      orderNumber: payment.orderNumber,
      amount: payment.amount,
      paymentStatus: payment.paymentStatus,
      paymentMethod: payment.paymentMethod,
      tid: payment.tid,
      product: payment.product,
      createdAt: payment.createdAt,
      completedAt: payment.completedAt,
    };
  }

  /**
   * 사용자의 결제 이력 조회
   */
  async getUserPayments(userId: string, limit: number = 10) {
    // [수정 2026-05-13] pending/failed 제외 — 결제 시도만 하고 미완료된 row 가 다수 누적되어
    //   결제 내역 페이지에 동일 상품이 중복 노출되던 문제 차단.
    //   completed / refunded / partially_refunded / cancelled 만 사용자에게 의미 있음.
    const payments = await this.prisma.payment.findMany({
      where: {
        userId,
        paymentStatus: {
          in: ["completed", "refunded", "partially_refunded", "cancelled"],
        },
      },
      include: {
        product: {
          select: {
            productName: true,
            price: true,
          },
        },
        // [추가 2026-05-13] 본 결제와 연결된 Enrollment 의 class.className 노출 —
        //   결제내역 카드에서 "월 패키지" 위에 수업명 표시.
        enrollments: {
          select: {
            class: { select: { className: true } },
          },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return payments.map((payment) => ({
      id: payment.id,
      orderNumber: payment.orderNumber,
      amount: payment.amount,
      paymentStatus: payment.paymentStatus,
      productName: payment.product?.productName,
      className: payment.enrollments?.[0]?.class?.className ?? null,
      createdAt: payment.createdAt,
      completedAt: payment.completedAt,
    }));
  }

  /**
   * [신규 2026-05-14] 정산 개요 — admin 정산관리 "수업 결제 정산" 탭용.
   *
   * 전체 활성 팀 → 수업 → ClassRegistration/Enrollment 를 집계하여
   * 팀별 + 전체 합계의 결제완료/미납 금액·인원 통계를 반환한다.
   *  - paid 판정: ClassRegistration.status !== 'inactive' AND (Payment.completed OR Enrollment.status='paid')
   *  - paidAmount: 실제 Payment.amount 우선, 없으면 Enrollment.product.price, 그래도 없으면 수업 최저 상품가
   *  - unpaidAmount: 미납 학생의 추정 금액 (Enrollment.product.price 또는 수업 최저 상품가)
   *  - 수수료(3%)는 프론트에서 표시 계산 — 본 메서드는 raw 금액만 반환.
   */
  async getSettlementOverview() {
    const teams = await this.prisma.team.findMany({
      where: { isActive: true },
      select: { id: true, name: true, teamCode: true },
      orderBy: { name: "asc" },
    });
    const teamIds = teams.map((t) => t.id);

    const classes = await this.prisma.class.findMany({
      where: { teamId: { in: teamIds } },
      select: {
        id: true,
        teamId: true,
        products: { select: { price: true }, orderBy: { price: "asc" } },
      },
    });
    const classIds = classes.map((c) => c.id);

    const registrations = classIds.length
      ? await this.prisma.classRegistration.findMany({
          where: { classId: { in: classIds } },
          select: { id: true, classId: true, userId: true, status: true },
        })
      : [];

    const enrollments = classIds.length
      ? await this.prisma.enrollment.findMany({
          where: { classId: { in: classIds } },
          orderBy: { updatedAt: "desc" },
          select: {
            classId: true,
            childId: true,
            status: true,
            product: { select: { price: true } },
            payment: { select: { amount: true, paymentStatus: true } },
          },
        })
      : [];

    // classId:childId → 최신 enrollment
    const enrollMap = new Map<string, (typeof enrollments)[number]>();
    for (const e of enrollments) {
      const key = `${e.classId}:${e.childId}`;
      if (!enrollMap.has(key)) enrollMap.set(key, e);
    }

    const isPaid = (e: (typeof enrollments)[number] | undefined): boolean => {
      if (!e) return false;
      return e.payment?.paymentStatus === "completed" || e.status === "paid";
    };

    const classByTeam = new Map<string, typeof classes>();
    for (const c of classes) {
      // teamId 는 where 절로 teamIds 에 포함된 값만 조회되므로 사실상 non-null.
      //  Prisma 스키마 타입(string|null) 대응 위해 가드.
      if (!c.teamId) continue;
      const arr = classByTeam.get(c.teamId) ?? [];
      arr.push(c);
      classByTeam.set(c.teamId, arr);
    }
    const regByClass = new Map<string, typeof registrations>();
    for (const r of registrations) {
      const arr = regByClass.get(r.classId) ?? [];
      arr.push(r);
      regByClass.set(r.classId, arr);
    }

    const teamStats = teams.map((team) => {
      const teamClasses = classByTeam.get(team.id) ?? [];
      let paidAmount = 0;
      let unpaidAmount = 0;
      let paidCount = 0;
      let unpaidCount = 0;
      let studentCount = 0;
      for (const c of teamClasses) {
        const fallbackPrice = c.products[0]?.price
          ? Number(c.products[0].price)
          : 0;
        const regs = regByClass.get(c.id) ?? [];
        for (const reg of regs) {
          studentCount += 1;
          const e = enrollMap.get(`${c.id}:${reg.userId}`);
          const paid = reg.status !== "inactive" && isPaid(e);
          if (paid) {
            paidCount += 1;
            paidAmount +=
              e?.payment?.amount ??
              (e?.product?.price ? Number(e.product.price) : fallbackPrice);
          } else {
            unpaidCount += 1;
            unpaidAmount += e?.product?.price
              ? Number(e.product.price)
              : fallbackPrice;
          }
        }
      }
      return {
        teamId: team.id,
        teamName: team.name,
        teamCode: team.teamCode,
        classCount: teamClasses.length,
        studentCount,
        paidCount,
        unpaidCount,
        paidAmount,
        unpaidAmount,
        totalAmount: paidAmount + unpaidAmount,
      };
    });

    const totals = teamStats.reduce(
      (acc, t) => ({
        classCount: acc.classCount + t.classCount,
        studentCount: acc.studentCount + t.studentCount,
        paidCount: acc.paidCount + t.paidCount,
        unpaidCount: acc.unpaidCount + t.unpaidCount,
        paidAmount: acc.paidAmount + t.paidAmount,
        unpaidAmount: acc.unpaidAmount + t.unpaidAmount,
        totalAmount: acc.totalAmount + t.totalAmount,
      }),
      {
        classCount: 0,
        studentCount: 0,
        paidCount: 0,
        unpaidCount: 0,
        paidAmount: 0,
        unpaidAmount: 0,
        totalAmount: 0,
      },
    );

    return { totals, teams: teamStats };
  }

  /**
   * @deprecated Phase B-4 — PaymentRefundService.cancelPayment 위임
   */
  async cancelPayment(
    paymentId: string,
    cancelReason: string,
    cancelAmount?: number,
    refundBankCode?: string,
    refundAccount?: string,
    refundAccountHolder?: string,
    requester?: RefundRequester,
  ) {
    return this.refundService.cancelPayment(
      paymentId,
      cancelReason,
      cancelAmount,
      refundBankCode,
      refundAccount,
      refundAccountHolder,
      requester,
    );
  }

  /**
   * @deprecated Phase B-4 — PaymentRefundService.requestRefund 위임 (레거시)
   */
  async requestRefund(
    paymentId: string,
    refundReason: string,
    refundAmount?: number,
    requester?: RefundRequester,
  ) {
    return this.refundService.requestRefund(
      paymentId,
      refundReason,
      refundAmount,
      requester,
    );
  }

  /**
   * @deprecated Phase B-4 — PaymentRefundService.getRefundLogs 위임
   */
  async getRefundLogs(paymentId: string, requester?: RefundRequester) {
    return this.refundService.getRefundLogs(paymentId, requester);
  }

  /**
   * 결제 통계
   */
  async getPaymentStats(userId?: string) {
    const where = userId ? { userId } : {};

    // DB 레벨 집계: 전체 레코드 로드 없이 상태별 count + sum 단일 쿼리
    const statsByStatus = await this.prisma.payment.groupBy({
      by: ["paymentStatus"],
      _count: { id: true },
      _sum: { amount: true },
      where,
    });

    const countMap = new Map(
      statsByStatus.map((s) => [s.paymentStatus, s._count.id]),
    );
    const sumMap = new Map(
      statsByStatus.map((s) => [s.paymentStatus, Number(s._sum.amount ?? 0)]),
    );

    const totalPayments = statsByStatus.reduce(
      (acc, s) => acc + s._count.id,
      0,
    );
    const completedCount = countMap.get("completed") ?? 0;
    const failedCount = countMap.get("failed") ?? 0;
    const refundedCount = countMap.get("refunded") ?? 0;
    const totalRevenue = sumMap.get("completed") ?? 0;
    const totalRefunded = sumMap.get("refunded") ?? 0;

    return {
      totalPayments,
      completedCount,
      failedCount,
      refundedCount,
      totalRevenue,
      totalRefunded,
      netRevenue: totalRevenue - totalRefunded,
      successRate:
        totalPayments > 0
          ? ((completedCount / totalPayments) * 100).toFixed(1)
          : "0",
    };
  }

  /**
   * 일정 기간의 결제 통계
   * DB 레벨 집계 — findMany 전체 로드 대신 groupBy 단일 쿼리 사용
   */
  async getPaymentStatsByDateRange(startDate: Date, endDate: Date) {
    const statsByStatus = await this.prisma.payment.groupBy({
      by: ["paymentStatus"],
      _count: { id: true },
      _sum: { amount: true },
      where: {
        createdAt: { gte: startDate, lte: endDate },
      },
    });

    const totalPayments = statsByStatus.reduce(
      (acc, s) => acc + s._count.id,
      0,
    );
    const completedRow = statsByStatus.find(
      (s) => s.paymentStatus === "completed",
    );
    const completedCount = completedRow?._count.id ?? 0;
    const totalRevenue = Number(completedRow?._sum.amount ?? 0);

    return {
      startDate,
      endDate,
      totalPayments,
      completedCount,
      totalRevenue,
      averageOrderValue:
        totalPayments > 0 ? (totalRevenue / totalPayments).toFixed(0) : "0",
    };
  }

  /**
   * 클럽 결제 이력 조회
   */
  async getClubPayments(
    coachUserId: string,
    teamId: string,
    startDate?: Date,
    endDate?: Date,
    page: number = 1,
    limit: number = 20,
  ) {
    // [보안 수정 2026-05-21] 감독 확인 — CoachProfile 단독 부여 제거.
    //  가입 시 CoachProfile 이 pending TeamMember 와 함께 자동 생성되므로
    //  pending coach 도 통과하던 결함. owner 또는 approved 멤버만 통과.
    await this.assertTeamManager(
      coachUserId,
      teamId,
      "이 클럽의 감독만 결제 이력을 볼 수 있습니다.",
    );

    // 클럽 회원 목록 조회
    const members = await this.prisma.teamMember.findMany({
      where: { teamId, approvalStatus: "approved" },
      select: { userId: true },
    });

    const userIds = members.map((m) => m.userId);

    // 날짜 필터 구성
    const dateFilter: Record<string, Date> = {};
    if (startDate) dateFilter.gte = startDate;
    if (endDate) dateFilter.lte = endDate;

    const whereClause: import("@prisma/client").Prisma.PaymentWhereInput = {
      userId: { in: userIds },
      ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
    };

    // 전체 개수 조회
    const total = await this.prisma.payment.count({ where: whereClause });

    // 페이지네이션 적용
    const payments = await this.prisma.payment.findMany({
      where: whereClause,
      include: {
        product: {
          select: {
            productName: true,
            price: true,
          },
        },
        user: {
          select: {
            email: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      payments: payments.map((payment) => ({
        id: payment.id,
        orderNumber: payment.orderNumber,
        amount: payment.amount,
        paymentStatus: payment.paymentStatus,
        paymentMethod: payment.paymentMethod,
        productName: payment.product?.productName,
        userEmail: payment.user.email,
        createdAt: payment.createdAt,
        completedAt: payment.completedAt,
      })),
    };
  }

  /**
   * 회원별 결제 이력 조회
   */
  async getMemberPayments(
    memberId: string,
    limit: number = 20,
    requester?: { id: string; userType?: string },
  ) {
    // 회원 조회
    const member = await this.prisma.teamMember.findUnique({
      where: { id: memberId },
    });

    if (!member) {
      throw new NotFoundException("회원을 찾을 수 없습니다.");
    }

    // [2026-06-10 SECURITY] 소유권/클럽 스코프 검증 — 본인/부모/조직관리자/소속 코치만 조회.
    //   기존: TeamMember id 만으로 타인 결제 이력 열람 가능(IDOR).
    await this.assertCanViewMemberPayments(
      requester,
      member.userId,
      member.teamId,
    );

    const payments = await this.prisma.payment.findMany({
      where: { userId: member.userId },
      include: {
        product: {
          select: {
            productName: true,
            price: true,
            sessionsPerMonth: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return payments.map((payment) => ({
      id: payment.id,
      orderNumber: payment.orderNumber,
      amount: payment.amount,
      paymentStatus: payment.paymentStatus,
      paymentMethod: payment.paymentMethod,
      productName: payment.product?.productName,
      sessionsPerMonth: payment.product?.sessionsPerMonth,
      createdAt: payment.createdAt,
      completedAt: payment.completedAt,
    }));
  }

  /**
   * 클럽 결제 통계 조회
   */
  async getClubPaymentStats(
    coachUserId: string,
    teamId: string,
    startDate?: Date,
    endDate?: Date,
  ) {
    // [보안 수정 2026-05-21] 감독 확인 — CoachProfile 단독 부여 제거.
    await this.assertTeamManager(
      coachUserId,
      teamId,
      "이 클럽의 감독만 통계를 볼 수 있습니다.",
    );

    // 클럽 회원 목록 조회
    const members = await this.prisma.teamMember.findMany({
      where: { teamId, approvalStatus: "approved" },
      select: { userId: true },
    });

    const userIds = members.map((m) => m.userId);

    // 기본 날짜 범위 설정 (최근 30일)
    const now = new Date();
    const defaultStartDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const actualStartDate = startDate || defaultStartDate;
    const actualEndDate = endDate || now;

    // 결제 데이터 조회
    const payments = await this.prisma.payment.findMany({
      where: {
        userId: { in: userIds },
        createdAt: {
          gte: actualStartDate,
          lte: actualEndDate,
        },
      },
    });

    const completedPayments = payments.filter(
      (p) => p.paymentStatus === "completed",
    );
    const failedPayments = payments.filter((p) => p.paymentStatus === "failed");
    const refundedPayments = payments.filter(
      (p) =>
        p.paymentStatus === "refunded" ||
        p.paymentStatus === "partially_refunded",
    );

    const totalRevenue = completedPayments.reduce(
      (sum, p) => sum + p.amount,
      0,
    );
    const totalRefunded = refundedPayments.reduce(
      (sum, p) => sum + p.amount,
      0,
    );

    // 일별 통계
    const dailyStats: { [date: string]: { count: number; revenue: number } } =
      {};
    completedPayments.forEach((p) => {
      const date = p.createdAt.toISOString().split("T")[0];
      if (!dailyStats[date]) {
        dailyStats[date] = { count: 0, revenue: 0 };
      }
      dailyStats[date].count++;
      dailyStats[date].revenue += p.amount;
    });

    return {
      period: {
        startDate: actualStartDate,
        endDate: actualEndDate,
      },
      summary: {
        totalPayments: payments.length,
        completedCount: completedPayments.length,
        failedCount: failedPayments.length,
        refundedCount: refundedPayments.length,
        totalRevenue,
        totalRefunded,
        netRevenue: totalRevenue - totalRefunded,
        successRate:
          payments.length > 0
            ? ((completedPayments.length / payments.length) * 100).toFixed(1)
            : "0.0",
        averageOrderValue:
          completedPayments.length > 0
            ? Math.round(totalRevenue / completedPayments.length)
            : 0,
      },
      dailyStats: Object.entries(dailyStats)
        .map(([date, stats]) => ({
          date,
          ...stats,
        }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  /**
   * 관리자 전체 결제 목록 조회 (검색/필터/페이지네이션)
   */
  async getAdminPaymentList(params: {
    search?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }) {
    const { search, status, startDate, endDate, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const where: import("@prisma/client").Prisma.PaymentWhereInput = {};

    if (status) {
      where.paymentStatus = status;
    }

    if (startDate || endDate) {
      where.createdAt = {
        ...(startDate && { gte: startDate }),
        ...(endDate && { lte: endDate }),
      };
    }

    // 검색어: 주문번호 또는 사용자 이메일
    if (search) {
      where.OR = [
        { orderNumber: { contains: search } },
        { user: { email: { contains: search } } },
      ];
    }

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        select: {
          id: true,
          orderNumber: true,
          amount: true,
          paymentStatus: true,
          paymentMethod: true,
          tid: true,
          createdAt: true,
          completedAt: true,
          user: {
            select: {
              id: true,
              email: true,
              phone: true,
            },
          },
          product: {
            select: {
              productName: true,
              price: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      data: payments.map((p) => ({
        id: p.id,
        orderNumber: p.orderNumber,
        amount: p.amount,
        paymentStatus: p.paymentStatus,
        paymentMethod: p.paymentMethod,
        tid: p.tid,
        userId: p.user.id,
        userEmail: p.user.email,
        userPhone: p.user.phone,
        productName: p.product?.productName ?? null,
        createdAt: p.createdAt,
        completedAt: p.completedAt,
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 관리자 결제 통계 (날짜 필터 지원)
   */
  async getAdminPaymentStats(params: { startDate?: Date; endDate?: Date }) {
    const { startDate, endDate } = params;

    const where: import("@prisma/client").Prisma.PaymentWhereInput = {};

    if (startDate || endDate) {
      where.createdAt = {
        ...(startDate && { gte: startDate }),
        ...(endDate && { lte: endDate }),
      };
    }

    const statsByStatus = await this.prisma.payment.groupBy({
      by: ["paymentStatus"],
      _count: { id: true },
      _sum: { amount: true },
      where,
    });

    const countMap = new Map(
      statsByStatus.map((s) => [s.paymentStatus, s._count.id]),
    );
    const sumMap = new Map(
      statsByStatus.map((s) => [s.paymentStatus, Number(s._sum.amount ?? 0)]),
    );

    const totalPayments = statsByStatus.reduce(
      (acc, s) => acc + s._count.id,
      0,
    );
    const completedCount = countMap.get("completed") ?? 0;
    const failedCount = countMap.get("failed") ?? 0;
    const refundedCount = countMap.get("refunded") ?? 0;
    const totalRevenue = sumMap.get("completed") ?? 0;
    const totalRefunded = sumMap.get("refunded") ?? 0;

    return {
      totalPayments,
      completedCount,
      failedCount,
      refundedCount,
      totalRevenue,
      totalRefunded,
      netRevenue: totalRevenue - totalRefunded,
      successRate:
        totalPayments > 0
          ? ((completedCount / totalPayments) * 100).toFixed(1)
          : "0",
    };
  }

  /**
   * 수업 상품 단건 조회 (결제 미리보기용)
   */
  /**
   * @deprecated Phase B-3 — PaymentCreateService.getClassProduct 위임
   */
  async getClassProduct(productId: string) {
    return this.createService.getClassProduct(productId);
  }

  /**
   * feeType별 결제 금액 계산
   * MONTHLY_FIXED: sessionsPerWeek × feePerSession × 4주
   * PER_SESSION: 상품 기본 가격 (선결제) 또는 출석횟수 × 회당단가 (후결제)
   * PER_GAME: 상품 기본 가격
   */
  /**
   * @deprecated Phase B-3 — PaymentCreateService.calculateFee 위임
   */
  async calculateFee(
    classId: string,
    feeType: string,
    attendanceCount?: number,
  ): Promise<{ amount: number; description: string }> {
    return this.createService.calculateFee(classId, feeType, attendanceCount);
  }

  // ==================== 정산 승인/지급 워크플로우 ====================

  /**
   * @deprecated Phase B-5 — PaymentReceiptService.getSettlementList 위임
   */
  async getSettlementList(params: {
    search?: string;
    status?: string;
    month?: string;
    page?: number;
    limit?: number;
  }) {
    return this.receiptService.getSettlementList(params);
  }

  /**
   * @deprecated Phase B-5 — PaymentReceiptService.getSettlementDetail 위임
   */
  async getSettlementDetail(settlementId: string) {
    return this.receiptService.getSettlementDetail(settlementId);
  }

  /**
   * @deprecated Phase B-5 — PaymentReceiptService.approveSettlement 위임
   */
  async approveSettlement(settlementId: string, adminUserId: string) {
    return this.receiptService.approveSettlement(settlementId, adminUserId);
  }

  /**
   * @deprecated Phase B-5 — PaymentReceiptService.completeSettlement 위임
   */
  async completeSettlement(settlementId: string, adminUserId: string) {
    return this.receiptService.completeSettlement(settlementId, adminUserId);
  }

  /**
   * @deprecated Phase B-5 — PaymentReceiptService.rejectSettlement 위임
   */
  async rejectSettlement(
    settlementId: string,
    adminUserId: string,
    reason: string,
  ) {
    return this.receiptService.rejectSettlement(
      settlementId,
      adminUserId,
      reason,
    );
  }

  // ==================== 영수증 관리 ====================

  /**
   * @deprecated Phase B-5 — PaymentReceiptService.getReceipt 위임
   */
  async getReceipt(
    paymentId: string,
    requesterId: string,
    requesterType: string,
  ) {
    return this.receiptService.getReceipt(paymentId, requesterId, requesterType);
  }

  /**
   * 영수증 다운로드 URL 조회 — 토스 호스팅 영수증 URL 반환.
   *
   * 1) 저장된 receiptUrl 있으면 즉시 반환.
   * 2) 없으면 완료 결제에 한해 토스 결제조회 API(tid=paymentKey)로 URL 사후 보충 후 저장·반환.
   * 소유자 검증(IDOR 방지): 본인 결제 또는 관리자급(ADMIN/DIRECTOR/COACH/ACADEMY_DIRECTOR)만 허용.
   */
  async getReceiptDownloadUrl(
    paymentId: string,
    requesterId: string,
    requesterType: string,
  ): Promise<{ downloadUrl: string }> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        userId: true,
        tid: true,
        paymentStatus: true,
        receipt: { select: { receiptUrl: true } },
      },
    });

    if (!payment) {
      throw new NotFoundException("결제 정보를 찾을 수 없습니다.");
    }

    const MANAGER_TYPES = ["ADMIN", "DIRECTOR", "COACH", "ACADEMY_DIRECTOR"];
    if (
      payment.userId !== requesterId &&
      !MANAGER_TYPES.includes(requesterType)
    ) {
      throw new ForbiddenException("해당 결제 정보에 접근할 권한이 없습니다.");
    }

    // 1) 이미 저장된 영수증 URL.
    if (payment.receipt?.receiptUrl) {
      return { downloadUrl: payment.receipt.receiptUrl };
    }

    // 2) 사후 보충 — 완료 결제 + tid(=토스 paymentKey) 있을 때 토스에서 영수증 URL 조회.
    if (payment.paymentStatus === "completed" && payment.tid) {
      let url: string | null = null;
      try {
        const toss = await this.tossGateway.getPayment(payment.tid);
        url = toss.receipt?.url ?? null;
      } catch (e) {
        this.logger.warn(
          `토스 영수증 URL 조회 실패: paymentId=${paymentId} ${(e as Error).message}`,
        );
      }
      if (url) {
        // 영수증 레코드 보장 + URL 저장(멱등).
        await this.receiptService.createReceipt(paymentId, url);
        return { downloadUrl: url };
      }
    }

    throw new NotFoundException("발급된 영수증 URL이 없습니다.");
  }

  /**
   * @deprecated Phase B-5 — PaymentReceiptService.createReceipt 위임
   */
  async createReceipt(paymentId: string) {
    return this.receiptService.createReceipt(paymentId);
  }

  /**
   * 팀 관리 권한 검증 (2026-05-21 보안 수정).
   *
   * `TeamsService.assertTeamManagerPermission` 과 동일 정책 — owner 또는 approved 멤버만.
   * CoachProfile 단독으로 권한 부여하지 않음 (가입 시 pending 과 함께 자동 생성되어 보안 우회 결함).
   * payments 모듈은 TeamsService 의존성을 피하기 위해 동일 로직 inline 으로 복제.
   */
  /**
   * [2026-06-10 SECURITY] 회원 결제 이력 조회 권한 검증 (IDOR 차단).
   *   본인 / 부모-자녀 / 조직 관리자 / 소속 클럽 코치만 조회 가능.
   */
  private async assertCanViewMemberPayments(
    requester: { id: string; userType?: string } | undefined,
    targetUserId: string,
    teamId: string | null | undefined,
  ): Promise<void> {
    if (!requester?.id) {
      throw new ForbiddenException("결제 이력을 조회할 권한이 없습니다.");
    }
    if (requester.id === targetUserId) return;
    if (
      isAdminRole(requester.userType) ||
      requester.userType === "DIRECTOR" ||
      requester.userType === "ACADEMY_DIRECTOR"
    ) {
      return;
    }

    // 부모-자녀 관계
    const parentChild = await this.prisma.parentChild.findUnique({
      where: {
        parentId_childId: { parentId: requester.id, childId: targetUserId },
      },
      select: { id: true },
    });
    if (parentChild) return;

    // 소속 클럽 코치
    if (requester.userType === "COACH" && teamId) {
      const [owner, approvedCoach] = await Promise.all([
        this.prisma.team.findFirst({
          where: { id: teamId, coachId: requester.id },
          select: { id: true },
        }),
        this.prisma.teamMember.findFirst({
          where: {
            userId: requester.id,
            teamId,
            approvalStatus: "approved",
            leftAt: null,
            roleInTeam: { in: ["HEAD_COACH", "COACH", "MANAGER"] },
          },
          select: { id: true },
        }),
      ]);
      if (owner || approvedCoach) return;
    }

    throw new ForbiddenException("해당 회원의 결제 이력을 조회할 권한이 없습니다.");
  }

  private async assertTeamManager(
    userId: string,
    teamId: string,
    failureMessage: string,
  ): Promise<void> {
    const [ownedTeam, approvedMember] = await Promise.all([
      this.prisma.team.findFirst({
        where: { id: teamId, coachId: userId },
        select: { id: true },
      }),
      this.prisma.teamMember.findFirst({
        where: {
          userId,
          teamId,
          approvalStatus: "approved",
          leftAt: null,
          roleInTeam: { in: ["HEAD_COACH", "COACH", "MANAGER"] },
        },
        select: { id: true },
      }),
    ]);
    if (!ownedTeam && !approvedMember) {
      throw new ForbiddenException(failureMessage);
    }
  }

  // calculateAgeFromBirthDate → @/common/utils/age.util 의 calculateKoreanAge 로 통합 (중복 제거)
}
