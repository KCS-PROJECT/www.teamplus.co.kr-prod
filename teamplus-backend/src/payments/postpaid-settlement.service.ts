import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "@/prisma/prisma.service";
import { NotificationsService } from "@/notifications/notifications.service";
import {
  PaymentCalculationService,
  BillingTiming,
} from "./payment-calculation.service";

export interface PostpaidSummaryItem {
  classId: string;
  className: string;
  userId: string;
  userEmail: string;
  attendanceCount: number;
  amount: number;
  month: string;
  status: "pending" | "processed";
}

@Injectable()
export class PostpaidSettlementService {
  private readonly logger = new Logger(PostpaidSettlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly calculationService: PaymentCalculationService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * 정산 자동 실행 (P-13 — 2026-05-21 변경)
   *
   * [Phase B-3] 본 배치는 **초안 산출/로그 전용**이다 — 실제 청구(Payment 생성·알림)는
   *   감독이 검수 후 POST /payments/postpaid/confirm 으로 수동 확정한다(자동 청구 없음).
   *
   * 정책: 매월 **10일 00:00 KST** + **말일 00:00 KST** 2회 실행
   *  - 10일 실행: 전월(1~말일) 정산 (기존 동작 유지)
   *  - 말일 실행: 당월(1~말일) 정산 (실시간 정산 — 학부모 익월 청구 부담 완화)
   *
   * Cron 표현식: `0 0 10,28-31 * *` (10일 + 28~31일 매일 — runtime에서 말일만 통과)
   *  - cron-parser는 "L" 미지원 → 28-31일 모두 발화 후 isLastDayOfMonth() 가드
   *  - 어드민에서 `AppSettings.settlementDays` 로 가드 패턴 동적 변경 가능
   */
  @Cron("0 0 10,28,29,30,31 * *", { timeZone: "Asia/Seoul" })
  async processScheduledSettlement(): Promise<void> {
    const now = new Date();
    const day = now.getDate();
    const lastDay = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
    ).getDate();
    const isLastDay = day === lastDay;
    const isTenth = day === 10;

    // 10일도 말일도 아니면 스킵 (28-31일 가드)
    if (!isTenth && !isLastDay) {
      return;
    }

    // 정산 대상 월 결정:
    //  - 10일 실행 → 전월 정산
    //  - 말일 실행 → 당월 정산
    const targetMonth = isTenth
      ? new Date(now.getFullYear(), now.getMonth() - 1, 1)
      : new Date(now.getFullYear(), now.getMonth(), 1);

    const reason = isTenth ? "전월 정산(10일 배치)" : "당월 정산(말일 배치)";
    this.logger.log(
      `후결제 정산 배치 시작 [${reason}]: ${targetMonth.getFullYear()}년 ${targetMonth.getMonth() + 1}월`,
    );

    try {
      await this.processSettlementForMonth(targetMonth);
      this.logger.log(`후결제 정산 배치 완료 [${reason}]`);
    } catch (error) {
      this.logger.error(
        `후결제 정산 배치 실패 [${reason}]`,
        (error as Error).stack,
      );
    }
  }

  /**
   * @deprecated 2026-05-21 — `processScheduledSettlement` 으로 통합 (10일 + 말일 2회)
   */
  async processMonthlySettlement(): Promise<void> {
    return this.processScheduledSettlement();
  }

  /**
   * 특정 월 후결제 정산 처리
   */
  async processSettlementForMonth(month: Date): Promise<PostpaidSummaryItem[]> {
    const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
    const monthEnd = new Date(
      month.getFullYear(),
      month.getMonth() + 1,
      0,
      23,
      59,
      59,
    );
    const monthLabel = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;

    // 1. POSTPAID 설정된 수업 상품 조회
    const postpaidProducts = await this.prisma.classProduct.findMany({
      where: { billingTiming: BillingTiming.POSTPAID },
      include: {
        class: {
          select: {
            id: true,
            className: true,
            schedules: {
              where: {
                scheduledDate: { gte: monthStart, lte: monthEnd },
              },
              select: {
                id: true,
                attendances: {
                  where: { attendanceStatus: "present" },
                  select: { memberId: true },
                },
              },
            },
          },
        },
        enrollments: {
          where: { status: "paid" },
          select: {
            childId: true,
            child: { select: { id: true, email: true } },
          },
        },
      },
    });

    const results: PostpaidSummaryItem[] = [];

    for (const product of postpaidProducts) {
      // 2. 전월 출석 횟수 집계 (수강 완료 회원별)
      const attendanceMap = new Map<string, number>();

      for (const schedule of product.class.schedules) {
        for (const att of schedule.attendances) {
          const current = attendanceMap.get(att.memberId) ?? 0;
          attendanceMap.set(att.memberId, current + 1);
        }
      }

      // 3. 수강 중인 회원별 결제 요청 생성
      for (const enrollment of product.enrollments) {
        const userId = enrollment.childId;
        const count = attendanceMap.get(userId) ?? 0;

        if (count === 0) continue;

        const amount = this.calculationService.calculatePerSessionFee(
          { feePerSession: product.feePerSession },
          count,
        );

        results.push({
          classId: product.class.id,
          className: product.class.className,
          userId,
          userEmail: enrollment.child.email ?? "",
          attendanceCount: count,
          amount: amount.toNumber(),
          month: monthLabel,
          status: "processed",
        });

        // 4. 결제 대기 레코드 생성 (알림 발송용 로그)
        this.logger.log(
          `후결제 정산: classId=${product.class.id}, userId=${userId}, ` +
            `출석=${count}회, 금액=${amount.toNumber()}원, 월=${monthLabel}`,
        );
      }
    }

    return results;
  }

