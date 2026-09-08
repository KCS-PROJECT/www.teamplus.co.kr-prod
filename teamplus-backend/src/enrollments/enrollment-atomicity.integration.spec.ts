import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { EnrollmentsService } from "./enrollments.service";
import { PrismaService } from "@/prisma/prisma.service";
import { CreditDomainService } from "@/credits/credit-domain.service";
import { PaymentsService } from "@/payments/payments.service";
import { RefundRequestService } from "@/payments/refund-requests/refund-request.service";
import { ORPHAN_PAYMENT_REFUND_REASON } from "@/payments/services/payment-enrollment-transition.util";

/**
 * 등록 생성·취소 원자성 — 실제 DEV DB 경합 재현 (RUN_DB_INTEGRATION=1 일 때만).
 *   ① 취소 중간 실패(명단 해지 단계 예외 주입) → 등록 상태·명단 원상 유지
 *   ② 같은 등록 동시 취소 2건 → 성공 1 · 실패 1, 명단 inactive
 *   ③ 후불 수업 마지막 1석 동시 등록 2건 → 성공 1 · 정원 409 1 (좌석 잠금)
 *   ④ 비판매 상품 · 결제방식 불일치 상품 → 400, 등록 행 0
 *   ⑤ [실제 승인 후처리] 취소 뒤 늦은 결제 승인 → 결제 completed · 등록 cancelled 유지 · 명단 미활성 ·
 *      환불 요청 자동 접수 1건 · 재도착 멱등
 *   ⑥ [실제 승인 후처리] 정상 경로 — pending 등록 paid · 명단 active · 환불 요청 없음
 *   ⑦ [실제 등록 서비스 + 승인 후처리] 후불 재활용(이전 선불 결제 로컬 취소) 뒤 늦은 승인 →
 *      결제 cancelled→completed 로 바로잡힘 · 후불 등록 유지 · 환불 요청 접수 · 판단 자료 sourceOk
 *   ⑦' 승인 선행 경합 — 결제가 먼저 완료되면 후불 재활용은 409, 등록·결제 무변경
 *   ⑧ [실제 좌석 선점] 선점 뒤 취소 → 승인 후처리 후 명단 inactive · 취소 뒤 선점 → 선점 0
 *   ⑨ 본인 활성 좌석은 정원 카운트에서 제외 — 만석(정원 1)이어도 본인 등록 성공
 * fixture: 블랭크 팀 소속 신규 수업(실행별 고유 태그) + parents1 자녀 2명(승인된 PLAYER).
 *   전제(고정 ID·부모자녀·팀 소속)가 없으면 beforeAll 에서 실패시킨다(조용한 통과 금지).
 *   정리는 이번 실행이 만든 행만 대상으로 하며 disconnect 는 finally 로 보장한다.
 */
jest.setTimeout(180_000);

const RUN = process.env.RUN_DB_INTEGRATION === "1";
const describeIf = RUN ? describe : describe.skip;

const TEAM_ID = "cmq7nuec400mkiazlq3tuzc4t"; // 블랭크
const PARENT_ID = "cmqaww02m002087abp1dwn5tt"; // parents1
const CHILD_A = "cmqeqm2ha00ai9jkokw4yfz9y";
const CHILD_B = "cmqawxxt7003487abv982a84t";
const RUN_TAG = `enrollment-atomicity ${randomUUID().slice(0, 8)}`;

function buildEnrollmentsService(prisma: PrismaService): EnrollmentsService {
  return new EnrollmentsService(
    prisma,
    {} as never,
    { promoteNextWaitlist: jest.fn().mockResolvedValue(undefined) } as never,
    new CreditDomainService(),
  );
}

/** 결제 확인 서비스 — 승인 후처리·좌석 선점만 실제로 쓰고 결제사·Redis 등은 스텁 */
function buildPaymentsService(prisma: PrismaService) {
  const notifications = {
    notifyUsers: jest.fn().mockResolvedValue(undefined),
    notifyTeamManagers: jest.fn().mockResolvedValue(undefined),
  };
  const service = new PaymentsService(
    prisma,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    new CreditDomainService(),
    notifications as never,
  );
  return { service, notifications };
}

