import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { UserSafetyService } from "./user-safety.service";
import { PrismaService } from "@/prisma/prisma.service";

describe("UserSafetyService", () => {
  let service: UserSafetyService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
    userBlock: {
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
    userReport: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserSafetyService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<UserSafetyService>(UserSafetyService);
    jest.clearAllMocks();
  });

  // ── blockUser ─────────────────────────────────────────────────────────────

  describe("blockUser", () => {
    it("자기 자신을 차단하면 BadRequestException을 던진다", async () => {
      await expect(service.blockUser("user-1", "user-1")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("대상 사용자가 없으면 NotFoundException을 던진다", async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      await expect(service.blockUser("user-1", "user-2")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("정상 차단 시 생성된 block 정보를 반환한다", async () => {
      const now = new Date();
      mockPrismaService.user.findUnique.mockResolvedValue({ id: "user-2" });
      mockPrismaService.userBlock.count.mockResolvedValue(0);
      mockPrismaService.userBlock.create.mockResolvedValue({
        id: "block-1",
        blockedId: "user-2",
        createdAt: now,
      });

      const result = await service.blockUser("user-1", "user-2");

      expect(result.success).toBe(true);
      expect(result.blockedId).toBe("user-2");
      expect(mockPrismaService.userBlock.create).toHaveBeenCalledTimes(1);
    });

    it("이미 차단된 사용자면 ConflictException을 던진다", async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ id: "user-2" });
      mockPrismaService.userBlock.count.mockResolvedValue(0);
      mockPrismaService.userBlock.create.mockRejectedValue({ code: "P2002" });

      await expect(service.blockUser("user-1", "user-2")).rejects.toThrow(
        ConflictException,
      );
    });

    it("차단 수가 500명에 도달하면 BadRequestException을 던진다", async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ id: "user-2" });
      mockPrismaService.userBlock.count.mockResolvedValue(500);

      await expect(service.blockUser("user-1", "user-2")).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ── unblockUser ───────────────────────────────────────────────────────────

  describe("unblockUser", () => {
    it("차단 목록에 없는 사용자 차단 해제 시 NotFoundException을 던진다", async () => {
      mockPrismaService.userBlock.findUnique.mockResolvedValue(null);

      await expect(service.unblockUser("user-1", "user-2")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("정상 차단 해제 시 success:true를 반환한다", async () => {
      mockPrismaService.userBlock.findUnique.mockResolvedValue({
        id: "block-1",
      });
      mockPrismaService.userBlock.delete.mockResolvedValue({});

      const result = await service.unblockUser("user-1", "user-2");

      expect(result.success).toBe(true);
      expect(mockPrismaService.userBlock.delete).toHaveBeenCalledWith({
        where: { id: "block-1" },
      });
    });
  });

  // ── reportUser ────────────────────────────────────────────────────────────

  describe("reportUser", () => {
    const reportData = {
      reportedId: "user-2",
      targetType: "community_post",
      targetId: "post-1",
      category: "spam",
      description: "스팸 게시물",
    };

    it("24시간 내 중복 신고 시 BadRequestException을 던진다", async () => {
      mockPrismaService.userReport.findFirst.mockResolvedValue({
        id: "report-1",
      });

      await expect(service.reportUser("user-1", reportData)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("자기 자신을 신고하면 BadRequestException을 던진다", async () => {
      await expect(
        service.reportUser("user-1", { ...reportData, reportedId: "user-1" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("정상 신고 시 저장 후 success:true를 반환한다", async () => {
      const now = new Date();
      mockPrismaService.userReport.findFirst.mockResolvedValue(null);
      mockPrismaService.userReport.create.mockResolvedValue({
        id: "report-new",
        status: "pending",
        createdAt: now,
      });

      const result = await service.reportUser("user-1", reportData);

      expect(result.success).toBe(true);
      expect(result.status).toBe("pending");
      expect(mockPrismaService.userReport.create).toHaveBeenCalledTimes(1);
    });
  });

  // ── getBlockList ──────────────────────────────────────────────────────────

  describe("getBlockList", () => {
    it("pagination 결과를 올바른 구조로 반환한다", async () => {
      const now = new Date();
      mockPrismaService.userBlock.findMany.mockResolvedValue([
        {
          id: "block-1",
          createdAt: now,
          blocked: {
            id: "user-2",
            firstName: "길동",
            lastName: "홍",
            userType: "PARENT",
          },
        },
      ]);
      mockPrismaService.userBlock.count.mockResolvedValue(1);

      const result = await service.getBlockList("user-1", 1, 20);

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(result.items[0].name).toBe("홍길동");
    });

    it("빈 차단 목록이면 items=[] 를 반환한다", async () => {
      mockPrismaService.userBlock.findMany.mockResolvedValue([]);
      mockPrismaService.userBlock.count.mockResolvedValue(0);

      const result = await service.getBlockList("user-1");

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });
});
