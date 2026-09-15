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
    payment: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };

  /** getReceipt 가 select 하는 형태의 완료 결제 행 — 영수증이 이미 있어 lazy-create 를 타지 않는다. */
  const completedPaymentRow = (overrides: Record<string, unknown>) => ({
    id: "pay-1",
    userId: "user-1",
    orderNumber: "TRN-1",
    amount: 30000,
    paymentStatus: "completed",
    paymentMethod: "nice",
    completedAt: new Date("2026-09-01T00:00:00Z"),
    createdAt: new Date("2026-09-01T00:00:00Z"),
    receipt: { id: "rc-1", taxable: false, taxAmount: 0 },
    product: null,
    credits: [],
    enrollments: [],
    tournamentRegistrations: [],
    monthlyBillingLines: [],
    ...overrides,
  });

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

  describe("getReceipt · 상품명", () => {
    it("대회 결제(상품 연결 없음) → 대회명 + 참가비", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(
        completedPaymentRow({
          tournamentRegistrations: [
            { tournament: { billingMode: "POSTPAID", name: "가을 리그" } },
          ],
        }),
      );

      const res = await service.getReceipt("pay-1", "user-1", "PARENT");

      expect(res.receipt.productName).toBe("가을 리그 참가비");
      expect(res.receipt.sourceType).toBe("TOURNAMENT");
    });

    it("상품이 연결된 결제 → 상품명 우선(대회 등록이 함께 있어도)", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(
        completedPaymentRow({
          product: { productName: "9월 후불 수강", billingTiming: "POSTPAID" },
          tournamentRegistrations: [
            { tournament: { billingMode: "PREPAID", name: "가을 리그" } },
          ],
        }),
      );

      const res = await service.getReceipt("pay-1", "user-1", "PARENT");

      expect(res.receipt.productName).toBe("9월 후불 수강");
    });

    it("빈 문자열 상품명 + 대회 → 대회명 폴백(공란 영수증 방지)", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(
        completedPaymentRow({
          product: { productName: "   ", billingTiming: "POSTPAID" },
          tournamentRegistrations: [
            { tournament: { billingMode: "POSTPAID", name: "가을 리그" } },
          ],
        }),
      );

      const res = await service.getReceipt("pay-1", "user-1", "PARENT");

      expect(res.receipt.productName).toBe("가을 리그 참가비");
    });

    it("상품·대회 모두 없음 → 기존 폴백 유지", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(completedPaymentRow({}));

      const res = await service.getReceipt("pay-1", "user-1", "PARENT");

      expect(res.receipt.productName).toBe("수업 결제");
    });
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
