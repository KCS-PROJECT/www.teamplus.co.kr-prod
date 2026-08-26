import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { KgInicisGateway } from "./kg-inicis.gateway";
import { TossPaymentsGateway } from "./toss-payments.gateway";
import { PaymentCalculationService } from "./payment-calculation.service";
import { PostpaidSettlementService } from "./postpaid-settlement.service";
import { SettlementSummaryService } from "./settlement/settlement-summary.service";
import { WebhookRetryService } from "./webhook-retry.service";
import { RedisService } from "@/redis/redis.service";
import {
  BadRequestException,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { InitiatePaymentDto as KgInitiateDto } from "./dto/initiate-payment.dto";
import { PaymentWebhookDto, CancelPaymentDto } from "./dto/kg-inicis.dto";
import { RefundDto } from "./dto/refund.dto";

describe("PaymentsController", () => {
  let controller: PaymentsController;

  const mockPayment = {
    id: "payment-uuid",
    orderNumber: "ORD-1704355200000-abc123",
    userId: "user-uuid",
    amount: 240000,
    paymentStatus: "completed",
    paymentMethod: "card",
    tid: "inicis-tid-123",
    productId: "product-uuid",
    createdAt: new Date("2026-01-04T10:00:00Z"),
    completedAt: new Date("2026-01-04T10:05:00Z"),
  };

  const mockPaymentResult = {
    id: "payment-uuid",
    orderNumber: "ORD-1704355200000-abc123",
    amount: 240000,
    paymentStatus: "pending",
    productId: "product-uuid",
    paymentPageUrl: "https://stdpay.inicis.com/stdpay/INIpayMobile.php?...",
  };

  const mockPaymentStats = {
    totalPayments: 100,
    completedCount: 95,
    failedCount: 3,
    refundedCount: 2,
    totalRevenue: 22800000,
    totalRefunded: 480000,
    netRevenue: 22320000,
    successRate: "95.0",
  };

  const mockRefund = {
    id: "refund-uuid",
    paymentId: "payment-uuid",
    refundAmount: 240000,
    refundReason: "고객 요청",
    paymentStatus: "refunded",
    processedAt: new Date("2026-01-04T10:00:00Z"),
  };

  const mockPaymentsService = {
    initiatePayment: jest.fn(),
    completePayment: jest.fn(),
    cancelPayment: jest.fn(),
    getPayment: jest.fn(),
    getUserPayments: jest.fn(),
    requestRefund: jest.fn(),
    getRefundLogs: jest.fn(),
    getPaymentStats: jest.fn(),
    getPaymentStatsByDateRange: jest.fn(),
  };

  const mockKgInicisGateway = {
    verifyIpWhitelist: jest.fn(),
    verifyWebhookSignature: jest.fn(),
  };

  // 웹훅 컨트롤러는 IP·서명 검증 통과 후 orderNumber 멱등 락(setIfNotExists) →
  //   webhookRetryService.logWebhook/processWebhook 로 위임한다(직접 completePayment 미호출).
  const mockRedisService = {
    setIfNotExists: jest.fn().mockResolvedValue(true),
    del: jest.fn().mockResolvedValue(undefined),
  };

  const mockWebhookRetryService = {
    logWebhook: jest.fn(),
    processWebhook: jest.fn(),
  };

  // 컨트롤러 생성자 DI 그래프 유지용 — 테스트 대상 엔드포인트에서 직접 사용하지 않음.
  const mockTossGateway = {};
  const mockCalculationService = {};
  const mockPostpaidSettlementService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        {
          provide: PaymentsService,
          useValue: mockPaymentsService,
        },
        {
          provide: WebhookRetryService,
          useValue: mockWebhookRetryService,
        },
        {
          provide: KgInicisGateway,
          useValue: mockKgInicisGateway,
        },
        {
          provide: TossPaymentsGateway,
          useValue: mockTossGateway,
        },
        {
          provide: PaymentCalculationService,
          useValue: mockCalculationService,
        },
        {
          provide: PostpaidSettlementService,
          useValue: mockPostpaidSettlementService,
        },
        {
          provide: SettlementSummaryService,
          useValue: {},
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        { provide: ConfigService, useValue: { get: jest.fn(() => "test") } },
      ],
    }).compile();

    controller = module.get<PaymentsController>(PaymentsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /api/v1/payments/initiate", () => {
    const initiateDto: KgInitiateDto = {
      productId: "product-uuid",
      amount: 240000,
      paymentMethod: "card",
      buyerName: "김철수",
      buyerEmail: "kim@example.com",
      buyerPhone: "01012345678",
    };

    const mockRequest = { user: { id: "user-uuid" } } as any;

    it("should initiate payment successfully", async () => {
      // Arrange
      mockPaymentsService.initiatePayment.mockResolvedValue(mockPaymentResult);

      // Act
      const result = await controller.initiatePayment(mockRequest, initiateDto);

      // Assert
      expect(result.orderNumber).toBeDefined();
      expect(result.paymentStatus).toBe("pending");
      expect(result.paymentPageUrl).toBeDefined();
      expect(mockPaymentsService.initiatePayment).toHaveBeenCalledWith(
        "user-uuid",
        initiateDto.productId,
        initiateDto.amount,
        expect.objectContaining({
          paymentMethod: initiateDto.paymentMethod,
          buyerName: initiateDto.buyerName,
        }),
      );
    });

    it("should call paymentsService with correct params", async () => {
      // Arrange
      mockPaymentsService.initiatePayment.mockResolvedValue(mockPaymentResult);

      // Act
      await controller.initiatePayment(mockRequest, initiateDto);

      // Assert
      expect(mockPaymentsService.initiatePayment).toHaveBeenCalledWith(
        mockRequest.user.id,
        initiateDto.productId,
        initiateDto.amount,
        {
          paymentMethod: initiateDto.paymentMethod,
          quota: initiateDto.quota,
          buyerName: initiateDto.buyerName,
          buyerEmail: initiateDto.buyerEmail,
          buyerPhone: initiateDto.buyerPhone,
        },
      );
    });

    it("should handle product not found error", async () => {
      // Arrange
      mockPaymentsService.initiatePayment.mockRejectedValue(
        new NotFoundException("상품을 찾을 수 없습니다."),
      );

      // Act & Assert
      await expect(
        controller.initiatePayment(mockRequest, initiateDto),
      ).rejects.toThrow(NotFoundException);
    });

    it("should handle amount mismatch error", async () => {
      // Arrange
      mockPaymentsService.initiatePayment.mockRejectedValue(
        new BadRequestException("결제 금액이 상품 가격과 일치하지 않습니다."),
      );

      // Act & Assert
      await expect(
        controller.initiatePayment(mockRequest, initiateDto),
      ).rejects.toThrow(BadRequestException);
    });

    it("should handle duplicate payment error", async () => {
      // Arrange
      mockPaymentsService.initiatePayment.mockRejectedValue(
        new ConflictException("이미 처리 중인 결제 요청입니다."),
      );

      // Act & Assert
      await expect(
        controller.initiatePayment(mockRequest, initiateDto),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("POST /api/v1/payments/webhook", () => {
    const webhookDto: PaymentWebhookDto = {
      orderNumber: "ORD-1704355200000-abc123",
      tid: "inicis-tid-123",
      resultCode: "0000",
      amount: 240000,
      authCode: "auth-code-123",
      signature: "valid-signature",
    };

    it("should complete payment successfully with valid webhook", async () => {
      // Arrange — IP·서명 통과 → 멱등 락 획득 → webhookRetryService 처리 성공.
      mockKgInicisGateway.verifyIpWhitelist.mockReturnValue(true);
      mockKgInicisGateway.verifyWebhookSignature.mockReturnValue(true);
      mockRedisService.setIfNotExists.mockResolvedValue(true);
      mockWebhookRetryService.logWebhook.mockResolvedValue("webhook-id-1");
      mockWebhookRetryService.processWebhook.mockResolvedValue({
        success: true,
        result: {
          id: mockPayment.id,
          orderNumber: webhookDto.orderNumber,
          amount: webhookDto.amount,
          paymentStatus: "completed",
          tid: mockPayment.tid,
          completedAt: mockPayment.completedAt,
        },
      });

      // Act
      const result = await controller.completePayment(webhookDto, "127.0.0.1");

      // Assert — 처리 결과(processResult.result)를 그대로 반환.
      expect(result.id).toBe(mockPayment.id);
      expect(result.paymentStatus).toBe("completed");
      expect(mockKgInicisGateway.verifyIpWhitelist).toHaveBeenCalledWith(
        "127.0.0.1",
      );
      expect(mockKgInicisGateway.verifyWebhookSignature).toHaveBeenCalledWith(
        {
          orderNumber: webhookDto.orderNumber,
          tid: webhookDto.tid,
          amount: webhookDto.amount,
          resultCode: webhookDto.resultCode,
        },
        webhookDto.signature,
      );
      expect(mockWebhookRetryService.logWebhook).toHaveBeenCalledTimes(1);
      expect(mockWebhookRetryService.processWebhook).toHaveBeenCalledWith(
        "webhook-id-1",
      );
    });

    it("should reject webhook from non-whitelisted IP", async () => {
      // Arrange
      mockKgInicisGateway.verifyIpWhitelist.mockReturnValue(false);

      // Act & Assert
      await expect(
        controller.completePayment(webhookDto, "192.168.1.100"),
      ).rejects.toThrow(BadRequestException);
      expect(mockKgInicisGateway.verifyIpWhitelist).toHaveBeenCalledWith(
        "192.168.1.100",
      );
    });

    it("should reject webhook with invalid signature", async () => {
      // Arrange — IP 통과했으나 서명 검증 실패(2차 방어).
      mockKgInicisGateway.verifyIpWhitelist.mockReturnValue(true);
      mockKgInicisGateway.verifyWebhookSignature.mockReturnValue(false);

      // Act & Assert
      await expect(
        controller.completePayment(webhookDto, "127.0.0.1"),
      ).rejects.toThrow(BadRequestException);
      expect(mockWebhookRetryService.processWebhook).not.toHaveBeenCalled();
    });

    it("should return duplicate response on idempotency lock miss", async () => {
      // Arrange — IP·서명 통과했으나 orderNumber 멱등 락 이미 점유(중복 웹훅).
      mockKgInicisGateway.verifyIpWhitelist.mockReturnValue(true);
      mockKgInicisGateway.verifyWebhookSignature.mockReturnValue(true);
      mockRedisService.setIfNotExists.mockResolvedValue(false);

      // Act
      const result = await controller.completePayment(webhookDto, "127.0.0.1");

      // Assert — 200 즉시 반환, 내부 처리는 미수행.
      expect(result.id).toBe("duplicate");
      expect(result.paymentStatus).toBe("completed");
      expect(mockWebhookRetryService.logWebhook).not.toHaveBeenCalled();
      expect(mockWebhookRetryService.processWebhook).not.toHaveBeenCalled();
    });

    it("should return pending when immediate processing fails (retry scheduled)", async () => {
      // Arrange — 처리 즉시 실패 시에도 KG 재시도 방지를 위해 200(pending) 반환(throw 아님).
      mockKgInicisGateway.verifyIpWhitelist.mockReturnValue(true);
      mockKgInicisGateway.verifyWebhookSignature.mockReturnValue(true);
      mockRedisService.setIfNotExists.mockResolvedValue(true);
      mockWebhookRetryService.logWebhook.mockResolvedValue("webhook-id-2");
      mockWebhookRetryService.processWebhook.mockResolvedValue({
        success: false,
        error: "결제 기록을 찾을 수 없습니다.",
      });

      // Act
      const result = await controller.completePayment(webhookDto, "127.0.0.1");

      // Assert
      expect(result.id).toBe("webhook-id-2");
      expect(result.paymentStatus).toBe("pending");
    });
  });

  describe("POST /api/v1/payments/:paymentId/cancel", () => {
    const cancelDto: CancelPaymentDto = {
      cancelReason: "고객 요청",
      cancelAmount: 240000,
    };

    it("should cancel payment successfully", async () => {
      // Arrange
      mockPaymentsService.cancelPayment.mockResolvedValue({
        ...mockPayment,
        paymentStatus: "cancelled",
      });

      // Act
      const result = await controller.cancelPayment({ user: { id: "user-uuid", userType: "ADMIN" } } as any, "payment-uuid", cancelDto);

      // Assert
      expect(result.paymentStatus).toBe("cancelled");
      expect(mockPaymentsService.cancelPayment).toHaveBeenCalledWith(
        "payment-uuid",
        cancelDto.cancelReason,
        cancelDto.cancelAmount,
        undefined,
        undefined,
        undefined,
        { id: "user-uuid", userType: "ADMIN" },
        { actorId: "user-uuid" }, // 감사 — ADMIN 직접 환불 실행 주체(RefundLog.actorId)
      );
    });

    it("should handle payment not found error", async () => {
      // Arrange
      mockPaymentsService.cancelPayment.mockRejectedValue(
        new NotFoundException("결제 기록을 찾을 수 없습니다."),
      );

      // Act & Assert
      await expect(
        controller.cancelPayment({ user: { id: "user-uuid", userType: "ADMIN" } } as any, "invalid-id", cancelDto),
      ).rejects.toThrow(NotFoundException);
    });

    it("should handle invalid cancel request", async () => {
      // Arrange
      mockPaymentsService.cancelPayment.mockRejectedValue(
        new BadRequestException("결제 취소 요청이 유효하지 않습니다."),
      );

      // Act & Assert
      await expect(
        controller.cancelPayment({ user: { id: "user-uuid", userType: "ADMIN" } } as any, "payment-uuid", cancelDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("GET /api/v1/payments/:paymentId/status", () => {
    it("should return payment status", async () => {
      // Arrange
      mockPaymentsService.getPayment.mockResolvedValue(mockPayment);

      // Act
      const result = await controller.getPaymentStatus({ user: { id: "user-uuid", userType: "ADMIN" } } as any, "payment-uuid");

      // Assert
      expect(result.paymentStatus).toBe("completed");
      expect(mockPaymentsService.getPayment).toHaveBeenCalledWith(
        "payment-uuid",
        "user-uuid",
        "ADMIN",
      );
    });

    it("should handle payment not found", async () => {
      // Arrange
      mockPaymentsService.getPayment.mockRejectedValue(
        new NotFoundException("결제 기록을 찾을 수 없습니다."),
      );

      // Act & Assert
      await expect(controller.getPaymentStatus({ user: { id: "user-uuid", userType: "ADMIN" } } as any, "invalid-id")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("GET /api/v1/payments/:paymentId", () => {
    it("should return payment details", async () => {
      // Arrange
      mockPaymentsService.getPayment.mockResolvedValue(mockPayment);

      // Act
      const result = await controller.getPayment({ user: { id: "user-uuid", userType: "ADMIN" } } as any, "payment-uuid");

      // Assert
      expect(result).toEqual(mockPayment);
      expect(mockPaymentsService.getPayment).toHaveBeenCalledWith(
        "payment-uuid",
        "user-uuid",
        "ADMIN",
      );
    });
  });

  describe("GET /api/v1/payments/user/history", () => {
    const mockRequest = { user: { id: "user-uuid" } } as any;

    it("should return user payment history with default limit", async () => {
      // Arrange
      mockPaymentsService.getUserPayments.mockResolvedValue([mockPayment]);

      // Act
      const result = await controller.getUserPayments(mockRequest);

      // Assert
      expect(result).toEqual([mockPayment]);
      expect(mockPaymentsService.getUserPayments).toHaveBeenCalledWith(
        "user-uuid",
        10,
      );
    });

    it("should return user payment history with custom limit", async () => {
      // Arrange
      mockPaymentsService.getUserPayments.mockResolvedValue([mockPayment]);

      // Act
      const result = await controller.getUserPayments(mockRequest, "20");

      // Assert
      expect(result).toEqual([mockPayment]);
      expect(mockPaymentsService.getUserPayments).toHaveBeenCalledWith(
        "user-uuid",
        20,
      );
    });

    it("should return empty array if no payments", async () => {
      // Arrange
      mockPaymentsService.getUserPayments.mockResolvedValue([]);

      // Act
      const result = await controller.getUserPayments(mockRequest);

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe("POST /api/v1/payments/:paymentId/refund", () => {
    const refundDto: RefundDto = {
      refundReason: "고객 요청",
      refundAmount: 240000,
    };

    it("should process refund successfully", async () => {
      // Arrange
      mockPaymentsService.requestRefund.mockResolvedValue(mockRefund);

      // Act
      const result = await controller.requestRefund({ user: { id: "user-uuid", userType: "ADMIN" } } as any, "payment-uuid", refundDto);

      // Assert
      expect(result.paymentStatus).toBe("refunded");
      expect(result.refundAmount).toBe(240000);
      expect(mockPaymentsService.requestRefund).toHaveBeenCalledWith(
        "payment-uuid",
        refundDto.refundReason,
        refundDto.refundAmount,
        { id: "user-uuid", userType: "ADMIN" },
        { actorId: "user-uuid" }, // 감사 — ADMIN 직접 환불 실행 주체(RefundLog.actorId)
      );
    });

    it("should handle non-refundable payment error", async () => {
      // Arrange
      mockPaymentsService.requestRefund.mockRejectedValue(
        new BadRequestException("환불할 수 없는 결제입니다."),
      );

      // Act & Assert
      await expect(
        controller.requestRefund({ user: { id: "user-uuid", userType: "ADMIN" } } as any, "payment-uuid", refundDto),
      ).rejects.toThrow(BadRequestException);
    });

    it("should handle payment not found for refund", async () => {
      // Arrange
      mockPaymentsService.requestRefund.mockRejectedValue(
        new NotFoundException("결제 기록을 찾을 수 없습니다."),
      );

      // Act & Assert
      await expect(
        controller.requestRefund({ user: { id: "user-uuid", userType: "ADMIN" } } as any, "invalid-id", refundDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("GET /api/v1/payments/:paymentId/refunds", () => {
    it("should return refund logs", async () => {
      // Arrange
      mockPaymentsService.getRefundLogs.mockResolvedValue([mockRefund]);

      // Act
      const result = await controller.getRefundLogs({ user: { id: "user-uuid", userType: "ADMIN" } } as any, "payment-uuid");

      // Assert
      expect(result).toEqual([mockRefund]);
      expect(mockPaymentsService.getRefundLogs).toHaveBeenCalledWith(
        "payment-uuid",
        { id: "user-uuid", userType: "ADMIN" },
      );
    });

    it("should return empty array if no refunds", async () => {
      // Arrange
      mockPaymentsService.getRefundLogs.mockResolvedValue([]);

      // Act
      const result = await controller.getRefundLogs({ user: { id: "user-uuid", userType: "ADMIN" } } as any, "payment-uuid");

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe("GET /api/v1/payments/stats/overview", () => {
    it("should return payment stats without userId", async () => {
      // Arrange
      mockPaymentsService.getPaymentStats.mockResolvedValue(mockPaymentStats);

      // Act
      const result = await controller.getPaymentStats();

      // Assert
      expect(result.totalPayments).toBe(100);
      expect(result.successRate).toBe("95.0");
      expect(mockPaymentsService.getPaymentStats).toHaveBeenCalledWith(
        undefined,
      );
    });

    it("should return payment stats for specific user", async () => {
      // Arrange
      mockPaymentsService.getPaymentStats.mockResolvedValue(mockPaymentStats);

      // Act
      const result = await controller.getPaymentStats("user-uuid");

      // Assert
      expect(result).toEqual(mockPaymentStats);
      expect(mockPaymentsService.getPaymentStats).toHaveBeenCalledWith(
        "user-uuid",
      );
    });
  });

  describe("GET /api/v1/payments/stats/date-range", () => {
    it("should return payment stats by date range", async () => {
      // Arrange
      mockPaymentsService.getPaymentStatsByDateRange.mockResolvedValue(
        mockPaymentStats,
      );

      // Act
      const result = await controller.getPaymentStatsByDateRange(
        "2026-01-01",
        "2026-01-31",
      );

      // Assert
      expect(result).toEqual(mockPaymentStats);
      expect(
        mockPaymentsService.getPaymentStatsByDateRange,
      ).toHaveBeenCalledWith(expect.any(Date), expect.any(Date));
    });
  });

  describe("API Response Format", () => {
    it("should return correct initiate payment response structure", async () => {
      // Arrange
      mockPaymentsService.initiatePayment.mockResolvedValue(mockPaymentResult);
      const mockRequest = { user: { id: "user-uuid" } } as any;

      // Act
      const result = await controller.initiatePayment(mockRequest, {
        productId: "product-uuid",
        amount: 240000,
        paymentMethod: "card",
        buyerName: "김철수",
        buyerEmail: "kim@example.com",
        buyerPhone: "01012345678",
      });

      // Assert
      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("orderNumber");
      expect(result).toHaveProperty("amount");
      expect(result).toHaveProperty("paymentStatus");
      expect(result).toHaveProperty("paymentPageUrl");
    });

    it("should return correct payment status response structure", async () => {
      // Arrange
      mockPaymentsService.getPayment.mockResolvedValue(mockPayment);

      // Act
      const result = await controller.getPaymentStatus({ user: { id: "user-uuid", userType: "ADMIN" } } as any, "payment-uuid");

      // Assert
      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("orderNumber");
      expect(result).toHaveProperty("amount");
      expect(result).toHaveProperty("paymentStatus");
    });

    it("should return correct payment stats response structure", async () => {
      // Arrange
      mockPaymentsService.getPaymentStats.mockResolvedValue(mockPaymentStats);

      // Act
      const result = await controller.getPaymentStats();

      // Assert
      expect(result).toHaveProperty("totalPayments");
      expect(result).toHaveProperty("completedCount");
      expect(result).toHaveProperty("failedCount");
      expect(result).toHaveProperty("totalRevenue");
      expect(result).toHaveProperty("successRate");
    });
  });
});
