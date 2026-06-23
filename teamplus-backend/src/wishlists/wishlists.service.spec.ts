import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { WishlistsService } from "./wishlists.service";
import { PrismaService } from "@/prisma/prisma.service";
import { WishlistTargetType } from "./dto/add-wishlist.dto";

describe("WishlistsService", () => {
  let service: WishlistsService;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockPrisma: any = {
    wishlist: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    shopWishlist: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    shopProduct: { count: jest.fn() },
    team: { count: jest.fn() },
    academy: { count: jest.fn() },
    user: { count: jest.fn(), findMany: jest.fn() },
    class: { count: jest.fn() },
    tournament: { count: jest.fn() },
    venue: { count: jest.fn() },
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
        WishlistsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<WishlistsService>(WishlistsService);
    jest.clearAllMocks();
    setupTransaction();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // ==================== addToWishlist ====================

  describe("addToWishlist", () => {
    it("정상적으로 찜을 추가한다 (CLUB 타입)", async () => {
      mockPrisma.team.count.mockResolvedValue(1);
      mockPrisma.wishlist.upsert.mockResolvedValue({
        id: "w-1",
        userId: "user-1",
        targetType: WishlistTargetType.CLUB,
        targetId: "club-1",
      });

      const result = await service.addToWishlist("user-1", {
        targetType: WishlistTargetType.CLUB,
        targetId: "club-1",
      });

      expect(result.id).toBe("w-1");
      expect(mockPrisma.wishlist.upsert).toHaveBeenCalled();
      // CLUB 타입은 ShopWishlist dual-write 하지 않음
      expect(mockPrisma.shopWishlist.upsert).not.toHaveBeenCalled();
    });

    it("PRODUCT 타입은 ShopWishlist dual-write를 수행한다", async () => {
      mockPrisma.shopProduct.count.mockResolvedValue(1);
      mockPrisma.wishlist.upsert.mockResolvedValue({
        id: "w-1",
        userId: "user-1",
        targetType: WishlistTargetType.PRODUCT,
        targetId: "prod-1",
      });
      mockPrisma.shopWishlist.upsert.mockResolvedValue({});

      await service.addToWishlist("user-1", {
        targetType: WishlistTargetType.PRODUCT,
        targetId: "prod-1",
      });

      expect(mockPrisma.shopWishlist.upsert).toHaveBeenCalled();
    });

    it("중복 추가 시 upsert로 멱등성을 보장한다", async () => {
      mockPrisma.team.count.mockResolvedValue(1);
      mockPrisma.wishlist.upsert.mockResolvedValue({
        id: "w-1",
        userId: "user-1",
        targetType: WishlistTargetType.CLUB,
        targetId: "club-1",
      });

      const result = await service.addToWishlist("user-1", {
        targetType: WishlistTargetType.CLUB,
        targetId: "club-1",
      });

      expect(result).toBeDefined();
      expect(mockPrisma.wishlist.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: {},
        }),
      );
    });

    it("존재하지 않는 대상이면 BadRequestException", async () => {
      mockPrisma.team.count.mockResolvedValue(0);

      await expect(
        service.addToWishlist("user-1", {
          targetType: WishlistTargetType.CLUB,
          targetId: "not-exist",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("OTHER 타입은 대상 검증을 건너뛴다", async () => {
      mockPrisma.wishlist.upsert.mockResolvedValue({
        id: "w-1",
        userId: "user-1",
        targetType: WishlistTargetType.OTHER,
        targetId: "external-1",
      });

      const result = await service.addToWishlist("user-1", {
        targetType: WishlistTargetType.OTHER,
        targetId: "external-1",
      });

      expect(result).toBeDefined();
    });
  });

  // ==================== removeFromWishlist ====================

  describe("removeFromWishlist", () => {
    it("정상적으로 찜을 삭제한다", async () => {
      mockPrisma.wishlist.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.removeFromWishlist(
        "user-1",
        WishlistTargetType.CLUB,
        "club-1",
      );

      expect(result.success).toBe(true);
    });

    it("PRODUCT 타입은 ShopWishlist도 함께 삭제한다", async () => {
      mockPrisma.wishlist.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.shopWishlist.deleteMany.mockResolvedValue({ count: 1 });

      await service.removeFromWishlist(
        "user-1",
        WishlistTargetType.PRODUCT,
        "prod-1",
      );

      expect(mockPrisma.shopWishlist.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user-1", productId: "prod-1" },
        }),
      );
    });

    it("존재하지 않는 찜 항목이면 NotFoundException", async () => {
      mockPrisma.wishlist.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.removeFromWishlist(
          "user-1",
          WishlistTargetType.CLUB,
          "not-exist",
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== getMyWishlists ====================

  describe("getMyWishlists", () => {
    it("타입 필터 없이 전체 찜 목록을 반환한다", async () => {
      mockPrisma.wishlist.findMany.mockResolvedValue([]);
      mockPrisma.wishlist.count.mockResolvedValue(0);

      const result = await service.getMyWishlists("user-1", {} as any);

      expect(result.items).toEqual([]);
      expect(result.pagination.total).toBe(0);
    });

    it("타입 필터를 적용하면 해당 타입만 조회한다", async () => {
      mockPrisma.wishlist.findMany.mockResolvedValue([]);
      mockPrisma.wishlist.count.mockResolvedValue(0);

      await service.getMyWishlists("user-1", {
        type: WishlistTargetType.CLUB,
      } as any);

      const callArgs = mockPrisma.wishlist.findMany.mock.calls[0][0];
      expect(callArgs.where.targetType).toBe(WishlistTargetType.CLUB);
    });

    it("삭제된 대상은 target: null로 표시한다", async () => {
      mockPrisma.wishlist.findMany.mockResolvedValue([
        {
          id: "w-1",
          userId: "user-1",
          targetType: WishlistTargetType.CLUB,
          targetId: "deleted-club",
          createdAt: new Date(),
        },
      ]);
      mockPrisma.wishlist.count.mockResolvedValue(1);
      // enrichment 시 해당 club이 존재하지 않으므로 빈 결과
      mockPrisma.team.findMany = jest.fn().mockResolvedValue([]);

      const result = await service.getMyWishlists("user-1", {} as any);

      expect(result.items[0].target).toBeNull();
    });
  });

  // ==================== isWishlisted ====================

  describe("isWishlisted", () => {
    it("찜한 상태면 true를 반환한다", async () => {
      mockPrisma.wishlist.count.mockResolvedValue(1);

      const result = await service.isWishlisted(
        "user-1",
        WishlistTargetType.CLUB,
        "club-1",
      );

      expect(result.wishlisted).toBe(true);
    });

    it("찜하지 않은 상태면 false를 반환한다", async () => {
      mockPrisma.wishlist.count.mockResolvedValue(0);

      const result = await service.isWishlisted(
        "user-1",
        WishlistTargetType.CLUB,
        "club-1",
      );

      expect(result.wishlisted).toBe(false);
    });
  });
});