/** 명단 해지 단계에서 예외를 던지는 PrismaService — tx 프록시로 classRegistration.updateMany 만 실패시킨다. */
function buildFailingPrisma(): PrismaService {
  const prisma = new PrismaService();
  const original = prisma.$transaction.bind(prisma);
  (prisma as any).$transaction = (fn: any, opts?: any) =>
    original(async (tx: any) => {
      const proxied = new Proxy(tx, {
        get(target, prop) {
          if (prop === "classRegistration") {
            return new Proxy(target.classRegistration, {
              get(delegate, p) {
                if (p === "updateMany") {
                  return async () => {
                    throw new Error("[integration] 명단 해지 단계 실패 주입");
                  };
                }
                return Reflect.get(delegate, p);
              },
            });
          }
          return Reflect.get(target, prop);
        },
      });
      return fn(proxied);
    }, opts);
  return prisma;
}

describeIf("enrollment atomicity (integration — 실제 DEV DB)", () => {
  const raw = new PrismaClient();
  const prismaA = new PrismaService();
  const prismaB = new PrismaService();
  const serviceA = buildEnrollmentsService(prismaA);
  const serviceB = buildEnrollmentsService(prismaB);
  const payments = buildPaymentsService(prismaA);
  const createdClassIds: string[] = [];
  const createdPaymentIds: string[] = [];

  async function makeClass(
    tag: string,
    capacity: number,
    billingMode: "POSTPAID" | "PREPAID" | "BOTH" = "POSTPAID",
  ) {
    const future = new Date();
    future.setUTCDate(future.getUTCDate() + 10);
    future.setUTCHours(0, 0, 0, 0);
    const salesOpenMonth = new Date(
      Date.UTC(future.getUTCFullYear(), future.getUTCMonth(), 1),
    );
    const cls = await raw.class.create({
      data: {
        teamId: TEAM_ID,
        className: `[integration] ${RUN_TAG} ${tag}`,
        instructorName: "integration",
        capacity,
        startTime: future,
        endTime: new Date(future.getTime() + 3600_000),
        billingMode,
        trainingType: "regular",
        approvalStatus: "APPROVED",
        salesOpenMonth,
        schedules: {
          create: {
            scheduledDate: future,
            startTime: "17:00",
            endTime: "18:00",
          },
        },
        products: {
          create: [
            {
              productName: "후불 1회 수업료",
              price: 10000,
              sessionsPerMonth: 0,
              feeType: "PER_SESSION",
              billingTiming: "POSTPAID",
              feePerSession: 10000,
              isActive: true,
            },
            {
              productName: "판매 중지 후불",
              price: 10000,
              sessionsPerMonth: 0,
              feeType: "PER_SESSION",
              billingTiming: "POSTPAID",
              feePerSession: 10000,
              isActive: false,
            },
            {
              productName: "선불 정액",
              price: 100000,
              sessionsPerMonth: 0,
              feeType: "MONTHLY_FIXED",
              billingTiming: "PREPAID",
              isActive: true,
            },
          ],
        },
      },
      select: {
        id: true,
        products: { select: { id: true, billingTiming: true, isActive: true } },
      },
    });
    createdClassIds.push(cls.id);
    const postpaid = cls.products.find(
      (p) => p.billingTiming === "POSTPAID" && p.isActive,
    )!;
    const inactive = cls.products.find(
      (p) => p.billingTiming === "POSTPAID" && !p.isActive,
    )!;
    const prepaid = cls.products.find((p) => p.billingTiming === "PREPAID")!;
    return {
      classId: cls.id,
      postpaidId: postpaid.id,
      inactiveId: inactive.id,
      prepaidId: prepaid.id,
    };
  }

  const enrollmentOf = (classId: string, childId: string) =>
    raw.enrollment.findFirst({
      where: { classId, childId },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, paymentId: true, classProductId: true },
    });
  const registrationOf = (classId: string, childId: string) =>
    raw.classRegistration.findUnique({
      where: { classId_userId: { classId, userId: childId } },
      select: { status: true },
    });
  const paymentOf = (id: string) =>
    raw.payment.findUnique({
      where: { id },
      select: { paymentStatus: true, tid: true },
    });
  const refundRequestsOf = (paymentId: string) =>
    raw.refundRequest.findMany({
      where: { paymentId },
      select: {
        id: true,
        status: true,
        sourceType: true,
        requestedAmount: true,
        classId: true,
        childId: true,
        requestReason: true,
      },
    });

  /**
   * 결제까지 끝난 선불 등록(paid) + completed Payment — 월 귀속 판정 대상 행.
   *  상품은 MONTHLY_FIXED(billingMonth 없음)라 귀속월은 결제 완료 시각의 KST 월이 된다.
   */
  async function makePaidPrepaidEnrollment(
    fx: { classId: string; prepaidId: string },
    childId = CHILD_A,
    monthsAgo = 0,
  ) {
    const completedAt = new Date();
    completedAt.setUTCMonth(completedAt.getUTCMonth() - monthsAgo);
    const payment = await raw.payment.create({
      data: {
        orderNumber: `INTEG-${randomUUID()}`,
        userId: PARENT_ID,
        productId: fx.prepaidId,
        amount: 100000,
        paymentStatus: "completed",
        paymentMethod: "card",
        pgProvider: "mock",
        completedAt,
      },
      select: { id: true },
    });
    createdPaymentIds.push(payment.id);
    const enrollment = await raw.enrollment.create({
      data: {
        childId,
        classId: fx.classId,
        classProductId: fx.prepaidId,
        requestedBy: PARENT_ID,
        requestType: "parent_direct",
        status: "paid",
        paymentId: payment.id,
        paidAt: completedAt,
        expiresAt: new Date(Date.now() + 72 * 3600_000),
      },
      select: { id: true },
    });
    return { paymentId: payment.id, enrollmentId: enrollment.id };
  }

  /** 결제를 기다리는 pending 등록 + pending Payment (선불 결제 개시 결과와 동형) */
  async function makePendingPaidEnrollment(
    fx: { classId: string; prepaidId: string },
    childId = CHILD_A,
  ) {
    const payment = await raw.payment.create({
      data: {
        orderNumber: `INTEG-${randomUUID()}`,
        userId: PARENT_ID,
        productId: fx.prepaidId,
        amount: 100000,
        paymentStatus: "pending",
        paymentMethod: "card",
        pgProvider: "mock",
      },
      select: { id: true },
    });
    createdPaymentIds.push(payment.id);
    const enrollment = await raw.enrollment.create({
      data: {
        childId,
        classId: fx.classId,
        classProductId: fx.prepaidId,
        requestedBy: PARENT_ID,
        requestType: "parent_direct",
        status: "pending",
        paymentId: payment.id,
        expiresAt: new Date(Date.now() + 72 * 3600_000),
      },
      select: { id: true },
    });
    return { paymentId: payment.id, enrollmentId: enrollment.id };
  }

  /** 결제사 승인 성공 뒤 호출되는 실제 승인 후처리(private) — PG 응답만 대체 */
  async function lateApproval(paymentId: string) {
    const row = await raw.payment.findUniqueOrThrow({
      where: { id: paymentId },
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
    await (payments.service as any).applyApprovedPayment(row, {
      paymentMethod: "toss",
      pgProvider: "toss",
      tid: `INTEG-TID-${randomUUID().slice(0, 8)}`,
      approvedAt: new Date(),
      orderId: `INTEG-${paymentId}`,
      // 실결제 경로 — 돈이 나간 뒤라 로컬 취소분도 완료로 바로잡는다.
      claimFrom: ["pending", "cancelled"],
    });
  }

  beforeAll(async () => {
    const [team, parent, links, members] = await Promise.all([
      raw.team.findUnique({ where: { id: TEAM_ID }, select: { id: true } }),
      raw.user.findUnique({ where: { id: PARENT_ID }, select: { id: true } }),
      raw.parentChild.count({
        where: { parentId: PARENT_ID, childId: { in: [CHILD_A, CHILD_B] } },
      }),
      raw.teamMember.count({
        where: {
          teamId: TEAM_ID,
          userId: { in: [CHILD_A, CHILD_B] },
          roleInTeam: "PLAYER",
          approvalStatus: "approved",
        },
      }),
    ]);
    const missing = !team
      ? `team ${TEAM_ID} 없음`
      : !parent
        ? `parent ${PARENT_ID} 없음`
        : links !== 2
          ? `parent-child 연결 ${links}/2`
          : members !== 2
            ? `승인된 PLAYER 소속 ${members}/2`
            : null;
    if (missing) {
      throw new Error(
        `[integration] fixture 전제 없음 — ${missing}. 테스트 계정 대장(test-accounts)을 확인한 뒤 상수를 갱신하세요.`,
      );
    }
  });

  afterAll(async () => {
    try {
      if (createdPaymentIds.length) {
        await raw.refundRequest.deleteMany({
          where: { paymentId: { in: createdPaymentIds } },
        });
      }
      if (createdClassIds.length) {
        await raw.enrollment.deleteMany({
          where: { classId: { in: createdClassIds } },
        });
        await raw.classRegistration.deleteMany({
          where: { classId: { in: createdClassIds } },
        });
        await raw.classProduct.deleteMany({
          where: { classId: { in: createdClassIds } },
        });
        await raw.classSchedule.deleteMany({
          where: { classId: { in: createdClassIds } },
        });
        await raw.class.deleteMany({ where: { id: { in: createdClassIds } } });
      }
      if (createdPaymentIds.length) {
        await raw.payment.deleteMany({
          where: { id: { in: createdPaymentIds } },
        });
      }
    } finally {
      await Promise.allSettled([
        raw.$disconnect(),
        prismaA.$disconnect(),
        prismaB.$disconnect(),
      ]);
    }
  });

  it("① 취소 중간 실패 → 등록 approved · 명단 active 원상 유지", async () => {
    const fx = await makeClass("cancel-fail", 5);
    await serviceA.createEnrollment(PARENT_ID, {
      childId: CHILD_A,
      classId: fx.classId,
      classProductId: fx.postpaidId,
    } as never);
    const before = await enrollmentOf(fx.classId, CHILD_A);
    expect(before?.status).toBe("approved");
    expect((await registrationOf(fx.classId, CHILD_A))?.status).toBe("active");

    const failing = buildFailingPrisma();
    try {
      const failingService = buildEnrollmentsService(failing);
      await expect(
        failingService.cancelEnrollment(PARENT_ID, before!.id),
      ).rejects.toThrow("명단 해지 단계 실패 주입");
    } finally {
      await failing.$disconnect();
    }

    expect((await enrollmentOf(fx.classId, CHILD_A))?.status).toBe("approved");
    expect((await registrationOf(fx.classId, CHILD_A))?.status).toBe("active");
  });

  it("② 같은 등록 동시 취소 2건 → 성공 1 · 실패 1 · 명단 inactive", async () => {
    const fx = await makeClass("double-cancel", 5);
    await serviceA.createEnrollment(PARENT_ID, {
      childId: CHILD_A,
      classId: fx.classId,
      classProductId: fx.postpaidId,
    } as never);
    const en = await enrollmentOf(fx.classId, CHILD_A);

    const results = await Promise.allSettled([
      serviceA.cancelEnrollment(PARENT_ID, en!.id),
      serviceB.cancelEnrollment(PARENT_ID, en!.id),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled").length;
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toBe(1);
    expect(rejected).toHaveLength(1);
    const loser = (rejected[0] as PromiseRejectedResult).reason;
    expect(
      loser instanceof ConflictException ||
        loser instanceof BadRequestException,
    ).toBe(true);
    expect((await enrollmentOf(fx.classId, CHILD_A))?.status).toBe("cancelled");
    expect((await registrationOf(fx.classId, CHILD_A))?.status).toBe(
      "inactive",
    );
  });

  it("③ 후불 수업 마지막 1석 동시 등록 2건 → 성공 1 · 정원 409 1", async () => {
    const fx = await makeClass("capacity-race", 1);
    const results = await Promise.allSettled([
      serviceA.createEnrollment(PARENT_ID, {
        childId: CHILD_A,
        classId: fx.classId,
        classProductId: fx.postpaidId,
      } as never),
      serviceB.createEnrollment(PARENT_ID, {
        childId: CHILD_B,
        classId: fx.classId,
        classProductId: fx.postpaidId,
      } as never),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled").length;
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toBe(1);
    expect(rejected).toHaveLength(1);
    const loser = (rejected[0] as PromiseRejectedResult).reason;
    expect(loser).toBeInstanceOf(ConflictException);
    expect(String(loser.message)).toContain("정원");
    expect(
      await raw.classRegistration.count({
        where: { classId: fx.classId, status: "active" },
      }),
    ).toBe(1);
  });

  it("④ 판매 중지 상품 · 결제방식 불일치 상품 → 400, 등록 행 0", async () => {
    const fx = await makeClass("product-guard", 5);
    await expect(
      serviceA.createEnrollment(PARENT_ID, {
        childId: CHILD_A,
        classId: fx.classId,
        classProductId: fx.inactiveId,
      } as never),
    ).rejects.toThrow("현재 결제할 수 없는 수강권입니다.");
    await expect(
      serviceA.createEnrollment(PARENT_ID, {
        childId: CHILD_A,
        classId: fx.classId,
        classProductId: fx.prepaidId,
      } as never),
    ).rejects.toThrow("수업 결제 방식과 맞지 않는 상품입니다.");
    expect(await raw.enrollment.count({ where: { classId: fx.classId } })).toBe(
      0,
    );
  });

  it("⑤ [승인 후처리] 취소 뒤 늦은 승인 → 결제 completed · 등록 cancelled · 명단 미활성 · 환불 요청 1 · 재도착 멱등", async () => {
    const fx = await makeClass("late-approval", 5);
    const { paymentId, enrollmentId } = await makePendingPaidEnrollment(fx);
    await serviceA.cancelEnrollment(PARENT_ID, enrollmentId);

    await lateApproval(paymentId);

    expect((await paymentOf(paymentId))?.paymentStatus).toBe("completed");
    expect((await enrollmentOf(fx.classId, CHILD_A))?.status).toBe("cancelled");
    expect(await registrationOf(fx.classId, CHILD_A)).toBeNull();
    const rrs = await refundRequestsOf(paymentId);
    expect(rrs).toHaveLength(1);
    expect(rrs[0]).toMatchObject({
      status: "pending",
      sourceType: "CLASS_PREPAID",
      requestedAmount: 100000,
      classId: fx.classId,
      childId: CHILD_A,
      requestReason: ORPHAN_PAYMENT_REFUND_REASON,
    });
    expect(payments.notifications.notifyUsers).toHaveBeenCalledWith(
      [PARENT_ID],
      expect.objectContaining({ notificationType: "refund_request_created" }),
    );

    // 웹훅 재시도 등 재도착 — 이미 completed 라 claim 0건, 중복 접수 없음
    await lateApproval(paymentId);
    expect(await refundRequestsOf(paymentId)).toHaveLength(1);
  });

  it("⑥ [승인 후처리] 정상 경로 — pending 등록 paid · 명단 active · 환불 요청 없음", async () => {
    const fx = await makeClass("approval-normal", 5);
    const { paymentId } = await makePendingPaidEnrollment(fx);
    await lateApproval(paymentId);
    expect((await paymentOf(paymentId))?.paymentStatus).toBe("completed");
    expect((await enrollmentOf(fx.classId, CHILD_A))?.status).toBe("paid");
    expect((await registrationOf(fx.classId, CHILD_A))?.status).toBe("active");
    expect(await refundRequestsOf(paymentId)).toHaveLength(0);
  });

  it("⑦ [등록 서비스 + 승인 후처리] 후불 재활용 뒤 늦은 승인 → 결제 cancelled→completed · 후불 등록 유지 · 환불 요청 · 판단 자료 OK", async () => {
    const fx = await makeClass("reuse-late-approval", 5, "BOTH");
    const { paymentId, enrollmentId } = await makePendingPaidEnrollment(fx);

    // 결제사 승인 진행 중 같은 자녀가 후불로 재신청 → 이전 선불 결제 로컬 취소 · 등록 approved/paymentId=null
    await serviceA.createEnrollment(PARENT_ID, {
      childId: CHILD_A,
      classId: fx.classId,
      classProductId: fx.postpaidId,
    } as never);
    const converted = await enrollmentOf(fx.classId, CHILD_A);
    expect(converted).toMatchObject({
      id: enrollmentId,
      status: "approved",
      paymentId: null,
      classProductId: fx.postpaidId,
    });
    expect((await paymentOf(paymentId))?.paymentStatus).toBe("cancelled");

    // 늦게 도착한 결제사 승인 — 돈은 나갔다
    await lateApproval(paymentId);
    expect((await paymentOf(paymentId))?.paymentStatus).toBe("completed");
    expect((await enrollmentOf(fx.classId, CHILD_A))?.status).toBe("approved");
    expect((await registrationOf(fx.classId, CHILD_A))?.status).toBe("active");
    const rrs = await refundRequestsOf(paymentId);
    expect(rrs).toHaveLength(1);
    expect(rrs[0]).toMatchObject({
      status: "pending",
      sourceType: "CLASS_PREPAID",
      classId: fx.classId,
      childId: null,
    });

    // 연결 등록이 없어도 자동 접수 요청은 판단 자료가 채워진다(감독 승인 가능)
    const rrService = new RefundRequestService(
      prismaA,
      {} as never,
      {} as never,
      {} as never,
    );
    const rrRow = await raw.refundRequest.findUniqueOrThrow({
      where: { id: rrs[0].id },
      select: {
        sourceType: true,
        paymentId: true,
        tournamentId: true,
        classId: true,
        requestReason: true,
      },
    });
    const usage = await (rrService as any).computeUsage(rrRow);
    expect(usage).toMatchObject({ sourceOk: true, usedCount: 0 });
  });

  it("⑦' 승인 선행 경합 — 결제가 먼저 완료되면 후불 재활용은 409, 등록·결제 무변경", async () => {
    const fx = await makeClass("approval-first", 5, "BOTH");
    const { paymentId } = await makePendingPaidEnrollment(fx);
    await lateApproval(paymentId); // 결제 완료 · 등록 paid

    await expect(
      serviceA.createEnrollment(PARENT_ID, {
        childId: CHILD_A,
        classId: fx.classId,
        classProductId: fx.postpaidId,
      } as never),
    ).rejects.toBeInstanceOf(ConflictException);
    expect((await paymentOf(paymentId))?.paymentStatus).toBe("completed");
    expect(await enrollmentOf(fx.classId, CHILD_A)).toMatchObject({
      status: "paid",
      paymentId,
    });
  });

  it("⑧ [좌석 선점] 선점 뒤 취소 → 명단 해지 · 취소 뒤 선점 → 선점 0", async () => {
    const fx = await makeClass("seat-claim", 1);
    const first = await makePendingPaidEnrollment(fx, CHILD_A);
    const claims = await (payments.service as any).claimSeatsBeforeApproval(
      first.paymentId,
    );
    expect(claims).toHaveLength(1);
    expect((await registrationOf(fx.classId, CHILD_A))?.status).toBe("active");

    await serviceA.cancelEnrollment(PARENT_ID, first.enrollmentId);
    expect((await registrationOf(fx.classId, CHILD_A))?.status).toBe(
      "inactive",
    );
    await lateApproval(first.paymentId);
    expect((await registrationOf(fx.classId, CHILD_A))?.status).toBe(
      "inactive",
    );
    expect(await refundRequestsOf(first.paymentId)).toHaveLength(1);

    // 취소가 먼저면 선점 자체가 없다
    const second = await makePendingPaidEnrollment(fx, CHILD_B);
    await serviceA.cancelEnrollment(PARENT_ID, second.enrollmentId);
    const noClaims = await (payments.service as any).claimSeatsBeforeApproval(
      second.paymentId,
    );
    expect(noClaims).toHaveLength(0);
    expect(await registrationOf(fx.classId, CHILD_B)).toBeNull();
  });

  it("⑨ 본인 활성 좌석은 정원 카운트에서 제외 — 정원 1 만석이어도 본인 등록 성공", async () => {
    const fx = await makeClass("own-seat", 1);
    await raw.classRegistration.create({
      data: { classId: fx.classId, userId: CHILD_A, status: "active" },
    });
    await serviceA.createEnrollment(PARENT_ID, {
      childId: CHILD_A,
      classId: fx.classId,
      classProductId: fx.postpaidId,
    } as never);
    expect((await enrollmentOf(fx.classId, CHILD_A))?.status).toBe("approved");
    // 다른 자녀는 여전히 만석
    await expect(
      serviceB.createEnrollment(PARENT_ID, {
        childId: CHILD_B,
        classId: fx.classId,
        classProductId: fx.postpaidId,
      } as never),
    ).rejects.toThrow("정원");
  });

  it("⑩ 취소가 연결된 pending 결제를 무효화 — 이후 결제 확인 진입이 거부된다", async () => {
    const fx = await makeClass("cancel-voids-payment", 0);
    const { paymentId, enrollmentId } = await makePendingPaidEnrollment(fx);

    await serviceA.cancelEnrollment(PARENT_ID, enrollmentId);
    expect((await paymentOf(paymentId))?.paymentStatus).toBe("cancelled");

    // 결제 확인 진입점(mock)은 cancelled 를 거부한다 — 돈이 나가지 않는다.
    const order = await raw.payment.findUniqueOrThrow({
      where: { id: paymentId },
      select: { orderNumber: true },
    });
    await expect(
      payments.service.mockConfirmPayment(PARENT_ID, order.orderNumber),
    ).rejects.toThrow("취소된 결제 요청");
    expect((await paymentOf(paymentId))?.paymentStatus).toBe("cancelled");
  });

  it("⑪ 등록 없이 배치된 좌석은 늦은 승인 후처리가 해지하지 않는다", async () => {
    const fx = await makeClass("director-roster", 0);
    const { paymentId, enrollmentId } = await makePendingPaidEnrollment(fx);
    await serviceA.cancelEnrollment(PARENT_ID, enrollmentId);

    // 감독이 명단에 직접 배치(등록과 무관한 좌석)
    await raw.classRegistration.upsert({
      where: { classId_userId: { classId: fx.classId, userId: CHILD_A } },
      update: { status: "active" },
      create: { classId: fx.classId, userId: CHILD_A, status: "active" },
    });

    await lateApproval(paymentId);
    expect((await registrationOf(fx.classId, CHILD_A))?.status).toBe("active");
    expect(await refundRequestsOf(paymentId)).toHaveLength(1);
  });

  it("⑫ 갱신 신청 취소 — 같은 자녀의 현재 유효 등록이 있으면 명단을 유지한다", async () => {
    const fx = await makeClass("renewal-cancel", 0);
    // 현재 유효한 후불 수강(approved) — 명단 active
    await serviceA.createEnrollment(PARENT_ID, {
      childId: CHILD_A,
      classId: fx.classId,
      classProductId: fx.postpaidId,
    } as never);
    expect((await registrationOf(fx.classId, CHILD_A))?.status).toBe("active");

    // 갱신용 선불 신청을 따로 만들고 취소해도 현 수강 명단은 유지돼야 한다.
    const renewal = await makePendingPaidEnrollment(fx);
    await serviceA.cancelEnrollment(PARENT_ID, renewal.enrollmentId);
    expect((await registrationOf(fx.classId, CHILD_A))?.status).toBe("active");
  });

  it("⑭ 무료(0원) 선불 수업 — 결제 없이 신청 즉시 수강 확정", async () => {
    const fx = await makeClass("free-class", 0, "PREPAID");
    // 1회 수업료 0원 상품 — 스팟(1회용) 무료 수업과 같은 형태.
    const free = await raw.classProduct.create({
      data: {
        classId: fx.classId,
        productName: "무료 1회 수업료",
        price: 0,
        sessionsPerMonth: 0,
        feeType: "PER_SESSION",
        billingTiming: "PREPAID",
        isActive: true,
      },
      select: { id: true },
    });

    const created = await serviceA.createEnrollment(PARENT_ID, {
      childId: CHILD_A,
      classId: fx.classId,
      classProductId: free.id,
    } as never);

    // 결제사를 거치지 않고 곧바로 수강 확정 — 상태 paid · 명단 active.
    expect(created.status).toBe("paid");
    // 완료 화면이 영수증을 조회할 주문번호를 응답에 싣는다.
    expect(
      (created as { freeOrderNumber?: string }).freeOrderNumber,
    ).toMatch(/^FREE-/);
    const row = await enrollmentOf(fx.classId, CHILD_A);
    expect(row?.status).toBe("paid");
    expect(row?.paymentId).toBeTruthy();
    expect((await registrationOf(fx.classId, CHILD_A))?.status).toBe("active");

    // 0원 결제 이력은 남는다 — 사용자가 내역에서 확인하고, 취소가 같은 흐름을 탄다.
    const pay = await raw.payment.findUniqueOrThrow({
      where: { id: row!.paymentId! },
      select: { amount: true, paymentStatus: true, paymentMethod: true },
    });
    expect(pay).toMatchObject({
      amount: 0,
      paymentStatus: "completed",
      paymentMethod: "free",
    });
    createdPaymentIds.push(row!.paymentId!);

    // 무료라도 신청 이후 수업이 진행됐으면 본인 취소 불가 — 유료와 같은 이용 개시 기준.
    //   판정은 "신청일 이후 ~ 오늘 이전"의 회차라 신청 시각을 3일 전으로 돌려 재현한다.
    const threeDaysAgo = new Date();
    threeDaysAgo.setUTCDate(threeDaysAgo.getUTCDate() - 3);
    await raw.enrollment.update({
      where: { id: created.id },
      data: { paidAt: threeDaysAgo },
    });
    const past = new Date();
    past.setUTCDate(past.getUTCDate() - 2);
    past.setUTCHours(0, 0, 0, 0);
    const pastSchedule = await raw.classSchedule.create({
      data: {
        classId: fx.classId,
        scheduledDate: past,
        startTime: "17:00",
        endTime: "18:00",
      },
      select: { id: true },
    });
    await expect(
      serviceA.cancelEnrollment(PARENT_ID, created.id),
    ).rejects.toThrow("이미 수업이 진행되어");
    await raw.classSchedule.delete({ where: { id: pastSchedule.id } });

    // 진행된 회차가 없으면 환불할 금액이 없으므로 본인이 바로 취소한다(승인제 환불 미경유).
    await serviceA.cancelEnrollment(PARENT_ID, created.id);
    expect((await enrollmentOf(fx.classId, CHILD_A))?.status).toBe("cancelled");
    expect((await registrationOf(fx.classId, CHILD_A))?.status).toBe(
      "inactive",
    );
    expect((await paymentOf(row!.paymentId!))?.paymentStatus).toBe("cancelled");
  });

  it("⑬ 선불 월 귀속 — 이번 달 결제는 명단 유지, 만료 이력뿐이면 해지", async () => {
    // ⑫ 는 후불 단축 경로만 타므로, 월 귀속 판정 분기를 실제 DB 로 확인한다.
    //   결제방식 판정 SoT(resolveRowBillingTiming)는 수업 billingMode 를 우선하므로
    //   선불 분기를 태우려면 수업 자체가 PREPAID 여야 한다.
    const fx = await makeClass("prepaid-month-scope", 0, "PREPAID");

    // (1) 이번 판매월에 귀속되는 완료 결제 — 명단이 유지돼야 한다.
    const current = await makePaidPrepaidEnrollment(fx, CHILD_A, 0);
    await raw.classRegistration.upsert({
      where: { classId_userId: { classId: fx.classId, userId: CHILD_A } },
      update: { status: "active" },
      create: { classId: fx.classId, userId: CHILD_A, status: "active" },
    });
    const toCancel = await makePendingPaidEnrollment(fx, CHILD_A);
    await serviceA.cancelEnrollment(PARENT_ID, toCancel.enrollmentId);
    expect((await registrationOf(fx.classId, CHILD_A))?.status).toBe("active");

    // (2) 그 결제를 아주 지난 달 귀속으로 되돌리면 만료 이력이라 명단이 해지돼야 한다.
    await raw.payment.update({
      where: { id: current.paymentId },
      data: { completedAt: new Date("2020-01-15T00:00:00Z") },
    });
    const toCancel2 = await makePendingPaidEnrollment(fx, CHILD_A);
    await serviceA.cancelEnrollment(PARENT_ID, toCancel2.enrollmentId);
    expect((await registrationOf(fx.classId, CHILD_A))?.status).toBe(
      "inactive",
    );
  });
});