  /**
   * 후결제 정산 내역 조회 (특정 월)
   */
  async getPostpaidSummary(
    month: Date,
    _classId?: string,
  ): Promise<PostpaidSummaryItem[]> {
    return this.processSettlementForMonth(month);
  }

  // ──────────────────────────────────────────────────────────────────
  // [Phase B-3] 감독 정산 확정 플로우 (모드 A POSTPAID)
  // ──────────────────────────────────────────────────────────────────

  /** "YYYY-MM" → 해당 월 [start, end] */
  private monthRange(yearMonth: string): { start: Date; end: Date } {
    const [y, m] = yearMonth.split("-").map(Number);
    return {
      start: new Date(y, m - 1, 1),
      end: new Date(y, m, 0, 23, 59, 59),
    };
  }

  /** 수업×월 출석 집계 (present) — scheduleId 단위 합산. */
  private async aggregateAttendance(
    classId: string,
    start: Date,
    end: Date,
  ): Promise<Map<string, number>> {
    const schedules = await this.prisma.classSchedule.findMany({
      where: {
        classId,
        scheduledDate: { gte: start, lte: end },
        isCancelled: false,
      },
      select: {
        attendances: {
          where: { attendanceStatus: "present" },
          select: { memberId: true },
        },
      },
    });
    const counts = new Map<string, number>();
    for (const s of schedules) {
      for (const a of s.attendances) {
        counts.set(a.memberId, (counts.get(a.memberId) ?? 0) + 1);
      }
    }
    return counts;
  }

  /** 수업×월 POSTPAID 정산 초안 — 회원별 출석×단가 미리보기 (미저장). */
  async getDraft(classId: string, yearMonth: string) {
    const { start, end } = this.monthRange(yearMonth);

    const product = await this.prisma.classProduct.findFirst({
      where: { classId, billingTiming: BillingTiming.POSTPAID },
      select: { feePerSession: true },
    });
    const unitPrice = product?.feePerSession
      ? Number(product.feePerSession)
      : 0;

    const counts = await this.aggregateAttendance(classId, start, end);

    const userIds = [...counts.keys()];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const nameOf = new Map(
      users.map((u) => [u.id, `${u.lastName}${u.firstName}`]),
    );

    const billing = await this.prisma.monthlyPostpaidBilling.findUnique({
      where: { classId_yearMonth: { classId, yearMonth } },
      select: { status: true, confirmedAt: true },
    });

    const items = [...counts.entries()]
      .filter(([, c]) => c > 0)
      .map(([userId, attendanceCount]) => ({
        userId,
        name: nameOf.get(userId) ?? "",
        attendanceCount,
        amount: unitPrice * attendanceCount,
      }));

    return {
      classId,
      yearMonth,
      unitPrice,
      status: billing?.status ?? "none",
      confirmedAt: billing?.confirmedAt ?? null,
      totalAmount: items.reduce((s, i) => s + i.amount, 0),
      items,
    };
  }

