import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { PaymentsService } from "./payments.service";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import { TossPaymentsGateway } from "./toss-payments.gateway";
import { NicePaymentsGateway } from "./nice-payments.gateway";
import { CreditDomainService } from "@/credits/credit-domain.service";
import { NotificationsService } from "@/notifications/notifications.service";
import { PaymentWebhookService } from "./services/payment-webhook.service";
import { PaymentCreateService } from "./services/payment-create.service";
import { PaymentRefundService } from "./services/payment-refund.service";
import { PaymentReceiptService } from "./services/payment-receipt.service";

/**
 * PaymentsService 는 Phase B 이후 Facade 로 재편되어, 결제 생성/웹훅/환불/영수증은
 * 각 sub-service 로 위임하고, 조회·통계·토스 confirm/mock confirm 만 직접 보유한다.
 *   - 위임 메서드: sub-service 를 mock 하여 "정확한 인자로 위임 + 결과 그대로 반환" 을 검증.
 *     (위임 대상 sub-service 의 내부 로직/예외는 각 sub-service spec 이 담당.)
 *   - 직접 메서드(getPayment·getUserPayments·통계·mockConfirmPayment): 실제 로직 검증.
 */
describe("PaymentsService", () => {
  let service: PaymentsService;
  let prismaService: PrismaService;

  const mockUserId = "user-123";
  const mockProductId = "product-456";
  const mockPaymentId = "payment-789";
  const mockOrderNumber = "ORD-1234567890-abcdef";

  const mockProduct = {
    productName: "신규 수강생반 - 월 8회",
    price: 240000,
    sessionsPerMonth: 8,
  };

  const mockCompletedPayment = {
    id: mockPaymentId,
    orderNumber: mockOrderNumber,
    userId: mockUserId,
    productId: mockProductId,
    amount: 240000,
    paymentStatus: "completed",
    paymentMethod: "card",
    tid: "TID-12345678",
    createdAt: new Date("2026-01-04T10:00:00Z"),
    completedAt: new Date("2026-01-04T10:05:00Z"),
  };

  const mockWebhookService = {
    completePayment: jest.fn(),
  };
  const mockCreateService = {
    initiatePayment: jest.fn(),
    verifyPayment: jest.fn(),
    getClassProduct: jest.fn(),
    calculateFee: jest.fn(),
  };
  const mockRefundService = {
    cancelPayment: jest.fn(),
    requestRefund: jest.fn(),
    getRefundLogs: jest.fn(),
  };
  const mockReceiptService = {
    getReceipt: jest.fn(),
    createReceipt: jest.fn(),
    getSettlementList: jest.fn(),
  };
  const mockTossGateway = {
    confirm: jest.fn(),
    getPayment: jest.fn(),
  };
  const mockNiceGateway = {
    approve: jest.fn(),
    netCancel: jest.fn(),
    verifyResultSignature: jest.fn().mockReturnValue(true),
  };
  const mockRedisService = {
    setIfNotExists: jest.fn().mockResolvedValue(true),
    del: jest.fn().mockResolvedValue(undefined),
  };
  const mockCreditDomain = {
    issueFromPayment: jest.fn(),
  };
  const mockNotificationsService = {
    notifyTeamManagers: jest.fn().mockResolvedValue(undefined),
    notifyUsers: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: PrismaService,
          useValue: {
            payment: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
              groupBy: jest.fn(),
            },
            enrollment: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            monthlyPostpaidBillingLine: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            tournamentRegistration: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            academy: {
              findUnique: jest.fn().mockResolvedValue(null),
            },
            $transaction: jest.fn(),
          },
        },
        { provide: PaymentWebhookService, useValue: mockWebhookService },
        { provide: PaymentCreateService, useValue: mockCreateService },
        { provide: PaymentRefundService, useValue: mockRefundService },
        { provide: PaymentReceiptService, useValue: mockReceiptService },
        { provide: TossPaymentsGateway, useValue: mockTossGateway },
        { provide: NicePaymentsGateway, useValue: mockNiceGateway },
        { provide: RedisService, useValue: mockRedisService },
        { provide: CreditDomainService, useValue: mockCreditDomain },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ────────────────────────────────────────────────────────────────────
  //  Facade 위임 검증 (sub-service 로 정확히 forward + 결과 반환)
  // ────────────────────────────────────────────────────────────────────
  describe("Facade 위임", () => {
    it("initiatePayment → PaymentCreateService.initiatePayment 위임", async () => {
      const expected = {
        orderNumber: mockOrderNumber,
        paymentStatus: "pending",
      };
      mockCreateService.initiatePayment.mockResolvedValue(expected);

      const options = { paymentMethod: "card", buyerName: "홍길동" };
      const result = await service.initiatePayment(
        mockUserId,
        mockProductId,
        240000,
        options,
      );

      expect(result).toBe(expected);
      expect(mockCreateService.initiatePayment).toHaveBeenCalledWith(
        mockUserId,
        mockProductId,
        240000,
        options,
      );
    });

    it("verifyPayment → PaymentCreateService.verifyPayment 위임", async () => {
      const expected = { creditsIssued: 8 };
      mockCreateService.verifyPayment.mockResolvedValue(expected);

      const result = await service.verifyPayment(mockUserId, mockOrderNumber);

      expect(result).toBe(expected);
      expect(mockCreateService.verifyPayment).toHaveBeenCalledWith(
        mockUserId,
        mockOrderNumber,
      );
    });

    it("completePayment → PaymentWebhookService.completePayment 위임", async () => {
      const webhookData = {
        orderNumber: mockOrderNumber,
        tid: "TID-12345678",
        resultCode: "0000",
        amount: 240000,
        signature: "valid-signature",
      };
      const expected = { paymentStatus: "completed", creditsIssued: 8 };
      mockWebhookService.completePayment.mockResolvedValue(expected);

      const result = await service.completePayment(webhookData);

      expect(result).toBe(expected);
      expect(mockWebhookService.completePayment).toHaveBeenCalledWith(
        webhookData,
      );
    });

    it("requestRefund → PaymentRefundService.requestRefund 위임", async () => {
      const requester = { id: mockUserId, userType: "ADMIN" };
      const expected = { refundAmount: 240000, paymentStatus: "refunded" };
      mockRefundService.requestRefund.mockResolvedValue(expected);

      const result = await service.requestRefund(
        mockPaymentId,
        "고객 요청",
        240000,
        requester,
      );

      expect(result).toBe(expected);
      expect(mockRefundService.requestRefund).toHaveBeenCalledWith(
        mockPaymentId,
        "고객 요청",
        240000,
        requester,
        undefined, // refundContext pass-through (미지정)
      );
    });

    it("cancelPayment → PaymentRefundService.cancelPayment 위임", async () => {
      const requester = { id: mockUserId, userType: "ADMIN" };
      const expected = { paymentStatus: "cancelled" };
      mockRefundService.cancelPayment.mockResolvedValue(expected);

      const result = await service.cancelPayment(
        mockPaymentId,
        "고객 요청",
        240000,
        undefined,
        undefined,
        undefined,
        requester,
      );

      expect(result).toBe(expected);
      expect(mockRefundService.cancelPayment).toHaveBeenCalledWith(
        mockPaymentId,
        "고객 요청",
        240000,
        undefined,
        undefined,
        undefined,
        requester,
        undefined, // refundContext pass-through (미지정)
      );
    });

    it("getRefundLogs → PaymentRefundService.getRefundLogs 위임", async () => {
      const requester = { id: mockUserId, userType: "ADMIN" };
      const expected = [{ id: "refund-1", refundAmount: 240000 }];
      mockRefundService.getRefundLogs.mockResolvedValue(expected);

      const result = await service.getRefundLogs(mockPaymentId, requester);

      expect(result).toBe(expected);
      expect(mockRefundService.getRefundLogs).toHaveBeenCalledWith(
        mockPaymentId,
        requester,
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────
  //  직접 보유 메서드 — 결제 조회
  // ────────────────────────────────────────────────────────────────────
  describe("getPayment", () => {
    it("결제 상세를 조회한다", async () => {
      jest.spyOn(prismaService.payment, "findUnique").mockResolvedValue({
        ...mockCompletedPayment,
        product: {
          productName: mockProduct.productName,
          price: mockProduct.price,
          sessionsPerMonth: mockProduct.sessionsPerMonth,
        },
      } as any);

      const result = await service.getPayment(mockPaymentId);

      expect(result.id).toBe(mockPaymentId);
      expect(result.paymentStatus).toBe("completed");
      expect(result.product?.productName).toBe(mockProduct.productName);
    });

    it("결제 기록이 없으면 NotFoundException", async () => {
      jest.spyOn(prismaService.payment, "findUnique").mockResolvedValue(null);

      await expect(service.getPayment(mockPaymentId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("본인이 아닌 비-ADMIN 접근 시 ForbiddenException (IDOR 차단)", async () => {
      jest.spyOn(prismaService.payment, "findUnique").mockResolvedValue({
        ...mockCompletedPayment,
        userId: "other-user",
        product: null,
      } as any);

      await expect(
        service.getPayment(mockPaymentId, mockUserId, "PARENT"),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("getUserPayments", () => {
    it("사용자 결제 이력을 매핑해 반환한다", async () => {
      const mockPayments = [
        {
          ...mockCompletedPayment,
          product: { productName: mockProduct.productName, price: 240000 },
          enrollments: [{ class: { className: "신규 수강생반" } }],
        },
      ];
      jest
        .spyOn(prismaService.payment, "findMany")
        .mockResolvedValue(mockPayments as any);

      const result = await service.getUserPayments(mockUserId);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0].paymentStatus).toBe("completed");
      expect(result[0].className).toBe("신규 수강생반");
    });

    it("결제가 없으면 빈 배열 반환", async () => {
      jest.spyOn(prismaService.payment, "findMany").mockResolvedValue([]);

      const result = await service.getUserPayments(mockUserId);

      expect(result).toEqual([]);
    });

    it("limit·상태 필터·include 를 반영한 findMany 호출", async () => {
      jest
        .spyOn(prismaService.payment, "findMany")
        .mockResolvedValue([] as any);

      await service.getUserPayments(mockUserId, 5);

      expect(prismaService.payment.findMany).toHaveBeenCalledWith({
        where: {
          userId: mockUserId,
          OR: [
            {
              paymentStatus: {
                in: ["completed", "refunded", "partially_refunded"],
              },
            },
            // 실결제 후 취소만 — 재시도 고아(cancelled + completedAt null) 숨김
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
          enrollments: {
            select: {
              class: { select: { className: true } },
              child: { select: { firstName: true, lastName: true } },
            },
            take: 1,
          },
          tournamentRegistrations: {
            select: {
              tournament: { select: { billingMode: true, name: true } },
            },
            take: 1,
          },
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
        take: 5,
      });
    });

    it("출처·선후불 파생을 append 하고 기존 키를 보존한다 (Dual Emit)", async () => {
      const mockPayments = [
        {
          ...mockCompletedPayment,
          product: {
            productName: mockProduct.productName,
            price: 240000,
            billingTiming: "PREPAID",
          },
          enrollments: [{ class: { className: "신규 수강생반" } }],
          tournamentRegistrations: [],
          monthlyBillingLines: [],
        },
      ];
      jest
        .spyOn(prismaService.payment, "findMany")
        .mockResolvedValue(mockPayments as any);

      const result = await service.getUserPayments(mockUserId);

      // 파생 append
      expect(result[0].sourceType).toBe("CLASS");
      expect(result[0].billingTiming).toBe("PREPAID");
      // 기존 키 보존
      expect(result[0].id).toBe(mockCompletedPayment.id);
      expect(result[0].orderNumber).toBe(mockCompletedPayment.orderNumber);
      expect(result[0].className).toBe("신규 수강생반");
    });

    it("관계 전무(매치·쇼핑) 결제는 sourceType/billingTiming null", async () => {
      const mockPayments = [
        {
          ...mockCompletedPayment,
          product: null,
          enrollments: [],
          tournamentRegistrations: [],
          monthlyBillingLines: [],
        },
      ];
      jest
        .spyOn(prismaService.payment, "findMany")
        .mockResolvedValue(mockPayments as any);

      const result = await service.getUserPayments(mockUserId);

      expect(result[0].sourceType).toBeNull();
      expect(result[0].billingTiming).toBeNull();
      // 후불 상세 필드도 전부 null (additive 계약)
      expect(result[0].subjectName).toBeNull();
      expect(result[0].childName).toBeNull();
      expect(result[0].billingYearMonth).toBeNull();
      expect(result[0].attendanceCount).toBeNull();
      expect(result[0].unitPrice).toBeNull();
    });

    it("후불 결제는 billing 체인에서 산정 근거 5필드를 emit 한다", async () => {
      const mockPayments = [
        {
          ...mockCompletedPayment,
          amount: 240000,
          product: null,
          enrollments: [],
          tournamentRegistrations: [],
          monthlyBillingLines: [
            {
              id: "line-1",
              attendanceCount: 8,
              amount: 240000,
              billing: {
                yearMonth: "2026-06",
                class: { className: "주니어 정규반" },
              },
              user: { firstName: "하늘", lastName: "김" },
            },
          ],
        },
      ];
      jest
        .spyOn(prismaService.payment, "findMany")
        .mockResolvedValue(mockPayments as any);

      const result = await service.getUserPayments(mockUserId);

      expect(result[0].sourceType).toBe("CLASS");
      expect(result[0].billingTiming).toBe("POSTPAID");
      expect(result[0].subjectName).toBe("주니어 정규반");
      expect(result[0].childName).toBe("김하늘");
      expect(result[0].billingYearMonth).toBe("2026-06");
      expect(result[0].attendanceCount).toBe(8);
      expect(result[0].unitPrice).toBe(30000);
    });

    it("후불 라인 출석 0회면 unitPrice null (0 나눗셈 가드)", async () => {
      const mockPayments = [
        {
          ...mockCompletedPayment,
          product: null,
          enrollments: [],
          tournamentRegistrations: [],
          monthlyBillingLines: [
            {
              id: "line-1",
              attendanceCount: 0,
              amount: 0,
              billing: {
                yearMonth: "2026-06",
                class: { className: "주니어 정규반" },
              },
              user: { firstName: "하늘", lastName: "김" },
            },
          ],
        },
      ];
      jest
        .spyOn(prismaService.payment, "findMany")
        .mockResolvedValue(mockPayments as any);

      const result = await service.getUserPayments(mockUserId);

      expect(result[0].attendanceCount).toBe(0);
      expect(result[0].unitPrice).toBeNull();
    });

    it("대회 결제는 subjectName 에 대회명을 emit 한다", async () => {
      const mockPayments = [
        {
          ...mockCompletedPayment,
          product: null,
          enrollments: [],
          tournamentRegistrations: [
            { tournament: { billingMode: "POSTPAID", name: "여름 챔피언십" } },
          ],
          monthlyBillingLines: [],
        },
      ];
      jest
        .spyOn(prismaService.payment, "findMany")
        .mockResolvedValue(mockPayments as any);

      const result = await service.getUserPayments(mockUserId);

      expect(result[0].sourceType).toBe("TOURNAMENT");
      expect(result[0].subjectName).toBe("여름 챔피언십");
    });

    it("선불 수업 결제는 Enrollment.child 로 childName 을 emit 한다", async () => {
      const mockPayments = [
        {
          ...mockCompletedPayment,
          product: {
            productName: mockProduct.productName,
            price: 240000,
            billingTiming: "PREPAID",
          },
          enrollments: [
            {
              class: { className: "신규 수강생반" },
              child: { firstName: "바다", lastName: "이" },
            },
          ],
          tournamentRegistrations: [],
          monthlyBillingLines: [],
        },
      ];
      jest
        .spyOn(prismaService.payment, "findMany")
        .mockResolvedValue(mockPayments as any);

      const result = await service.getUserPayments(mockUserId);

      expect(result[0].childName).toBe("이바다");
      // 선불 수업명은 기존 className 이 담당 — subjectName 은 null
      expect(result[0].className).toBe("신규 수강생반");
      expect(result[0].subjectName).toBeNull();
      expect(result[0].billingYearMonth).toBeNull();
    });
  });

  // ────────────────────────────────────────────────────────────────────
  //  직접 보유 메서드 — 통계 (groupBy 기반)
  // ────────────────────────────────────────────────────────────────────
  describe("getPaymentStats", () => {
    it("상태별 통계를 계산한다", async () => {
      jest.spyOn(prismaService.payment as any, "groupBy").mockResolvedValue([
        {
          paymentStatus: "completed",
          _count: { id: 2 },
          _sum: { amount: 540000 },
        },
        {
          paymentStatus: "failed",
          _count: { id: 1 },
          _sum: { amount: 120000 },
        },
        {
          paymentStatus: "refunded",
          _count: { id: 1 },
          _sum: { amount: 120000 },
        },
      ] as any);

      const result = await service.getPaymentStats();

      expect(result.totalPayments).toBe(4);
      expect(result.completedCount).toBe(2);
      expect(result.failedCount).toBe(1);
      expect(result.refundedCount).toBe(1);
      expect(result.totalRevenue).toBe(540000);
      expect(result.totalRefunded).toBe(120000);
      expect(result.netRevenue).toBe(420000);
    });

    it("결제가 없으면 0 통계 반환", async () => {
      jest.spyOn(prismaService.payment as any, "groupBy").mockResolvedValue([]);

      const result = await service.getPaymentStats(mockUserId);

      expect(result.totalPayments).toBe(0);
      expect(result.totalRevenue).toBe(0);
      expect(result.successRate).toBe("0");
    });

    it("성공률을 정확히 계산한다", async () => {
      jest.spyOn(prismaService.payment as any, "groupBy").mockResolvedValue([
        {
          paymentStatus: "completed",
          _count: { id: 2 },
          _sum: { amount: 540000 },
        },
        {
          paymentStatus: "failed",
          _count: { id: 2 },
          _sum: { amount: 220000 },
        },
      ] as any);

      const result = await service.getPaymentStats();

      expect(result.successRate).toBe("50.0");
    });
  });

  describe("getPaymentStatsByDateRange", () => {
    it("기간별 통계를 계산한다", async () => {
      const startDate = new Date("2026-01-01");
      const endDate = new Date("2026-01-31");

      jest.spyOn(prismaService.payment as any, "groupBy").mockResolvedValue([
        {
          paymentStatus: "completed",
          _count: { id: 2 },
          _sum: { amount: 540000 },
        },
        {
          paymentStatus: "failed",
          _count: { id: 1 },
          _sum: { amount: 120000 },
        },
      ] as any);

      const result = await service.getPaymentStatsByDateRange(
        startDate,
        endDate,
      );

      expect(result.startDate).toEqual(startDate);
      expect(result.endDate).toEqual(endDate);
      expect(result.totalPayments).toBe(3);
      expect(result.completedCount).toBe(2);
      expect(result.totalRevenue).toBe(540000);
    });

    it("기간 내 결제가 없으면 0 통계 반환", async () => {
      jest.spyOn(prismaService.payment as any, "groupBy").mockResolvedValue([]);

      const result = await service.getPaymentStatsByDateRange(
        new Date("2026-01-01"),
        new Date("2026-01-31"),
      );

      expect(result.totalPayments).toBe(0);
      expect(result.totalRevenue).toBe(0);
      expect(result.averageOrderValue).toBe("0");
    });
  });

  // ────────────────────────────────────────────────────────────────────
  //  mockConfirmPayment (DEV 전용 토스 승인 우회 결제 완료)
  // ────────────────────────────────────────────────────────────────────
  describe("mockConfirmPayment", () => {
    const pendingPayment = {
      id: mockPaymentId,
      userId: mockUserId,
      amount: 240000,
      paymentStatus: "pending",
      productId: mockProductId,
      // sessionsPerMonth 0 → 크레딧 미발급 상품(대회 참가비 등) — 발급 분기 스킵.
      product: {
        classId: "class-123",
        durationDays: 30,
        sessionsPerMonth: 0,
        feeType: "PER_GAME",
        billingTiming: "PREPAID",
        billingMonth: null,
      },
    };

    it("타인 결제 승인 시도 시 ForbiddenException", async () => {
      jest.spyOn(prismaService.payment, "findUnique").mockResolvedValue({
        ...pendingPayment,
        userId: "other-user",
      } as any);

      await expect(
        service.mockConfirmPayment(mockUserId, mockOrderNumber),
      ).rejects.toThrow(ForbiddenException);
    });

    it("이미 완료된 결제는 멱등 응답({ idempotent: true }) 반환", async () => {
      jest.spyOn(prismaService.payment, "findUnique").mockResolvedValue({
        ...pendingPayment,
        paymentStatus: "completed",
      } as any);

      const result = await service.mockConfirmPayment(
        mockUserId,
        mockOrderNumber,
      );

      expect(result).toEqual({
        success: true,
        paymentId: mockPaymentId,
        idempotent: true,
      });
      // 멱등 응답은 상태 전환/락 획득을 수행하지 않는다.
      expect(prismaService.$transaction).not.toHaveBeenCalled();
      expect(mockRedisService.setIfNotExists).not.toHaveBeenCalled();
    });

    it("취소된 결제 승인 시도 시 BadRequestException", async () => {
      jest.spyOn(prismaService.payment, "findUnique").mockResolvedValue({
        ...pendingPayment,
        paymentStatus: "cancelled",
      } as any);

      await expect(
        service.mockConfirmPayment(mockUserId, mockOrderNumber),
      ).rejects.toThrow(BadRequestException);
    });

    it("정상 경로: paymentMethod 'mock'·tid 'MOCK-' prefix 로 완료 처리 + 응답 shape", async () => {
      jest
        .spyOn(prismaService.payment, "findUnique")
        .mockResolvedValue(pendingPayment as any);
      mockRedisService.setIfNotExists.mockResolvedValue(true);

      const txPaymentUpdate = jest.fn().mockResolvedValue({ count: 1 });
      const tx = {
        payment: { updateMany: txPaymentUpdate },
        monthlyPostpaidBillingLine: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        enrollment: {
          findMany: jest.fn().mockResolvedValue([]),
          update: jest.fn(),
        },
        classRegistration: { upsert: jest.fn() },
        tournamentRegistration: {
          findMany: jest.fn().mockResolvedValue([]),
          update: jest.fn(),
        },
      };
      jest
        .spyOn(prismaService, "$transaction")
        .mockImplementation(async (fn: any) => fn(tx));

      const result = await service.mockConfirmPayment(
        mockUserId,
        mockOrderNumber,
      );

      // 응답 shape 검증.
      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          paymentId: mockPaymentId,
          orderId: mockOrderNumber,
          amount: 240000,
          method: "mock",
          receiptUrl: null,
        }),
      );
      expect(typeof result.approvedAt).toBe("string");

      // 멱등 락 획득(실결제와 동일 키).
      expect(mockRedisService.setIfNotExists).toHaveBeenCalledWith(
        `toss:confirm:${mockOrderNumber}`,
        "1",
        86400,
      );

      // 공용 후처리(applyApprovedPayment) 가 mock 결제 표식으로 완료 갱신.
      //   where 에 pending 조건이 있어야 동시 진입 시 단일 실행이 보장된다.
      expect(txPaymentUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockPaymentId, paymentStatus: "pending" },
          data: expect.objectContaining({
            paymentStatus: "completed",
            paymentMethod: "mock",
            tid: expect.stringMatching(/^MOCK-/),
          }),
        }),
      );
    });

    it("동시 승인(락 획득 실패) 시 BadRequestException", async () => {
      jest
        .spyOn(prismaService.payment, "findUnique")
        .mockResolvedValue(pendingPayment as any);
      mockRedisService.setIfNotExists.mockResolvedValue(false);

      await expect(
        service.mockConfirmPayment(mockUserId, mockOrderNumber),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  //  [정원 선점] 승인(캡처) 직전 좌석 원자 확보 — reservation before capture
  // ────────────────────────────────────────────────────────────────────
  describe("좌석 선점 (claimSeatsBeforeApproval)", () => {
    const pendingPayment = {
      id: mockPaymentId,
      userId: mockUserId,
      amount: 240000,
      paymentStatus: "pending",
      productId: mockProductId,
      product: {
        classId: "cls-1",
        durationDays: null,
        sessionsPerMonth: 0, // 크레딧 미발급 경로 — 후처리 단순화
        feeType: "MONTHLY_FIXED",
        billingTiming: "PREPAID",
        billingMonth: null,
      },
    };
    const tossDone = {
      status: "DONE",
      totalAmount: 240000,
      approvedAt: "2026-07-28T10:00:00+09:00",
      method: "card",
      receipt: { url: null },
    };

    /** claim tx + apply tx 겸용 tx mock 배선. */
    const wireSeatMocks = (opts: {
      capacity: number | null;
      existingStatus: string | null;
      activeCount: number;
    }) => {
      const mockTx = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        class: {
          findUnique: jest.fn().mockResolvedValue({ capacity: opts.capacity }),
        },
        classRegistration: {
          findUnique: jest
            .fn()
            .mockResolvedValue(
              opts.existingStatus ? { status: opts.existingStatus } : null,
            ),
          count: jest.fn().mockResolvedValue(opts.activeCount),
          upsert: jest.fn().mockResolvedValue({}),
        },
        payment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        monthlyPostpaidBillingLine: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        enrollment: {
          findMany: jest.fn().mockResolvedValue([]), // apply 후처리 루프 스킵
          update: jest.fn(),
        },
        tournamentRegistration: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          findMany: jest.fn().mockResolvedValue([]),
        },
      };
      // clearAllMocks 가 모듈 스코프 기본값을 지우므로 매 배선에서 재설정.
      mockRedisService.setIfNotExists.mockResolvedValue(true);
      (prismaService.payment.findUnique as jest.Mock).mockResolvedValue(
        pendingPayment,
      );
      // claim 쌍 조회(서비스 루트 prisma) — 자녀 1명 수업 결제
      (prismaService.enrollment.findMany as jest.Mock).mockResolvedValue([
        { classId: "cls-1", childId: "child-1" },
      ]);
      (prismaService as unknown as Record<string, unknown>).classRegistration =
        {
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        };
      (prismaService.$transaction as jest.Mock).mockImplementation(
        (arg: unknown) =>
          typeof arg === "function"
            ? (arg as (tx: typeof mockTx) => unknown)(mockTx)
            : Promise.all(arg as Promise<unknown>[]),
      );
      mockTossGateway.confirm.mockResolvedValue(tossDone);
      return { mockTx };
    };

    it("정원 마감 → 승인 미호출·좌석 미생성·마감 에러", async () => {
      const { mockTx } = wireSeatMocks({
        capacity: 10,
        existingStatus: null,
        activeCount: 10, // 만석
      });
      await expect(
        service.confirmTossPayment(mockUserId, {
          paymentKey: "pk",
          orderId: mockOrderNumber,
          amount: 240000,
        }),
      ).rejects.toThrow("수업 정원이 마감되어");
      expect(mockTossGateway.confirm).not.toHaveBeenCalled(); // 돈 안 나감
      expect(mockTx.classRegistration.upsert).not.toHaveBeenCalled();
    });

    it("잔여 좌석 있음 → 선점(upsert active) 후 승인 진행", async () => {
      const { mockTx } = wireSeatMocks({
        capacity: 10,
        existingStatus: null,
        activeCount: 9,
      });
      const res = await service.confirmTossPayment(mockUserId, {
        paymentKey: "pk",
        orderId: mockOrderNumber,
        amount: 240000,
      });
      expect(res.success).toBe(true);
      expect(mockTx.classRegistration.upsert).toHaveBeenCalledTimes(1);
      expect(mockTossGateway.confirm).toHaveBeenCalledTimes(1);
    });

    it("자녀가 이미 active(갱신 결제) → 선점 스킵·정상 승인", async () => {
      const { mockTx } = wireSeatMocks({
        capacity: 10,
        existingStatus: "active",
        activeCount: 10, // 만석이어도 본인 좌석 보유라 통과해야 함
      });
      const res = await service.confirmTossPayment(mockUserId, {
        paymentKey: "pk",
        orderId: mockOrderNumber,
        amount: 240000,
      });
      expect(res.success).toBe(true);
      expect(mockTx.classRegistration.upsert).not.toHaveBeenCalled();
    });

    it("무정원(capacity 0) → 선점 로직 전체 스킵", async () => {
      const { mockTx } = wireSeatMocks({
        capacity: 0,
        existingStatus: null,
        activeCount: 99,
      });
      const res = await service.confirmTossPayment(mockUserId, {
        paymentKey: "pk",
        orderId: mockOrderNumber,
        amount: 240000,
      });
      expect(res.success).toBe(true);
      expect(mockTx.classRegistration.count).not.toHaveBeenCalled();
      expect(mockTx.classRegistration.upsert).not.toHaveBeenCalled();
    });

    it("승인 실패(DONE 아님) → 신규 선점 좌석 삭제 원복", async () => {
      wireSeatMocks({ capacity: 10, existingStatus: null, activeCount: 9 });
      mockTossGateway.confirm.mockResolvedValue({
        ...tossDone,
        status: "CANCELED",
      });
      await expect(
        service.confirmTossPayment(mockUserId, {
          paymentKey: "pk",
          orderId: mockOrderNumber,
          amount: 240000,
        }),
      ).rejects.toThrow("DONE 이 아닙니다");
      const reg = (
        prismaService as unknown as Record<
          string,
          { deleteMany: jest.Mock; updateMany: jest.Mock }
        >
      ).classRegistration;
      expect(reg.deleteMany).toHaveBeenCalledTimes(1); // 신규 행 → 삭제 복귀
      expect(reg.updateMany).not.toHaveBeenCalled();
    });

    it("expired 자녀 승인 실패 → expired 상태로 복원", async () => {
      wireSeatMocks({
        capacity: 10,
        existingStatus: "expired",
        activeCount: 9,
      });
      mockTossGateway.confirm.mockRejectedValue(new Error("network"));
      await expect(
        service.confirmTossPayment(mockUserId, {
          paymentKey: "pk",
          orderId: mockOrderNumber,
          amount: 240000,
        }),
      ).rejects.toThrow("network");
      const reg = (
        prismaService as unknown as Record<
          string,
          { deleteMany: jest.Mock; updateMany: jest.Mock }
        >
      ).classRegistration;
      expect(reg.updateMany).toHaveBeenCalledWith({
        where: { classId: "cls-1", userId: "child-1", status: "active" },
        data: { status: "expired" },
      });
      expect(reg.deleteMany).not.toHaveBeenCalled();
    });

    it("mock-confirm 도 동일 계약 — 정원 마감 시 거부·후처리 미실행", async () => {
      const { mockTx } = wireSeatMocks({
        capacity: 10,
        existingStatus: null,
        activeCount: 10,
      });
      await expect(
        service.mockConfirmPayment(mockUserId, mockOrderNumber),
      ).rejects.toThrow("수업 정원이 마감되어");
      expect(mockTx.payment.updateMany).not.toHaveBeenCalled(); // applyApprovedPayment 미도달
    });
  });
});
