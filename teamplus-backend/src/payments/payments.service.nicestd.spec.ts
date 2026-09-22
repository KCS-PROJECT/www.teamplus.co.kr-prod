import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  PaymentsService,
  NiceStdResultPendingError,
  NiceStdPaymentVoidedError,
} from "./payments.service";
import { PrismaService } from "@/prisma/prisma.service";
import { PaymentWebhookService } from "./services/payment-webhook.service";
import { PaymentCreateService } from "./services/payment-create.service";
import { PaymentRefundService } from "./services/payment-refund.service";
import { PaymentReceiptService } from "./services/payment-receipt.service";
import { TossPaymentsGateway } from "./toss-payments.gateway";
import { NicePaymentsGateway } from "./nice-payments.gateway";
import {
  NiceStdPaymentsGateway,
  NiceStdApproveAmbiguousError,
} from "./nice-std-payments.gateway";
import { RedisService } from "@/redis/redis.service";
import { CreditDomainService } from "@/credits/credit-domain.service";
import { NotificationsService } from "@/notifications/notifications.service";

/**
 * 구모듈 승인·통보 서비스 계약.
 *
 *  1) 캡처 후 후처리가 죽어 tid 만 남은 주문은 재진입 시 승인을 다시 부르지 않는다(F9).
 *  2) `already_approved`(1682) 응답도 캡처로 취급해 후처리까지 완결한다.
 *  3) 승인 모호는 망취소 1회 → 조회 1회로 해소하고, 확인 실패만 격리한다(F4).
 *  4) 통보 핸들러는 어떤 경우에도 `payment.update` 를 부르지 않는다(F2).
 */
