import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { PaymentCreateService } from "./payment-create.service";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import { KgInicisGateway } from "../kg-inicis.gateway";
import { PaymentCalculationService } from "../payment-calculation.service";
import { PaymentWebhookService } from "./payment-webhook.service";

describe("PaymentCreateService", () => {
  let service: PaymentCreateService;

  const mockPrisma = {
    payment: { findUnique: jest.fn(), create: jest.fn() },
    product: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };

  const mockRedis = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  const mockConfig = {
    get: jest.fn((key: string) => {
      const map: Record<string, string> = {
        INICIS_STORE_ID: "test_store",
        INICIS_MERCHANT_KEY: "test_key",
      };
      return map[key];
    }),
  };

  const mockKgGateway = {
    createPaymentRequest: jest.fn(),
    verifyWebhookSignature: jest.fn(),
  };

  const mockCalculation = {
    calculateFee: jest.fn(),
  };

  // 생성자 DI 그래프 유지용 — PaymentCreateService 는 _webhookService 를 보관만 하고
  //   직접 호출하지 않으므로(참조 hold) 빈 mock 으로 충분.
  const mockWebhookService = {
    completePayment: jest.fn(),
    finalizePayment: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentCreateService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: ConfigService, useValue: mockConfig },
        { provide: KgInicisGateway, useValue: mockKgGateway },
        { provide: PaymentCalculationService, useValue: mockCalculation },
        { provide: PaymentWebhookService, useValue: mockWebhookService },
      ],
    }).compile();

    service = module.get<PaymentCreateService>(PaymentCreateService);
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // Phase B 구현 후 활성화 예정
  it.skip("initiatePayment: orderNumber UUID 멱등성 보장 — 동일 productId+userId 재요청 시 기존 orderNumber 반환", async () => {
    // given: Redis에 이미 멱등성 키 존재
    // when: initiatePayment 재호출
    // then: 동일 orderNumber 반환, KG 게이트웨이 중복 호출 없음
  });

  it.skip("initiatePayment: 금액 0 이하 요청 시 BadRequestException 발생", async () => {
    // given: amount = 0
    // when: initiatePayment
    // then: BadRequestException('결제 금액이 유효하지 않습니다.')
  });

  it.skip("calculateFee: PaymentCalculationService 에 위임하고 결과를 그대로 반환", async () => {
    // given: mockCalculation.calculateFee 가 { feeAmount: 300, netAmount: 9700 } 반환
    // when: calculateFee(10000, 'prod-1')
    // then: 반환값 동일, calculationService.calculateFee 1회 호출
  });

  it.skip("verifyPayment: Redis 캐시 히트 시 DB 조회 없이 cached 상태 반환", async () => {
    // given: mockRedis.get 이 JSON 상태 문자열 반환
    // when: verifyPayment(userId, orderNumber)
    // then: prisma.payment.findUnique 호출 없음
  });

  describe("verifyPayment: 출처 라벨링 append", () => {
    const basePayment = {
      id: "pay-1",
      orderNumber: "ORD-1",
      userId: "user-1",
      amount: 240000,
      paymentStatus: "completed",
      paymentMethod: "card",
      tid: "tid-1",
      completedAt: new Date("2026-07-10T00:00:00Z"),
      createdAt: new Date("2026-07-10T00:00:00Z"),
      productId: "prod-1",
      credits: [{ totalSessions: 8 }],
      receipt: { id: "rcpt-1", receiptNumber: "R-1", issuedAt: new Date() },
      enrollments: [],
    };

    it("선불 수업 결제 → CLASS/PREPAID append + 기존 키 보존(Dual Emit)", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        ...basePayment,
        product: { productName: "입문반", sessionsPerMonth: 8, billingTiming: "PREPAID" },
        tournamentRegistrations: [],
        monthlyBillingLines: [],
      });

      const result = await service.verifyPayment("user-1", "ORD-1");

      expect(result.receipt.sourceType).toBe("CLASS");
      expect(result.receipt.billingTiming).toBe("PREPAID");
      // 기존 키 보존
      expect(result.receipt.orderNumber).toBe("ORD-1");
      expect(result.creditsIssued).toBe(8);
      expect(result.message).toBe("결제가 완료되었습니다.");
    });

    it("관계 전무(매치 결제) → sourceType/billingTiming null", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        ...basePayment,
        product: null,
        tournamentRegistrations: [],
        monthlyBillingLines: [],
      });

      const result = await service.verifyPayment("user-1", "ORD-1");

      expect(result.receipt.sourceType).toBeNull();
      expect(result.receipt.billingTiming).toBeNull();
    });
  });
});