  /**
   * 수업×월 POSTPAID 정산 확정 — 감독 검수 후 호출.
   * 회원별 출석×단가로 pending Payment 일괄 생성 + 청구 알림. 멱등(재확정 차단).
   */
  async confirmSettlement(
    classId: string,
    yearMonth: string,
    confirmedBy: string,
  ): Promise<{ billingId: string; lineCount: number; totalAmount: number }> {
    // [A안] 월 마감 전 확정 금지 — 당월/미래월은 출석이 더 쌓일 수 있어 청구가 미완성.
    //   draft(미리보기)는 당월에도 허용하되, 실제 청구를 만드는 confirm 만 과거월로 제한한다.
    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const currentYearMonth = `${kstNow.getUTCFullYear()}-${String(
      kstNow.getUTCMonth() + 1,
    ).padStart(2, "0")}`;
    if (yearMonth >= currentYearMonth) {
      // YYYY-MM 은 사전식 비교 = 시간순 비교
      throw new BadRequestException(
        "해당 월이 종료된 후에 정산을 확정할 수 있습니다.",
      );
    }

    const { start, end } = this.monthRange(yearMonth);

    const product = await this.prisma.classProduct.findFirst({
      where: { classId, billingTiming: BillingTiming.POSTPAID },
      select: { id: true, feePerSession: true },
    });
    if (!product?.feePerSession) {
      throw new BadRequestException("후불 단가가 설정되지 않은 수업입니다.");
    }
    const unitPrice = Number(product.feePerSession);

    const existing = await this.prisma.monthlyPostpaidBilling.findUnique({
      where: { classId_yearMonth: { classId, yearMonth } },
      select: { status: true },
    });
    if (existing?.status === "confirmed") {
      throw new ConflictException("이미 확정된 정산입니다.");
    }

    const counts = await this.aggregateAttendance(classId, start, end);
    const lines = [...counts.entries()]
      .filter(([, c]) => c > 0)
      .map(([userId, count]) => ({ userId, count, amount: unitPrice * count }));
    const totalAmount = lines.reduce((s, l) => s + l.amount, 0);

    // [Phase B-5-4] 결제자(payer) 해석 — 출석자(자녀)의 주 보호자. Payment.userId 는 결제자여야
    //   confirmTossPayment(본인 결제 검증)를 통과한다. 보호자 없으면 본인(성인/청소년) 폴백.
    const childIds = lines.map((l) => l.userId);
    const parentLinks = childIds.length
      ? await this.prisma.parentChild.findMany({
          where: { childId: { in: childIds } },
          select: { childId: true, parentId: true, isPrimary: true },
        })
      : [];
    const payerOf = new Map<string, string>();
    for (const pl of parentLinks) {
      if (!payerOf.has(pl.childId) || pl.isPrimary) {
        payerOf.set(pl.childId, pl.parentId);
      }
    }

    const billing = await this.prisma.$transaction(async (tx) => {
      const head = await tx.monthlyPostpaidBilling.upsert({
        where: { classId_yearMonth: { classId, yearMonth } },
        update: { status: "confirmed", confirmedBy, confirmedAt: new Date() },
        create: {
          classId,
          yearMonth,
          status: "confirmed",
          confirmedBy,
          confirmedAt: new Date(),
        },
        select: { id: true },
      });

      for (const ln of lines) {
        const orderNumber = `POSTPAID-${head.id}-${ln.userId}`;
        const payment = await tx.payment.upsert({
          where: { orderNumber },
          update: { amount: ln.amount, paymentStatus: "pending" },
          create: {
            orderNumber,
            userId: payerOf.get(ln.userId) ?? ln.userId,
            productId: product.id,
            amount: ln.amount,
            paymentStatus: "pending",
          },
          select: { id: true },
        });
        await tx.monthlyPostpaidBillingLine.upsert({
          where: {
            billingId_userId: { billingId: head.id, userId: ln.userId },
          },
          update: {
            attendanceCount: ln.count,
            amount: ln.amount,
            paymentId: payment.id,
            paymentStatus: "pending",
          },
          create: {
            billingId: head.id,
            userId: ln.userId,
            attendanceCount: ln.count,
            amount: ln.amount,
            paymentId: payment.id,
          },
        });
      }

      return head;
    });

    // 청구 알림 (트랜잭션 밖 — 실패해도 정산 롤백 없음).
    //   [Phase B-5-4] 결제자(학부모)에게 발송 + orderNumber 담은 결제 화면 deep-link.
    for (const ln of lines) {
      const payerId = payerOf.get(ln.userId) ?? ln.userId;
      const orderNumber = `POSTPAID-${billing.id}-${ln.userId}`;
      const link = `/payment/postpaid?orderNumber=${encodeURIComponent(orderNumber)}&amount=${ln.amount}&name=${encodeURIComponent(`${yearMonth} 수업료`)}`;
      try {
        await this.notifications.createNotification({
          userId: payerId,
          notificationType: "postpaid_billing",
          title: "수업료 결제 요청",
          message: `${yearMonth} 출석 ${ln.count}회 · ${ln.amount.toLocaleString()}원 결제를 진행해주세요.`,
          linkUrl: link,
        });
      } catch (e) {
        this.logger.warn(
          `후불 청구 알림 실패: userId=${payerId}, ${(e as Error).message}`,
        );
      }
    }

    return { billingId: billing.id, lineCount: lines.length, totalAmount };
  }

  /** 학부모(결제자)의 미납 후불 청구 목록 — 확정된 라인 중 paymentStatus=pending. */
  async getMyPendingBillings(payerUserId: string) {
    const lines = await this.prisma.monthlyPostpaidBillingLine.findMany({
      where: {
        paymentStatus: "pending",
        payment: { userId: payerUserId, paymentStatus: "pending" },
      },
      select: {
        id: true,
        attendanceCount: true,
        amount: true,
        billing: {
          select: {
            yearMonth: true,
            class: { select: { id: true, className: true } },
          },
        },
        payment: { select: { orderNumber: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return lines.map((l) => ({
      lineId: l.id,
      classId: l.billing.class.id,
      className: l.billing.class.className,
      yearMonth: l.billing.yearMonth,
      attendanceCount: l.attendanceCount,
      amount: l.amount,
      orderNumber: l.payment?.orderNumber ?? null,
    }));
  }
}