describe("PaymentsService — 나이스 구모듈", () => {
  let service: PaymentsService;
  let releaseSpy: jest.SpyInstance;

  const mockPrisma = {
    payment: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    refundRequest: { findUnique: jest.fn(), update: jest.fn() },
    enrollment: { findMany: jest.fn().mockResolvedValue([]) },
    monthlyPostpaidBillingLine: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    tournamentRegistration: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    academy: { findUnique: jest.fn().mockResolvedValue(null) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(),
  };

  const mockNiceStdGateway = {
    isConfigured: jest.fn().mockReturnValue(true),
    buildPayRequest: jest.fn().mockReturnValue({
      actionUrl: "https://api.teamplus.test/api/v1/payments/nicestd/authorize",
      fields: { MID: "nictest00m" },
    }),
    approve: jest.fn(),
    netCancel: jest.fn(),
    getTransactionStatus: jest.fn(),
    cancel: jest.fn(),
  };

  const mockRedis = {
    setIfNotExists: jest.fn().mockResolvedValue(true),
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(undefined),
  };
  const mockReceiptService = { createReceipt: jest.fn() };
  const mockNotifications = {
    notifyUsers: jest.fn(),
    notifyTeamManagers: jest.fn(),
    getTeamManagerUserIds: jest.fn().mockResolvedValue(["coach-1"]),
  };

  /** applyApprovedPayment 가 실제로 돌도록 $transaction 콜백에 넘길 tx 목. */
  function makeTx(overrides: Record<string, unknown> = {}) {
    return {
      payment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      monthlyPostpaidBillingLine: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      enrollment: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn(),
      },
      classRegistration: { updateMany: jest.fn(), upsert: jest.fn() },
      tournamentRegistration: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      refundRequest: { findFirst: jest.fn().mockResolvedValue(null) },
      ...overrides,
    };
  }

  const pendingPayment = {
    id: "pay-1",
    userId: "parent-1",
    amount: 1004,
    paymentStatus: "pending",
    productId: null,
    tid: null,
    product: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PaymentWebhookService, useValue: {} },
        { provide: PaymentCreateService, useValue: {} },
        { provide: PaymentRefundService, useValue: {} },
        { provide: PaymentReceiptService, useValue: mockReceiptService },
        { provide: TossPaymentsGateway, useValue: {} },
        { provide: NicePaymentsGateway, useValue: {} },
        { provide: NiceStdPaymentsGateway, useValue: mockNiceStdGateway },
        { provide: RedisService, useValue: mockRedis },
        {
          provide: CreditDomainService,
          useValue: { issueFromPayment: jest.fn() },
        },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    jest.clearAllMocks();
    mockRedis.setIfNotExists.mockResolvedValue(true);
    mockRedis.get.mockResolvedValue(null);
    releaseSpy = jest
      .spyOn(
        service as unknown as {
          releaseClaimedSeats: (c: unknown[]) => Promise<void>;
        },
        "releaseClaimedSeats",
      )
      .mockResolvedValue(undefined);
    // 재시도 백오프는 계약이 아니라 대기 시간이라 테스트에서 0 으로 만든다.
    jest
      .spyOn(
        service as unknown as { sleep: (ms: number) => Promise<void> },
        "sleep",
      )
      .mockResolvedValue(undefined);
    mockNiceStdGateway.isConfigured.mockReturnValue(true);
    mockNiceStdGateway.buildPayRequest.mockReturnValue({
      actionUrl: "https://api.teamplus.test/api/v1/payments/nicestd/authorize",
      fields: { MID: "nictest00m" },
    });
    mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
      cb(makeTx()),
    );
    mockPrisma.enrollment.findMany.mockResolvedValue([]);
    mockPrisma.monthlyPostpaidBillingLine.findMany.mockResolvedValue([]);
    mockPrisma.tournamentRegistration.findMany.mockResolvedValue([]);
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockNotifications.getTeamManagerUserIds.mockResolvedValue(["coach-1"]);
  });

  const approveArgs = {
    orderNumber: "ORD-1",
    tid: "tid-1",
    authToken: "authtoken-1",
    amount: 1004,
    nextAppUrl: "https://dc1-api.nicepay.co.kr/webapi/pay_process.jsp",
    netCancelUrl: "https://dc1-api.nicepay.co.kr/webapi/cancel_process.jsp",
  };

  describe("buildNiceStdPayRequest", () => {
    const signArgs = {
      orderNumber: "ORD-1",
      userId: "parent-1",
      payMethod: "CARD" as const,
    };

    it("본인 소유 pending 주문만 서명한다 — 이메일은 싣지 않는다", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        id: "pay-1",
        userId: "parent-1",
        amount: 1004,
        paymentStatus: "pending",
        product: { productName: "수요일 수업 4회" },
        user: { firstName: "민준", lastName: "김", phone: "010-1234-5678" },
      });

      await service.buildNiceStdPayRequest(signArgs);

      expect(mockNiceStdGateway.buildPayRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          orderNumber: "ORD-1",
          amount: 1004,
          goodsName: "수요일 수업 4회",
          payMethod: "CARD",
          buyerName: "김민준",
          buyerTel: "01012345678",
        }),
      );
      const arg = mockNiceStdGateway.buildPayRequest.mock.calls[0][0];
      expect(arg).not.toHaveProperty("buyerEmail");
    });

    it("남의 주문번호는 존재 여부도 알리지 않고 404 로 끊는다", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        id: "pay-1",
        userId: "other-parent",
        amount: 1004,
        paymentStatus: "pending",
        product: null,
        user: null,
      });

      await expect(service.buildNiceStdPayRequest(signArgs)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockNiceStdGateway.buildPayRequest).not.toHaveBeenCalled();
    });

    it("pending 이 아닌 주문은 서명하지 않는다", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        id: "pay-1",
        userId: "parent-1",
        amount: 1004,
        paymentStatus: "completed",
        product: null,
        user: null,
      });

      await expect(service.buildNiceStdPayRequest(signArgs)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockNiceStdGateway.buildPayRequest).not.toHaveBeenCalled();
    });

    it("상품이 없는 대회 결제는 대회명으로 상품명을 파생한다", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        id: "pay-1",
        userId: "parent-1",
        amount: 30000,
        paymentStatus: "pending",
        product: null,
        user: null,
      });
      mockPrisma.tournamentRegistration.findFirst.mockResolvedValue({
        tournament: { name: "전국동빙리그" },
      });

      await service.buildNiceStdPayRequest(signArgs);

      expect(mockNiceStdGateway.buildPayRequest).toHaveBeenCalledWith(
        expect.objectContaining({ goodsName: "전국동빙리그 대회 참가비" }),
      );
    });

    it("게이트웨이 미설정이면 503 으로 거절한다", async () => {
      mockNiceStdGateway.isConfigured.mockReturnValue(false);

      await expect(service.buildNiceStdPayRequest(signArgs)).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(mockPrisma.payment.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("getRetryPathByOrderNumber", () => {
    const pendingWhere = (orderNumber: string) =>
      expect.objectContaining({
        where: { orderNumber, paymentStatus: "pending", deletedAt: null },
      });

    it("수업 후불 주문은 후불 결제 화면으로 만든다 (pending 주문만)", async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        productId: null,
        amount: 50000,
        enrollments: [],
        tournamentRegistrations: [],
      });

      const path = await service.getRetryPathByOrderNumber(
        "POSTPAID-bill-1-user-1",
      );

      expect(path).toBe(
        "/payment/postpaid?orderNumber=POSTPAID-bill-1-user-1&error=fail",
      );
      expect(mockPrisma.payment.findFirst).toHaveBeenCalledWith(
        pendingWhere("POSTPAID-bill-1-user-1"),
      );
    });

    it("코드·취소 여부를 받으면 복귀 쿼리에 code·cancel 을 함께 싣는다", async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        productId: null,
        amount: 50000,
        enrollments: [],
        tournamentRegistrations: [{ tournamentId: "tour-1" }],
      });

      expect(
        await service.getRetryPathByOrderNumber("TRN-1", {
          code: "I002",
          cancelled: true,
        }),
      ).toBe("/tournaments/tour-1/apply?error=fail&code=I002&cancel=1");
      expect(
        await service.getRetryPathByOrderNumber("TRN-1", { code: "W090" }),
      ).toBe("/tournaments/tour-1/apply?error=fail&code=W090");
    });

    it("대회 후불(TRN-POSTPAID-)은 대회 신청이 연결돼 있어도 후불 결제 화면으로 만든다", async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        productId: null,
        amount: 30000,
        enrollments: [],
        tournamentRegistrations: [{ tournamentId: "tour-1" }],
      });

      const path = await service.getRetryPathByOrderNumber(
        "TRN-POSTPAID-tour-1-reg-1",
      );

      expect(path).toBe(
        "/payment/postpaid?orderNumber=TRN-POSTPAID-tour-1-reg-1&error=fail",
      );
    });

    it("대회 선불은 연결된 대회 신청의 대회 id 로 참가 화면을 만든다", async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        productId: null,
        amount: 30000,
        enrollments: [],
        tournamentRegistrations: [{ tournamentId: "tour-1" }],
      });

      const path = await service.getRetryPathByOrderNumber("TRN-1");

      expect(path).toBe("/tournaments/tour-1/apply?error=fail");
    });

    it("수업 선불은 결제 행과 수강 신청으로 토스 failUrl 과 같은 쿼리를 만든다", async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        productId: "prod-1",
        amount: 1004,
        enrollments: [{ classId: "class-1", childId: "child-1" }],
        tournamentRegistrations: [],
      });

      const path = await service.getRetryPathByOrderNumber("ORD-1");

      expect(path).toBe(
        "/payment/checkout?productId=prod-1&childId=child-1&classId=class-1&amount=1004&error=fail",
      );
      expect(mockPrisma.payment.findFirst).toHaveBeenCalledWith(
        pendingWhere("ORD-1"),
      );
    });

    it("pending 이 아니거나 없는 주문, 복원 재료가 없는 주문은 null", async () => {
      mockPrisma.payment.findFirst.mockResolvedValueOnce(null);
      expect(await service.getRetryPathByOrderNumber("ORD-x")).toBeNull();

      mockPrisma.payment.findFirst.mockResolvedValueOnce({
        productId: "prod-1",
        amount: 1004,
        enrollments: [],
        tournamentRegistrations: [],
      });
      expect(await service.getRetryPathByOrderNumber("ORD-y")).toBeNull();
    });
  });

  describe("confirmNiceStdPayment", () => {
    it("승인 성공 직후 tid 를 기록한 뒤 후처리한다", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(pendingPayment);
      mockNiceStdGateway.approve.mockResolvedValue({
        status: "approved",
        tid: "tid-approved",
        amount: 1004,
        payMethod: "CARD",
        approvedAt: new Date("2026-09-18T01:00:00Z"),
        raw: {},
      });

      const result = await service.confirmNiceStdPayment(approveArgs);

      expect(result.success).toBe(true);
      // tid 기록은 후처리($transaction) 이전이어야 재진입이 성립한다.
      const tidWrite = mockPrisma.payment.updateMany.mock.calls.find(
        (c) => (c[0] as { data?: { tid?: string } }).data?.tid,
      );
      expect(tidWrite?.[0]).toEqual({
        where: { id: "pay-1", paymentStatus: "pending" },
        data: { tid: "tid-approved" },
      });
      expect(
        mockPrisma.payment.updateMany.mock.invocationCallOrder[0],
      ).toBeLessThan(mockPrisma.$transaction.mock.invocationCallOrder[0]);
    });

    it("이미 tid 가 기록된 pending 주문은 승인을 다시 호출하지 않는다", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        ...pendingPayment,
        tid: "tid-captured",
      });
      mockNiceStdGateway.getTransactionStatus.mockResolvedValue({
        status: "approved",
        authDate: "260918100000",
        raw: {},
      });

      const result = await service.confirmNiceStdPayment(approveArgs);

      expect(mockNiceStdGateway.approve).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it("재진입은 원장 조회로 승인 시각을 복원해 후처리에 넘긴다", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        ...pendingPayment,
        tid: "tid-captured",
      });
      mockNiceStdGateway.getTransactionStatus.mockResolvedValue({
        status: "approved",
        authDate: "260918100000",
        raw: {},
      });

      const result = await service.confirmNiceStdPayment(approveArgs);

      expect(mockNiceStdGateway.getTransactionStatus).toHaveBeenCalledWith(
        "tid-captured",
        { timeoutMs: 8000 },
      );
      // KST 2026-09-18 10:00:00 → UTC 01:00:00
      expect(result.approvedAt).toBe("2026-09-18T01:00:00.000Z");
    });

    it("재진입 조회가 실패하면 현재 시각으로 폴백한다", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        ...pendingPayment,
        tid: "tid-captured",
      });
      mockNiceStdGateway.getTransactionStatus.mockRejectedValue(
        new Error("조회 실패"),
      );

      const result = await service.confirmNiceStdPayment(approveArgs);

      expect(result.success).toBe(true);
      expect(result.approvedAt).toEqual(expect.any(String));
    });

    it("already_approved(기승인) 응답도 캡처로 취급해 후처리까지 마친다", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(pendingPayment);
      mockNiceStdGateway.approve.mockResolvedValue({
        status: "already_approved",
        tid: "tid-1",
        amount: 1004,
        raw: {},
      });

      const result = await service.confirmNiceStdPayment(approveArgs);

      expect(result.success).toBe(true);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it("완료된 주문은 승인 없이 멱등 응답한다", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        ...pendingPayment,
        paymentStatus: "completed",
      });

      const result = await service.confirmNiceStdPayment(approveArgs);

      expect(result).toEqual({
        success: true,
        paymentId: "pay-1",
        idempotent: true,
      });
      expect(mockNiceStdGateway.approve).not.toHaveBeenCalled();
    });

    it("failed 주문은 재결제를 막는다 (망취소 실패 격리)", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        ...pendingPayment,
        paymentStatus: "failed",
      });

      await expect(service.confirmNiceStdPayment(approveArgs)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockNiceStdGateway.approve).not.toHaveBeenCalled();
    });

    /** 승인 응답이 모호한 상황을 만든다. */
    const makeAmbiguous = () =>
      new NiceStdApproveAmbiguousError("미확정", {
        orderNumber: "ORD-1",
        tid: "tid-1",
        authToken: "authtoken-1",
        netCancelUrl: approveArgs.netCancelUrl,
      });

    /** failed 전이가 기록됐는지. */
    const failedWrite = () =>
      mockPrisma.payment.updateMany.mock.calls.find(
        (c) =>
          (c[0] as { data?: { paymentStatus?: string } }).data
            ?.paymentStatus === "failed",
      );

    /** tid 기록 호출. */
    const tidWrite = () =>
      mockPrisma.payment.updateMany.mock.calls.find(
        (c) => (c[0] as { data?: { tid?: string } }).data?.tid !== undefined,
      );

    it("망취소 1회 성공이면 조회 없이 재결제를 안내한다", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(pendingPayment);
      mockNiceStdGateway.approve.mockRejectedValue(makeAmbiguous());
      mockNiceStdGateway.netCancel.mockResolvedValue(undefined);

      await expect(service.confirmNiceStdPayment(approveArgs)).rejects.toThrow(
        NiceStdPaymentVoidedError,
      );

      expect(mockNiceStdGateway.netCancel).toHaveBeenCalledTimes(1);
      expect(mockNiceStdGateway.getTransactionStatus).not.toHaveBeenCalled();
      // 되돌린 것이 확인됐으므로 격리도, 뒤늦은 승인 표식도 남기지 않는다.
      expect(failedWrite()).toBeUndefined();
      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    it("망취소는 재시도하지 않고 바로 조회로 넘어간다", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(pendingPayment);
      mockNiceStdGateway.approve.mockRejectedValue(makeAmbiguous());
      mockNiceStdGateway.netCancel.mockRejectedValue(
        new Error("허용시간 초과"),
      );
      mockNiceStdGateway.getTransactionStatus.mockResolvedValue({
        status: "cancelled",
        raw: {},
      });

      await expect(service.confirmNiceStdPayment(approveArgs)).rejects.toThrow(
        NiceStdPaymentVoidedError,
      );

      // 확정 실패 코드에 같은 요청을 한 번 더 보내도 결과가 바뀌지 않는다.
      expect(mockNiceStdGateway.netCancel).toHaveBeenCalledTimes(1);
      expect(mockNiceStdGateway.getTransactionStatus).toHaveBeenCalledTimes(1);
    });

    it("조회가 승인으로 답하면 승인을 재호출하지 않고 후처리로 이어간다", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(pendingPayment);
      mockNiceStdGateway.approve.mockRejectedValue(makeAmbiguous());
      mockNiceStdGateway.netCancel.mockRejectedValue(new Error("망취소 실패"));
      mockNiceStdGateway.getTransactionStatus.mockResolvedValue({
        status: "approved",
        authDate: "260918100000",
        raw: { TID: "tid-from-inquiry" },
      });

      const result = await service.confirmNiceStdPayment(approveArgs);

      expect(result.success).toBe(true);
      expect(mockNiceStdGateway.approve).toHaveBeenCalledTimes(1);
      expect(failedWrite()).toBeUndefined();
      // 거래번호는 서명으로 검증한 인증 단계 TxTid 를 쓴다 — 조회 응답에는 서명이 없다.
      //   tid 기록이 후처리보다 먼저여야 F9 재진입이 성립한다.
      expect(tidWrite()?.[0]).toEqual({
        where: { id: "pay-1", paymentStatus: "pending" },
        data: { tid: "tid-1" },
      });
      expect(
        mockPrisma.payment.updateMany.mock.invocationCallOrder[0],
      ).toBeLessThan(mockPrisma.$transaction.mock.invocationCallOrder[0]);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it("조회 승인 후 후처리가 실패해도 pending+tid 가 남아 재진입이 가능하다", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(pendingPayment);
      mockNiceStdGateway.approve.mockRejectedValue(makeAmbiguous());
      mockNiceStdGateway.netCancel.mockRejectedValue(new Error("망취소 실패"));
      mockNiceStdGateway.getTransactionStatus.mockResolvedValue({
        status: "approved",
        raw: {},
      });
      mockPrisma.$transaction.mockRejectedValue(new Error("DB 실패"));

      await expect(service.confirmNiceStdPayment(approveArgs)).rejects.toThrow(
        "DB 실패",
      );

      expect(tidWrite()?.[0]).toEqual({
        where: { id: "pay-1", paymentStatus: "pending" },
        data: { tid: "tid-1" },
      });
      expect(failedWrite()).toBeUndefined();
      // 재진입할 수 있도록 락은 푼다.
      expect(mockRedis.del).toHaveBeenCalledWith("nicestd:confirm:ORD-1");
    });

    it("조회가 취소로 답하면 미승인 표식을 남기고 재결제를 안내한다", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(pendingPayment);
      mockNiceStdGateway.approve.mockRejectedValue(makeAmbiguous());
      mockNiceStdGateway.netCancel.mockRejectedValue(new Error("망취소 실패"));
      mockNiceStdGateway.getTransactionStatus.mockResolvedValue({
        status: "cancelled",
        raw: {},
      });

      await expect(service.confirmNiceStdPayment(approveArgs)).rejects.toThrow(
        NiceStdPaymentVoidedError,
      );

      expect(failedWrite()).toBeUndefined();
      expect(tidWrite()).toBeUndefined();
      expect(mockRedis.set).toHaveBeenCalledWith(
        "nicestd:voided:ORD-1",
        "tid-1",
        86400,
      );
    });

    it("조회가 거래없음으로 답하면 미승인으로 단정하지 않고 격리한다", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(pendingPayment);
      mockNiceStdGateway.approve.mockRejectedValue(makeAmbiguous());
      mockNiceStdGateway.netCancel.mockRejectedValue(new Error("망취소 실패"));
      mockNiceStdGateway.getTransactionStatus.mockResolvedValue({
        status: "none",
        raw: {},
      });

      await expect(service.confirmNiceStdPayment(approveArgs)).rejects.toThrow(
        NiceStdResultPendingError,
      );

      // 원장 반영 지연일 수 있어 재조회도 미승인 확정도 하지 않는다.
      expect(mockNiceStdGateway.getTransactionStatus).toHaveBeenCalledTimes(1);
      expect(mockRedis.set).not.toHaveBeenCalled();
      expect(failedWrite()).toBeDefined();
    });

    it("격리로 끝나면 좌석을 반납하지 않는다 (돈이 나갔을 수 있음)", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(pendingPayment);
      mockNiceStdGateway.approve.mockRejectedValue(makeAmbiguous());
      mockNiceStdGateway.netCancel.mockRejectedValue(new Error("망취소 실패"));
      mockNiceStdGateway.getTransactionStatus.mockRejectedValue(
        new Error("조회 실패"),
      );

      await expect(service.confirmNiceStdPayment(approveArgs)).rejects.toThrow(
        NiceStdResultPendingError,
      );

      expect(releaseSpy).not.toHaveBeenCalled();
    });

    it("미승인이 확정되면 좌석을 반납한다", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(pendingPayment);
      mockNiceStdGateway.approve.mockRejectedValue(makeAmbiguous());
      mockNiceStdGateway.netCancel.mockResolvedValue(undefined);

      await expect(service.confirmNiceStdPayment(approveArgs)).rejects.toThrow(
        NiceStdPaymentVoidedError,
      );

      expect(releaseSpy).toHaveBeenCalledTimes(1);
    });

    it("미승인 표식 기록이 실패해도 취소 확정을 뒤집지 않는다", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(pendingPayment);
      mockNiceStdGateway.approve.mockRejectedValue(makeAmbiguous());
      mockNiceStdGateway.netCancel.mockRejectedValue(new Error("망취소 실패"));
      mockNiceStdGateway.getTransactionStatus.mockResolvedValue({
        status: "cancelled",
        raw: {},
      });
      mockRedis.set.mockRejectedValue(new Error("Redis 장애"));

      await expect(service.confirmNiceStdPayment(approveArgs)).rejects.toThrow(
        NiceStdPaymentVoidedError,
      );

      // 돈이 나가지 않은 것이 확인됐으므로 격리로 넘어가면 안 된다.
      expect(failedWrite()).toBeUndefined();
      expect(releaseSpy).toHaveBeenCalledTimes(1);
    });

    it("격리 표시 쓰기가 실패해도 좌석은 유지하고 격리 예외로 끝난다", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(pendingPayment);
      mockNiceStdGateway.approve.mockRejectedValue(makeAmbiguous());
      mockNiceStdGateway.netCancel.mockRejectedValue(new Error("망취소 실패"));
      mockNiceStdGateway.getTransactionStatus.mockRejectedValue(
        new Error("조회 실패"),
      );
      mockPrisma.payment.updateMany.mockRejectedValue(new Error("DB 장애"));

      await expect(service.confirmNiceStdPayment(approveArgs)).rejects.toThrow(
        NiceStdResultPendingError,
      );

      // 표시를 못 남겼다고 일반 실패로 보이면 사용자가 재결제를 시도한다.
      expect(releaseSpy).not.toHaveBeenCalled();
    });

    it("조회까지 실패하면 Payment 를 failed 로 바꾸고 전용 예외를 던진다", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(pendingPayment);
      mockNiceStdGateway.approve.mockRejectedValue(makeAmbiguous());
      mockNiceStdGateway.netCancel.mockRejectedValue(new Error("망취소 실패"));
      mockNiceStdGateway.getTransactionStatus.mockRejectedValue(
        new Error("조회 실패"),
      );

      await expect(service.confirmNiceStdPayment(approveArgs)).rejects.toThrow(
        NiceStdResultPendingError,
      );

      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith({
        where: { id: "pay-1", paymentStatus: "pending" },
        // tid 를 함께 남겨 재청구(tid: null 조건)가 이 행을 되살리지 못하게 한다.
        data: { paymentStatus: "failed", tid: "tid-1" },
      });
      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    it("망취소·failed 전이가 끝난 뒤에야 락을 푼다", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(pendingPayment);
      mockNiceStdGateway.approve.mockRejectedValue(makeAmbiguous());
      mockNiceStdGateway.netCancel.mockRejectedValue(new Error("망취소 실패"));
      mockNiceStdGateway.getTransactionStatus.mockRejectedValue(
        new Error("조회 실패"),
      );

      await expect(service.confirmNiceStdPayment(approveArgs)).rejects.toThrow(
        NiceStdResultPendingError,
      );

      // 락을 먼저 풀면 같은 AuthToken 재요청이 승인 불명 구간에 재승인을 시도한다.
      expect(
        mockNiceStdGateway.netCancel.mock.invocationCallOrder[0],
      ).toBeLessThan(mockRedis.del.mock.invocationCallOrder[0]);
      expect(
        mockPrisma.payment.updateMany.mock.invocationCallOrder[0],
      ).toBeLessThan(mockRedis.del.mock.invocationCallOrder[0]);
    });

    it("동시 호출은 Redis 락으로 차단한다", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(pendingPayment);
      mockRedis.setIfNotExists.mockResolvedValue(false);

      await expect(service.confirmNiceStdPayment(approveArgs)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockNiceStdGateway.approve).not.toHaveBeenCalled();
    });
  });

  describe("handleNiceStdNotify", () => {
    it("격리된 환불요청과 일치하는 취소 통보는 자기 증거만 기록한다", async () => {
      mockPrisma.refundRequest.findUnique.mockResolvedValue({
        id: "rr-1",
        status: "execution_failed",
        failureCode: "NICE_UNCONFIRMED",
        payment: { tid: "tid-1", amount: 1004 },
      });

      await service.handleNiceStdNotify({
        StateCd: "1",
        TID: "tid-1",
        MOID: "ORD-1",
        Amt: "1004",
        CancelMOID: "RF-rr-1",
      });

      expect(mockPrisma.refundRequest.update).toHaveBeenCalledWith({
        where: { id: "rr-1" },
        data: {
          failureStage: "DB_AFTER_PG",
          pgRefundSucceededAt: expect.any(Date),
        },
      });
      expect(mockPrisma.payment.update).not.toHaveBeenCalled();
    });

    it("tid 가 다르면 증거를 기록하지 않는다", async () => {
      mockPrisma.refundRequest.findUnique.mockResolvedValue({
        id: "rr-1",
        status: "execution_failed",
        failureCode: "NICE_UNCONFIRMED",
        payment: { tid: "other-tid", amount: 1004 },
      });
      mockPrisma.payment.findFirst.mockResolvedValue(null);

      await service.handleNiceStdNotify({
        StateCd: "2",
        TID: "tid-1",
        MOID: "ORD-1",
        Amt: "1004",
        CancelMOID: "RF-rr-1",
      });

      expect(mockPrisma.refundRequest.update).not.toHaveBeenCalled();
      expect(mockPrisma.payment.update).not.toHaveBeenCalled();
    });

    it("우리 환불 기록이 없는 외부 취소는 상태를 바꾸지 않고 경보만 남긴다", async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({ id: "pay-1" });

      await service.handleNiceStdNotify({
        StateCd: "1",
        TID: "tid-1",
        MOID: "ORD-1",
        Amt: "1004",
        CancelMOID: "",
      });

      expect(mockPrisma.payment.update).not.toHaveBeenCalled();
      expect(mockPrisma.refundRequest.update).not.toHaveBeenCalled();
    });

    it("부분환불 격리건도 통보 Amt(원 결제금액) 기준으로 매칭된다", async () => {
      // 통보의 Amt 는 환불액이 아니라 상품금액이다 — 환불액과 비교하면 영구 미매칭이 된다.
      mockPrisma.refundRequest.findUnique.mockResolvedValue({
        id: "rr-2",
        status: "execution_failed",
        failureCode: "NICE_UNCONFIRMED",
        payment: { tid: "tid-1", amount: 100000 },
      });

      await service.handleNiceStdNotify({
        StateCd: "2",
        TID: "tid-1",
        MOID: "ORD-1",
        Amt: "100000",
        CancelMOID: "RF-rr-2",
      });

      expect(mockPrisma.refundRequest.update).toHaveBeenCalledWith({
        where: { id: "rr-2" },
        data: {
          failureStage: "DB_AFTER_PG",
          pgRefundSucceededAt: expect.any(Date),
        },
      });
      expect(mockNotifications.notifyTeamManagers).not.toHaveBeenCalled();
      expect(mockNotifications.notifyUsers).not.toHaveBeenCalled();
    });

    it("정상 종결된 환불의 통보는 아무것도 기록하지 않고 경보도 보내지 않는다", async () => {
      mockPrisma.refundRequest.findUnique.mockResolvedValue({
        id: "rr-3",
        status: "executed",
        failureCode: null,
        payment: { tid: "tid-1", amount: 1004 },
      });

      await service.handleNiceStdNotify({
        StateCd: "1",
        TID: "tid-1",
        MOID: "ORD-1",
        Amt: "1004",
        CancelMOID: "RF-rr-3",
      });

      expect(mockPrisma.refundRequest.update).not.toHaveBeenCalled();
      expect(mockPrisma.payment.update).not.toHaveBeenCalled();
      expect(mockNotifications.notifyTeamManagers).not.toHaveBeenCalled();
      expect(mockNotifications.notifyUsers).not.toHaveBeenCalled();
    });

    it("미승인 확정 후 옛 거래가 승인 통보로 오면 경보한다", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        id: "pay-1",
        paymentStatus: "pending",
        tid: null,
      });
      mockRedis.get.mockResolvedValue("tid-1");
      mockPrisma.enrollment.findMany.mockResolvedValue([
        {
          class: {
            id: "class-1",
            className: "수업",
            teamId: "team-1",
            academyId: null,
          },
        },
      ]);

      await service.handleNiceStdNotify({
        StateCd: "0",
        TID: "tid-1",
        MOID: "ORD-1",
        Amt: "1004",
      });

      expect(mockRedis.get).toHaveBeenCalledWith("nicestd:voided:ORD-1");
      expect(mockNotifications.notifyTeamManagers).toHaveBeenCalledWith(
        "team-1",
        expect.objectContaining({ title: "재결제 허용 후 옛 거래 승인" }),
      );
      // 상태는 여전히 건드리지 않는다.
      expect(mockPrisma.payment.update).not.toHaveBeenCalled();
      expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
    });

    it("완료된 주문에 다른 거래번호의 승인 통보가 오면 경보한다", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        id: "pay-1",
        paymentStatus: "completed",
        tid: "tid-recorded",
      });
      mockPrisma.enrollment.findMany.mockResolvedValue([
        {
          class: {
            id: "class-1",
            className: "수업",
            teamId: "team-1",
            academyId: null,
          },
        },
      ]);

      await service.handleNiceStdNotify({
        StateCd: "0",
        TID: "tid-other",
        MOID: "ORD-1",
        Amt: "1004",
      });

      expect(mockNotifications.notifyTeamManagers).toHaveBeenCalledWith(
        "team-1",
        expect.objectContaining({ title: "재결제 허용 후 옛 거래 승인" }),
      );
      expect(mockPrisma.payment.update).not.toHaveBeenCalled();
    });

    it("격리(failed)해 둔 거래가 승인 통보로 오면 경보한다", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        id: "pay-1",
        paymentStatus: "failed",
        tid: "tid-1",
      });
      mockPrisma.enrollment.findMany.mockResolvedValue([
        {
          class: {
            id: "class-1",
            className: "수업",
            teamId: "team-1",
            academyId: null,
          },
        },
      ]);

      await service.handleNiceStdNotify({
        StateCd: "0",
        TID: "tid-1",
        MOID: "ORD-1",
        Amt: "1004",
      });

      expect(mockNotifications.notifyTeamManagers).toHaveBeenCalledWith(
        "team-1",
        expect.objectContaining({ title: "격리 주문 승인 확인됨" }),
      );
      expect(mockPrisma.payment.update).not.toHaveBeenCalled();
      expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
    });

    it("담당 팀에 감독·코치가 없으면 경보가 운영자에게 간다", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        id: "pay-1",
        paymentStatus: "failed",
        tid: "tid-1",
      });
      mockPrisma.enrollment.findMany.mockResolvedValue([
        {
          class: {
            id: "class-1",
            className: "수업",
            teamId: "team-1",
            academyId: null,
          },
        },
      ]);
      // 대상 팀은 있지만 실제 수신자가 0명 — 대상 개수만 세면 경보가 사라진다.
      mockNotifications.getTeamManagerUserIds.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([{ id: "oper-1" }]);

      await service.handleNiceStdNotify({
        StateCd: "0",
        TID: "tid-1",
        MOID: "ORD-1",
        Amt: "1004",
      });

      expect(mockNotifications.notifyTeamManagers).not.toHaveBeenCalled();
      expect(mockNotifications.notifyUsers).toHaveBeenCalledWith(
        ["oper-1"],
        expect.objectContaining({ title: "격리 주문 승인 확인됨" }),
      );
    });

    it("담당자를 특정할 수 없는 결제의 경보는 운영자에게 간다", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        id: "pay-1",
        paymentStatus: "failed",
        tid: "tid-1",
      });
      // 수업·대회 연결이 없어 담당 감독을 찾을 수 없는 결제.
      mockPrisma.enrollment.findMany.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([{ id: "oper-1" }]);

      await service.handleNiceStdNotify({
        StateCd: "0",
        TID: "tid-1",
        MOID: "ORD-1",
        Amt: "1004",
      });

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userType: { in: ["ADMIN", "SYSTEM", "OPER"] },
            deletedAt: null,
          },
        }),
      );
      expect(mockNotifications.notifyUsers).toHaveBeenCalledWith(
        ["oper-1"],
        expect.objectContaining({ title: "격리 주문 승인 확인됨" }),
      );
    });

    it("승인 통보인데 DB 가 pending 이면 상태도 바꾸지 않고 경보도 보내지 않는다", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        id: "pay-1",
        paymentStatus: "pending",
        tid: null,
      });

      await service.handleNiceStdNotify({
        StateCd: "0",
        TID: "tid-1",
        MOID: "ORD-1",
        Amt: "1004",
      });

      expect(mockPrisma.payment.update).not.toHaveBeenCalled();
      expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
      // 후처리 진행 중일 수 있어 경보 대상이 아니다.
      expect(mockNotifications.notifyTeamManagers).not.toHaveBeenCalled();
      expect(mockNotifications.notifyUsers).not.toHaveBeenCalled();
    });
  });
});
