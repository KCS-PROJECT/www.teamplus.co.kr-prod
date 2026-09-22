import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import {
  applyPaymentToEnrollments,
  applyPaymentToTournamentRegistrations,
  isOrphanPayment,
  PAYMENT_APPLICABLE_ENROLLMENT_STATUSES,
  recordOrphanPaymentRefundRequest,
} from "./services/payment-enrollment-transition.util";
import { isAdminRole } from "@/auth/constants/chldiv.constants";
import { PaymentWebhookService } from "./services/payment-webhook.service";
import { PaymentCreateService } from "./services/payment-create.service";
import {
  PaymentRefundService,
  RefundRequester,
  RefundExecutionContext,
} from "./services/payment-refund.service";
import { PaymentReceiptService } from "./services/payment-receipt.service";
import { deriveSource } from "./payment-source.util";
import { buildAdminTeamPaymentSummaries } from "./admin-team-payment-summary.util";
import { TossPaymentsGateway } from "./toss-payments.gateway";
import {
  NicePaymentsGateway,
  NiceApproveAmbiguousError,
} from "./nice-payments.gateway";
import {
  NiceStdPaymentsGateway,
  NiceStdApproveAmbiguousError,
  buildNiceStdReceiptUrl,
} from "./nice-std-payments.gateway";
import { RedisService } from "@/redis/redis.service";
import { resolveActivePaymentProvider } from "./payment-provider.util";
import type { PaymentProviderCode } from "./constants/payment-provider.constant";
import {
  CreditDomainService,
  resolveCreditExpiry,
} from "@/credits/credit-domain.service";
import { NotificationsService } from "@/notifications/notifications.service";
import { kstCompactToInstant } from "@/common/utils/kst-date.util";
import { JwtUserPayload } from "@/common/interfaces/authenticated-request.interface";
import { acquireClassSeatLock } from "@/classes/utils/class-locks.util";
import { resolveRefundRequestRecipients } from "./refund-requests/refund-request-recipients.util";
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

/**
 * 승인 후처리(applyApprovedPayment) 입력 — confirm/mock 이 동일 select 로 조회하는 Payment 형태.
 */
type ConfirmPaymentRow = import("@prisma/client").Prisma.PaymentGetPayload<{
  select: {
    id: true;
    userId: true;
    amount: true;
    paymentStatus: true;
    productId: true;
    product: {
      select: {
        classId: true;
        durationDays: true;
        sessionsPerMonth: true;
        feeType: true;
        billingTiming: true;
        billingMonth: true;
      };
    };
  };
}>;

/** [정원 선점] 승인 실패 원복용 스냅샷 — prevStatus null = 선점 전 행 없음(삭제로 원상 복귀). */
type SeatClaim = {
  classId: string;
  userId: string;
  prevStatus: string | null;
};

/** 결제 담당자 알림 수신 대상 — 완료 알림과 사고 경보가 공유한다. */
type PaymentManagerTarget =
  | {
      kind: "team";
      teamId: string;
      scope: "class" | "tournament";
      subject: string;
      linkUrl: string;
    }
  | {
      kind: "users";
      userIds: string[];
      scope: "academy";
      subject: string;
      linkUrl: string;
    };

/**
 * 승인 결과도 망취소 결과도 확인하지 못한 상태.
 *  컨트롤러가 이 예외만 `result_pending` 리다이렉트로 매핑한다 — 일반 승인 실패와
 *  구분하지 않으면 사용자가 재결제를 시도해 이중 결제가 된다.
 */
export class NiceStdResultPendingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NiceStdResultPendingError";
  }
}

/**
 * 승인이 성사되지 않았음이 확인된 상태(망취소 성공 · 거래조회 취소/거래없음).
 *  돈이 나가지 않았으므로 사용자는 그대로 다시 결제하면 된다.
 */
export class NiceStdPaymentVoidedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NiceStdPaymentVoidedError";
  }
}

/** 승인 모호 해소 결과 — 승인이 확인됐거나(후처리 진행), 취소가 확인됐거나(재결제 안내). */
type AmbiguousApprovalOutcome =
  | { kind: "voided" }
  | { kind: "approved"; tid: string; approvedAt?: Date };

/** 조회 전 대기 — 나이스 원장에 승인이 반영될 시간을 준다. */
const NICESTD_INQUIRY_DELAY_MS = 1500;
/**
 * 해소 단계 호출 타임아웃 — 사용자가 결과 화면을 기다리는 중이라 기본 30초로는 길다.
 * 승인 30 + 망취소 8 + 대기 1.5 + 조회 8 ≈ 48초가 최악이다.
 */
