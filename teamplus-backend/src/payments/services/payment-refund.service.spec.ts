import { Test, TestingModule } from "@nestjs/testing";
import { PaymentRefundService } from "./payment-refund.service";
import { PrismaService } from "@/prisma/prisma.service";
import { KgInicisGateway } from "../kg-inicis.gateway";

describe("PaymentRefundService", () => {
  let service: PaymentRefundService;

  const mockPrisma = {
    payment: { findUnique: jest.fn(), update: jest.fn() },
    memberCredit: { updateMany: jest.fn() },
    refundLog: { create: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(),
  };

  const mockKgGateway = {
    cancelPayment: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentRefundService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: KgInicisGateway, useValue: mockKgGateway },
      ],
    }).compile();

    service = module.get<PaymentRefundService>(PaymentRefundService);
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
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
