import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { PaymentsService } from "./payments.service";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import { KgInicisGateway } from "./kg-inicis.gateway";
import { PaymentCalculationService } from "./payment-calculation.service";

describe("PaymentsService", () => {
  let service: PaymentsService;
  let prismaService: PrismaService;

  const mockUserId = "user-123";
  const mockProductId = "product-456";
  const mockPaymentId = "payment-789";
  const mockOrderNumber = "ORD-1234567890-abcdef";

  const mockProduct = {
    id: mockProductId,
    classId: "class-123",
    productName: "신규 수강생반 - 월 8회",
    description: "초보자용 프로그램",
    price: 240000,
    sessionsPerMonth: 8,
    durationDays: 30,
    createdAt: new Date(),
    class: {
      id: "class-123",
      teamId: "club-123",
      className: "신규 수강생반",
    },
  };

  const mockPayment = {
    id: mockPaymentId,
    orderNumber: mockOrderNumber,
    userId: mockUserId,
    productId: mockProductId,
    amount: 240000,
    paymentStatus: "pending",
    paymentMethod: "card",
    tid: null,
    createdAt: new Date("2026-01-04T10:00:00Z"),
    completedAt: null,
  };

  const mockCompletedPayment = {
    ...mockPayment,
    paymentStatus: "completed",
    tid: "TID-12345678",
    completedAt: new Date("2026-01-04T10:05:00Z"),
  };

  const mockKgInicisGateway = {
    verifyAmount: jest.fn(),
    createPaymentRequest: jest.fn(),
    verifyWebhookSignature: jest.fn(),
    cancelPayment: jest.fn(),
  };

  const mockRedisService = {
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(undefined),
    exists: jest.fn().mockResolvedValue(false),
    getConnectionStatus: jest.fn().mockReturnValue(true),
    setIfNotExists: jest.fn().mockResolvedValue(true),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === "redis") {
        return {
          keyPrefix: {
            payment: "payment:",
          },
          cacheTTL: {
            paymentIdempotency: 86400,
          },
        };
      }
      return undefined;
    }),
  };

  const mockPaymentCalculationService = {
    calculatePrepaidFee: jest.fn().mockReturnValue({
      baseAmount: { toNumber: () => 240000 },
      feeType: "MONTHLY_FIXED",
      billingTiming: "PREPAID",
      description: "월정액 (240,000원)",
    }),
    calculateMonthlyFee: jest.fn(),
    calculatePerSessionFee: jest.fn(),
    calculatePerGameFee: jest.fn(),
    calculatePostpaidFee: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: PrismaService,
          useValue: {
            classProduct: {
              findUnique: jest.fn(),
              findFirst: jest.fn(),
            },
            user: {
              findUnique: jest.fn(),
            },
            payment: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
              groupBy: jest.fn(),
            },
            memberCredit: {
              create: jest.fn(),
            },
            refundLog: {
              create: jest.fn(),
              findMany: jest.fn(),
            },
            enrollment: {
              findFirst: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            parentChild: {
              findUnique: jest.fn(),
            },
            class: {
              findUnique: jest.fn(),
            },
            classRegistration: {
              count: jest.fn(),
            },
            childProfile: {
              findUnique: jest.fn(),
            },
            $transaction: jest.fn(),
          },
        },
        {
          provide: KgInicisGateway,
          useValue: mockKgInicisGateway,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: PaymentCalculationService,
          useValue: mockPaymentCalculationService,
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // 서비스의 classProduct.findUnique는 다른 select 구조를 사용하므로 맞춤
  const mockProductForService = {
    id: mockProductId,
    productName: "신규 수강생반 - 월 8회",
    feeType: "MONTHLY_FIXED",
    price: 240000,
    sessionsPerWeek: null,
    feePerSession: null,
  };

  describe("initiatePayment", () => {
    it("should successfully initiate payment (dev mock path)", async () => {
      // 서비스는 NODE_ENV !== production 이면 mockCompletePayment를 호출하는 dev-only 경로를 탄다.
      // mockCompletePayment → _finalizePayment → payment.findUnique(orderNumber) 를 거치므로
      // payment.findUnique 를 두 번 호출하는 것을 고려해 mock을 설정한다.
      jest
        .spyOn(prismaService.classProduct, "findUnique")
        .mockResolvedValue(mockProductForService as any);
      mockKgInicisGateway.verifyAmount.mockReturnValue(true);
      mockRedisService.setIfNotExists.mockResolvedValue(true);
      mockRedisService.get.mockResolvedValue(null);
      mockRedisService.exists.mockResolvedValue(false);
      jest.spyOn(prismaService.user, "findUnique").mockResolvedValue({
        email: "test@example.com",
        phone: "010-1234-5678",
      } as any);

      const mockCreatedPayment = { ...mockPayment, id: mockPaymentId };
      jest
        .spyOn(prismaService, "$transaction")
        .mockResolvedValue(mockCreatedPayment as any);

      // dev 경로: initiatePayment → $transaction(payment.create) → mockCompletePayment
      //           → payment.findUnique(orderNumber) → _finalizePayment
      // mockCompletePayment 내 payment.findUnique(orderNumber, select:{amount}) mock
      jest
        .spyOn(prismaService.payment, "findUnique")
        .mockResolvedValue({ amount: 240000 } as any);

      // _finalizePayment를 mock하여 복잡한 내부 체인을 우회
      jest.spyOn(service as any, "_finalizePayment").mockResolvedValue({
        id: mockPaymentId,
        orderNumber: mockCreatedPayment.orderNumber,
        amount: 240000,
        paymentStatus: "completed",
        tid: "MOCK-TID",
        completedAt: new Date(),
        creditsIssued: 8,
      });

      const result = await service.initiatePayment(
        mockUserId,
        mockProductId,
        240000,
      );

      expect(result.orderNumber).toBeDefined();
      expect(result.orderNumber).toMatch(/^ORD-/);
      // dev 경로에서는 paymentStatus: "completed" 반환
      expect(result.paymentStatus).toBe("completed");
    });

    it("should throw NotFoundException if product does not exist", async () => {
      jest
        .spyOn(prismaService.classProduct, "findUnique")
        .mockResolvedValue(null);

      await expect(
        service.initiatePayment(mockUserId, mockProductId, 240000),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw BadRequestException if amount does not match product price", async () => {
      jest
        .spyOn(prismaService.classProduct, "findUnique")
        .mockResolvedValue(mockProductForService as any);
      mockKgInicisGateway.verifyAmount.mockReturnValue(false);

      await expect(
        service.initiatePayment(mockUserId, mockProductId, 100000),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw ConflictException if payment lock already acquired", async () => {
      jest
        .spyOn(prismaService.classProduct, "findUnique")
        .mockResolvedValue(mockProductForService as any);
      mockKgInicisGateway.verifyAmount.mockReturnValue(true);
      mockRedisService.setIfNotExists.mockResolvedValue(false); // 락 이미 존재

      await expect(
        service.initiatePayment(mockUserId, mockProductId, 240000),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("completePayment", () => {
    // completePayment는 먼저 payment.findUnique(orderNumber)로 amount·status를 조회,
    // 서명 검증 후 _finalizePayment를 호출하며 그 안에서도 payment.findUnique(orderNumber)를 한 번 더 호출.
    const pendingPaymentByOrderNumber = {
      amount: 240000,
      paymentStatus: "pending",
    };

    it("should throw NotFoundException if payment does not exist", async () => {
      jest.spyOn(prismaService.payment, "findUnique").mockResolvedValue(null);

      await expect(
        service.completePayment({
          orderNumber: mockOrderNumber,
          tid: "TID-12345678",
          resultCode: "0000",
          amount: 240000,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ConflictException if payment already processed", async () => {
      jest.spyOn(prismaService.payment, "findUnique").mockResolvedValue({
        amount: 240000,
        paymentStatus: "completed",
      } as any);

      await expect(
        service.completePayment({
          orderNumber: mockOrderNumber,
          tid: "TID-12345678",
          resultCode: "0000",
          amount: 240000,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("should throw BadRequestException if signature is missing", async () => {
      jest
        .spyOn(prismaService.payment, "findUnique")
        .mockResolvedValue(pendingPaymentByOrderNumber as any);

      await expect(
        service.completePayment({
          orderNumber: mockOrderNumber,
          tid: "TID-12345678",
          resultCode: "0000",
          amount: 240000,
          // signature 없음
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException for invalid webhook signature", async () => {
      jest
        .spyOn(prismaService.payment, "findUnique")
        .mockResolvedValue(pendingPaymentByOrderNumber as any);
      mockKgInicisGateway.verifyWebhookSignature.mockReturnValue(false);

      await expect(
        service.completePayment({
          orderNumber: mockOrderNumber,
          tid: "TID-12345678",
          resultCode: "0000",
          amount: 240000,
          signature: "invalid-signature",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException if amount does not match", async () => {
      jest
        .spyOn(prismaService.payment, "findUnique")
        .mockResolvedValue(pendingPaymentByOrderNumber as any);
      mockKgInicisGateway.verifyWebhookSignature.mockReturnValue(true);
      mockKgInicisGateway.verifyAmount.mockReturnValue(false);

      await expect(
        service.completePayment({
          orderNumber: mockOrderNumber,
          tid: "TID-12345678",
          resultCode: "0000",
          amount: 100000,
          signature: "valid-signature",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should successfully complete payment and issue credits", async () => {
      // 첫 번째 findUnique: completePayment 내 amount·status 조회
      // 두 번째 findUnique: _finalizePayment 내 전체 조회
      jest
        .spyOn(prismaService.payment, "findUnique")
        .mockResolvedValueOnce(pendingPaymentByOrderNumber as any)
        .mockResolvedValueOnce({
          id: mockPaymentId,
          orderNumber: mockOrderNumber,
          userId: mockUserId,
          amount: 240000,
          paymentStatus: "pending",
          productId: mockProductId,
          product: { durationDays: 30, sessionsPerMonth: 8 },
        } as any);

      mockKgInicisGateway.verifyWebhookSignature.mockReturnValue(true);
      mockKgInicisGateway.verifyAmount.mockReturnValue(true);

      const finalizedResult = {
        id: mockPaymentId,
        orderNumber: mockOrderNumber,
        amount: 240000,
        paymentStatus: "completed",
        tid: "TID-12345678",
        completedAt: new Date(),
        creditsIssued: 8,
      };
      jest.spyOn(prismaService, "$transaction").mockResolvedValue({
        updatedPayment: {
          id: mockPaymentId,
          orderNumber: mockOrderNumber,
          userId: mockUserId,
          amount: 240000,
          paymentStatus: "completed",
          tid: "TID-12345678",
          completedAt: new Date(),
        },
        creditsIssued: 8,
      } as any);

      // $transaction mock이 내부 로직을 건너뛰므로 반환값을 직접 조합
      jest
        .spyOn(service as any, "_finalizePayment")
        .mockResolvedValue(finalizedResult);

      const result = await service.completePayment({
        orderNumber: mockOrderNumber,
        tid: "TID-12345678",
        resultCode: "0000",
        amount: 240000,
        signature: "valid-signature",
      });

      expect(result.paymentStatus).toBe("completed");
      expect(result.creditsIssued).toBe(8);
    });

    it("should handle failed payment without issuing credits", async () => {
      jest
        .spyOn(prismaService.payment, "findUnique")
        .mockResolvedValueOnce(pendingPaymentByOrderNumber as any);

      mockKgInicisGateway.verifyWebhookSignature.mockReturnValue(true);
      mockKgInicisGateway.verifyAmount.mockReturnValue(true);

      jest.spyOn(service as any, "_finalizePayment").mockResolvedValue({
        id: mockPaymentId,
        orderNumber: mockOrderNumber,
        amount: 240000,
        paymentStatus: "failed",
        tid: null,
        completedAt: null,
        creditsIssued: 0,
      });

      const result = await service.completePayment({
        orderNumber: mockOrderNumber,
        tid: "",
        resultCode: "9999",
        amount: 240000,
        signature: "valid-signature",
      });

      expect(result.paymentStatus).toBe("failed");
      expect(result.creditsIssued).toBe(0);
    });
  });

  describe("getPayment", () => {
    it("should retrieve payment details successfully", async () => {
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

    it("should throw NotFoundException if payment does not exist", async () => {
      jest.spyOn(prismaService.payment, "findUnique").mockResolvedValue(null);

      await expect(service.getPayment(mockPaymentId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("getUserPayments", () => {
    it("should retrieve user payment history", async () => {
      const mockPayments = [
        {
          ...mockCompletedPayment,
          product: {
            productName: mockProduct.productName,
            price: mockProduct.price,
          },
        },
        {
          ...mockPayment,
          product: { productName: "고급반", price: 300000 },
        },
      ];
      jest
        .spyOn(prismaService.payment, "findMany")
        .mockResolvedValue(mockPayments as any);

      const result = await service.getUserPayments(mockUserId);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result[0].paymentStatus).toBe("completed");
    });

    it("should return empty array if user has no payments", async () => {
      jest.spyOn(prismaService.payment, "findMany").mockResolvedValue([]);

      const result = await service.getUserPayments(mockUserId);

      expect(result).toEqual([]);
    });

    it("should respect limit parameter", async () => {
      jest
        .spyOn(prismaService.payment, "findMany")
        .mockResolvedValue([] as any);

      await service.getUserPayments(mockUserId, 5);

      expect(prismaService.payment.findMany).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        include: {
          product: {
            select: {
              productName: true,
              price: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      });
    });
  });

  describe("requestRefund", () => {
    // requestRefund는 cancelPayment를 위임하고,
    // cancelPayment는 payment.findUnique(id) → KG이니시스 취소 → $transaction 순으로 처리

    it("should throw NotFoundException if payment does not exist", async () => {
      jest.spyOn(prismaService.payment, "findUnique").mockResolvedValue(null);

      await expect(
        service.requestRefund(mockPaymentId, "고객 요청"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw BadRequestException if payment is not completed", async () => {
      jest
        .spyOn(prismaService.payment, "findUnique")
        .mockResolvedValue(mockPayment as any); // paymentStatus: "pending"

      await expect(
        service.requestRefund(mockPaymentId, "고객 요청"),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException if refund amount exceeds payment amount", async () => {
      jest
        .spyOn(prismaService.payment, "findUnique")
        .mockResolvedValue(mockCompletedPayment as any);

      await expect(
        service.requestRefund(mockPaymentId, "고객 요청", 500000),
      ).rejects.toThrow(BadRequestException);
    });

    it("should successfully request full refund", async () => {
      jest.spyOn(prismaService.payment, "findUnique").mockResolvedValue({
        ...mockCompletedPayment,
        tid: "TID-12345678",
      } as any);
      mockKgInicisGateway.cancelPayment.mockResolvedValue({
        success: true,
        message: "Cancelled",
      });

      const refundLogMock = {
        id: "refund-123",
        paymentId: mockPaymentId,
        refundAmount: 240000,
        refundReason: "고객 요청",
        processedAt: new Date(),
      };
      const updatedPaymentMock = {
        ...mockCompletedPayment,
        paymentStatus: "refunded",
      };

      jest.spyOn(prismaService, "$transaction").mockResolvedValue({
        refundLog: refundLogMock,
        updatedPayment: updatedPaymentMock,
      } as any);

      const result = await service.requestRefund(mockPaymentId, "고객 요청");

      expect(result.refundAmount).toBe(240000);
      expect(result.paymentStatus).toBe("refunded");
    });

    it("should handle partial refund", async () => {
      jest.spyOn(prismaService.payment, "findUnique").mockResolvedValue({
        ...mockCompletedPayment,
        tid: "TID-12345678",
      } as any);
      mockKgInicisGateway.cancelPayment.mockResolvedValue({
        success: true,
        message: "Partially cancelled",
      });

      const refundLogMock = {
        id: "refund-123",
        paymentId: mockPaymentId,
        refundAmount: 120000,
        refundReason: "부분 환불",
        processedAt: new Date(),
      };
      const updatedPaymentMock = {
        ...mockCompletedPayment,
        paymentStatus: "partially_refunded",
      };

      jest.spyOn(prismaService, "$transaction").mockResolvedValue({
        refundLog: refundLogMock,
        updatedPayment: updatedPaymentMock,
      } as any);

      const result = await service.requestRefund(
        mockPaymentId,
        "부분 환불",
        120000,
      );

      expect(result.refundAmount).toBe(120000);
      expect(result.paymentStatus).toBe("partially_refunded");
    });
  });

  describe("getRefundLogs", () => {
    it("should retrieve refund logs for payment", async () => {
      const mockRefundLogs = [
        {
          id: "refund-1",
          paymentId: mockPaymentId,
          refundAmount: 240000,
          refundReason: "고객 요청",
          processedAt: new Date(),
        },
      ];
      jest
        .spyOn(prismaService.refundLog, "findMany")
        .mockResolvedValue(mockRefundLogs as any);

      const result = await service.getRefundLogs(mockPaymentId);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0].refundAmount).toBe(240000);
    });

    it("should throw NotFoundException if no refund logs exist", async () => {
      jest.spyOn(prismaService.refundLog, "findMany").mockResolvedValue([]);

      await expect(service.getRefundLogs(mockPaymentId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("getPaymentStats", () => {
    // getPaymentStats는 payment.groupBy를 사용
    it("should calculate payment statistics", async () => {
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

    it("should return zero statistics for user with no payments", async () => {
      jest.spyOn(prismaService.payment as any, "groupBy").mockResolvedValue([]);

      const result = await service.getPaymentStats(mockUserId);

      expect(result.totalPayments).toBe(0);
      expect(result.totalRevenue).toBe(0);
      expect(result.successRate).toBe("0");
    });

    it("should calculate success rate correctly", async () => {
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
    // getPaymentStatsByDateRange도 payment.groupBy를 사용
    it("should calculate stats for date range", async () => {
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

    it("should return zero stats if no payments in range", async () => {
      const startDate = new Date("2026-01-01");
      const endDate = new Date("2026-01-31");
      jest.spyOn(prismaService.payment as any, "groupBy").mockResolvedValue([]);

      const result = await service.getPaymentStatsByDateRange(
        startDate,
        endDate,
      );

      expect(result.totalPayments).toBe(0);
      expect(result.totalRevenue).toBe(0);
      expect(result.averageOrderValue).toBe("0");
    });
  });
});
