import { Test, TestingModule } from "@nestjs/testing";
import { MainPopupsService } from "./main-popups.service";
import { PrismaService } from "@/prisma/prisma.service";
import { NotFoundException } from "@nestjs/common";

describe("MainPopupsService", () => {
  let service: MainPopupsService;

  const mockPrisma = {
    appBanner: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MainPopupsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<MainPopupsService>(MainPopupsService);
    jest.clearAllMocks();
  });

  describe("getActive", () => {
    const now = new Date();
    const mockPopups = [
      {
        id: "1",
        title: "팝업 1",
        isActive: true,
        sortOrder: 1,
        startAt: new Date(now.getTime() - 86400000),
        endAt: new Date(now.getTime() + 86400000),
        targetRolesJson: ["PARENT", "COACH"],
        imageUrl: "https://example.com/img.jpg",
        linkUrl: null,
        linkType: "NONE",
        createdAt: now,
      },
      {
        id: "2",
        title: "팝업 2",
        isActive: true,
        sortOrder: 2,
        startAt: new Date(now.getTime() - 86400000),
        endAt: new Date(now.getTime() + 86400000),
        targetRolesJson: ["ADMIN"],
        imageUrl: "https://example.com/img2.jpg",
        linkUrl: null,
        linkType: "NONE",
        createdAt: now,
      },
    ];

    it("활성 팝업 전체를 반환해야 한다 (userType 미지정)", async () => {
      mockPrisma.appBanner.findMany.mockResolvedValue(mockPopups);

      const result = await service.getActive();

      expect(result).toHaveLength(2);
      expect(mockPrisma.appBanner.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true }),
          orderBy: { sortOrder: "asc" },
        }),
      );
    });

    it("userType으로 역할 필터링해야 한다", async () => {
      mockPrisma.appBanner.findMany.mockResolvedValue(mockPopups);

      const result = await service.getActive("PARENT");

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
    });

    it("매칭되는 팝업이 없으면 빈 배열을 반환해야 한다", async () => {
      mockPrisma.appBanner.findMany.mockResolvedValue([]);

      const result = await service.getActive("TEEN");

      expect(result).toHaveLength(0);
    });
  });

  describe("findAll", () => {
    it("상태 필터로 전체 팝업을 조회해야 한다", async () => {
      mockPrisma.appBanner.findMany.mockResolvedValue([]);

      await service.findAll(true);

      expect(mockPrisma.appBanner.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true },
        }),
      );
    });
  });

  describe("toggle", () => {
    it("활성 상태를 토글해야 한다", async () => {
      mockPrisma.appBanner.findUnique.mockResolvedValue({
        id: "1",
        isActive: true,
      });
      mockPrisma.appBanner.update.mockResolvedValue({
        id: "1",
        isActive: false,
      });

      await service.toggle("1", false);

      expect(mockPrisma.appBanner.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "1" },
          data: { isActive: false },
        }),
      );
    });

    it("미존재 ID면 404를 던져야 한다", async () => {
      mockPrisma.appBanner.findUnique.mockResolvedValue(null);

      await expect(service.toggle("non-existent", true)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("remove", () => {
    it("정상적으로 삭제해야 한다", async () => {
      mockPrisma.appBanner.findUnique.mockResolvedValue({ id: "1" });
      mockPrisma.appBanner.delete.mockResolvedValue({ id: "1" });

      await service.remove("1");

      expect(mockPrisma.appBanner.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "1" } }),
      );
    });

    it("미존재 ID면 404를 던져야 한다", async () => {
      mockPrisma.appBanner.findUnique.mockResolvedValue(null);

      await expect(service.remove("non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
