import { PrismaService } from "@/prisma/prisma.service";
import { CreditDomainService } from "@/credits/credit-domain.service";
import {
  PaymentRefundService,
  RefundExecutionError,
} from "./payment-refund.service";

/**
 * [Major 4] 실제 PostgreSQL 원자성·동시성 통합 테스트.
 *  mock 이 아닌 .env DEV DB(schema icehockey)에 고유 prefix 데이터로 실행 후 afterAll 전량 삭제.
 *  검증:
 *   1) tx-A 단계 실패(원장 create FK 위반) → Payment·기존 요청·원장 전체 rollback(Payment completed 유지).
 *   2) 승인(refundRequestId 지정) vs 직접 환불 동시 실행 → 원장 커밋·PG(mock) 정확히 1회.
 *   3) 전액 크레딧 복원 vs 동시 사용 증가 → 음수/CHECK 위반 없이 정합.
 *
 *  DB 미연결 시 실패로 드러나도록 설계(스킵 게이트 아님). 실행 로그는 리뷰 보고에 요약.
 */
describe("refund atomicity/concurrency (real PostgreSQL)", () => {
  const prisma = new PrismaService();
  const creditDomain = new CreditDomainService();
  const kgStub = { cancelPayment: jest.fn() } as any;
  const tossStub = { cancel: jest.fn() } as any;
  const niceStub = { cancel: jest.fn() } as any;
  const service = new PaymentRefundService(
    prisma,
    kgStub,
    tossStub,
    niceStub,
    creditDomain,
  );

  const RUN = `ITEST_${Date.now()}`;
  let userId: string;
  let classId: string;
  // 생성 리소스 추적(정리용 명시적 id 목록).
  const paymentIds: string[] = [];

  async function makePayment(amount: number): Promise<string> {
    const p = await prisma.payment.create({
      data: {
        orderNumber: `${RUN}_${Math.random().toString(36).slice(2, 10)}`,
        userId,
        amount,
        paymentStatus: "completed",
        paymentMethod: "mock", // PG 호출 생략(단일 초크포인트·원장 흐름만 검증).
        tid: `${RUN}_tid`,
        completedAt: new Date(),
      },
      select: { id: true },
    });
    paymentIds.push(p.id);
    return p.id;
  }

  beforeAll(async () => {
    await prisma.$connect();
    const u = await prisma.user.findFirst({ select: { id: true } });
    const c = await prisma.class.findFirst({ select: { id: true } });
    if (!u || !c) throw new Error("통합 테스트용 user/class fixture 없음");
    userId = u.id;
    classId = c.id;
  });

  afterAll(async () => {
    // FK-safe 순서로 이번 실행 생성분만 삭제.
    if (paymentIds.length) {
      await prisma.creditTransaction.deleteMany({
        where: { memberCredit: { paymentId: { in: paymentIds } } },
      });
      await prisma.memberCredit.deleteMany({
        where: { paymentId: { in: paymentIds } },
      });
      await prisma.refundLog.deleteMany({
        where: { paymentId: { in: paymentIds } },
      });
      await prisma.refundRequest.deleteMany({
        where: { paymentId: { in: paymentIds } },
      });
      await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
    }
    await prisma.$disconnect();
  });

  it("① tx-A 단계 실패(원장 create FK 위반) → 전체 rollback, Payment completed 유지", async () => {
    const paymentId = await makePayment(10000);

    // actorId 를 존재하지 않는 user id 로 → 원장 create 의 requesterId FK 위반 → tx-A rollback.
    await expect(
      service.cancelPayment(
        paymentId,
        "통합-롤백",
        undefined,
        undefined,
        undefined,
        undefined,
        { trusted: true },
        { actorId: `${RUN}_NOEXIST_USER` },
      ),
    ).rejects.toBeDefined();

    const after = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: { paymentStatus: true },
    });
    expect(after?.paymentStatus).toBe("completed"); // claim 롤백됨.
    const ledgers = await prisma.refundRequest.count({ where: { paymentId } });
    expect(ledgers).toBe(0); // 고아 원장 없음.
    const logs = await prisma.refundLog.count({ where: { paymentId } });
    expect(logs).toBe(0);
  }, 30000);

  it("② 승인 vs 직접 환불 동시 → 정확히 1건만 원장 커밋/PG, Payment refunded", async () => {
    const paymentId = await makePayment(20000);
    // 승인 대상 executing 원장 사전 생성(승인이 CAS 로 executing 전이한 상태 시뮬).
    const approval = await prisma.refundRequest.create({
      data: {
        paymentId,
        requesterId: userId,
        sourceType: "CLASS_PREPAID",
        status: "executing",
        requestReason: "승인 실행",
        requestedAmount: 20000,
        executionStartedAt: new Date(),
        idempotencyKey: `rr:${RUN}_approval`,
      },
      select: { id: true, version: true },
    });

    const callApproval = service.cancelPayment(
      paymentId,
      "통합-승인",
      undefined,
      undefined,
      undefined,
      undefined,
      { trusted: true, userType: "ADMIN", id: userId },
      {
        refundRequestId: approval.id,
        actorId: userId,
        expectedVersion: approval.version,
        idempotencyKey: `rr:${RUN}_approval`,
      },
    );
    const callDirect = service.cancelPayment(
      paymentId,
      "통합-직접",
      undefined,
      undefined,
      undefined,
      undefined,
      { trusted: true, userType: "ADMIN", id: userId },
      { actorId: userId },
    );

    const results = await Promise.allSettled([callApproval, callDirect]);
    const fulfilled = results.filter((r) => r.status === "fulfilled").length;
    const rejected = results.filter((r) => r.status === "rejected").length;

    // 정확히 1 성공 / 1 실패(PAYMENT_NOT_AVAILABLE — claim CAS 단일 초크포인트).
    expect(fulfilled).toBe(1);
    expect(rejected).toBe(1);
    const loserErr = (results.find((r) => r.status === "rejected") as any)
      ?.reason;
    expect(loserErr).toBeInstanceOf(RefundExecutionError);
    expect(loserErr.code).toBe("PAYMENT_NOT_AVAILABLE");

    // 원장 커밋(RefundLog) 정확히 1건, Payment refunded.
    const logs = await prisma.refundLog.count({ where: { paymentId } });
    expect(logs).toBe(1);
    const pay = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: { paymentStatus: true },
    });
    expect(pay?.paymentStatus).toBe("refunded");
  }, 30000);

  it("③ 부분 크레딧 복원 vs 동시 사용 증가 → 정확 보존식·원장 delta 일치", async () => {
    const paymentId = await makePayment(30000);
    const U0 = 5;
    const TOTAL = 10;
    const RESTORE = 2;
    const BUMPS = 3; // 5+3=8 < 10 → 전 bump 성공(headroom), safe=min(2,관찰≥5)=2 결정적.
    const credit = await prisma.memberCredit.create({
      data: {
        userId,
        classId,
        totalSessions: TOTAL,
        usedSessions: U0,
        paymentId,
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      },
      select: { id: true },
    });

    // 동시: 부분 복원($transaction 내 refundSessions decrement) + 사용 증가 BUMPS 회(원자 increment).
    const restoreP = prisma.$transaction(async (tx) =>
      creditDomain.refundSessions(tx, {
        memberCreditId: credit.id,
        sessionsToRestore: RESTORE,
        isFullRefund: false,
        reason: "통합-부분복원",
      }),
    );
    const bumpPs = Array.from({ length: BUMPS }, () =>
      prisma.memberCredit.updateMany({
        where: { id: credit.id, usedSessions: { lt: TOTAL } },
        data: { usedSessions: { increment: 1 } },
      }),
    );

    const [restoreRes, ...bumpRes] = await Promise.all([restoreP, ...bumpPs]);
    const successBumps = bumpRes.reduce((s, r) => s + r.count, 0);

    // 원자 연산 net 보존식(순서 무관): 최종 = U0 + Σ성공bump − 실제복원delta.
    const final = await prisma.memberCredit.findUniqueOrThrow({
      where: { id: credit.id },
      select: { usedSessions: true, totalSessions: true },
    });
    expect(successBumps).toBe(BUMPS); // headroom 상 전량 성공.
    expect(restoreRes.sessionsRestored).toBe(RESTORE); // safe=min(2,관찰≥5)=2 결정적.
    expect(final.usedSessions).toBe(
      U0 + successBumps - restoreRes.sessionsRestored,
    ); // = 6, 유실 0.
    expect(final.usedSessions).toBeGreaterThanOrEqual(0);
    expect(final.usedSessions).toBeLessThanOrEqual(final.totalSessions);

    // 원장 감사: 이번 복원의 CreditTransaction.amount === 실제 CAS delta.
    const txn = await prisma.creditTransaction.findFirst({
      where: { memberCreditId: credit.id, reason: "통합-부분복원" },
      select: { amount: true, balanceAfter: true },
    });
    expect(txn?.amount).toBe(restoreRes.sessionsRestored);
    // balanceAfter = 복원 시점 스냅샷(total − 그 순간 used); refund 반환 balanceAfter 와 일치.
    expect(txn?.balanceAfter).toBe(restoreRes.balanceAfter);
    // 스냅샷이므로 total − used(복원 직후 refund 가 관찰한 used) 범위 내(∈[total−8, total−3]).
    expect(txn!.balanceAfter).toBeGreaterThanOrEqual(TOTAL - (U0 + BUMPS));
    expect(txn!.balanceAfter).toBeLessThanOrEqual(TOTAL - (U0 - RESTORE));
  }, 30000);
});
