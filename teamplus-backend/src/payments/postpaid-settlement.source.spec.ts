import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { PostpaidSettlementService } from "./postpaid-settlement.service";
import { PrismaService } from "@/prisma/prisma.service";
import { PaymentCalculationService } from "./payment-calculation.service";
import { NotificationsService } from "@/notifications/notifications.service";
import { ResourceAccessService } from "@/common/access/resource-access.service";

/**
 * 출처 라벨링 append 검증 (SPEC §6-1):
 *  - getMyPendingBillings: childName append(lastName+firstName) · kind 불변 · child null 폴백
 *  - getPostpaidOrder: sourceType/billingTiming 파생 · 연결 끊김 시 null · IDOR 404 보존
 */
describe("PostpaidSettlementService · 출처 라벨링", () => {
  let service: PostpaidSettlementService;

  const mockPrisma = {
    monthlyPostpaidBillingLine: { findMany: jest.fn(), findFirst: jest.fn() },
    tournamentRegistration: { findMany: jest.fn(), findFirst: jest.fn() },
    payment: { findUnique: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostpaidSettlementService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PaymentCalculationService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: ResourceAccessService, useValue: {} },
      ],
    }).compile();

    service = module.get<PostpaidSettlementService>(PostpaidSettlementService);
    jest.clearAllMocks();
  });

  describe("getMyPendingBillings", () => {
    it("classItems 는 kind 유지 + childName append(lastName+firstName)", async () => {
      mockPrisma.monthlyPostpaidBillingLine.findMany.mockResolvedValue([
        {
          id: "line-1",
          attendanceCount: 4,
          amount: 40000,
          createdAt: new Date("2026-07-10T00:00:00Z"),
          billing: {
            yearMonth: "2026-07",
            class: { id: "cls-1", className: "입문반" },
          },
          payment: { orderNumber: "ORD-1" },
          user: { firstName: "민준", lastName: "김" },
        },
      ]);
      mockPrisma.tournamentRegistration.findMany.mockResolvedValue([]);

      const result = await service.getMyPendingBillings("payer-1");

      expect(result).toHaveLength(1);
      expect(result[0].kind).toBe("CLASS");
      expect((result[0] as any).childName).toBe("김민준");
      // 기존 키 보존
      expect((result[0] as any).lineId).toBe("line-1");
      expect(result[0].paymentName).toBe("2026-07 수업료");
    });

    it("tournamentItems 는 kind 유지 + child null 폴백", async () => {
      mockPrisma.monthlyPostpaidBillingLine.findMany.mockResolvedValue([]);
      mockPrisma.tournamentRegistration.findMany.mockResolvedValue([
        {
          id: "reg-1",
          calculatedFee: 30000,
          updatedAt: new Date("2026-07-11T00:00:00Z"),
          tournament: { id: "tour-1", name: "여름컵" },
          payment: { orderNumber: "ORD-2" },
          child: null,
        },
      ]);

      const result = await service.getMyPendingBillings("payer-1");

      expect(result).toHaveLength(1);
      expect(result[0].kind).toBe("TOURNAMENT");
      expect((result[0] as any).childName).toBeNull();
    });
  });

  describe("getPostpaidOrder", () => {
    it("후불 대회 링크 → TOURNAMENT/파생 billingTiming append", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        id: "pay-1",
        userId: "user-1",
        amount: 30000,
        paymentStatus: "pending",
      });
      mockPrisma.monthlyPostpaidBillingLine.findFirst.mockResolvedValue(null);
      mockPrisma.tournamentRegistration.findFirst.mockResolvedValue({
        tournament: { name: "여름컵", billingMode: "POSTPAID" },
      });

      const result = await service.getPostpaidOrder("ORD-2", "user-1", "PARENT");

      expect(result.sourceType).toBe("TOURNAMENT");
      expect(result.billingTiming).toBe("POSTPAID");
      expect(result.paymentName).toBe("여름컵 참가비");
    });

    it("수업 후불 라인 → CLASS/POSTPAID append", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        id: "pay-1",
        userId: "user-1",
        amount: 40000,
        paymentStatus: "pending",
      });
      mockPrisma.monthlyPostpaidBillingLine.findFirst.mockResolvedValue({
        billing: { yearMonth: "2026-07" },
      });
      mockPrisma.tournamentRegistration.findFirst.mockResolvedValue(null);

      const result = await service.getPostpaidOrder("ORD-1", "user-1", "PARENT");

      expect(result.sourceType).toBe("CLASS");
      expect(result.billingTiming).toBe("POSTPAID");
    });

    it("연결 끊김(line·tReg 모두 없음) → sourceType/billingTiming null", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        id: "pay-1",
        userId: "user-1",
        amount: 10000,
        paymentStatus: "pending",
      });
      mockPrisma.monthlyPostpaidBillingLine.findFirst.mockResolvedValue(null);
      mockPrisma.tournamentRegistration.findFirst.mockResolvedValue(null);

      const result = await service.getPostpaidOrder("ORD-X", "user-1", "PARENT");

      expect(result.sourceType).toBeNull();
      expect(result.billingTiming).toBeNull();
      expect(result.paymentName).toBeNull();
    });

    it("타인 결제(IDOR) → NotFoundException 404 보존", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        id: "pay-1",
        userId: "owner-1",
        amount: 10000,
        paymentStatus: "pending",
      });

      await expect(
        service.getPostpaidOrder("ORD-1", "attacker-2", "PARENT"),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
