import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { SettlementsService } from "./settlements.service";
import { PrismaService } from "@/prisma/prisma.service";

describe("SettlementsService", () => {
  let service: SettlementsService;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockPrisma: any = {
    settlement: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    settlementDetail: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    settlementTransaction: {
      create: jest.fn(),
    },
    clubMember: {
      findMany: jest.fn(),
    },
    team: {
      findFirst: jest.fn(),
    },
    teamMember: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const setupTransaction = () => {
    mockPrisma.$transaction.mockImplementation(
      (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma),
    );
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettlementsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SettlementsService>(SettlementsService);
    jest.clearAllMocks();
    setupTransaction();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // ==================== getSettlements ====================

  describe("getSettlements", () => {
    it("기간 필터 적용 시 createdAt 범위가 설정된다", async () => {
      mockPrisma.settlement.findMany.mockResolvedValue([]);
      mockPrisma.settlement.count.mockResolvedValue(0);

      await service.getSettlements({
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      } as any);

      const callArgs = mockPrisma.settlement.findMany.mock.calls[0][0];
      expect(callArgs.where.createdAt).toBeDefined();
      expect(callArgs.where.createdAt.gte).toEqual(new Date("2026-01-01"));
      expect(callArgs.where.createdAt.lte).toEqual(new Date("2026-01-31"));
    });

    it("상태 필터를 올바르게 적용한다", async () => {
      mockPrisma.settlement.findMany.mockResolvedValue([]);
      mockPrisma.settlement.count.mockResolvedValue(0);

      await service.getSettlements({ status: "PENDING" } as any);

      const callArgs = mockPrisma.settlement.findMany.mock.calls[0][0];
      expect(callArgs.where.status).toBe("PENDING");
    });

    it("페이지네이션 메타를 올바르게 반환한다", async () => {
      mockPrisma.settlement.findMany.mockResolvedValue([]);
      mockPrisma.settlement.count.mockResolvedValue(45);

      const result = await service.getSettlements({
        page: 3,
        pageSize: 10,
      } as any);

      expect(result.meta).toEqual({
        total: 45,
        page: 3,
        pageSize: 10,
        totalPages: 5,
      });
    });

    it("필터 없이 호출하면 기본 페이징으로 전체 조회한다", async () => {
      mockPrisma.settlement.findMany.mockResolvedValue([]);
      mockPrisma.settlement.count.mockResolvedValue(0);

      const result = await service.getSettlements({} as any);

      expect(result.meta.page).toBe(1);
      expect(result.meta.pageSize).toBe(20);
    });
  });

  // ==================== getMySettlements ====================

  describe("getMySettlements", () => {
    it("코치가 소속된 클럽의 정산만 반환한다", async () => {
      mockPrisma.clubMember.findMany.mockResolvedValue([
        { teamId: "club-1" },
        { teamId: "club-2" },
      ]);
      mockPrisma.settlement.findMany.mockResolvedValue([]);
      mockPrisma.settlement.count.mockResolvedValue(0);

      await service.getMySettlements("coach-1", {} as any);

      const callArgs = mockPrisma.settlement.findMany.mock.calls[0][0];
      expect(callArgs.where.teamId).toEqual({ in: ["club-1", "club-2"] });
    });

    it("소속 클럽이 없으면 빈 데이터를 반환한다", async () => {
      mockPrisma.clubMember.findMany.mockResolvedValue([]);

      const result = await service.getMySettlements("coach-1", {} as any);

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
      expect(mockPrisma.settlement.findMany).not.toHaveBeenCalled();
    });
  });

  // ==================== approveSettlement ====================

  describe("approveSettlement", () => {
    it("정상적으로 정산을 승인한다", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue({
        id: "s-1",
        managerApprovalStatus: "PENDING",
        status: "PENDING",
      });
      mockPrisma.settlement.update.mockResolvedValue({
        id: "s-1",
        managerApprovalStatus: "APPROVED",
        managerApprovalAt: new Date(),
        managerId: "manager-1",
      });

      const result = await service.approveSettlement("s-1", "manager-1");

      expect(result.managerApprovalStatus).toBe("APPROVED");
      expect(result.managerId).toBe("manager-1");
    });

    it("이미 승인된 정산이면 BadRequestException", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue({
        id: "s-1",
        managerApprovalStatus: "APPROVED",
        status: "APPROVED",
      });

      await expect(
        service.approveSettlement("s-1", "manager-1"),
      ).rejects.toThrow(BadRequestException);
    });

    it("존재하지 않는 정산이면 NotFoundException", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue(null);

      await expect(
        service.approveSettlement("not-exist", "manager-1"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== rejectSettlement ====================

  describe("rejectSettlement", () => {
    it("정상적으로 정산을 반려하고 사유를 반환한다", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue({
        id: "s-1",
        managerApprovalStatus: "PENDING",
        status: "PENDING",
      });
      mockPrisma.settlement.update.mockResolvedValue({
        id: "s-1",
        managerApprovalStatus: "REJECTED",
        managerApprovalAt: new Date(),
        managerId: "manager-1",
      });

      const result = await service.rejectSettlement(
        "s-1",
        "manager-1",
        "금액 오류",
      );

      expect(result.managerApprovalStatus).toBe("REJECTED");
      expect(result.reason).toBe("금액 오류");
    });

    it("사유 없이 반려해도 null로 처리된다", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue({
        id: "s-1",
        managerApprovalStatus: "PENDING",
        status: "PENDING",
      });
      mockPrisma.settlement.update.mockResolvedValue({
        id: "s-1",
        managerApprovalStatus: "REJECTED",
        managerApprovalAt: new Date(),
        managerId: "manager-1",
      });

      const result = await service.rejectSettlement("s-1", "manager-1");

      expect(result.reason).toBeNull();
    });

    it("이미 반려된 정산이면 BadRequestException", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue({
        id: "s-1",
        managerApprovalStatus: "REJECTED",
        status: "REJECTED",
      });

      await expect(
        service.rejectSettlement("s-1", "manager-1", "중복 반려"),
      ).rejects.toThrow(BadRequestException);
    });

    it("존재하지 않는 정산이면 NotFoundException", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue(null);

      await expect(
        service.rejectSettlement("not-exist", "manager-1"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== adminApproveSettlement ====================

  describe("adminApproveSettlement", () => {
    it("pending 상태 정산을 approved로 전환하고 managerApprovalStatus를 APPROVED로 설정한다", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue({
        id: "s-1",
        status: "pending",
      });
      mockPrisma.settlement.update.mockResolvedValue({
        id: "s-1",
        status: "approved",
        managerApprovalStatus: "APPROVED",
        managerApprovalAt: new Date(),
        managerId: "admin-1",
      });

      const result = await service.adminApproveSettlement("s-1", "admin-1");

      expect(result.status).toBe("approved");
      expect(result.managerApprovalStatus).toBe("APPROVED");
      expect(result.managerId).toBe("admin-1");
      const updateArgs = mockPrisma.settlement.update.mock.calls[0][0];
      expect(updateArgs.data.status).toBe("approved");
    });

    it("pending이 아닌 정산은 BadRequestException을 발생시킨다", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue({
        id: "s-1",
        status: "approved",
      });

      await expect(
        service.adminApproveSettlement("s-1", "admin-1"),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== payoutSettlement ====================

  describe("payoutSettlement", () => {
    it("approved 상태 정산을 paid로 전환하고 SettlementTransaction(type=payout)을 생성한다", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue({
        id: "s-1",
        status: "approved",
        netAmount: 500000,
      });
      mockPrisma.settlement.update.mockResolvedValue({
        id: "s-1",
        status: "paid",
        completedAt: new Date(),
        netAmount: 500000,
      });
      mockPrisma.settlementTransaction.create.mockResolvedValue({});

      const result = await service.payoutSettlement("s-1", "admin-1");

      expect(result.status).toBe("paid");
      expect(result.completedAt).toBeDefined();
      const txCreateArgs =
        mockPrisma.settlementTransaction.create.mock.calls[0][0];
      expect(txCreateArgs.data.transactionType).toBe("payout");
      expect(txCreateArgs.data.amount).toBe(500000);
    });

    it("approved가 아닌 정산은 BadRequestException을 발생시킨다", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue({
        id: "s-1",
        status: "paid",
        netAmount: 500000,
      });

      await expect(service.payoutSettlement("s-1", "admin-1")).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ==================== getSettlementById ====================

  describe("getSettlementById", () => {
    it("존재하는 정산 상세를 반환한다", async () => {
      const mockSettlement = {
        id: "s-1",
        teamId: "club-1",
        settlementMonth: "2026-01",
        totalRevenue: 1000000,
        status: "COMPLETED",
        details: [],
        manager: null,
        team: { id: "club-1", name: "Test Club" },
      };
      mockPrisma.settlement.findUnique.mockResolvedValue(mockSettlement);

      // [2026-06-10 SECURITY] 클럽 스코프 검증 추가 — ADMIN 요청자는 통과.
      const result = await service.getSettlementById("s-1", {
        id: "admin-1",
        userType: "ADMIN",
      });

      expect(result.id).toBe("s-1");
    });

    it("[보안] 타 클럽 코치는 정산 상세 조회 시 ForbiddenException", async () => {
      const mockSettlement = {
        id: "s-1",
        teamId: "club-1",
        details: [],
        manager: null,
        team: { id: "club-1", name: "Test Club" },
      };
      mockPrisma.settlement.findUnique.mockResolvedValue(mockSettlement);
      mockPrisma.team.findFirst.mockResolvedValue(null);
      mockPrisma.teamMember.findFirst.mockResolvedValue(null);

      await expect(
        service.getSettlementById("s-1", {
          id: "other-coach",
          userType: "COACH",
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("존재하지 않는 정산이면 NotFoundException", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue(null);

      await expect(service.getSettlementById("not-exist")).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
