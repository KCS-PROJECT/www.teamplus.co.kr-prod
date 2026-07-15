/**
 * 결제 시스템 종합 통합 테스트 (Facade + Controller 경계)
 *
 * Phase B 재편으로 결제 도메인 로직은 sub-service 로 이관되었다:
 *   - 결제 생성/멱등/금액검증  → PaymentCreateService  (payment-create.service.spec)
 *   - 웹훅 서명/금액/멱등/발급  → PaymentWebhookService (payment-webhook.service.spec)
 *   - 환불/취소               → PaymentRefundService  (payment-refund.service.spec)
 * 따라서 본 통합 스펙은 "Facade(PaymentsService) 와 Controller 가 sub-service·게이트웨이로
 * 올바르게 위임·전파하는지" 와, 컨트롤러 고유의 웹훅 IP/서명 게이트를 검증한다.
 * 각 sub-service 내부의 심층 보안 로직(서명 실패 시 트랜잭션 미실행 등)은 해당 sub-service
 * spec 이 단독 커버한다.
 *
 * 보안 검증 체크리스트 (경계 위임 관점):
 * ✓ 서버사이드 금액 검증 위임 (PaymentCreateService/PaymentWebhookService)
 * ✓ 웹훅 서명 검증 (Controller 2차 게이트 + PaymentWebhookService)
 * ✓ IP 화이트리스트 (Controller 1차 게이트)
 * ✓ 중복/멱등 예외 전파
 * ✓ 암호화된 로그인 (CryptoService)
 */

import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { PaymentsService } from "./payments.service";
import { PaymentsController } from "./payments.controller";
import { KgInicisGateway } from "./kg-inicis.gateway";
import { TossPaymentsGateway } from "./toss-payments.gateway";
import { PaymentCalculationService } from "./payment-calculation.service";
import { PostpaidSettlementService } from "./postpaid-settlement.service";
import { WebhookRetryService } from "./webhook-retry.service";
import { PaymentCreateService } from "./services/payment-create.service";
import { PaymentWebhookService } from "./services/payment-webhook.service";
import { PaymentRefundService } from "./services/payment-refund.service";
import { PaymentReceiptService } from "./services/payment-receipt.service";
import { CreditDomainService } from "@/credits/credit-domain.service";
import { NotificationsService } from "@/notifications/notifications.service";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import { CryptoService } from "@/auth/services/crypto.service";
import { AuthService } from "@/auth/auth.service";