const NICESTD_RESOLVE_TIMEOUT_MS = 8000;

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
    private readonly niceGateway: NicePaymentsGateway,
    private readonly niceStdGateway: NiceStdPaymentsGateway,
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
            billingMonth: true,
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
    // 취소된 결제 요청 승인 차단 — 취소(예: 후불 결제요청 취소) 후 옛 알림 링크로
    //   결제가 진행되면 등록 연결이 끊긴 채 돈만 나가는 상태가 되므로 서버가 최종 거부.
    //   재시도 흐름은 항상 새 orderNumber 발급이라 정상 결제에는 영향 없다.
    if (payment.paymentStatus === "cancelled") {
      throw new BadRequestException(
        "취소된 결제 요청입니다. 최신 결제 요청을 확인해주세요.",
      );
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

    let seatClaims: SeatClaim[] = [];
    let captured = false;
    try {
      // 2.5) [정원 선점] 승인(캡처) 전 좌석 원자 확보 — 초과 시 돈이 나가기 전에 거부.
      seatClaims = await this.claimSeatsBeforeApproval(payment.id);

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
      // 캡처 확정 — 이후 실패(후처리 오류)는 돈이 이미 나간 상태라 좌석을 유지한다
      //   (재시도로 후처리 완결이 정상 경로, 좌석 회수는 환불 플로우의 몫).
      captured = true;

      // 4) DB 갱신 — Payment 완료 + Enrollment paid + ClassRegistration active + MemberCredit 발급.
      //    실결제·mock 공용 후처리(applyApprovedPayment)로 위임 — 토스 승인만 confirm 고유.
      await this.applyApprovedPayment(payment, {
        paymentMethod: "toss",
        pgProvider: "toss",
        tid: paymentKey,
        approvedAt: new Date(tossResult.approvedAt ?? new Date()),
        orderId,
        claimFrom: ["pending", "cancelled"],
      });

      // [2026-06-19 사용자 직접 지시] 결제 완료 → 팀 감독/코치에게 결제 알림 (수업/대회).
      //   best-effort — 실패해도 결제 승인 흐름에 영향 없음.
      void this.notifyManagersOfCompletedPayment(
        payment.id,
        Number(amount),
      ).catch((err) =>
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
      // 캡처 전 실패(정원 마감·승인 거부·금액 불일치)만 좌석 원복 — 보상 트랜잭션.
      if (!captured) {
        await this.releaseClaimedSeats(seatClaims);
      }
      // 승인 실패 시 락 해제 — 사용자 재시도 가능
      await this.redisService.del(lockKey);
      throw e;
    }
  }

  /**
   * 활성 결제사 조회 — 결제 화면이 어느 PG SDK 를 띄울지 결정하는 데 쓴다.
   *
   *  결제사는 서버가 정한다(AppSettings.paymentProvider). 클라이언트가 임의로 고를 수 없어야
   *  하므로 화면은 이 값을 "조회"만 하고, 실제 Payment.pgProvider 는 initiate 가 서버에서
   *  다시 해석해 기록한다 — 화면이 거짓말을 해도 결제 원장은 오염되지 않는다.
   *
   *  민감정보가 아니라 공개 조회로 둔다(결제창을 열면 어느 PG 인지 어차피 드러난다).
   */
  async getActivePaymentProvider(): Promise<{ provider: PaymentProviderCode }> {
    const provider = await resolveActivePaymentProvider(
      this.prisma,
      this.redisService,
    );
    return { provider };
  }

  // ────────────────────────────────────────────────────────────────────
  //  나이스페이먼츠 결제 승인 / Webhook 처리 (2026-08-27 신규)
  //  토스와 병행. 활성 결제사는 AppSettings.paymentProvider 가 결정한다.
  // ────────────────────────────────────────────────────────────────────

  /**
   * 나이스 결제 승인 (Server 승인 모델).
   *  1) Payment row 조회 (orderId == orderNumber)
   *  2) 멱등성 락 — Redis `nice:confirm:{orderId}` 24h
   *  3) 금액 검증 — DB amount 와 인증 결과 amount 일치
   *  4) 나이스 승인 API 호출 → resultCode '0000' && status 'paid'
   *  5) 응답 signature 재검증 → applyApprovedPayment 로 공용 후처리
   *
   *  ⚠️ 토스와 달리 userId 인자가 없다. 이 흐름은 결제창이 returnUrl 로 보내는
   *    브라우저 form POST 가 기점이라 Authorization 헤더가 실리지 않는다. 대신
   *    ① 인증 signature(SecretKey 없이는 위조 불가) ② orderNumber(UUID) 조회
   *    ③ 서버 보관 금액과의 대조 로 정당성을 확인한다. 컨트롤러가 ①을 이미 통과시킨
   *    요청만 여기로 넘긴다.
   *
   *  ⚠️ 승인 결과 미확정(read-timeout 등)은 반드시 망취소로 해소한다. 그대로 두면
   *    승인은 됐는데 우리 DB 는 pending 인 미매칭 거래가 남는다(유효기간 1시간).
   */
  async confirmNicePayment(body: {
    tid: string;
    orderId: string;
    amount: number;
  }) {
    const { tid, orderId, amount } = body;
    if (!tid || !orderId || !amount || amount <= 0) {
      throw new BadRequestException(
        "tid/orderId/amount 값이 유효하지 않습니다.",
      );
    }

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
            billingMonth: true,
          },
        },
      },
    });
    if (!payment) {
      throw new NotFoundException("주문 정보를 찾을 수 없습니다.");
    }
    if (payment.paymentStatus === "completed") {
      this.logger.log(
        `나이스 confirm 멱등 응답 — orderId=${orderId} already completed`,
      );
      return { success: true, paymentId: payment.id, idempotent: true };
    }
    if (payment.paymentStatus === "cancelled") {
      throw new BadRequestException(
        "취소된 결제 요청입니다. 최신 결제 요청을 확인해주세요.",
      );
    }
    if (Math.abs(payment.amount - amount) > 0) {
      throw new BadRequestException(
        `결제 금액 불일치 — 주문 ${payment.amount}원, 요청 ${amount}원`,
      );
    }

    const lockKey = `nice:confirm:${orderId}`;
    const acquired = await this.redisService.setIfNotExists(
      lockKey,
      "1",
      86400,
    );
    if (!acquired) {
      this.logger.warn(`나이스 confirm 동시 호출 차단: orderId=${orderId}`);
      throw new BadRequestException(
        "결제 승인이 이미 진행 중입니다. 잠시 후 다시 시도해주세요.",
      );
    }

    let seatClaims: SeatClaim[] = [];
    let captured = false;
    try {
      // 승인(캡처) 전 좌석 원자 확보 — 초과 시 돈이 나가기 전에 거부(토스와 동일 정책).
      seatClaims = await this.claimSeatsBeforeApproval(payment.id);

      const result = await this.niceGateway.approve({ tid, amount, orderId });

      if (result.status !== "paid") {
        throw new BadRequestException(
          `나이스 결제 상태가 paid 가 아닙니다: ${result.status}`,
        );
      }
      if (result.amount !== amount) {
        throw new BadRequestException(
          `나이스 응답 금액 불일치 — 응답 ${result.amount}원`,
        );
      }
      // 응답 위변조 검증 — 승인 성공 건에만 signature 가 내려온다.
      //   검증 실패는 캡처 전 실패로 다루지 않는다(이미 승인된 상태일 수 있음) → 격리 대상.
      if (result.signature && result.ediDate) {
        const valid = this.niceGateway.verifyResultSignature({
          tid: result.tid,
          amount: result.amount,
          ediDate: result.ediDate,
          signature: result.signature,
        });
        if (!valid) {
          this.logger.error(
            `[NICE_SIGNATURE_MISMATCH] 승인 응답 서명 불일치 — orderId=${orderId} tid=${result.tid}`,
          );
          throw new BadRequestException(
            "결제 응답 검증에 실패했습니다. 고객센터로 문의해주세요.",
          );
        }
      } else {
        // 서명 미응답은 매뉴얼상 "유효 거래건에 한하여 응답" 의 이면 —
        //   승인은 성공했는데 서명이 없다면 후속 대사 대상으로 남긴다(결제는 진행).
        this.logger.warn(
          `나이스 승인 응답에 signature 없음 — orderId=${orderId} (대사 대상)`,
        );
      }
      captured = true;

      await this.applyApprovedPayment(payment, {
        paymentMethod: "nice",
        pgProvider: "nice",
        tid: result.tid,
        approvedAt: this.parseNicePaidAt(result.paidAt),
        orderId,
        claimFrom: ["pending", "cancelled"],
      });

      void this.notifyManagersOfCompletedPayment(
        payment.id,
        Number(amount),
      ).catch((err) =>
        this.logger.warn(
          `결제 완료 감독/코치 알림 실패: paymentId=${payment.id} ${(err as Error).message}`,
        ),
      );

      try {
        await this.receiptService.createReceipt(
          payment.id,
          result.receiptUrl ?? null,
        );
      } catch (receiptErr) {
        this.logger.warn(
          `나이스 결제 영수증 발급 실패(무시): orderId=${orderId} ${(receiptErr as Error).message}`,
        );
      }

      this.logger.log(
        `나이스 결제 승인 완료: orderId=${orderId} amount=${amount} method=${result.payMethod}`,
      );
      return {
        success: true,
        paymentId: payment.id,
        orderId,
        amount,
        method: result.payMethod,
        receiptUrl: result.receiptUrl ?? null,
        approvedAt: result.paidAt,
      };
    } catch (e) {
      if (!captured) {
        await this.releaseClaimedSeats(seatClaims);
      }
      await this.redisService.del(lockKey);

      // 승인 결과 미확정 → 망취소로 해소(1시간 제한). 실패해도 원 예외를 삼키지 않는다.
      if (e instanceof NiceApproveAmbiguousError) {
        try {
          await this.niceGateway.netCancel({ orderId: e.orderId });
          this.logger.warn(
            `[NICE_NETCANCEL] 승인 미확정 거래 망취소 완료: orderId=${e.orderId}`,
          );
        } catch (ncErr) {
          // 망취소까지 실패하면 사람이 봐야 한다 — 승인됐는데 DB 는 pending 인 거래가 남는다.
          this.logger.error(
            `[NICE_NETCANCEL_FAILED] 수동 확인 필요: orderId=${e.orderId} ${(ncErr as Error).message}`,
          );
        }
        throw new BadRequestException(
          "결제 결과를 확인하지 못했습니다. 중복 결제를 방지하기 위해 취소 처리했습니다. 다시 시도해주세요.",
        );
      }
      throw e;
    }
  }

  /**
   * 나이스 paidAt 파싱 — 결제완료가 아니면 문자열 "0" 이 온다.
   *  그대로 new Date("0") 하면 Invalid Date 가 되어 Prisma 가 던지므로 방어한다.
   */
  private parseNicePaidAt(paidAt?: string): Date {
    if (!paidAt || paidAt === "0") return new Date();
    const d = new Date(paidAt);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }

  /**
   * 나이스 Webhook 처리 — 결제 상태 동기화.
   *  webhook 은 보조 수단이다. 카드 결제는 authorize 흐름이 주(主)이고,
   *  webhook 은 ① 취소 반영 ② 가상계좌 입금 통지 ③ 승인 응답 유실 보완 용도다.
   *
   *  서명 검증은 컨트롤러가 이미 수행한 뒤 호출한다.
   */
  async handleNiceWebhook(body: {
    tid?: string;
    orderId?: string;
    status?: string;
    amount?: number;
  }) {
    const { orderId, status } = body;
    if (!orderId) return;
    const payment = await this.prisma.payment.findUnique({
      where: { orderNumber: orderId },
      select: { id: true, paymentStatus: true },
    });
    if (!payment) {
      this.logger.warn(`나이스 webhook: orderId=${orderId} 결제 없음 — 무시`);
      return;
    }
    if (status === "cancelled" || status === "partialCancelled") {
      if (payment.paymentStatus !== "refunded") {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { paymentStatus: "refunded" },
        });
        this.logger.log(`나이스 webhook 처리: orderId=${orderId} → refunded`);
      }
      return;
    }
    // 'paid' 는 authorize 흐름에서 처리되므로 여기서는 미확정 건만 보완 기록한다.
    //   가상계좌 입금(vbank) 완료 처리는 결제수단 도입 시 이 지점에 추가한다.
    if (status === "paid" && payment.paymentStatus === "pending") {
      this.logger.warn(
        `[NICE_WEBHOOK_PAID] 승인 응답 유실 의심 — orderId=${orderId} 는 나이스 기준 paid 이나 DB 는 pending. 대사 대상.`,
      );
    }
  }

  // ────────────────────────────────────────────────────────────────────
  //  나이스페이먼츠 구모듈(표준결제) 승인 / 결제통보 처리
  //  신모듈(위 confirmNicePayment)과 정책은 같고 프로토콜만 다르다.
  //  공통 정책(좌석 선점·격리·후처리)을 고칠 때는 두 경로를 함께 고친다.
  // ────────────────────────────────────────────────────────────────────

  /**
   * 구모듈 결제창 폼 필드 생성 — 컨트롤러의 `/payments/nicestd/sign` 이 호출한다.
   *
   *  금액·상품명은 클라이언트 입력을 쓰지 않고 주문번호로 서버에서 복원한다.
   *  `BuyerEmail` 은 넣지 않는다 — `users.email` 은 로그인 ID 라 외부 PG 에 이메일로
   *  전달하면 안 된다.
   */
  async buildNiceStdPayRequest(params: {
    orderNumber: string;
    userId: string;
    payMethod: "CARD" | "BANK";
    wapUrl?: string;
    ispCancelUrl?: string;
  }) {
    const { orderNumber, userId, payMethod } = params;
    if (!this.niceStdGateway.isConfigured()) {
      throw new ServiceUnavailableException(
        "나이스 구모듈 결제 설정이 없어 결제를 시작할 수 없습니다.",
      );
    }

    const payment = await this.prisma.payment.findUnique({
      where: { orderNumber },
      select: {
        id: true,
        userId: true,
        amount: true,
        paymentStatus: true,
        product: { select: { productName: true } },
        user: { select: { firstName: true, lastName: true, phone: true } },
      },
    });
    // 남의 주문번호로 서명을 받아가지 못하도록, 소유자가 아니면 존재 여부도 알리지 않는다.
    if (!payment || payment.userId !== userId) {
      throw new NotFoundException("주문 정보를 찾을 수 없습니다.");
    }
    if (payment.paymentStatus !== "pending") {
      throw new BadRequestException(
        "결제를 진행할 수 없는 주문입니다. 최신 결제 요청을 확인해주세요.",
      );
    }

    const goodsName = await this.resolveGoodsName(
      payment.id,
      payment.product?.productName ?? null,
    );

    return this.niceStdGateway.buildPayRequest({
      orderNumber,
      amount: Number(payment.amount),
      goodsName,
      payMethod,
      buyerName:
        `${payment.user?.lastName ?? ""}${payment.user?.firstName ?? ""}`.trim() ||
        undefined,
      buyerTel: payment.user?.phone?.replace(/\D/g, "") || undefined,
      wapUrl: params.wapUrl,
      ispCancelUrl: params.ispCancelUrl,
    });
  }

  /**
   * 결제창에 띄울 상품명 — 상품 → 대회 → 후불 청구 순으로 서버에서 파생한다.
   *  대회·후불 결제는 `productId` 가 없어 상품명이 비므로 각 원본에서 읽는다.
   */
  private async resolveGoodsName(
    paymentId: string,
    productName: string | null,
  ): Promise<string> {
    if (productName) return productName;

    const tournamentReg = await this.prisma.tournamentRegistration.findFirst({
      where: { paymentId },
      select: { tournament: { select: { name: true } } },
    });
    if (tournamentReg?.tournament?.name) {
      return `${tournamentReg.tournament.name} 대회 참가비`;
    }

    const billingLine = await this.prisma.monthlyPostpaidBillingLine.findFirst({
      where: { paymentId },
      select: {
        billing: {
          select: { yearMonth: true, class: { select: { className: true } } },
        },
      },
    });
    if (billingLine?.billing) {
      const className = billingLine.billing.class?.className ?? "수업";
      return `${className} ${billingLine.billing.yearMonth} 수업료`;
    }
    return "TEAMPLUS 결제";
  }

  /**
   * 주문번호로 결제 금액만 조회 — 인증 응답 검증의 기준 금액이다.
   *  결제창이 돌려준 `Amt` 를 기준으로 삼으면 금액 위변조를 걸러낼 수 없다.
   *  주문이 없으면 null.
   */
  async getPaymentAmountByOrderNumber(
    orderNumber: string,
  ): Promise<number | null> {
    if (!orderNumber) return null;
    const payment = await this.prisma.payment.findUnique({
      where: { orderNumber },
      select: { amount: true },
    });
    return payment ? Number(payment.amount) : null;
  }

  /**
   * 사용자가 결제창을 스스로 닫았을 때 되돌려 보낼 결제 화면 경로.
   *  토스 failUrl 이 쓰는 쿼리 계약(`error=fail` + 화면별 식별자)과 같은 형식이라 웹 화면은
   *  결제사를 구분하지 않는다. 값은 전부 DB 에서 복원한다 — 결제창 응답값으로 만들면
   *  오픈 리다이렉트가 된다. 복원 재료가 없으면 null(호출부가 결과 화면으로 폴백).
   */
  async getRetryPathByOrderNumber(
    orderNumber: string,
    options: {
      /** 결제사 결과 코드 — 웹이 로그·문구에 참고 */
      code?: string;
      /** 사용자가 결제창을 스스로 닫은 경우 — 웹이 "취소" 문구를 고르는 단일 근거 */
      cancelled?: boolean;
    } = {},
  ): Promise<string | null> {
    if (!orderNumber) return null;
    // 복귀 쿼리는 여기서만 조립한다(호출부 문자열 접합 금지).
    const withReturnQuery = (
      path: string,
      params: Record<string, string>,
    ): string => {
      const query = new URLSearchParams({ ...params, error: "fail" });
      if (options.code) query.set("code", options.code);
      if (options.cancelled) query.set("cancel", "1");
      return `${path}?${query.toString()}`;
    };
    // 미결(pending) 주문만 되돌린다 — 이미 승인·취소된 주문에 늦게 온 취소 응답이나 주문번호만
    //   아는 위조 요청으로 "취소했어요" 안내가 뜨면 안 된다.
    const payment = await this.prisma.payment.findFirst({
      where: { orderNumber, paymentStatus: "pending", deletedAt: null },
      select: {
        productId: true,
        amount: true,
        enrollments: { select: { classId: true, childId: true }, take: 1 },
        tournamentRegistrations: { select: { tournamentId: true }, take: 1 },
      },
    });
    if (!payment) return null;
    // 후불 청구는 수업(`POSTPAID-`)·대회(`TRN-POSTPAID-`) 모두 후불 결제 화면에서 낸다.
    //   대회 후불은 대회 신청이 연결돼 있어도 참가 화면으로 보내면 이미 신청된 자녀라
    //   결제할 수 없으므로 대회 분기보다 먼저 본다.
    if (/^(TRN-)?POSTPAID-/.test(orderNumber)) {
      return withReturnQuery("/payment/postpaid", { orderNumber });
    }
    const tournamentId = payment.tournamentRegistrations[0]?.tournamentId;
    if (tournamentId) {
      return withReturnQuery(
        `/tournaments/${encodeURIComponent(tournamentId)}/apply`,
        {},
      );
    }
    const enrollment = payment.enrollments[0];
    if (!payment.productId || !enrollment) return null;
    return withReturnQuery("/payment/checkout", {
      productId: payment.productId,
      childId: enrollment.childId,
      classId: enrollment.classId,
      amount: String(Number(payment.amount)),
    });
  }

  /**
   * 구모듈 결제 승인.
   *  1) Payment 조회 — completed 멱등 · cancelled/failed 거부 · 금액 대조
   *  2) Redis 락 `nicestd:confirm:{orderNumber}` 24h
   *  3) 재진입 판정 — pending 인데 tid 가 이미 있으면 캡처는 끝났고 후처리만 남았다.
   *     같은 AuthToken 재승인은 나이스가 거절하므로 승인 호출을 건너뛰어야 복구된다.
   *  4) 좌석 선점 → 승인 → 금액 대조 → `tid` 즉시 기록(재진입 근거)
   *  5) 공용 후처리(applyApprovedPayment) → 영수증 → 감독 알림
   *
   *  컨트롤러가 인증 응답 서명·MID·금액·URL 호스트를 이미 검증한 요청만 넘긴다.
   */
  async confirmNiceStdPayment(body: {
    orderNumber: string;
    tid: string;
    authToken: string;
    amount: number;
    nextAppUrl: string;
    netCancelUrl: string;
  }) {
    const { orderNumber, tid, authToken, amount, nextAppUrl, netCancelUrl } =
      body;
    if (!orderNumber || !tid || !authToken || !amount || amount <= 0) {
      throw new BadRequestException("승인 요청값이 유효하지 않습니다.");
    }

    const payment = await this.prisma.payment.findUnique({
      where: { orderNumber },
      select: {
        id: true,
        userId: true,
        amount: true,
        paymentStatus: true,
        productId: true,
        tid: true,
        product: {
          select: {
            classId: true,
            durationDays: true,
            sessionsPerMonth: true,
            feeType: true,
            billingTiming: true,
            billingMonth: true,
          },
        },
      },
    });
    if (!payment) {
      throw new NotFoundException("주문 정보를 찾을 수 없습니다.");
    }
    if (payment.paymentStatus === "completed") {
      this.logger.log(
        `나이스 구모듈 confirm 멱등 응답 — orderNumber=${orderNumber} already completed`,
      );
      return { success: true, paymentId: payment.id, idempotent: true };
    }
    if (payment.paymentStatus === "cancelled") {
      throw new BadRequestException(
        "취소된 결제 요청입니다. 최신 결제 요청을 확인해주세요.",
      );
    }
    if (payment.paymentStatus === "failed") {
      // 망취소 실패로 결과를 알 수 없는 주문 — 같은 주문번호 재결제를 막아야 이중 결제가 없다.
      throw new BadRequestException(
        "결제 결과를 확인 중인 주문입니다. 고객센터로 문의해주세요.",
      );
    }
    if (Math.abs(Number(payment.amount) - amount) > 0) {
      throw new BadRequestException(
        `결제 금액 불일치 — 주문 ${payment.amount}원, 요청 ${amount}원`,
      );
    }

    const lockKey = `nicestd:confirm:${orderNumber}`;
    const acquired = await this.redisService.setIfNotExists(
      lockKey,
      "1",
      86400,
    );
    if (!acquired) {
      this.logger.warn(
        `나이스 구모듈 confirm 동시 호출 차단: orderNumber=${orderNumber}`,
      );
      throw new BadRequestException(
        "결제 승인이 이미 진행 중입니다. 잠시 후 다시 시도해주세요.",
      );
    }

    // 캡처 완료 증거 — 승인 성공 직후 기록되므로, 남아 있으면 승인을 다시 부르면 안 된다.
    const alreadyCaptured = Boolean(payment.tid);
    let seatClaims: SeatClaim[] = [];
    let captured = alreadyCaptured;
    // 승인 여부를 끝내 확인하지 못한 격리 건은 좌석을 반납하지 않는다 — 돈이 나갔을 수 있다.
    let keepSeats = false;
    let capturedTid = payment.tid ?? tid;
    let approvedAt = new Date();
    let payMethod: string | undefined;

    try {
      if (!alreadyCaptured) {
        seatClaims = await this.claimSeatsBeforeApproval(payment.id);

        // 승인 결과가 모호하면 여기서 해소한다 — 바깥 catch 로 새면 좌석이 먼저 풀려
        //   승인이 확인된 거래의 정원이 사라진다.
        let outcome: {
          tid: string;
          approvedAt?: Date;
          payMethod?: string;
        };
        try {
          const approved = await this.niceStdGateway.approve({
            nextAppUrl,
            netCancelUrl,
            tid,
            authToken,
            amount,
            orderNumber,
          });
          // 금액 대조는 승인 응답에만 한다 — 거래조회 응답에는 금액이 없고,
          //   요청 금액은 컨트롤러가 이미 DB 금액으로 검증했다.
          if (Number(approved.amount) !== amount) {
            throw new BadRequestException(
              `나이스 응답 금액 불일치 — 응답 ${approved.amount}원`,
            );
          }
          outcome = {
            tid: approved.tid,
            approvedAt: approved.approvedAt,
            payMethod: approved.payMethod,
          };
        } catch (approveErr) {
          if (!(approveErr instanceof NiceStdApproveAmbiguousError)) {
            throw approveErr;
          }
          // 해소에 들어가는 순간부터 좌석은 반납하지 않는다 — 해소 도중 어디서 실패해도
          //   돈이 나갔을 가능성이 남아 있다. 되돌린 것이 확인되면 아래에서 다시 푼다.
          keepSeats = true;
          const resolved = await this.resolveAmbiguousApproval({
            error: approveErr,
            paymentId: payment.id,
            orderNumber,
            amount,
          });
          if (resolved.kind === "voided") {
            // 되돌린 것이 확인됐으므로 좌석을 붙들고 있을 이유가 없다.
            keepSeats = false;
            throw new NiceStdPaymentVoidedError(
              "결제 결과를 확인하지 못해 취소 처리했습니다. 다시 시도해주세요.",
            );
          }
          outcome = { tid: resolved.tid, approvedAt: resolved.approvedAt };
        }
        captured = true;
        capturedTid = outcome.tid;
        approvedAt = outcome.approvedAt ?? new Date();
        payMethod = outcome.payMethod;

        // 후처리보다 먼저 기록한다 — 후처리가 죽어도 재진입이 승인을 건너뛸 수 있어야 한다.
        await this.prisma.payment.updateMany({
          where: { id: payment.id, paymentStatus: "pending" },
          data: { tid: capturedTid },
        });
      } else {
        this.logger.warn(
          `[NICESTD_REENTRY] 캡처 완료 주문 재진입 — 승인 호출 생략: orderNumber=${orderNumber}`,
        );
        // 승인 시각은 원장에만 있다 — 재진입 시각을 쓰면 매출 귀속월이 틀어질 수 있다.
        approvedAt =
          (await this.lookupApprovedAt(capturedTid, orderNumber)) ?? approvedAt;
      }

      try {
        await this.applyApprovedPayment(payment, {
          paymentMethod: "nicestd",
          pgProvider: "nicestd",
          tid: capturedTid,
          approvedAt,
          orderId: orderNumber,
          claimFrom: ["pending", "cancelled"],
        });
      } catch (postErr) {
        // 돈은 나갔는데 DB 가 따라오지 못한 상태 — tid 는 기록돼 있어 재진입으로 복구된다.
        this.logger.error(
          `[PAYMENT_CAPTURED_DB_FAILED] orderNumber=${orderNumber} tid=${capturedTid.slice(0, 12)}*** ${(postErr as Error).message}`,
        );
        void this.notifyManagersOfPaymentIncident(payment.id, {
          title: "결제 후처리 실패",
          message: `주문번호 ${orderNumber} 결제는 승인되었으나 후처리가 실패했습니다. 확인이 필요합니다.`,
        }).catch(() => undefined);
        throw postErr;
      }

      void this.notifyManagersOfCompletedPayment(
        payment.id,
        Number(amount),
      ).catch((err) =>
        this.logger.warn(
          `결제 완료 감독/코치 알림 실패: paymentId=${payment.id} ${(err as Error).message}`,
        ),
      );

      try {
        await this.receiptService.createReceipt(
          payment.id,
          buildNiceStdReceiptUrl(capturedTid),
        );
      } catch (receiptErr) {
        this.logger.warn(
          `나이스 구모듈 영수증 발급 실패(무시): orderNumber=${orderNumber} ${(receiptErr as Error).message}`,
        );
      }

      this.logger.log(
        `나이스 구모듈 결제 승인 완료: orderNumber=${orderNumber} amount=${amount} method=${payMethod ?? "unknown"}`,
      );
      return {
        success: true,
        paymentId: payment.id,
        orderId: orderNumber,
        amount,
        method: payMethod ?? null,
        receiptUrl: buildNiceStdReceiptUrl(capturedTid),
        approvedAt: approvedAt.toISOString(),
      };
    } catch (e) {
      try {
        if (!captured && !keepSeats) {
          await this.releaseClaimedSeats(seatClaims);
        }
        throw e;
      } finally {
        // 락은 승인 여부 불명 구간을 닫은 뒤에 푼다 — 망취소·failed 전이 전에 풀면
        //   같은 AuthToken 으로 들어온 재요청이 재승인을 시도한다.
        await this.redisService.del(lockKey);
      }
    }
  }

  /**
   * 승인 모호 해소 — 망취소 1회 → 거래조회 1회로 결과를 확정한다.
   *
   *  호출부의 Redis 락이 살아 있는 동안 실행돼야 한다(같은 AuthToken 재승인 차단).
   *  망취소 재시도는 두지 않는다 — 실패 코드는 대부분 확정 실패(허용시간 초과 등)라
   *  같은 요청을 한 번 더 보내도 결과가 바뀌지 않고 사용자 대기만 늘어난다.
   *  결과를 끝내 알 수 없으면(`거래없음` 포함) 격리하고 예외를 던진다.
   */
  private async resolveAmbiguousApproval(params: {
    error: NiceStdApproveAmbiguousError;
    paymentId: string;
    orderNumber: string;
    amount: number;
  }): Promise<AmbiguousApprovalOutcome> {
    const { error: e, paymentId, orderNumber, amount } = params;

    // ① 망취소 — 성공하면 승인은 없던 일이 된다.
    if (await this.tryNetCancel(e, amount, orderNumber)) {
      return { kind: "voided" };
    }

    // ② 망취소로 못 되돌렸다 — 원장에 무엇이 남았는지 조회로 확인한다.
    try {
      await this.sleep(NICESTD_INQUIRY_DELAY_MS);
      const status = await this.niceStdGateway.getTransactionStatus(e.tid, {
        timeoutMs: NICESTD_RESOLVE_TIMEOUT_MS,
      });
      if (status.status === "approved") {
        // 거래번호는 조회 응답이 아니라 인증 단계에서 서명으로 검증한 TxTid 를 쓴다 —
        //   조회 응답에는 서명이 없어 값을 그대로 원장에 기록할 근거가 없다.
        this.logger.warn(
          `[NICESTD_APPROVED_BY_INQUIRY] 망취소 실패 후 조회로 승인 확인: orderNumber=${orderNumber} tid=${this.maskTid(e.tid)}`,
        );
        return {
          kind: "approved",
          tid: e.tid,
          approvedAt: this.parseNiceStdAuthDate(status.authDate),
        };
      }
      if (status.status === "cancelled") {
        // 우리가 되돌린 게 아니므로, 뒤늦은 승인 통보를 가려낼 표식을 남긴다.
        //   표식 기록이 실패해도 "취소됨"이라는 확인 자체는 뒤집히지 않는다 —
        //   여기서 throw 로 새면 돈이 나가지 않은 거래가 격리로 넘어간다.
        try {
          await this.redisService.set(
            `nicestd:voided:${orderNumber}`,
            e.tid,
            86400,
          );
        } catch (markErr) {
          this.logger.warn(
            `[NICESTD_VOIDED_BY_INQUIRY] 미승인 표식 기록 실패: orderNumber=${orderNumber} ${(markErr as Error).message}`,
          );
        }
        this.logger.warn(
          `[NICESTD_VOIDED_BY_INQUIRY] 조회 결과 취소 확정: orderNumber=${orderNumber} tid=${this.maskTid(e.tid)}`,
        );
        return { kind: "voided" };
      }
      // `거래없음` — 원장 반영 지연과 진짜 미승인을 구분할 수 없다. 미승인으로 단정하면
      //   뒤늦게 반영된 승인 위에 재결제가 얹힌다. 격리해 사람이 확인하게 한다.
      throw new Error(`거래조회 결과 거래없음 — tid=${this.maskTid(e.tid)}`);
    } catch (inquiryErr) {
      // 승인 여부도 취소 여부도 끝내 모른다 — 재결제를 막고 사람이 확인하게 한다.
      //   tid 도 함께 남긴다: 재청구는 tid 가 없는 행만 갱신하므로 이 행이 pending 으로
      //   되살아나 재결제되는 경로가 닫히고, 운영자·취소통보 대사에 거래번호가 남는다.
      try {
        await this.prisma.payment.updateMany({
          where: { id: paymentId, paymentStatus: "pending" },
          data: { paymentStatus: "failed", tid: e.tid },
        });
      } catch (markErr) {
        // 격리 표시를 못 남겼어도 경보와 격리 예외는 그대로 간다 — 여기서 새면
        //   사용자에게 일반 실패로 보여 재결제를 유도하게 된다.
        this.logger.error(
          `[NICESTD_QUARANTINE_WRITE_FAILED] orderNumber=${orderNumber} ${(markErr as Error).message}`,
        );
      }
      this.logger.error(
        `[NICESTD_NETCANCEL_FAILED] 수동 확인 필요: orderNumber=${orderNumber} tid=${this.maskTid(e.tid)} ${(inquiryErr as Error).message}`,
      );
      void this.notifyManagersOfPaymentIncident(paymentId, {
        title: "결제 결과 확인 실패",
        message: `주문번호 ${orderNumber} 의 승인 결과를 확인하지 못했고 망취소·거래조회도 실패했습니다. 가맹점관리자에서 거래 상태를 확인해주세요.`,
      }).catch(() => undefined);
      throw new NiceStdResultPendingError(
        "결제 결과를 확인 중입니다. 잠시 후 결제 내역을 확인해주세요.",
      );
    }
  }

  /** 재진입 시 원장에서 승인 시각을 복원한다. 조회·파싱 실패는 undefined(현재 시각 폴백). */
  private async lookupApprovedAt(
    tid: string,
    orderNumber: string,
  ): Promise<Date | undefined> {
    try {
      const status = await this.niceStdGateway.getTransactionStatus(tid, {
        timeoutMs: NICESTD_RESOLVE_TIMEOUT_MS,
      });
      const at = this.parseNiceStdAuthDate(status.authDate);
      if (at) return at;
      this.logger.warn(
        `[NICESTD_REENTRY] 승인 시각 복원 실패(응답에 AuthDate 없음) — orderNumber=${orderNumber}`,
      );
      return undefined;
    } catch (err) {
      this.logger.warn(
        `[NICESTD_REENTRY] 승인 시각 조회 실패 — orderNumber=${orderNumber} ${(err as Error).message}`,
      );
      return undefined;
    }
  }

  /** 망취소 1회 — 성공 여부만 돌려주고 실패는 로그로 남긴다. */
  private async tryNetCancel(
    e: NiceStdApproveAmbiguousError,
    amount: number,
    orderNumber: string,
  ): Promise<boolean> {
    try {
      await this.niceStdGateway.netCancel({
        netCancelUrl: e.netCancelUrl,
        tid: e.tid,
        authToken: e.authToken,
        amount,
        orderNumber,
        timeoutMs: NICESTD_RESOLVE_TIMEOUT_MS,
      });
      this.logger.warn(
        `[NICESTD_NETCANCEL] 승인 미확정 거래 망취소 완료: orderNumber=${orderNumber}`,
      );
      return true;
    } catch (ncErr) {
      this.logger.warn(
        `[NICESTD_NETCANCEL] 망취소 실패: orderNumber=${orderNumber} ${(ncErr as Error).message}`,
      );
      return false;
    }
  }

  /** 거래조회 `AuthDate`(`YYMMDDHHMISS` KST) → instant. 해석 실패는 undefined. */
  private parseNiceStdAuthDate(authDate?: string): Date | undefined {
    if (!authDate) return undefined;
    try {
      return kstCompactToInstant(authDate);
    } catch {
      return undefined;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 구모듈 결제통보(노티) 처리.
   *
   *  ⚠️ 이 핸들러는 `Payment` 상태를 절대 직접 바꾸지 않는다. 통보에는 서명이 없고,
   *  환불은 승인제 엔진(RefundRequest)이 크레딧 회수·등록 롤백까지 함께 처리하므로
   *  통보가 Payment 를 refunded 로 바꾸면 그 모든 보상이 건너뛰어진다.
   *  통보가 하는 일은 격리된 환불요청에 "PG 취소는 성공했다"는 증거를 남기는 것뿐이다.
   */
  async handleNiceStdNotify(fields: Record<string, string>): Promise<void> {
    const stateCd = fields.StateCd ?? "";
    const tid = fields.TID ?? "";
    const moid = fields.MOID ?? "";
    // 통보의 `Amt` 는 규격상 상품금액(원 결제금액)이다 — 취소 통보에서도 환불액이 아니다.
    const amt = Number(fields.Amt ?? 0);

    // StateCd 1(전취소)·2(후취소) — 취소 통보.
    if (stateCd === "1" || stateCd === "2") {
      const cancelMoid = fields.CancelMOID ?? "";
      const refundRequestId = cancelMoid.startsWith("RF-")
        ? cancelMoid.slice(3)
        : "";
      const rr = refundRequestId
        ? await this.prisma.refundRequest.findUnique({
            where: { id: refundRequestId },
            select: {
              id: true,
              status: true,
              failureCode: true,
              payment: { select: { tid: true, amount: true } },
            },
          })
        : null;

      // 우리 취소 기록을 못 찾았거나 다른 거래의 통보 — 외부 취소일 수 있어 사람이 봐야 한다.
      if (!rr || !rr.payment?.tid || rr.payment.tid !== tid) {
        this.logger.warn(
          `[NICESTD_NOTIFY_UNMATCHED] 취소 통보와 환불 기록이 맞지 않음 — cancelMoid=${cancelMoid || "none"} tid=${this.maskTid(tid)} moid=${moid}`,
        );
        await this.notifyPaymentIncidentByTid(
          tid,
          "외부 취소 감지",
          `우리 환불 기록과 맞지 않는 취소 통보를 받았습니다. (주문 ${moid}) 가맹점관리자에서 확인해주세요.`,
        );
        return;
      }
      if (amt !== Number(rr.payment.amount)) {
        this.logger.warn(
          `[NICESTD_NOTIFY_UNMATCHED] 취소 통보 금액 불일치 — refundRequestId=${rr.id} 통보=${amt} 결제=${rr.payment.amount}`,
        );
        await this.notifyPaymentIncidentByTid(
          tid,
          "취소 통보 불일치",
          `취소 통보(주문 ${moid})의 결제금액이 기록과 다릅니다. 확인이 필요합니다.`,
        );
        return;
      }

      // 격리된 건만 자기 증거를 남긴다. 확정은 운영자 재처리가 DB-only 경로로 수행한다.
      if (
        rr.status !== "execution_failed" ||
        rr.failureCode !== "NICE_UNCONFIRMED"
      ) {
        // 이미 정상 종결(또는 진행 중)된 환불의 통보 — 정상 동작이라 경보 대상이 아니다.
        this.logger.log(
          `[NICESTD_NOTIFY] 취소 통보 수신(조치 없음): refundRequestId=${rr.id} status=${rr.status}`,
        );
        return;
      }
      await this.prisma.refundRequest.update({
        where: { id: rr.id },
        data: {
          failureStage: "DB_AFTER_PG",
          pgRefundSucceededAt: new Date(),
        },
      });
      this.logger.log(
        `[NICESTD_NOTIFY] 격리 환불요청에 PG 취소 증거 기록: refundRequestId=${rr.id}`,
      );
      return;
    }

    // StateCd 0 — 승인 통보. 상태는 바꾸지 않고(F2) 위험한 조합만 경보로 올린다.
    if (stateCd === "0" && moid) {
      const payment = await this.prisma.payment.findUnique({
        where: { orderNumber: moid },
        select: { id: true, paymentStatus: true, tid: true },
      });
      if (!payment) return;

      // (a) 우리가 미승인으로 확정하고 재결제를 허용한 거래가 뒤늦게 승인됐다 — 이중 결제 위험.
      const voidedTid = await this.redisService.get<string>(
        `nicestd:voided:${moid}`,
      );
      // (b) 완료된 주문인데 통보의 거래번호가 우리 기록과 다르다 — 같은 주문에 두 건이 승인됐다.
      const foreignApproval =
        payment.paymentStatus === "completed" &&
        !!payment.tid &&
        !!tid &&
        payment.tid !== tid;

      // (c) 격리(failed)해 둔 바로 그 거래가 승인됐다 — 운영자가 완료 처리해야 한다.
      if (
        payment.paymentStatus === "failed" &&
        !!payment.tid &&
        payment.tid === tid
      ) {
        this.logger.error(
          `[NICESTD_NOTIFY_PAID_QUARANTINED] orderNumber=${moid} tid=${this.maskTid(tid)}`,
        );
        await this.notifyManagersOfPaymentIncident(payment.id, {
          title: "격리 주문 승인 확인됨",
          message: `주문 ${moid} 의 거래가 나이스에서 승인된 것으로 통보되었습니다. 가맹점관리자에서 확인 후 완료 처리해주세요.`,
        });
        return;
      }

      if ((voidedTid && tid && voidedTid === tid) || foreignApproval) {
        this.logger.error(
          `[NICESTD_NOTIFY_PAID_AFTER_VOID] orderNumber=${moid} 통보tid=${this.maskTid(tid)} 기록tid=${this.maskTid(payment.tid ?? "")} status=${payment.paymentStatus}`,
        );
        await this.notifyManagersOfPaymentIncident(payment.id, {
          title: "재결제 허용 후 옛 거래 승인",
          message: `주문 ${moid} 의 이전 거래가 뒤늦게 승인되었습니다. 가맹점관리자에서 취소해주세요.`,
        });
        return;
      }

      // 승인 후처리가 아직 도는 중일 수 있어 경보 대상이 아니다 — 흔적만 남긴다.
      if (payment.paymentStatus === "pending") {
        this.logger.warn(
          `[NICESTD_NOTIFY_PAID_PENDING] 나이스는 승인, DB 는 pending — orderNumber=${moid} tid=${this.maskTid(tid)}. 대사 대상.`,
        );
      }
    }
  }

  /** 로그에 거래번호 전체를 남기지 않는다. */
  private maskTid(tid: string): string {
    return tid ? `${tid.slice(0, 12)}***` : "none";
  }

  /** 통보에 실린 TID 로 결제를 역추적해 담당자 경보를 보낸다(찾지 못하면 로그만). */
  private async notifyPaymentIncidentByTid(
    tid: string,
    title: string,
    message: string,
  ): Promise<void> {
    const payment = tid
      ? await this.prisma.payment.findFirst({
          where: { tid },
          select: { id: true },
        })
      : null;
    if (!payment) {
      // 결제를 역추적하지 못해도 운영자에게는 알린다 — 외부 취소는 사람이 봐야 한다.
      await this.notifyOperatorsOfPaymentIncident({ title, message });
      return;
    }
    await this.notifyManagersOfPaymentIncident(payment.id, { title, message });
  }

  /** 담당자를 특정할 수 없을 때의 수신자 — 운영자 전원. */
  private async notifyOperatorsOfPaymentIncident(body: {
    title: string;
    message: string;
  }): Promise<void> {
    try {
      const operators = await this.prisma.user.findMany({
        where: {
          userType: { in: ["ADMIN", "SYSTEM", "OPER"] },
          deletedAt: null,
        },
        select: { id: true },
      });
      if (operators.length === 0) return;
      await this.notificationsService.notifyUsers(
        operators.map((o) => o.id),
        {
          notificationType: "payment_failed",
          title: body.title,
          message: body.message,
          linkUrl: "/director-payments",
        },
      );
    } catch (err) {
      this.logger.warn(`결제 사고 운영자 알림 실패: ${(err as Error).message}`);
    }
  }

  /**
   * 결제 사고 경보 — 수신자 해석은 결제 완료 알림과 같은 규칙을 공유한다.
   *  실패해도 원 흐름을 막지 않도록 내부에서 삼킨다.
   */
  private async notifyManagersOfPaymentIncident(
    paymentId: string,
    body: { title: string; message: string },
  ): Promise<void> {
    try {
      // 팀 대상은 수신자까지 펼쳐서 센다 — 감독·코치가 없는 팀은 대상이 있어도 발송 0건이라,
      //   대상 개수만 보면 경보가 조용히 사라진다.
      const targets = await this.resolvePaymentManagerTargets(paymentId);
      const recipients = new Set<string>();
      for (const target of targets) {
        if (target.kind === "team") {
          const managerIds =
            await this.notificationsService.getTeamManagerUserIds(
              target.teamId,
            );
          for (const id of managerIds) recipients.add(id);
        } else {
          for (const id of target.userIds) recipients.add(id);
        }
      }
      if (recipients.size === 0) {
        // 담당자를 특정할 수 없는 결제(미연결·고아·관리자 부재)라도 경보가 사라지면 안 된다.
        await this.notifyOperatorsOfPaymentIncident(body);
        return;
      }
      for (const target of targets) {
        await this.sendToPaymentManagerTarget(target, {
          notificationType: "payment_failed",
          title: body.title,
          message: body.message,
        });
      }
    } catch (err) {
      this.logger.warn(
        `결제 사고 알림 실패: paymentId=${paymentId} ${(err as Error).message}`,
      );
    }
  }

  /**
   * [정원 선점] 결제 승인(캡처) 직전 좌석 원자 확보 — 표준 reservation-before-capture.
   *  결제에 연결된 수업 enrollment 의 (classId, childId) 쌍마다:
   *   · 무정원(capacity 0/null) 수업 → 스킵
   *   · 자녀가 이미 active(월권 갱신 재결제) → 스킵 — 자기 좌석에 만석 판정 방지
   *   · advisory lock(class-seats) 트랜잭션 안에서 카운트+선점 원자화 —
   *     마지막 1자리 동시 confirm race 차단. 초과면 승인 미호출로 돈이 나가지 않는다.
   *  대회/쇼핑 결제는 수업 enrollment 연결이 없어 자연 스킵.
   *  복수 자녀 결제 중 일부만 선점된 채 실패하면 내부에서 전량 원복 후 throw.
   */
  private async claimSeatsBeforeApproval(
    paymentId: string,
  ): Promise<SeatClaim[]> {
    // 결제를 기다리는(pending·approved) 등록만 선점 — 그 사이 취소된 등록의 명단을 되살리지 않는다.
    //   조회와 선점 사이에 취소가 끼어드는 경우는 잠금 안 재확인이 닫는다.
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        paymentId,
        status: { in: PAYMENT_APPLICABLE_ENROLLMENT_STATUSES },
      },
      select: { id: true, classId: true, childId: true },
    });
    const claims: SeatClaim[] = [];
    try {
      for (const en of enrollments) {
        const claim = await this.prisma.$transaction(async (tx) => {
          await acquireClassSeatLock(tx, en.classId);
          // 잠금 안 재확인 — 조회 이후 취소된 등록의 좌석은 선점하지 않는다.
          //   취소도 같은 좌석 잠금을 잡으므로 두 경로는 직렬화된다.
          const still = await tx.enrollment.findFirst({
            where: {
              id: en.id,
              status: { in: PAYMENT_APPLICABLE_ENROLLMENT_STATUSES },
            },
            select: { id: true },
          });
          if (!still) return null;
          const cls = await tx.class.findUnique({
            where: { id: en.classId },
            select: { capacity: true },
          });
          if (!cls?.capacity || cls.capacity <= 0) return null; // 무정원
          const existing = await tx.classRegistration.findUnique({
            where: {
              classId_userId: { classId: en.classId, userId: en.childId },
            },
            select: { status: true },
          });
          if (existing?.status === "active") return null; // 좌석 이미 보유(갱신)
          const activeCount = await tx.classRegistration.count({
            where: { classId: en.classId, status: "active" },
          });
          if (activeCount >= cls.capacity) {
            throw new BadRequestException(
              "수업 정원이 마감되어 결제가 진행되지 않았습니다.",
            );
          }
          await tx.classRegistration.upsert({
            where: {
              classId_userId: { classId: en.classId, userId: en.childId },
            },
            update: { status: "active" },
            create: {
              classId: en.classId,
              userId: en.childId,
              status: "active",
            },
          });
          return {
            classId: en.classId,
            userId: en.childId,
            prevStatus: existing?.status ?? null,
          };
        });
        if (claim) claims.push(claim);
      }
    } catch (e) {
      await this.releaseClaimedSeats(claims);
      throw e;
    }
    return claims;
  }

  /**
   * [정원 선점] 원복 — 승인(캡처) 실패 시 보상 트랜잭션.
   *  신규 생성 행(prevStatus=null)은 삭제(무행 원상 복귀), 기존 행은 이전 상태 복원.
   *  원복 자체 실패는 로그만 — 잔존 좌석은 "미구매 active"로 화면에 드러나
   *  감독 명단제외/판매 시작 만료로 정리 가능한 자가 치유 상태다.
   */
  private async releaseClaimedSeats(claims: SeatClaim[]): Promise<void> {
    for (const c of claims) {
      try {
        if (c.prevStatus == null) {
          await this.prisma.classRegistration.deleteMany({
            where: { classId: c.classId, userId: c.userId, status: "active" },
          });
        } else {
          await this.prisma.classRegistration.updateMany({
            where: { classId: c.classId, userId: c.userId, status: "active" },
            data: { status: c.prevStatus },
          });
        }
      } catch (err) {
        this.logger.error(
          `좌석 선점 원복 실패: classId=${c.classId} userId=${c.userId} ${(err as Error).message}`,
        );
      }
    }
  }

  /**
   * 결제 승인 후처리 — Payment 완료 + 후불 라인 paid + Enrollment paid +
   *   ClassRegistration active + MemberCredit 발급 + TournamentRegistration PAID.
   *  실결제(토스 confirm)와 mock 결제가 공유하는 유일한 후처리 경로다. PG 승인 단계만
   *  호출부 고유이며, 크레딧 정책 분기(B4 후불 미발급·B7 월말 만료·billingMonth 귀속월 창)는
   *  이 메서드에 단일 존재하여 두 경로에 자동 상속된다(복사본 없음).
   */
  private async applyApprovedPayment(
    payment: ConfirmPaymentRow,
    opts: {
      paymentMethod: string;
      /** 실제로 승인을 처리한 결제사. mock 승인은 PG 를 거치지 않으므로 'mock' 으로 정정된다. */
      pgProvider: string;
      tid: string;
      approvedAt: Date;
      orderId: string;
      /**
       * 완료로 확정할 수 있는 직전 결제 상태.
       *  · 실결제(토스·나이스): pending 과 cancelled — 돈이 실제로 나갔으므로 로컬에서만
       *    취소된 결제도 completed 로 바로잡고, 연결 등록이 없으면 환불 요청을 접수한다.
       *  · mock: pending 만 — 결제사 승인이 없어 취소된 결제를 완료로 바꾸면 돈이 나가지
       *    않은 거래가 매출로 남는다.
       */
      claimFrom: string[];
    },
  ): Promise<void> {
    const orphanRefundRequestId = await this.prisma.$transaction(async (tx) => {
      // 완료 전이를 조건부 claim 으로 선점한다. Redis 락은 프로세스 레벨 방어라
      //   락 소실·우회 경로에서 동시 진입이 가능하므로 DB 에서도 단일 실행을 보장한다.
      // 허용 상태는 호출부가 정한다(opts.claimFrom). 실결제는 돈이 이미 나갔으므로 그 사이
      //   로컬에서만 cancelled 로 바뀐 결제도 completed 로 바로잡고 연결 등록이 없으면 아래
      //   고아 처리로 환불 요청을 접수한다. mock 은 결제사 승인이 없어 pending 만 허용한다.
      const claimed = await tx.payment.updateMany({
        where: {
          id: payment.id,
          paymentStatus: { in: opts.claimFrom },
        },
        data: {
          paymentStatus: "completed",
          tid: opts.tid,
          // paymentMethod 는 PG 판별용 'toss' 로 유지 — cancel 시 isTossPayment() 가
          //   true 로 분기되어 KG 404 에러를 회피한다.
          paymentMethod: opts.paymentMethod,
          pgProvider: opts.pgProvider,
          completedAt: opts.approvedAt,
        },
      });
      if (claimed.count === 0) {
        // 이미 확정된 결제 — 부수효과를 다시 수행하지 않고 멱등 성공으로 종료한다.
        this.logger.warn(
          `이미 확정된 결제라 승인 후처리 스킵(멱등): paymentId=${payment.id} orderId=${opts.orderId}`,
        );
        return;
      }
      // [Phase B-5-4] POSTPAID 후불 청구 라인 paid 처리 (해당 결제가 후불 청구면 — 아니면 no-op).
      const paidLines = await tx.monthlyPostpaidBillingLine.updateMany({
        where: { paymentId: payment.id },
        data: { paymentStatus: "paid" },
      });
      // 등록 전이 — 결제를 기다리던(pending·approved) 등록만 paid 로. 그 사이 취소·만료됐거나
      //   후불 재활용으로 연결이 끊긴 등록은 되살리지 않는다(취소가 최종).
      //   ⚠️ KG 웹훅(payment-webhook.service)은 이 경로를 쓰지 않고 자체 규칙으로 처리한다
      //   (미사용 결제사 — 활성 결제사는 나이스). 규칙 공용은 confirm 3진입점에 한한다.
      const transition = await applyPaymentToEnrollments(
        tx,
        payment.id,
        opts.approvedAt,
      );
      // [추가 2026-05-15] Payment 와 연결된 TournamentRegistration PAID 처리.
      //  · 대회 참가 결제 흐름: /tournaments/:id/payment/initiate → 결제창 → confirm.
      //  · 결제 완료 시 학부모 자녀 캘린더에 대회가 자동 노출되도록 PAID 갱신.
      //  · 결제를 기다리던(PENDING) 등록만 전이한다. 그 사이 취소(CANCELLED)된 등록은
      //    되살리지 않고 아래 고아 처리로 환불 요청을 접수한다 — 수업 등록과 같은 규칙.
      const tournamentTransition = await applyPaymentToTournamentRegistrations(
        tx,
        payment.id,
      );
      // 고아 결제 — 선불 수업 또는 대회 결제인데 전이된 등록이 없음: 돈은 보존(completed)하고
      //   수업권·명단은 건드리지 않으며 환불 요청을 자동 접수한다(승인제 환불 흐름으로 처리).
      const orphan = isOrphanPayment({
        product: payment.product,
        enrollments: transition,
        tournaments: tournamentTransition,
        linkedBillingLines: paidLines.count,
      });
      // 스코프를 알 수 없는 미연결 결제 — 상품도 대회 링크도 없어 환불 요청을 접수할
      //   대상을 특정할 수 없다(후불 정산 취소가 대회 연결을 끊은 뒤 승인이 도착한 경우 등).
      //   돈만 남고 아무 기록이 없는 상태를 피하려 경고로 남겨 운영 대사 대상으로 만든다.
      const unlinked =
        !orphan &&
        transition.transitioned.length === 0 &&
        tournamentTransition.transitioned.length === 0 &&
        paidLines.count === 0;
      if (unlinked) {
        this.logger.warn(
          `[UNLINKED_PAYMENT] 연결 대상 없는 결제 완료 — paymentId=${payment.id} orderId=${opts.orderId} productId=${payment.productId ?? "(없음)"}. 수동 확인 대상.`,
        );
      }
      let orphanRefundRequestId: string | null = null;
      if (orphan) {
        orphanRefundRequestId = await recordOrphanPaymentRefundRequest(tx, {
          paymentId: payment.id,
          payerUserId: payment.userId,
          amount: Number(payment.amount),
          classId: payment.product?.classId ?? null,
          tournamentId: tournamentTransition.stale[0]?.tournamentId ?? null,
          childId:
            transition.stale[0]?.childId ??
            tournamentTransition.stale[0]?.childId ??
            null,
        });
        const staleLabel =
          [
            ...transition.stale.map((e) => `${e.id}:${e.status}`),
            ...tournamentTransition.stale.map(
              (t) => `${t.id}:${t.paymentStatus}`,
            ),
          ].join(",") || "(연결 없음)";
        this.logger.warn(
          `고아 결제(취소·만료된 신청에 결제 완료): paymentId=${payment.id} orderId=${opts.orderId} stale=${staleLabel} refundRequest=${orphanRefundRequestId ?? "(기존 요청 있음)"}`,
        );
      }
      const isPostpaidProduct = payment.product?.billingTiming === "POSTPAID";

      if (
        payment.product &&
        payment.product.sessionsPerMonth > 0 &&
        !isPostpaidProduct &&
        !orphan
      ) {
        // 유효기간 산정은 resolveCreditExpiry 단일 SoT — 승인 경로(토스/KG 웹훅)와
        //   관리자 수동 발급이 같은 식을 쓰도록 통일했다(경로별 식 복제 금지).
        const { startsAt, expiresAt } = resolveCreditExpiry({
          feeType: payment.product.feeType,
          billingMonth: payment.product.billingMonth,
          durationDays: payment.product.durationDays,
          at: opts.approvedAt,
        });

        const targetUserId =
          transition.transitioned[0]?.childId ?? payment.userId;

        await this.creditDomain.issueFromPayment(tx, {
          paymentId: payment.id,
          userId: targetUserId,
          classId: payment.product.classId,
          sessions: payment.product.sessionsPerMonth,
          startsAt,
          expiresAt,
          sourceLabel: `토스 결제 완료 - 수업권 발급 (주문번호: ${opts.orderId})`,
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
      return orphanRefundRequestId;
    });
    if (orphanRefundRequestId) {
      await this.notifyOrphanPayment(payment.userId, orphanRefundRequestId);
    }
  }

  /**
   * 고아 결제 알림 — 결제자에게 환불 접수 사실을, 승인 권한자에게 확인 요청을 보낸다.
   *  수신자·상세 링크는 학부모 직접 요청 알림과 같은 SoT(resolveRefundRequestRecipients)를 쓴다
   *  — 팀 수업뿐 아니라 오픈클래스(아카데미 원장)·대회까지 같은 경로로 라우팅된다.
   */
  private async notifyOrphanPayment(
    payerUserId: string,
    refundRequestId: string,
  ): Promise<void> {
    try {
      const rr = await this.prisma.refundRequest.findUnique({
        where: { id: refundRequestId },
        select: {
          id: true,
          teamId: true,
          academyId: true,
          sourceType: true,
          paymentId: true,
          classId: true,
          tournamentId: true,
        },
      });
      if (!rr) return;
      // RefundRequest 는 스코프 스냅샷(id)만 들고 있어 이름은 원본에서 읽는다.
      const [cls, tournament] = await Promise.all([
        rr.classId
          ? this.prisma.class.findUnique({
              where: { id: rr.classId },
              select: { className: true },
            })
          : Promise.resolve(null),
        rr.tournamentId
          ? this.prisma.tournament.findUnique({
              where: { id: rr.tournamentId },
              select: { name: true },
            })
          : Promise.resolve(null),
      ]);
      const subject = cls?.className ?? tournament?.name ?? "신청";
      await this.notificationsService.notifyUsers([payerUserId], {
        notificationType: "refund_request_created",
        title: "환불 요청 자동 접수",
        message: `"${subject}" 신청이 취소된 뒤 결제가 완료되어 환불 요청이 자동 접수되었습니다.`,
        linkUrl: "/payment/history",
      });
      const { userIds, linkUrl } = await resolveRefundRequestRecipients(
        this.prisma,
        rr,
      );
      if (userIds.length === 0) return;
      await this.notificationsService.notifyUsers(userIds, {
        notificationType: "refund_request_created",
        title: "환불 요청 확인 필요",
        message: `"${subject}" 취소된 신청에 결제가 완료되어 환불 요청이 접수되었습니다. 확인해주세요.`,
        linkUrl,
      });
    } catch (err) {
      this.logger.warn(
        `고아 결제 알림 실패: refundRequestId=${refundRequestId}, error=${(err as Error).message}`,
      );
    }
  }

  /**
   * 토스 승인 API 를 건너뛴 테스트 결제 완료 처리 (수업 결제 + 대회 선불 결제 공용).
   *  결제창에 테스터의 실카드/실계좌가 노출되지 않도록 토스 위젯 없이 결제를 완료한다.
   *  검증·멱등 락·후처리(applyApprovedPayment)는 confirmTossPayment 와 완전히 동일하며,
   *  토스 승인 단계만 생략한다.
   *
   *  ⚠️ 오픈 전 운영 환경 테스트를 위해 상시 허용 상태다. 대금 이체 없이
   *  paymentStatus='completed' + MemberCredit 이 발급되므로, 매출·정산·부가세 영수증에
   *  허위 거래가 혼입되고 tid=MOCK-* 는 PG 취소가 불가하다.
   *  정식 서비스 오픈 시 이 메서드와 컨트롤러 엔드포인트를 제거해야 한다.
   */
  async mockConfirmPayment(userId: string, orderId: string) {
    this.logger.warn(
      `[MOCK CONFIRM] 테스트 결제 호출: userId=${userId}, orderId=${orderId}`,
    );

    if (!orderId) {
      throw new BadRequestException("orderId 값이 유효하지 않습니다.");
    }

    // 1) Payment row 조회 — confirm 과 동일 select (공용 후처리 입력 형태 일치).
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
            billingMonth: true,
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
      this.logger.log(
        `mock confirm 멱등 응답 — orderId=${orderId} already completed`,
      );
      return { success: true, paymentId: payment.id, idempotent: true };
    }
    if (payment.paymentStatus === "cancelled") {
      throw new BadRequestException(
        "취소된 결제 요청입니다. 최신 결제 요청을 확인해주세요.",
      );
    }

    // 2) 멱등성 락 — 실결제와 동일 키(toss:confirm:{orderId})로 실결제·mock 동시 승인 방지.
    const lockKey = `toss:confirm:${orderId}`;
    const lockTtl = 86400;
    const acquired = await this.redisService.setIfNotExists(
      lockKey,
      "1",
      lockTtl,
    );
    if (!acquired) {
      this.logger.warn(`mock confirm 동시 호출 차단: orderId=${orderId}`);
      throw new BadRequestException(
        "결제 승인이 이미 진행 중입니다. 잠시 후 다시 시도해주세요.",
      );
    }

    let seatClaims: SeatClaim[] = [];
    try {
      // 2.5) [정원 선점] 실결제와 동일 계약 — 초과 시 mock 승인도 동일하게 거부.
      seatClaims = await this.claimSeatsBeforeApproval(payment.id);

      // 3) 토스 승인 없이 공용 후처리 호출 — 금액은 DB payment.amount 신뢰(클라이언트 금액 미수신).
      const approvedAt = new Date();
      await this.applyApprovedPayment(payment, {
        paymentMethod: "mock",
        // 시작 시점에는 활성 결제사로 기록됐지만 실제로는 PG 를 거치지 않았다 — 환불 라우팅용으로 정정.
        pgProvider: "mock",
        tid: `MOCK-${Date.now()}`,
        approvedAt,
        orderId,
        // 결제사 승인이 없으므로 취소된 결제는 완료로 바꾸지 않는다(돈 안 나간 매출 방지).
        claimFrom: ["pending"],
      });

      // 실결제와 동일하게 감독/코치 결제 알림 (best-effort — 실패해도 승인 흐름 유지).
      void this.notifyManagersOfCompletedPayment(
        payment.id,
        Number(payment.amount),
      ).catch((err) =>
        this.logger.warn(
          `결제 완료 감독/코치 알림 실패: paymentId=${payment.id} ${(err as Error).message}`,
        ),
      );

      this.logger.log(
        `mock 결제 승인 완료: orderId=${orderId} amount=${payment.amount}`,
      );
      return {
        success: true,
        paymentId: payment.id,
        orderId,
        amount: payment.amount,
        method: "mock",
        receiptUrl: null,
        approvedAt: approvedAt.toISOString(),
      };
    } catch (e) {
      // mock 은 실출금이 없으므로 실패 시 항상 좌석 원복 — 보상 트랜잭션.
      await this.releaseClaimedSeats(seatClaims);
      // 후처리 실패 시 락 해제 — 사용자 재시도 가능
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
    const targets = await this.resolvePaymentManagerTargets(paymentId);

    for (const target of targets) {
      const body =
        target.scope === "tournament"
          ? {
              title: "대회 결제 알림",
              message: `"${target.subject}" 대회 참가비 결제가 완료되었어요. (${won})`,
            }
          : target.scope === "academy"
            ? {
                title: "오픈클래스 결제 알림",
                message: `"${target.subject}" 오픈클래스 결제가 완료되었어요. (${won})`,
              }
            : {
                title: "수업 결제 알림",
                message: `"${target.subject}" 수업 결제가 완료되었어요. (${won})`,
              };
      await this.sendToPaymentManagerTarget(target, {
        notificationType: "payment_success",
        ...body,
      });
    }
  }

  /**
   * 결제 담당자(감독·코치·오픈클래스 원장) 수신 대상 해석.
   *  완료 알림과 사고 경보가 같은 라우팅을 쓰도록 분리했다 — 한쪽만 고쳐 수신자가
   *  갈라지는 것을 막는다.
   */
  private async resolvePaymentManagerTargets(
    paymentId: string,
  ): Promise<PaymentManagerTarget[]> {
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

    const targets: PaymentManagerTarget[] = [];
    for (const cls of classMap.values()) {
      if (cls.teamId) {
        // 정규 수업 → 팀 감독/코치. 착지 = 결제 관리(수납 현황) — director/coach 모두 접근 가능.
        targets.push({
          kind: "team",
          teamId: cls.teamId,
          scope: "class",
          subject: cls.className,
          linkUrl: "/director-payments",
        });
      } else if (cls.academyId) {
        // 오픈클래스 → 해당 아카데미 감독(ACADEMY_DIRECTOR)에게만 발송 (정규 감독/코치 제외).
        //  착지 = 아카데미 상세 정산 탭 — ACADEMY_DIRECTOR 는 /director-payments 미들웨어 차단 대상.
        const academy = await this.prisma.academy.findUnique({
          where: { id: cls.academyId },
          select: { directorId: true },
        });
        if (academy?.directorId) {
          targets.push({
            kind: "users",
            userIds: [academy.directorId],
            scope: "academy",
            subject: cls.className,
            linkUrl: `/academy/${cls.academyId}?tab=settlement`,
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
      if (r.tournament?.teamId)
        tourTeams.set(r.tournament.teamId, r.tournament.name);
    }
    for (const [teamId, name] of tourTeams) {
      targets.push({
        kind: "team",
        teamId,
        scope: "tournament",
        subject: name,
        linkUrl: "/director-payments",
      });
    }
    return targets;
  }

  private async sendToPaymentManagerTarget(
    target: PaymentManagerTarget,
    body: { notificationType: string; title: string; message: string },
  ): Promise<void> {
    if (target.kind === "team") {
      await this.notificationsService.notifyTeamManagers(target.teamId, {
        ...body,
        linkUrl: target.linkUrl,
      });
      return;
    }
    if (target.userIds.length === 0) return;
    await this.notificationsService.notifyUsers(target.userIds, {
      ...body,
      linkUrl: target.linkUrl,
    });
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
    // cancelled 는 실결제 후 취소(completedAt 존재)만 노출 — 재시도 시 Enrollment 재활용이
    //   이전 pending Payment 를 cancelled 로 마킹하는 고아(completedAt null)는 사용자가
    //   결제한 적 없는 건이라 숨긴다 (payment-create.service "이전 고아 Payment cancelled 처리").
    const payments = await this.prisma.payment.findMany({
      where: {
        userId,
        OR: [
          {
            paymentStatus: {
              in: ["completed", "refunded", "partially_refunded"],
            },
          },
          { paymentStatus: "cancelled", completedAt: { not: null } },
        ],
      },
      include: {
        product: {
          select: {
            productName: true,
            price: true,
            billingTiming: true,
          },
        },
        // [추가 2026-05-13] 본 결제와 연결된 Enrollment 의 class.className 노출 —
        //   결제내역 카드에서 "월 패키지" 위에 수업명 표시.
        enrollments: {
          select: {
            class: { select: { className: true } },
            child: { select: { firstName: true, lastName: true } },
          },
          take: 1,
        },
        // 출처 라벨링 파생용 관계 — N+1 방지 take:1 select
        tournamentRegistrations: {
          select: { tournament: { select: { billingMode: true, name: true } } },
          take: 1,
        },
        // 후불 산정 근거 표시용 — 라인 확정값 + billing 체인(정산월·수업명·자녀)
        monthlyBillingLines: {
          select: {
            id: true,
            attendanceCount: true,
            amount: true,
            billing: {
              select: {
                yearMonth: true,
                class: { select: { className: true } },
              },
            },
            user: { select: { firstName: true, lastName: true } },
          },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    // User 에 name 필드 없음 — 표시명은 lastName+firstName 조합, 둘 다 비면 null
    const toDisplayName = (
      u?: { firstName: string | null; lastName: string | null } | null,
    ) => (u ? `${u.lastName ?? ""}${u.firstName ?? ""}`.trim() || null : null);

    return payments.map((payment) => {
      const line = payment.monthlyBillingLines?.[0] ?? null;
      const src = deriveSource({
        productBillingTiming: payment.product?.billingTiming,
        hasMonthlyBillingLine: line != null,
        tournamentBillingMode:
          payment.tournamentRegistrations?.[0]?.tournament?.billingMode ?? null,
      });
      return {
        id: payment.id,
        orderNumber: payment.orderNumber,
        amount: payment.amount,
        paymentStatus: payment.paymentStatus,
        productName: payment.product?.productName,
        className: payment.enrollments?.[0]?.class?.className ?? null,
        createdAt: payment.createdAt,
        completedAt: payment.completedAt,
        // 파생 append (Dual Emit) — 무관계 결제는 null
        sourceType: src.sourceType,
        billingTiming: src.billingTiming,
        // 후불 산정 근거 append (additive) — 대회명 또는 후불 billing 체인 수업명.
        //   선불 수업명은 기존 className 이 담당(Enrollment 경유), 무관계 결제는 전부 null.
        subjectName:
          payment.tournamentRegistrations?.[0]?.tournament?.name ??
          line?.billing?.class?.className ??
          null,
        childName:
          toDisplayName(line?.user) ??
          toDisplayName(payment.enrollments?.[0]?.child),
        billingYearMonth: line?.billing?.yearMonth ?? null,
        attendanceCount: line?.attendanceCount ?? null,
        // 단가는 저장 컬럼 없음 — 라인 확정 총액÷출석횟수 파생 (0 나눗셈은 null)
        unitPrice:
          line && line.attendanceCount > 0
            ? Math.round(line.amount / line.attendanceCount)
            : null,
      };
    });
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
          // active 만 결제 집계 — expired(만료) 등 비활성 상태가 완납으로 오집계되지 않게 양성 비교.
          const paid = reg.status === "active" && isPaid(e);
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
    refundContext?: RefundExecutionContext,
  ) {
    return this.refundService.cancelPayment(
      paymentId,
      cancelReason,
      cancelAmount,
      refundBankCode,
      refundAccount,
      refundAccountHolder,
      requester,
      refundContext,
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
    refundContext?: RefundExecutionContext,
  ) {
    return this.refundService.requestRefund(
      paymentId,
      refundReason,
      refundAmount,
      requester,
      refundContext,
    );
  }

  /**
   * @deprecated Phase B-4 — PaymentRefundService.getRefundLogs 위임
   */
  async getRefundLogs(paymentId: string, requester?: RefundRequester) {
    return this.refundService.getRefundLogs(paymentId, requester);
  }

  /**
   * [환불 정책 2단계] 잔여 회차 비례 환불 산정 미리보기 — 확정 전 동일 값 노출용.
   * 소유자(학부모) 본인 또는 소속 관리자만 조회할 수 있다.
   */
  async getRefundQuote(paymentId: string, requester: JwtUserPayload) {
    await this.assertRefundQuoteViewer(paymentId, requester);
    return this.refundService.computeRefundQuote(paymentId);
  }

  /** 산정 미리보기 열람 권한 — 본인 결제는 통과, 그 외는 감독 스코프 검증에 위임. */
  private async assertRefundQuoteViewer(
    paymentId: string,
    requester: JwtUserPayload,
  ) {
    if (isAdminRole(requester.userType)) return;
    const owner = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { userId: true },
    });
    if (!owner) {
      throw new NotFoundException("결제 기록을 찾을 수 없습니다.");
    }
    if (owner.userId === requester.id) return;
    await this.refundService.assertManagerRefundScopeFor(paymentId, requester);
  }

  /**
   * [환불 정책 2단계] 감독/원장 승인 부분환불 — PaymentRefundService.refundByManager 위임.
   */
  async refundByManager(
    paymentId: string,
    dto: {
      refundReason: string;
      refundAmount?: number;
      refundBankCode?: string;
      refundAccount?: string;
      refundAccountHolder?: string;
    },
    requester: JwtUserPayload,
  ) {
    return this.refundService.refundByManager(paymentId, dto, requester);
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
   * 팀 귀속 조건 — 결제↔수업/대회 연결로 판정한다.
   *  결제자는 보호자이고 팀에 속한 사람은 자녀라, TeamMember 축(레거시 getClubPayments)은
   *  결제를 누락·오집계한다. 정산 센터(getTeamTransactions)와 동일 기준을 사용한다.
   */
  private buildTeamScopeFilter(
    teamId: string,
  ): import("@prisma/client").Prisma.PaymentWhereInput {
    return {
      OR: [
        { enrollments: { some: { class: { teamId } } } },
        { monthlyBillingLines: { some: { billing: { class: { teamId } } } } },
        { tournamentRegistrations: { some: { tournament: { teamId } } } },
      ],
    };
  }

  /**
   * 관리자 전체 결제 목록 조회 (검색/필터/페이지네이션)
   */
  async getAdminPaymentList(params: {
    search?: string;
    status?: string;
    teamId?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }) {
    const {
      search,
      status,
      teamId,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = params;
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

    // 검색어(OR)와 팀 귀속(OR)은 서로 다른 축이라 AND 로 합성한다.
    //   where.OR 에 직접 넣으면 두 조건이 하나의 OR 로 뭉쳐 필터가 무력화된다.
    const andConditions: import("@prisma/client").Prisma.PaymentWhereInput[] =
      [];
    if (search) {
      andConditions.push({
        OR: [
          { orderNumber: { contains: search } },
          { user: { email: { contains: search } } },
        ],
      });
    }
    if (teamId) {
      andConditions.push(this.buildTeamScopeFilter(teamId));
    }
    if (andConditions.length > 0) {
      where.AND = andConditions;
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
  async getAdminPaymentStats(params: {
    startDate?: Date;
    endDate?: Date;
    teamId?: string;
  }) {
    const { startDate, endDate, teamId } = params;

    const where: import("@prisma/client").Prisma.PaymentWhereInput = {};

    if (startDate || endDate) {
      where.createdAt = {
        ...(startDate && { gte: startDate }),
        ...(endDate && { lte: endDate }),
      };
    }

    if (teamId) {
      where.AND = [this.buildTeamScopeFilter(teamId)];
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
   * [어드민 결제 관리] 팀별 "선택 월" 결제 요약 — 구현·판정 계약은
   * admin-team-payment-summary.util.ts 참조 (attribution.util SoT 공유).
   */
  async getAdminTeamPaymentSummaries(yearMonth?: string) {
    return buildAdminTeamPaymentSummaries(this.prisma, yearMonth);
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
    return this.receiptService.getReceipt(
      paymentId,
      requesterId,
      requesterType,
    );
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
        pgProvider: true,
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

    // 2) 나이스 구모듈 — 승인 응답에 영수증 URL 이 없어 거래번호로 매출전표 주소를 조합한다.
    //    이 수정 전에 만들어진 영수증 행(URL 없음)도 처음 열 때 여기서 보충·저장된다.
    if (
      payment.pgProvider === "nicestd" &&
      payment.paymentStatus === "completed" &&
      payment.tid
    ) {
      const url = buildNiceStdReceiptUrl(payment.tid);
      await this.receiptService.createReceipt(paymentId, url);
      return { downloadUrl: url };
    }
    // 3) 토스 사후 보충 — 완료 결제 + tid(=토스 paymentKey) 있을 때 토스에서 영수증 URL 조회.
    //    결제사가 토스일 때만 — 다른 결제사 거래번호로 토스를 조회하면 실패 로그만 남는다.
    if (
      payment.pgProvider === "toss" &&
      payment.paymentStatus === "completed" &&
      payment.tid
    ) {
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

    throw new ForbiddenException(
      "해당 회원의 결제 이력을 조회할 권한이 없습니다.",
    );
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
