import { Test, TestingModule } from "@nestjs/testing";
import { PaymentReceiptService } from "./payment-receipt.service";
import { PrismaService } from "@/prisma/prisma.service";

describe("PaymentReceiptService", () => {
  let service: PaymentReceiptService;

  const mockPrisma = {
    settlement: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    receipt: { findUnique: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentReceiptService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PaymentReceiptService>(PaymentReceiptService);
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // Phase B 구현 후 활성화 예정
  it.skip("getSettlementList: 빈 결과 시 items=[], total=0 반환", async () => {
    // given: prisma.settlement.findMany = [], count = 0
    // when: getSettlementList({ page: 1, limit: 20 })
    // then: { items: [], total: 0, page: 1, limit: 20 }
  });

  it.skip("createReceipt: 동일 paymentId 중복 생성 시 Prisma P2002 → ConflictException 변환", async () => {
    // given: prisma.receipt.create 가 P2002 Unique constraint 에러 throw
    // when: createReceipt(paymentId, userId)
    // then: ConflictException('이미 발급된 영수증입니다.')
  });

  it.skip("approveSettlement: PENDING 상태가 아닌 정산 승인 시도 시 BadRequestException", async () => {
    // given: settlement.status = 'COMPLETED'
    // when: approveSettlement(settlementId, adminId)
    // then: BadRequestException, settlement.update 호출 없음
  });

  it.skip("getSettlementList: status 필터 적용 시 Prisma where 절에 status 포함", async () => {
    // given: query = { status: 'PENDING' }
    // when: getSettlementList(query)
    // then: prisma.settlement.findMany 호출 인자에 where.status = 'PENDING' 포함
  });
});