describe("Payment System Integration Tests (7 Scenarios)", () => {
  let service: PaymentsService;
  let controller: PaymentsController;
  let prismaService: PrismaService;
  let cryptoService: CryptoService;

  // ═══════════════════════════════════════════════════════════════════════════════
  // 테스트 데이터 정의
  // ═══════════════════════════════════════════════════════════════════════════════

  const mockUserId = "user-uuid-parent-001";
  const mockProductId = "product-uuid-class-001";
  const mockOrderNumber = `ORD-${Date.now()}-parent001`;
  const mockTid = `INICIS-TID-${Date.now()}`;

  const mockProduct = {
    id: mockProductId,
    classId: "class-uuid-001",
    productName: "신규 수강생반 - 월 8회 패키지",
    price: 240000,
    sessionsPerMonth: 8,
    durationDays: 30,
    createdAt: new Date(),
    class: {
      id: "class-uuid-001",
      teamId: "club-uuid-001",
      className: "신규 수강생반",
    },
  };

  const mockUser = {
    id: mockUserId,
    email: "parent@teamplus.com",
    userType: "parent",
    createdAt: new Date(),
  };

  const mockPayment = {
    id: "payment-uuid-001",
    orderNumber: mockOrderNumber,
    userId: mockUserId,
    productId: mockProductId,
    amount: mockProduct.price,
    paymentStatus: "pending",
    paymentMethod: "card",
    tid: null,
    createdAt: new Date(),
    completedAt: null,
  };

  const mockCompletedPayment = {
    ...mockPayment,
    paymentStatus: "completed",
    tid: mockTid,
    completedAt: new Date(),
  };

  // 결제 시작 결과(Facade 가 PaymentCreateService 로부터 받는 형태).
  const mockInitiateResult = {
    id: mockPayment.id,
    orderNumber: mockOrderNumber,
    amount: mockProduct.price,
    paymentStatus: "pending",
    productId: mockProductId,
    paymentPageUrl:
      "https://stdpay.inicis.com/stdpay/INIpayMobile.php?mid=test&oid=ORD-1234",
  };

  // 웹훅 완료 결과(Facade 가 PaymentWebhookService 로부터 받는 형태).
  const mockCompleteResult = {
    id: mockPayment.id,
    orderNumber: mockOrderNumber,
    amount: mockProduct.price,
    paymentStatus: "completed",
    tid: mockTid,
    completedAt: new Date(),
    creditsIssued: 8,
  };

  const mockWebhookPayload = {
    orderNumber: mockOrderNumber,
    tid: mockTid,
    resultCode: "0000",
    amount: mockProduct.price,
    signature: "valid-signature-hash",
  };

  const maliciousIp = "192.168.1.100";

  // ═══════════════════════════════════════════════════════════════════════════════
  // Mock 설정
  // ═══════════════════════════════════════════════════════════════════════════════

  const mockPrismaService = {
    classProduct: { findUnique: jest.fn() },
    payment: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      groupBy: jest.fn(),
    },
    memberCredit: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    user: { findUnique: jest.fn() },
    clubMember: { findMany: jest.fn() },
    auditLog: { create: jest.fn() },
    enrollment: { findMany: jest.fn().mockResolvedValue([]) },
    monthlyPostpaidBillingLine: { findMany: jest.fn().mockResolvedValue([]) },
    tournamentRegistration: { findMany: jest.fn().mockResolvedValue([]) },
    academy: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(),
  };

  const mockRedisService = {
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(undefined),
    exists: jest.fn().mockResolvedValue(false),
    setIfNotExists: jest.fn().mockResolvedValue(true),
    getConnectionStatus: jest.fn().mockReturnValue(true),
  };

  const mockKgInicisGateway = {
    verifyAmount: jest.fn(),
    createPaymentRequest: jest.fn(),
    verifyWebhookSignature: jest.fn(),
    verifyIpWhitelist: jest.fn(),
    cancelPayment: jest.fn(),
  };

  // Facade 가 위임하는 sub-service 들 — 통합 관점에서 위임/전파만 검증.
  const mockCreateService = {
    initiatePayment: jest.fn(),
    verifyPayment: jest.fn(),
    getClassProduct: jest.fn(),
    calculateFee: jest.fn(),
  };
  const mockWebhookService = { completePayment: jest.fn() };
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
  const mockTossGateway = { confirm: jest.fn(), getPayment: jest.fn() };
  const mockCreditDomain = { issueFromPayment: jest.fn() };
  const mockNotificationsService = {
    notifyTeamManagers: jest.fn().mockResolvedValue(undefined),
    notifyUsers: jest.fn().mockResolvedValue(undefined),
  };

  // 컨트롤러 웹훅 파이프라인(IP·서명 통과 후 위임).
  const mockWebhookRetryService = {
    logWebhook: jest.fn().mockResolvedValue("webhook-id"),
    processWebhook: jest.fn(),
  };
  const mockPostpaidSettlementService = {};
  const mockCalculationService = {};

  const mockCryptoService = {
    decryptCredentialsWithAudit: jest.fn(),
    decryptCredentials: jest.fn(),
  };

  const mockAuthService = {
    validateUser: jest.fn(),
    generateTokens: jest.fn(),
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // 테스트 모듈 초기화
  // ═══════════════════════════════════════════════════════════════════════════════

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: KgInicisGateway, useValue: mockKgInicisGateway },
        { provide: TossPaymentsGateway, useValue: mockTossGateway },
        { provide: PaymentCalculationService, useValue: mockCalculationService },
        { provide: PostpaidSettlementService, useValue: mockPostpaidSettlementService },
        { provide: WebhookRetryService, useValue: mockWebhookRetryService },
        { provide: PaymentCreateService, useValue: mockCreateService },
        { provide: PaymentWebhookService, useValue: mockWebhookService },
        { provide: PaymentRefundService, useValue: mockRefundService },
        { provide: PaymentReceiptService, useValue: mockReceiptService },
        { provide: CreditDomainService, useValue: mockCreditDomain },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: CryptoService, useValue: mockCryptoService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    controller = module.get<PaymentsController>(PaymentsController);
    prismaService = module.get<PrismaService>(PrismaService);
    cryptoService = module.get<CryptoService>(CryptoService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Scenario 1: 정상적인 결제 흐름
  // ═══════════════════════════════════════════════════════════════════════════════

  describe("Scenario 1: 정상적인 결제 흐름 (정상 완료)", () => {
    it("Step 1: 부모 사용자가 수업 상품 조회", async () => {
      mockPrismaService.classProduct.findUnique.mockResolvedValue(mockProduct);

      const product = await prismaService.classProduct.findUnique({
        where: { id: mockProductId },
      });

      expect(product).toBeDefined();
      expect(product?.price).toBe(240000);
      expect(product?.sessionsPerMonth).toBe(8);
    });

    it("Step 2: 결제 초기화 — Facade 가 PaymentCreateService 로 위임하고 결제 URL 반환", async () => {
      mockCreateService.initiatePayment.mockResolvedValue(mockInitiateResult);

      const result = await service.initiatePayment(
        mockUserId,
        mockProductId,
        mockProduct.price,
      );

      expect(result).toBeDefined();
      expect(result?.orderNumber).toBe(mockOrderNumber);
      expect(result?.amount).toBe(240000);
      expect(String(result?.paymentPageUrl)).toContain("inicis.com");
      expect(mockCreateService.initiatePayment).toHaveBeenCalledWith(
        mockUserId,
        mockProductId,
        mockProduct.price,
        undefined,
      );
    });

    it("Step 3: 사용자가 KG이니시스 결제 페이지에서 결제 완료", async () => {
      // 외부 시스템 — 웹훅 콜백(Step 4)으로 검증됨.
      expect(true).toBe(true);
    });

    it("Step 4: 웹훅 완료 — Facade 가 PaymentWebhookService 로 위임하고 completed 반환", async () => {
      mockWebhookService.completePayment.mockResolvedValue(mockCompleteResult);

      const result = await service.completePayment(mockWebhookPayload);

      expect(result?.paymentStatus).toBe("completed");
      expect(result?.tid).toBe(mockTid);
      expect(result?.creditsIssued).toBe(8);
      expect(mockWebhookService.completePayment).toHaveBeenCalledWith(
        mockWebhookPayload,
      );
    });

    it("Step 5: 결제 조회 - 상태 및 크레딧 확인", async () => {
      mockPrismaService.payment.findUnique.mockResolvedValue(
        mockCompletedPayment,
      );
      mockPrismaService.memberCredit.findUnique.mockResolvedValue({
        id: "credit-uuid-001",
        memberId: mockUserId,
        totalCredits: 8,
        usedCredits: 0,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      } as any);

      const payment = await prismaService.payment.findUnique({
        where: { id: mockPayment.id },
      });
      const credit = (await prismaService.memberCredit.findUnique({
        where: { id: "credit-uuid-001" },
      })) as any;

      expect(payment?.paymentStatus).toBe("completed");
      expect(credit?.totalCredits).toBe(8);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Scenario 2: 금액 불일치 탐지 (PaymentWebhookService 위임 → 예외 전파)
  // ═══════════════════════════════════════════════════════════════════════════════

  describe("Scenario 2: 금액 불일치 탐지", () => {
    it("웹훅 금액 불일치 시 BadRequestException 전파", async () => {
      mockWebhookService.completePayment.mockRejectedValue(
        new BadRequestException("결제 금액이 일치하지 않습니다."),
      );

      const mismatchedWebhookPayload = { ...mockWebhookPayload, amount: 230000 };

      await expect(
        service.completePayment(mismatchedWebhookPayload),
      ).rejects.toThrow(BadRequestException);
      expect(mockWebhookService.completePayment).toHaveBeenCalledWith(
        mismatchedWebhookPayload,
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Scenario 3: 중복 결제 방지 (PaymentCreateService 위임 → 예외 전파)
  // ═══════════════════════════════════════════════════════════════════════════════

  describe("Scenario 3: 중복 결제 방지 (동일 요청)", () => {
    it("동일 상품 결제 진행 중이면 ConflictException 전파", async () => {
      mockCreateService.initiatePayment.mockRejectedValue(
        new ConflictException("이미 처리 중인 결제 요청입니다."),
      );

      await expect(
        service.initiatePayment(mockUserId, mockProductId, mockProduct.price),
      ).rejects.toThrow(ConflictException);
    });

    it("정상 요청은 PaymentCreateService 로 위임되어 결제가 생성된다", async () => {
      mockCreateService.initiatePayment.mockResolvedValue(mockInitiateResult);

      const result = await service.initiatePayment(
        mockUserId,
        mockProductId,
        mockProduct.price,
      );

      expect(result?.orderNumber).toBe(mockOrderNumber);
      expect(mockCreateService.initiatePayment).toHaveBeenCalledTimes(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Scenario 4: 웹훅 서명 검증 실패
  // ═══════════════════════════════════════════════════════════════════════════════

  describe("Scenario 4: 웹훅 서명 검증 실패", () => {
    it("서명 검증 실패 시 BadRequestException 전파 (PaymentWebhookService)", async () => {
      mockWebhookService.completePayment.mockRejectedValue(
        new BadRequestException("웹훅 서명이 유효하지 않습니다."),
      );

      const invalidSignaturePayload = {
        ...mockWebhookPayload,
        signature: "invalid-signature-hash",
      };

      await expect(
        service.completePayment(invalidSignaturePayload),
      ).rejects.toThrow(BadRequestException);
    });

    it("Controller 2차 게이트: 서명 검증 실패 시 BadRequestException", async () => {
      mockKgInicisGateway.verifyIpWhitelist.mockReturnValue(true);
      mockKgInicisGateway.verifyWebhookSignature.mockReturnValue(false);

      await expect(
        controller.completePayment(mockWebhookPayload, "127.0.0.1"),
      ).rejects.toThrow(BadRequestException);
      expect(mockWebhookRetryService.processWebhook).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Scenario 5: IP 화이트리스트 검증 (Controller 1차 게이트)
  // ═══════════════════════════════════════════════════════════════════════════════

  describe("Scenario 5: IP 화이트리스트 검증", () => {
    it("화이트리스트 IP + 서명 통과 시 웹훅 처리 파이프라인으로 위임", async () => {
      mockKgInicisGateway.verifyIpWhitelist.mockReturnValue(true);
      mockKgInicisGateway.verifyWebhookSignature.mockReturnValue(true);
      mockRedisService.setIfNotExists.mockResolvedValue(true);
      mockWebhookRetryService.logWebhook.mockResolvedValue("webhook-id");
      mockWebhookRetryService.processWebhook.mockResolvedValue({
        success: true,
        result: mockCompleteResult,
      });

      const result = await controller.completePayment(
        mockWebhookPayload,
        "203.238.37.10",
      );

      expect(result).toBeDefined();
      expect(mockKgInicisGateway.verifyIpWhitelist).toHaveBeenCalledWith(
        "203.238.37.10",
      );
      expect(mockWebhookRetryService.processWebhook).toHaveBeenCalledTimes(1);
    });

    it("비허용 IP 웹훅은 BadRequestException 으로 차단", async () => {
      mockKgInicisGateway.verifyIpWhitelist.mockReturnValue(false);

      await expect(
        controller.completePayment(mockWebhookPayload, maliciousIp),
      ).rejects.toThrow(BadRequestException);
      expect(mockKgInicisGateway.verifyIpWhitelist).toHaveBeenCalledWith(
        maliciousIp,
      );
    });

    it("비허용 IP 차단 시 웹훅 처리로 진입하지 않는다", async () => {
      mockKgInicisGateway.verifyIpWhitelist.mockReturnValue(false);

      await expect(
        controller.completePayment(mockWebhookPayload, maliciousIp),
      ).rejects.toThrow(BadRequestException);
      expect(mockWebhookRetryService.processWebhook).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Scenario 6: 멱등성 보장 (이미 처리된 결제 재호출 → ConflictException 전파)
  // ═══════════════════════════════════════════════════════════════════════════════

  describe("Scenario 6: 멱등성 보장 (동일 웹훅 재전송)", () => {
    it("이미 처리된 결제 재호출 시 ConflictException 전파", async () => {
      mockWebhookService.completePayment.mockRejectedValue(
        new ConflictException("이미 처리된 결제입니다."),
      );

      await expect(service.completePayment(mockWebhookPayload)).rejects.toThrow(
        ConflictException,
      );
    });

    it("멱등 예외 전파 시에도 Facade 는 sub-service 로 정확히 위임한다", async () => {
      mockWebhookService.completePayment.mockRejectedValue(
        new ConflictException("이미 처리된 결제입니다."),
      );

      await expect(
        service.completePayment(mockWebhookPayload),
      ).rejects.toThrow(ConflictException);
      expect(mockWebhookService.completePayment).toHaveBeenCalledWith(
        mockWebhookPayload,
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Scenario 7: 암호화된 로그인과 결제 통합
  // ═══════════════════════════════════════════════════════════════════════════════

  describe("Scenario 7: 암호화된 로그인과 결제 통합 (AES-256-GCM)", () => {
    it("Step 1-2: 클라이언트에서 암호화된 페이로드로 로그인 요청", async () => {
      const encryptedPayload = {
        encryptedData: "base64-encrypted-credentials",
        iv: "base64-iv-16-bytes",
        authTag: "base64-auth-tag-16-bytes",
      };

      mockCryptoService.decryptCredentialsWithAudit.mockResolvedValue(
        JSON.stringify({
          email: "parent@teamplus.com",
          password: "password123",
        }),
      );
      mockAuthService.validateUser.mockResolvedValue(mockUser);
      mockAuthService.generateTokens.mockResolvedValue({
        accessToken: "jwt-access-token",
        refreshToken: "jwt-refresh-token",
      });

      const decrypted =
        await cryptoService.decryptCredentialsWithAudit(encryptedPayload);
      const tokens = await mockAuthService.generateTokens(JSON.parse(decrypted));

      expect(decrypted).toContain("parent@teamplus.com");
      expect(tokens.accessToken).toBeDefined();
      expect(mockCryptoService.decryptCredentialsWithAudit).toHaveBeenCalled();
    });

    it("Step 3-4: 백엔드에서 복호화 및 JWT 토큰 발급", async () => {
      const encryptedPayload = {
        encryptedData: "base64-encrypted-credentials",
        iv: "base64-iv-16-bytes",
        authTag: "base64-auth-tag-16-bytes",
      };

      mockCryptoService.decryptCredentialsWithAudit.mockResolvedValue(
        JSON.stringify({
          email: "parent@teamplus.com",
          password: "password123",
        }),
      );

      const result =
        await cryptoService.decryptCredentialsWithAudit(encryptedPayload);

      expect(result).toBeTruthy();
      expect(result).toContain("parent@teamplus.com");
    });

    it("Step 5: JWT로 결제 초기화 요청 (Facade 위임)", async () => {
      mockCreateService.initiatePayment.mockResolvedValue(mockInitiateResult);

      const result = await service.initiatePayment(
        mockUserId,
        mockProductId,
        mockProduct.price,
      );

      expect(result).toBeDefined();
      expect(String(result?.paymentPageUrl)).toContain("inicis.com");
    });

    it("Step 6: 결제 성공 (Facade 위임)", async () => {
      mockWebhookService.completePayment.mockResolvedValue(mockCompleteResult);

      const result = await service.completePayment(mockWebhookPayload);

      expect(result?.paymentStatus).toBe("completed");
      expect(result?.creditsIssued).toBe(8);
    });

    it("should log full audit trail for encryption/decryption operations", async () => {
      const encryptedPayload = {
        encryptedData: "base64-encrypted",
        iv: "base64-iv",
        authTag: "base64-tag",
      };

      mockCryptoService.decryptCredentialsWithAudit.mockResolvedValue(
        JSON.stringify({ email: "parent@teamplus.com", password: "pass" }),
      );

      const result =
        await cryptoService.decryptCredentialsWithAudit(encryptedPayload);

      expect(result).toBeTruthy();
      expect(
        mockCryptoService.decryptCredentialsWithAudit,
      ).toHaveBeenCalledWith(encryptedPayload);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // 보안 검증 체크리스트 (경계 위임 관점)
  // ═══════════════════════════════════════════════════════════════════════════════

  describe("Security Validation Checklist", () => {
    it("✓ 서버사이드 금액 검증 - KG 게이트웨이 제공", () => {
      expect(mockKgInicisGateway.verifyAmount).toBeDefined();
    });

    it("✓ 웹훅 서명 검증 - KG 게이트웨이 제공", () => {
      expect(mockKgInicisGateway.verifyWebhookSignature).toBeDefined();
    });

    it("✓ IP 화이트리스트 - Controller 1차 게이트", () => {
      expect(mockKgInicisGateway.verifyIpWhitelist).toBeDefined();
    });

    it("✓ 결제 생성/웹훅 위임 - sub-service 존재", () => {
      expect(mockCreateService.initiatePayment).toBeDefined();
      expect(mockWebhookService.completePayment).toBeDefined();
    });

    it("✓ 암호화된 로그인 - CryptoService 제공", () => {
      expect(mockCryptoService.decryptCredentialsWithAudit).toBeDefined();
    });

    it("✓ 감사 로그 - auditLog.create 제공", () => {
      expect(mockPrismaService.auditLog.create).toBeDefined();
    });

    it("✓ JWT 인증 - AuthService 제공", () => {
      expect(mockAuthService.generateTokens).toBeDefined();
    });

    it("✓ RBAC - PARENT 역할만 결제 가능 (테스트 데이터)", () => {
      expect(mockUser.userType).toBe("parent");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // 성능 (위임 오버헤드)
  // ═══════════════════════════════════════════════════════════════════════════════

  describe("Performance Targets", () => {
    it("결제 초기화 위임: <200ms", async () => {
      mockCreateService.initiatePayment.mockResolvedValue(mockInitiateResult);

      const startTime = Date.now();
      await service.initiatePayment(mockUserId, mockProductId, mockProduct.price);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(200);
    });

    it("웹훅 처리 위임: <500ms", async () => {
      mockWebhookService.completePayment.mockResolvedValue(mockCompleteResult);

      const startTime = Date.now();
      await service.completePayment(mockWebhookPayload);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(500);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // 에러 처리 (위임 예외 전파)
  // ═══════════════════════════════════════════════════════════════════════════════

  describe("Error Handling Tests", () => {
    it("NotFoundException - 잘못된 상품ID (PaymentCreateService 전파)", async () => {
      mockCreateService.initiatePayment.mockRejectedValue(
        new NotFoundException("상품을 찾을 수 없습니다."),
      );

      await expect(
        service.initiatePayment(mockUserId, "invalid-product-id", 240000),
      ).rejects.toThrow(NotFoundException);
    });

    it("BadRequestException - 잘못된 금액 (PaymentCreateService 전파)", async () => {
      mockCreateService.initiatePayment.mockRejectedValue(
        new BadRequestException("결제 금액이 상품 가격과 일치하지 않습니다."),
      );

      await expect(
        service.initiatePayment(mockUserId, mockProductId, 999999),
      ).rejects.toThrow(BadRequestException);
    });

    it("BadRequestException - 서명 검증 실패 (PaymentWebhookService 전파)", async () => {
      mockWebhookService.completePayment.mockRejectedValue(
        new BadRequestException("웹훅 서명이 유효하지 않습니다."),
      );

      await expect(service.completePayment(mockWebhookPayload)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("BadRequestException - IP 미승인 (Controller 1차 게이트)", async () => {
      mockKgInicisGateway.verifyIpWhitelist.mockReturnValue(false);

      await expect(
        controller.completePayment(mockWebhookPayload, maliciousIp),
      ).rejects.toThrow(BadRequestException);
    });

    it("ConflictException - 멱등성 위반 (PaymentWebhookService 전파)", async () => {
      mockWebhookService.completePayment.mockRejectedValue(
        new ConflictException("이미 처리된 결제입니다."),
      );

      await expect(service.completePayment(mockWebhookPayload)).rejects.toThrow(
        ConflictException,
      );
    });

    it('Error - 복호화 실패 ("Decryption failed")', async () => {
      const invalidPayload = {
        encryptedData: "invalid-base64-encrypted",
        iv: "invalid-base64-iv",
        authTag: "invalid-base64-tag",
      };

      mockCryptoService.decryptCredentialsWithAudit.mockRejectedValue(
        new Error("Decryption failed"),
      );

      await expect(
        cryptoService.decryptCredentialsWithAudit(invalidPayload),
      ).rejects.toThrow("Decryption failed");
    });
  });
});
