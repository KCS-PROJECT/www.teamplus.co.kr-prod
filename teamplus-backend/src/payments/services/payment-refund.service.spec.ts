import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import {
  PaymentRefundService,
  RefundExecutionError,
} from "./payment-refund.service";
import { PrismaService } from "@/prisma/prisma.service";
import {
  KgInicisGateway,
  KgCancelAmbiguousError,
} from "../kg-inicis.gateway";
import {
  TossPaymentsGateway,
  TossCancelAmbiguousError,
} from "../toss-payments.gateway";
import { CreditDomainService } from "@/credits/credit-domain.service";

describe("PaymentRefundService", () => {
  let service: PaymentRefundService;

  const mockPrisma = {
    payment: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    memberCredit: { findMany: jest.fn(), updateMany: jest.fn() },
    refundLog: { create: jest.fn(), findMany: jest.fn() },
    refundRequest: {
      updateMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    enrollment: { findMany: jest.fn(), findFirst: jest.fn() },
    monthlyPostpaidBillingLine: { findFirst: jest.fn() },
    tournamentRegistration: { findFirst: jest.fn() },
    class: { findUnique: jest.fn() },
    tournament: { findUnique: jest.fn() },
    classAttendance: { count: jest.fn() },
    $transaction: jest.fn(),
  };

  const mockKgGateway = {
    cancelPayment: jest.fn(),
  };

  const mockTossGateway = {
    cancel: jest.fn(),
  };

  const mockCreditDomain = { refundSessions: jest.fn() };

  /** $transaction 콜백에 전달할 tx delegate 목 — tx-A(claim+정합화+원장) + tx-B(확정) 전부. */
  function makeTxMock(overrides: Record<string, any> = {}) {
    return {
      refundLog: { create: jest.fn().mockResolvedValue({ id: "rlog-1" }) },
      payment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      memberCredit: { findMany: jest.fn().mockResolvedValue([]) },
      enrollment: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      classRegistration: { updateMany: jest.fn() },
      monthlyPostpaidBillingLine: { updateMany: jest.fn() },
      tournamentRegistration: { updateMany: jest.fn() },
      pickupMatchApplicant: { updateMany: jest.fn() },
      refundRequest: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: "sys-rr-1", version: 0 }),
      },
      ...overrides,
    };
  }

  // 기본 tx — 테스트에서 inspect 하려면 이 객체를 참조한다.
  let sharedTx: ReturnType<typeof makeTxMock>;

  /** completed 상태의 KG 결제 기본 fixture (학부모 parent-1 소유) */
  const kgPayment = {
    id: "pay-1",
    userId: "parent-1",
    paymentStatus: "completed",
    paymentMethod: "card",
    tid: "StdpayCARD_INI0001",
    amount: 400000,
    completedAt: new Date("2026-07-08T05:40:00Z"),
    createdAt: new Date("2026-07-08T05:39:00Z"),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentRefundService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: KgInicisGateway, useValue: mockKgGateway },
        { provide: TossPaymentsGateway, useValue: mockTossGateway },
        { provide: CreditDomainService, useValue: mockCreditDomain },
      ],
    }).compile();

    service = module.get<PaymentRefundService>(PaymentRefundService);
    jest.clearAllMocks();
    // 기본: Payment 선점 복원 updateMany·markLedgerFailed 는 1건 성공.
    mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.refundRequest.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.refundRequest.create.mockResolvedValue({
      id: "sys-rr-1",
      version: 0,
    });
    mockPrisma.refundRequest.update.mockResolvedValue({});
    // 도메인 판별 실패 → DIRECT.
    mockPrisma.enrollment.findFirst.mockResolvedValue(null);
    mockPrisma.monthlyPostpaidBillingLine.findFirst.mockResolvedValue(null);
    mockPrisma.tournamentRegistration.findFirst.mockResolvedValue(null);
    // 기본 $transaction: sharedTx 로 콜백 실행(tx-A claim/정합화/원장, tx-B 확정 공유).
    sharedTx = makeTxMock();
    mockPrisma.$transaction.mockImplementation((cb: any) => cb(sharedTx));
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // ── [환불 정책 1단계] 이용 개시(출석) 후 셀프 취소 차단 ────────────────────

  describe("cancelPayment — 출석 사용분 가드", () => {
    it("결제 후 출석(present)이 있으면 학부모 셀프 취소를 ForbiddenException 으로 거절한다", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(kgPayment);
      mockPrisma.enrollment.findMany.mockResolvedValue([
        { childId: "child-1", classId: "class-1" },
      ]);
      mockPrisma.classAttendance.count.mockResolvedValue(1);

      await expect(
        service.cancelPayment(
          "pay-1",
          "학부모 요청",
          undefined,
          undefined,
          undefined,
          undefined,
          { id: "parent-1", userType: "PARENT" },
        ),
      ).rejects.toThrow(ForbiddenException);

      // 가드에서 거절 — PG 취소는 호출되지 않아야 한다
      expect(mockKgGateway.cancelPayment).not.toHaveBeenCalled();
      // 출석 조회는 결제일(KST 달력일) 이후 일정으로 한정
      expect(mockPrisma.classAttendance.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            memberId: "child-1",
            attendanceStatus: "present",
          }),
        }),
      );
    });

    it("출석 이력이 없으면 가드를 통과해 PG 취소 단계로 진행한다", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(kgPayment);
      mockPrisma.enrollment.findMany.mockResolvedValue([
        { childId: "child-1", classId: "class-1" },
      ]);
      mockPrisma.classAttendance.count.mockResolvedValue(0);
      // PG 실패로 흐름 종료 — 가드 통과 여부만 검증 ($transaction 미진입)
      mockKgGateway.cancelPayment.mockResolvedValue({
        success: false,
        message: "PG 실패",
      });

      await expect(
        service.cancelPayment(
          "pay-1",
          "학부모 요청",
          undefined,
          undefined,
          undefined,
          undefined,
          { id: "parent-1", userType: "PARENT" },
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockKgGateway.cancelPayment).toHaveBeenCalledTimes(1);
    });

    it("ADMIN 요청은 출석 이력과 무관하게 가드를 우회한다", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(kgPayment);
      mockKgGateway.cancelPayment.mockResolvedValue({
        success: false,
        message: "PG 실패",
      });

      await expect(
        service.cancelPayment(
          "pay-1",
          "관리자 환불",
          undefined,
          undefined,
          undefined,
          undefined,
          { id: "admin-1", userType: "ADMIN" },
        ),
      ).rejects.toThrow(BadRequestException);

      // 가드 미실행 — 수강/출석 조회 자체가 없어야 한다
      expect(mockPrisma.enrollment.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.classAttendance.count).not.toHaveBeenCalled();
    });

    it("수강 결제가 아니면(Enrollment 미연결) 가드 대상이 아니다", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(kgPayment);
      mockPrisma.enrollment.findMany.mockResolvedValue([]);
      mockKgGateway.cancelPayment.mockResolvedValue({
        success: false,
        message: "PG 실패",
      });

      await expect(
        service.cancelPayment(
          "pay-1",
          "학부모 요청",
          undefined,
          undefined,
          undefined,
          undefined,
          { id: "parent-1", userType: "PARENT" },
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.classAttendance.count).not.toHaveBeenCalled();
      expect(mockKgGateway.cancelPayment).toHaveBeenCalledTimes(1);
    });
  });

  // ── [환불 승인제] Payment 단위 선점(단일 초크포인트) + fencing ────────────
  describe("cancelPayment — Payment 선점 CAS", () => {
    it("선점 실패(tx-A claim count!==1) → PAYMENT_NOT_AVAILABLE + 전체 rollback, PG 미호출", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(kgPayment);
      // tx-A 내부 claim 경쟁 패배.
      sharedTx.payment.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.cancelPayment(
          "pay-1",
          "관리자 환불",
          undefined,
          undefined,
          undefined,
          undefined,
          { id: "admin-1", userType: "ADMIN" },
        ),
      ).rejects.toMatchObject({ code: "PAYMENT_NOT_AVAILABLE" });

      expect(mockKgGateway.cancelPayment).not.toHaveBeenCalled();
      // 원장 create 는 claim 실패로 도달 안 함(tx rollback).
      expect(sharedTx.refundRequest.create).not.toHaveBeenCalled();
    });

    it("PG 실패 시 선점 과도 상태를 completed 로 복원(무이체 보장)", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(kgPayment);
      mockKgGateway.cancelPayment.mockResolvedValue({
        success: false,
        message: "PG 통신 오류(명확한 거절)",
      });

      await expect(
        service.cancelPayment(
          "pay-1",
          "관리자 환불",
          undefined,
          undefined,
          undefined,
          undefined,
          { id: "admin-1", userType: "ADMIN" },
        ),
      ).rejects.toBeInstanceOf(RefundExecutionError);

      // 복원 updateMany(this.prisma) 가 refund_processing→completed 로 호출됨.
      const restoreCall = mockPrisma.payment.updateMany.mock.calls.find(
        (c) => c[0]?.data?.paymentStatus === "completed",
      );
      expect(restoreCall).toBeTruthy();
      expect(restoreCall[0].where).toMatchObject({
        paymentStatus: "refund_processing",
      });
    });
  });

  describe("executeRefundTransaction — CAS/fencing (via $transaction 콜백)", () => {
    const paymentArg = { id: "pay-1", amount: 400000 };

    it("Payment 선점 CAS count!==1 → 전체 rollback(throw)", async () => {
      const tx = makeTxMock({
        payment: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      });
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(tx));

      await expect(
        (service as any).executeRefundTransaction(
          paymentArg,
          400000,
          "환불",
          { refundRequestId: "rr-1", expectedVersion: 1 },
        ),
      ).rejects.toThrow(/PAYMENT_CAS_CONFLICT/);
      // RefundLog 는 생성됐어도 tx throw 로 전체 롤백(원장 확정 안 됨).
      expect(tx.refundRequest.updateMany).not.toHaveBeenCalled();
    });

    it("RefundRequest fence count!==1(선점 상실) → 전체 rollback(throw)", async () => {
      const tx = makeTxMock({
        refundRequest: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      });
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(tx));

      await expect(
        (service as any).executeRefundTransaction(
          paymentArg,
          400000,
          "환불",
          { refundRequestId: "rr-1", expectedVersion: 3 },
        ),
      ).rejects.toThrow(/REFUND_REQUEST_FENCE_LOST/);
      // fence where 에 executing + expectedVersion 포함.
      expect(tx.refundRequest.updateMany.mock.calls[0][0].where).toMatchObject({
        id: "rr-1",
        status: "executing",
        version: 3,
      });
    });

    it("refundRequestId 있으면 fence, 없으면(방어) 정합화·fence 모두 skip", async () => {
      const tx = makeTxMock();
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(tx));

      // 직접 환불 정합화는 PG 전 createDirectRefundLedger 로 이동 — tx 안에서는 fence 만.
      await (service as any).executeRefundTransaction(paymentArg, 400000, "환불", {
        refundRequestId: "rr-1",
        expectedVersion: 3,
      });
      expect(tx.refundRequest.updateMany.mock.calls[0][0].data.status).toBe(
        "executed",
      );
    });
  });

  // ── [Critical 1] 직접 환불 원자 tx-A(claim+정합화+원장) ─────────────
  describe("cancelPayment — 직접(admin) 환불 원자 원장", () => {
    const mockPayment = {
      id: "pay-1",
      userId: "parent-1",
      paymentStatus: "completed",
      paymentMethod: "mock", // PG 호출 생략 → 원장 흐름 집중
      tid: "MOCK-1",
      amount: 400000,
      completedAt: new Date("2026-07-08T05:40:00Z"),
      createdAt: new Date("2026-07-08T05:39:00Z"),
    };

    it("tx-A 원자: claim + 활성요청(executing 포함) canceled + DIRECT 원장(idempotencyKey 포함) 생성", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(mockPayment);

      await service.cancelPayment(
        "pay-1",
        "관리자 환불",
        undefined,
        undefined,
        undefined,
        undefined,
        { id: "admin-1", userType: "ADMIN" },
        { actorId: "admin-1" },
      );

      // tx-A 내부(sharedTx): ① claim ② 정합화 ③ create.
      expect(sharedTx.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "pay-1", paymentStatus: "completed" },
          data: { paymentStatus: "refund_processing" },
        }),
      );
      const reconcile = sharedTx.refundRequest.updateMany.mock.calls.find(
        (c: any) => c[0]?.data?.status === "canceled",
      );
      expect(reconcile[0].where.status).toEqual({
        in: ["pending", "execution_failed", "executing"],
      });
      // 원장 create: executing + DIRECT + id·idempotencyKey 를 create data 에 포함(사후 update 없음).
      const created = sharedTx.refundRequest.create.mock.calls[0][0].data;
      expect(created.status).toBe("executing");
      expect(created.sourceType).toBe("DIRECT");
      expect(created.requestedAmount).toBe(400000);
      expect(created.id).toBeDefined();
      expect(created.idempotencyKey).toBe(`rr:${created.id}`);
      // 사후 idempotencyKey update(this.prisma) 없음.
      expect(mockPrisma.refundRequest.update).not.toHaveBeenCalled();
    });

    it("도메인 판별 성공해도 origin 은 DIRECT 고정, 도메인은 스냅샷 필드에만 저장", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(mockPayment);
      // 도메인 판별 성공(CLASS_PREPAID enrollment).
      mockPrisma.enrollment.findFirst.mockResolvedValue({
        classId: "cls-9",
        childId: "child-9",
      });
      mockPrisma.class.findUnique.mockResolvedValue({
        teamId: "team-9",
        academyId: null,
      });

      await service.cancelPayment(
        "pay-1",
        "관리자 환불",
        undefined,
        undefined,
        undefined,
        undefined,
        { id: "admin-1", userType: "ADMIN" },
        { actorId: "admin-1" },
      );

      const created = sharedTx.refundRequest.create.mock.calls[0][0].data;
      expect(created.sourceType).toBe("DIRECT"); // origin 불변.
      expect(created.classId).toBe("cls-9"); // 도메인은 스냅샷 필드에.
      expect(created.teamId).toBe("team-9");
      expect(created.childId).toBe("child-9");
    });

    it("tx-A create 실패 → 전체 rollback(예외 전파), PG 미호출", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        ...mockPayment,
        paymentMethod: "card",
        tid: "StdpayCARD_INI0001",
      });
      sharedTx.refundRequest.create.mockRejectedValueOnce(
        new Error("DB create 실패"),
      );

      await expect(
        service.cancelPayment(
          "pay-1",
          "관리자 환불",
          undefined,
          undefined,
          undefined,
          undefined,
          { id: "admin-1", userType: "ADMIN" },
          { actorId: "admin-1" },
        ),
      ).rejects.toThrow(/DB create 실패/);
      // tx-A 롤백 → PG 호출 없음.
      expect(mockKgGateway.cancelPayment).not.toHaveBeenCalled();
    });
  });

  // ── [Critical 2] 최초 KG 모호 결과 격리 ────────────────────────────
  describe("cancelPayment — KG 모호 결과 격리", () => {
    it("최초 KG transport 모호(KgCancelAmbiguousError) → KG_UNCONFIRMED, Payment 미복원", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(kgPayment);
      mockKgGateway.cancelPayment.mockRejectedValue(
        new KgCancelAmbiguousError("응답 유실"),
      );

      await expect(
        service.cancelPayment(
          "pay-1",
          "관리자 환불",
          undefined,
          undefined,
          undefined,
          undefined,
          { id: "admin-1", userType: "ADMIN" },
          { actorId: "admin-1" },
        ),
      ).rejects.toMatchObject({ code: "KG_UNCONFIRMED" });

      // Payment refund_processing→completed 복원 없음(격리).
      const restoreCall = mockPrisma.payment.updateMany.mock.calls.find(
        (c) => c[0]?.data?.paymentStatus === "completed",
      );
      expect(restoreCall).toBeFalsy();
      // 시스템 원장 execution_failed(KG_UNCONFIRMED) 증거 영속(markLedgerFailed).
      const failCall = mockPrisma.refundRequest.updateMany.mock.calls.find(
        (c) => c[0]?.data?.failureCode === "KG_UNCONFIRMED",
      );
      expect(failCall).toBeTruthy();
    });
  });

  // ── [상태매트릭스 감사] 토스 취소 결과 확정/불확실 구분 ───────────────
  describe("cancelPayment — 토스 취소 결과 확정/불확실 구분", () => {
    const tossPayment = {
      id: "pay-1",
      userId: "parent-1",
      paymentStatus: "completed",
      paymentMethod: "toss", // isTossPayment true → 토스 취소 경로.
      tid: "tviatoss202607232311111ABCD",
      amount: 400000,
      completedAt: new Date("2026-07-08T05:40:00Z"),
      createdAt: new Date("2026-07-08T05:39:00Z"),
    };

    // [회귀 ④] 정상 수신된 명확한 거절(4xx 바디 → BadRequestException)만 확정 실패 + Payment 복원.
    it("정상 수신된 토스 거절(BadRequestException) → DIRECT 원장 execution_failed(PG/PG_CANCEL_ERROR) + Payment completed 복원", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(tossPayment);
      // 게이트웨이가 명확한 거절(ALREADY_CANCELED 등)을 BadRequestException 으로 확정 반환.
      mockTossGateway.cancel.mockRejectedValue(
        new BadRequestException("이미 취소된 결제입니다."),
      );

      await expect(
        service.cancelPayment(
          "pay-1",
          "관리자 환불",
          undefined,
          undefined,
          undefined,
          undefined,
          { id: "admin-1", userType: "ADMIN" },
          { actorId: "admin-1" },
        ),
      ).rejects.toMatchObject({ stage: "PG", code: "PG_CANCEL_ERROR" });

      const ledgerFail = mockPrisma.refundRequest.updateMany.mock.calls.find(
        (c) => c[0]?.data?.status === "execution_failed",
      );
      expect(ledgerFail[0].data.failureCode).toBe("PG_CANCEL_ERROR");
      // 확정 실패 → Payment refund_processing → completed 복원(무이체 — 재환불 가능).
      const restoreCall = mockPrisma.payment.updateMany.mock.calls.find(
        (c) => c[0]?.data?.paymentStatus === "completed",
      );
      expect(restoreCall).toBeTruthy();
      expect(restoreCall[0].where).toMatchObject({
        paymentStatus: "refund_processing",
      });
    });

    // [회귀 ①] transport 모호성(timeout·응답 유실) → TOSS_UNCONFIRMED 격리, Payment 복원 금지.
    it("토스 transport 모호(TossCancelAmbiguousError) → TOSS_UNCONFIRMED, Payment 미복원, DIRECT 원장 격리, 멱등키 보존", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(tossPayment);
      mockTossGateway.cancel.mockRejectedValue(
        new TossCancelAmbiguousError("응답 유실/타임아웃"),
      );

      await expect(
        service.cancelPayment(
          "pay-1",
          "관리자 환불",
          undefined,
          undefined,
          undefined,
          undefined,
          { id: "admin-1", userType: "ADMIN" },
          { actorId: "admin-1" },
        ),
      ).rejects.toMatchObject({ stage: "PG", code: "TOSS_UNCONFIRMED" });

      // Payment refund_processing → completed 복원 **없음**(격리 — 재부분환불 방지).
      const restoreCall = mockPrisma.payment.updateMany.mock.calls.find(
        (c) => c[0]?.data?.paymentStatus === "completed",
      );
      expect(restoreCall).toBeFalsy();
      // DIRECT 원장 execution_failed(TOSS_UNCONFIRMED) 증거 영속.
      const ledgerFail = mockPrisma.refundRequest.updateMany.mock.calls.find(
        (c) => c[0]?.data?.failureCode === "TOSS_UNCONFIRMED",
      );
      expect(ledgerFail).toBeTruthy();
      expect(ledgerFail[0].data.failureStage).toBe("PG");
      // markLedgerFailed 는 idempotencyKey 를 건드리지 않음 → 원 멱등키 보존(재처리 시 같은 키 사용).
      expect(ledgerFail[0].data.idempotencyKey).toBeUndefined();
    });

    // [회귀 ②] 그 상태(Payment refund_processing)에서 ADMIN 직접 재시도 → claim 차단(새 원장·PG 0회).
    it("Payment refund_processing 상태에서 ADMIN 직접 재시도 → PAYMENT_NOT_AVAILABLE, 새 원장·PG 호출 0회", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        ...tossPayment,
        paymentStatus: "refund_processing", // TOSS_UNCONFIRMED 격리 후 상태.
      });

      await expect(
        service.cancelPayment(
          "pay-1",
          "관리자 재시도",
          undefined,
          undefined,
          undefined,
          undefined,
          { id: "admin-1", userType: "ADMIN" },
          { actorId: "admin-1" },
        ),
      ).rejects.toMatchObject({ code: "PAYMENT_NOT_AVAILABLE" });

      // 새 DIRECT 원장 생성 0 · 새 멱등키 0 · PG(toss) 재호출 0.
      expect(mockPrisma.refundRequest.create).not.toHaveBeenCalled();
      expect(mockTossGateway.cancel).not.toHaveBeenCalled();
    });

    // [회귀 ③] 재처리(resume) → 같은 Idempotency-Key 헤더로 PG 재호출(새 키 생성 0) → 원결과 성공 시 확정.
    it("resumeProcessing 재처리 → 같은 idempotencyKey 로 토스 재호출, 원결과 CANCELED → executed tx", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        ...tossPayment,
        paymentStatus: "refund_processing",
      });
      // resume 관문: pgFirstAttemptedAt 14일 이내여야 같은 키 재호출 허용.
      mockPrisma.refundRequest.findUnique.mockResolvedValue({
        requestedAmount: 100000,
        pgFirstAttemptedAt: new Date(),
      });
      // 토스 멱등 재호출 → 원 취소 결과(PARTIAL_CANCELED) 반환.
      mockTossGateway.cancel.mockResolvedValue({ status: "PARTIAL_CANCELED" });

      await service.cancelPayment(
        "pay-1",
        "환불 재처리",
        100000, // 부분 취소(원 요청과 동일 금액).
        undefined,
        undefined,
        undefined,
        { trusted: true, userType: "ADMIN", id: "admin-1" },
        {
          refundRequestId: "rr-1",
          actorId: "admin-1",
          expectedVersion: 3,
          idempotencyKey: "rr:rr-1",
          resumeProcessing: true,
        },
      );

      // 토스 취소에 원 멱등키가 그대로 전달(새 키 생성 0), 정확히 1회 호출.
      expect(mockTossGateway.cancel).toHaveBeenCalledTimes(1);
      expect(mockTossGateway.cancel).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: "rr:rr-1" }),
      );
      // resume 경로 → 초기 Payment claim CAS 스킵(선점 재수행 없음).
      const claimCall = mockPrisma.payment.updateMany.mock.calls.find(
        (c) => c[0]?.data?.paymentStatus === "refund_processing",
      );
      expect(claimCall).toBeFalsy();
    });

    // [409 processing] 멱등 처리 중 → 확정 실패 아님, TOSS_UNCONFIRMED 격리.
    it("TossCancelAmbiguousError(PROCESSING/409) → TOSS_UNCONFIRMED, Payment 미복원", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(tossPayment);
      mockTossGateway.cancel.mockRejectedValue(
        new TossCancelAmbiguousError("처리 중", "PROCESSING"),
      );
      await expect(
        service.cancelPayment(
          "pay-1",
          "관리자 환불",
          undefined,
          undefined,
          undefined,
          undefined,
          { id: "admin-1", userType: "ADMIN" },
          { actorId: "admin-1" },
        ),
      ).rejects.toMatchObject({ stage: "PG", code: "TOSS_UNCONFIRMED" });
      const restoreCall = mockPrisma.payment.updateMany.mock.calls.find(
        (c) => c[0]?.data?.paymentStatus === "completed",
      );
      expect(restoreCall).toBeFalsy();
    });

    // [422 conflict] 멱등 본문 불일치 → 확정 실패 아님, TOSS_IDEMPOTENCY_CONFLICT 격리.
    it("TossCancelAmbiguousError(CONFLICT/422) → TOSS_IDEMPOTENCY_CONFLICT, Payment 미복원", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(tossPayment);
      mockTossGateway.cancel.mockRejectedValue(
        new TossCancelAmbiguousError("본문 불일치", "CONFLICT"),
      );
      await expect(
        service.cancelPayment(
          "pay-1",
          "관리자 환불",
          undefined,
          undefined,
          undefined,
          undefined,
          { id: "admin-1", userType: "ADMIN" },
          { actorId: "admin-1" },
        ),
      ).rejects.toMatchObject({ stage: "PG", code: "TOSS_IDEMPOTENCY_CONFLICT" });
      const restoreCall = mockPrisma.payment.updateMany.mock.calls.find(
        (c) => c[0]?.data?.paymentStatus === "completed",
      );
      expect(restoreCall).toBeFalsy();
    });

    // [회귀 ②-payload] 승인 최초 호출과 resume 재호출이 동일한 toss body(key·reason·amount) 전송.
    it("payload 결정성 — 승인 최초 vs resume 이 동일한 toss cancel body(호출자 reason/amount 무관)", async () => {
      // body 는 원장(requestedAmount=전액) 기준 결정 — 호출자 reason/amount 차이와 무관.
      //   pgFirstAttemptedAt 최근 → resume 관문 통과.
      mockPrisma.refundRequest.findUnique.mockResolvedValue({
        requestedAmount: 400000,
        pgFirstAttemptedAt: new Date(),
      });
      mockPrisma.payment.findUnique.mockResolvedValue(tossPayment); // completed → 최초 시도.
      mockTossGateway.cancel.mockResolvedValue({ status: "CANCELED" });

      await service.cancelPayment(
        "pay-1",
        "환불 승인 실행 — 감독 메모 A", // 최초 reason(메모 포함).
        undefined,
        undefined,
        undefined,
        undefined,
        { trusted: true, userType: "ADMIN", id: "admin-1" },
        {
          refundRequestId: "rr-1",
          actorId: "admin-1",
          expectedVersion: 3,
          idempotencyKey: "rr:rr-1",
        },
      );
      const firstBody = mockTossGateway.cancel.mock.calls[0][0];

      mockTossGateway.cancel.mockClear();
      mockPrisma.payment.findUnique.mockResolvedValue({
        ...tossPayment,
        paymentStatus: "refund_processing",
      });
      await service.cancelPayment(
        "pay-1",
        "환불 재처리 — 다른 사유", // 다른 reason.
        100000, // 다른 cancelAmount 인자.
        undefined,
        undefined,
        undefined,
        { trusted: true, userType: "ADMIN", id: "admin-1" },
        {
          refundRequestId: "rr-1",
          actorId: "admin-1",
          expectedVersion: 3,
          idempotencyKey: "rr:rr-1",
          resumeProcessing: true,
        },
      );
      const resumeBody = mockTossGateway.cancel.mock.calls[0][0];

      // 최초·재처리 body 전체 동일(paymentKey·cancelReason·cancelAmount·idempotencyKey).
      expect(resumeBody).toEqual(firstBody);
      expect(firstBody.cancelReason).toBe("환불 처리 (rr:rr-1)");
      expect(firstBody.cancelAmount).toBeUndefined(); // 전액.
      expect(firstBody.idempotencyKey).toBe("rr:rr-1");
    });

    // [Major 1 유효기간] 최초 PG 시도 시각을 claim 과 동일 $transaction(sharedTx) 에 set-if-null 기록,
    //   resume 은 claim tx 를 타지 않으므로 미기록.
    it("pgFirstAttemptedAt — 최초 시도 claim 과 동일 tx 에 set-if-null, resume 은 갱신 안 함", async () => {
      mockPrisma.refundRequest.findUnique.mockResolvedValue({
        requestedAmount: 400000,
        pgFirstAttemptedAt: new Date(),
      });
      mockPrisma.payment.findUnique.mockResolvedValue(tossPayment); // completed.
      mockTossGateway.cancel.mockResolvedValue({ status: "CANCELED" });

      await service.cancelPayment(
        "pay-1",
        "승인",
        undefined,
        undefined,
        undefined,
        undefined,
        { trusted: true, userType: "ADMIN", id: "admin-1" },
        {
          refundRequestId: "rr-1",
          actorId: "admin-1",
          expectedVersion: 3,
          idempotencyKey: "rr:rr-1",
        },
      );
      // claim + set-if-null 은 동일 tx(sharedTx)에서 실행됨.
      const setFirst = sharedTx.refundRequest.updateMany.mock.calls.find(
        (c: any) =>
          c[0]?.where?.pgFirstAttemptedAt === null &&
          c[0]?.data?.pgFirstAttemptedAt instanceof Date,
      );
      expect(setFirst).toBeTruthy();

      sharedTx.refundRequest.updateMany.mockClear();
      mockPrisma.payment.findUnique.mockResolvedValue({
        ...tossPayment,
        paymentStatus: "refund_processing",
      });
      await service.cancelPayment(
        "pay-1",
        "재처리",
        undefined,
        undefined,
        undefined,
        undefined,
        { trusted: true, userType: "ADMIN", id: "admin-1" },
        {
          refundRequestId: "rr-1",
          actorId: "admin-1",
          expectedVersion: 3,
          idempotencyKey: "rr:rr-1",
          resumeProcessing: true,
        },
      );
      const setResume = sharedTx.refundRequest.updateMany.mock.calls.find(
        (c: any) => c[0]?.where?.pgFirstAttemptedAt === null,
      );
      expect(setResume).toBeFalsy();
    });

    // [Critical 1 / 회귀 ③] resume 토스 만료 → PG 0회 + TOSS_UNCONFIRMED 격리(단일 관문).
    it("resume 토스 + pgFirstAttemptedAt 15일 경과(만료) → 토스 호출 0회, TOSS_UNCONFIRMED, Payment 미복원", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        ...tossPayment,
        paymentStatus: "refund_processing",
      });
      mockPrisma.refundRequest.findUnique.mockResolvedValue({
        requestedAmount: 100000,
        pgFirstAttemptedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
      });
      await expect(
        service.cancelPayment(
          "pay-1",
          "재처리",
          undefined,
          undefined,
          undefined,
          undefined,
          { trusted: true, userType: "ADMIN", id: "admin-1" },
          {
            refundRequestId: "rr-1",
            actorId: "admin-1",
            expectedVersion: 3,
            idempotencyKey: "rr:rr-1",
            resumeProcessing: true,
          },
        ),
      ).rejects.toMatchObject({ stage: "PG", code: "TOSS_UNCONFIRMED" });
      expect(mockTossGateway.cancel).not.toHaveBeenCalled();
      const restoreCall = mockPrisma.payment.updateMany.mock.calls.find(
        (c) => c[0]?.data?.paymentStatus === "completed",
      );
      expect(restoreCall).toBeFalsy();
    });

    // [Critical 1 / 회귀 ③] resume 토스 최초시각 null(레거시/미기록) → 보수적 차단.
    it("resume 토스 + pgFirstAttemptedAt null → 토스 호출 0회, TOSS_UNCONFIRMED", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        ...tossPayment,
        paymentStatus: "refund_processing",
      });
      mockPrisma.refundRequest.findUnique.mockResolvedValue({
        requestedAmount: 100000,
        pgFirstAttemptedAt: null,
      });
      await expect(
        service.cancelPayment(
          "pay-1",
          "재처리",
          undefined,
          undefined,
          undefined,
          undefined,
          { trusted: true, userType: "ADMIN", id: "admin-1" },
          {
            refundRequestId: "rr-1",
            actorId: "admin-1",
            expectedVersion: 3,
            idempotencyKey: "rr:rr-1",
            resumeProcessing: true,
          },
        ),
      ).rejects.toMatchObject({ stage: "PG", code: "TOSS_UNCONFIRMED" });
      expect(mockTossGateway.cancel).not.toHaveBeenCalled();
    });

    // [Major 1 / 회귀 ④] 최초시각 기록 실패 → claim 트랜잭션 rollback(예외 전파), PG 0회.
    it("최초시각 기록(set-if-null) 실패 → claim tx rollback, 토스 호출 0회", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(tossPayment); // completed, toss.
      // claim 과 동일 tx 내 pgFirstAttemptedAt set-if-null 이 실패 → tx rollback.
      sharedTx.refundRequest.updateMany.mockRejectedValueOnce(
        new Error("pgFirstAttemptedAt write fail"),
      );
      await expect(
        service.cancelPayment(
          "pay-1",
          "승인",
          undefined,
          undefined,
          undefined,
          undefined,
          { trusted: true, userType: "ADMIN", id: "admin-1" },
          {
            refundRequestId: "rr-1",
            actorId: "admin-1",
            expectedVersion: 3,
            idempotencyKey: "rr:rr-1",
          },
        ),
      ).rejects.toThrow(/pgFirstAttemptedAt write fail/);
      expect(mockTossGateway.cancel).not.toHaveBeenCalled();
    });

    // [Minor 2 / 회귀 ⑤] 14일 경계 — Date.now 고정 3점(14일-1ms 허용 / 14일 허용(경계) / 14일+1ms 차단).
    describe("토스 멱등 14일 경계 — Date.now 고정 3점", () => {
      const WINDOW = 14 * 24 * 60 * 60 * 1000;
      const firstAtMs = new Date("2026-07-01T00:00:00.000Z").getTime();
      let nowSpy: jest.SpyInstance | undefined;

      beforeEach(() => {
        mockPrisma.payment.findUnique.mockResolvedValue({
          ...tossPayment,
          paymentStatus: "refund_processing",
        });
        mockPrisma.refundRequest.findUnique.mockResolvedValue({
          requestedAmount: 100000,
          pgFirstAttemptedAt: new Date(firstAtMs),
        });
        mockTossGateway.cancel.mockResolvedValue({ status: "PARTIAL_CANCELED" });
      });
      afterEach(() => nowSpy?.mockRestore());

      // 가드는 Date.now() 만 사용하므로 Date.now 스파이로 결정적으로 고정(new Date() 는 무영향).
      const setNow = (ms: number) => {
        nowSpy = jest.spyOn(Date, "now").mockReturnValue(ms);
      };
      const runResume = () =>
        service.cancelPayment(
          "pay-1",
          "재처리",
          undefined,
          undefined,
          undefined,
          undefined,
          { trusted: true, userType: "ADMIN", id: "admin-1" },
          {
            refundRequestId: "rr-1",
            actorId: "admin-1",
            expectedVersion: 3,
            idempotencyKey: "rr:rr-1",
            resumeProcessing: true,
          },
        );

      it("14일 - 1ms → 허용(토스 1회)", async () => {
        setNow(firstAtMs + WINDOW - 1);
        await runResume();
        expect(mockTossGateway.cancel).toHaveBeenCalledTimes(1);
      });

      it("정확히 14일 → 허용(경계 포함, now-firstAt <= WINDOW)", async () => {
        setNow(firstAtMs + WINDOW);
        await runResume();
        expect(mockTossGateway.cancel).toHaveBeenCalledTimes(1);
      });

      it("14일 + 1ms → 차단(토스 0회, TOSS_UNCONFIRMED)", async () => {
        setNow(firstAtMs + WINDOW + 1);
        await expect(runResume()).rejects.toMatchObject({
          code: "TOSS_UNCONFIRMED",
        });
        expect(mockTossGateway.cancel).not.toHaveBeenCalled();
      });
    });
  });

  // ── [Major 3] applyRefundDbOnly 내부 증거·금액·fence 강제 ──────────
  describe("applyRefundDbOnly — 자기 증거·fence 강제", () => {
    it("자기 PG 증거(DB_AFTER_PG+pgRefundSucceededAt) 없으면 거부", async () => {
      mockPrisma.refundRequest.findUnique.mockResolvedValue({
        paymentId: "pay-1",
        status: "executing",
        failureStage: "PG", // DB_AFTER_PG 아님 → 증거 없음
        pgRefundSucceededAt: null,
        requestedAmount: 400000,
      });

      await expect(
        service.applyRefundDbOnly("pay-1", "재처리", 400000, {
          refundRequestId: "rr-1",
          expectedVersion: 3,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("이미 refunded + fence count!==1(선점 상실) → 성공 금지(RefundExecutionError)", async () => {
      mockPrisma.refundRequest.findUnique.mockResolvedValue({
        paymentId: "pay-1",
        status: "executing",
        failureStage: "DB_AFTER_PG",
        pgRefundSucceededAt: new Date(),
        requestedAmount: 400000,
      });
      mockPrisma.payment.findUnique.mockResolvedValue({
        id: "pay-1",
        amount: 400000,
        paymentStatus: "refunded",
      });
      // fence 선점 상실.
      mockPrisma.refundRequest.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.applyRefundDbOnly("pay-1", "재처리", 400000, {
          refundRequestId: "rr-1",
          expectedVersion: 3,
        }),
      ).rejects.toBeInstanceOf(RefundExecutionError);
    });

    it("증거 有 + 이미 refunded + fence count=1 → alreadyApplied", async () => {
      mockPrisma.refundRequest.findUnique.mockResolvedValue({
        paymentId: "pay-1",
        status: "executing",
        failureStage: "DB_AFTER_PG",
        pgRefundSucceededAt: new Date(),
        requestedAmount: 400000,
      });
      mockPrisma.payment.findUnique.mockResolvedValue({
        id: "pay-1",
        amount: 400000,
        paymentStatus: "refunded",
      });
      mockPrisma.refundRequest.updateMany.mockResolvedValueOnce({ count: 1 });

      const res = await service.applyRefundDbOnly("pay-1", "재처리", 400000, {
        refundRequestId: "rr-1",
        expectedVersion: 3,
      });
      expect(res.alreadyApplied).toBe(true);
    });
  });

  describe("cancelPayment — KG stale 격리(Major 1)", () => {
    it("KG resumeProcessing → 자동 PG 재호출 금지, KG_UNCONFIRMED", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(kgPayment);

      await expect(
        service.cancelPayment(
          "pay-1",
          "재처리",
          undefined,
          undefined,
          undefined,
          undefined,
          { trusted: true, userType: "ADMIN" },
          {
            refundRequestId: "rr-1",
            resumeProcessing: true,
            idempotencyKey: "rr:rr-1",
            expectedVersion: 3,
          },
        ),
      ).rejects.toMatchObject({ code: "KG_UNCONFIRMED" });

      // KG PG 재호출 없음.
      expect(mockKgGateway.cancelPayment).not.toHaveBeenCalled();
    });
  });

  // Phase B 구현 후 활성화 예정
  it.skip("cancelPayment: KG 취소 성공 후 $transaction 내 크레딧 복원 + 감사 로그 생성", async () => {
    // given: kgGateway.cancelPayment 성공, payment 존재
    // when: cancelPayment(paymentId, userId, { refundReason: '회원 요청' })
    // then: $transaction 1회, 반환값 { refundId, cancelledAmount, restoredCreditIds } 포함
  });

  it.skip("cancelPayment: 이미 취소된 결제 재시도 시 ConflictException — 멱등성", async () => {
    // given: payment.status = 'CANCELLED'
    // when: cancelPayment 재호출
    // then: ConflictException, kgGateway.cancelPayment 호출 없음
  });

  it.skip("requestRefund: cancelPayment 에 그대로 위임하고 동일 결과 반환", async () => {
    // given: cancelPayment 가 정상 CancelPaymentResult 반환하도록 spy
    // when: requestRefund(paymentId, userId, options)
    // then: cancelPayment 호출 1회, 반환값 동일
  });

  it.skip("getRefundLogs: 존재하지 않는 paymentId 조회 시 빈 배열 반환", async () => {
    // given: prisma.refundLog.findMany 가 [] 반환
    // when: getRefundLogs('non-existent', userId)
    // then: [] 반환, 예외 없음
  });
});
