import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { PaymentCreateService } from "./payment-create.service";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import { KgInicisGateway } from "../kg-inicis.gateway";
import { PaymentCalculationService } from "../payment-calculation.service";

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentCreateService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: ConfigService, useValue: mockConfig },
        { provide: KgInicisGateway, useValue: mockKgGateway },
        { provide: PaymentCalculationService, useValue: mockCalculation },
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
});
