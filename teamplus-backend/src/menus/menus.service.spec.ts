import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { UserType } from "@prisma/client";
import { MenusService } from "./menus.service";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { CreateAppMenuDto } from "./dto/app-menu.dto";

/**
 * MenusService 유닛 테스트
 *
 * 핵심 시나리오:
 *  1. getMenusByUserType: 정상 경로 (appMenu.findMany 호출)
 *  2. getMenusByUserType: enum 불일치 폴백 경로 ($queryRaw + Prisma.sql)
 *  3. getMenuById: 존재하지 않으면 NotFoundException
 *  4. syncMenus: 전체 교체 (기존 deleteMany → create 반복)
 *  5. 회귀 방어: PARENT "자녀 관리" 그룹의 서브 항목이 "자녀 관리" 하나만 남는지
 *     (seed.ts / migrate-remove-child-add-menu.ts 정합성 보장)
 */
describe("MenusService", () => {
  let service: MenusService;

  const mockPrismaService = {
    appMenu: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
  };

  // RedisService Mock — MenusService 생성자 의존성 충족 (TestingModule DI 해결)
  const mockRedisService = {
    get: jest.fn().mockResolvedValue(null), // 기본 캐시 미스
    set: jest.fn().mockResolvedValue("OK"),
    del: jest.fn().mockResolvedValue(1),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MenusService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<MenusService>(MenusService);
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // ==================== getMenusByUserType ====================

  describe("getMenusByUserType", () => {
    it("정상 경로 — userType 으로 parentId:null 그룹을 조회하고 children 2단계를 include 한다", async () => {
      const fakeMenus = [{ id: "m-1", label: "자녀 관리", children: [] }];
      mockPrismaService.appMenu.findMany.mockResolvedValue(fakeMenus);

      const result = await service.getMenusByUserType(UserType.PARENT);

      expect(result).toBe(fakeMenus);
      expect(mockPrismaService.appMenu.findMany).toHaveBeenCalledTimes(1);

      const callArg = mockPrismaService.appMenu.findMany.mock.calls[0][0];
      expect(callArg.where.userType).toBe(UserType.PARENT);
      expect(callArg.where.parentId).toBeNull();
      expect(callArg.orderBy).toEqual({ order: "asc" });
      expect(callArg.include.children.include.children).toBeDefined();
    });

    it("Prisma enum 불일치로 실패하면 $queryRaw(Prisma.sql) 폴백 경로로 동작한다", async () => {
      mockPrismaService.appMenu.findMany.mockRejectedValueOnce(
        new Error("enum mismatch"),
      );

      // 단일 쿼리로 전체 메뉴 반환 (2026-04-20 C2 개선: N+1 회피 + Prisma.sql 매개변수 바인딩)
      mockPrismaService.$queryRaw.mockResolvedValueOnce([
        {
          id: "parent-1",
          label: "자녀 관리",
          parent_id: null,
          user_type: "PARENT",
          order: 1,
        },
        {
          id: "child-1",
          label: "자녀 관리",
          parent_id: "parent-1",
          user_type: "PARENT",
          order: 1,
        },
      ]);

      const result = await service.getMenusByUserType(UserType.PARENT);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("parent-1");
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].id).toBe("child-1");
      expect(result[0].children[0].children).toEqual([]);
      expect(mockPrismaService.$queryRaw).toHaveBeenCalledTimes(1);
    });
  });

  // ==================== getMenuById ====================

  describe("getMenuById", () => {
    it("메뉴가 존재하면 반환한다", async () => {
      mockPrismaService.appMenu.findUnique.mockResolvedValue({
        id: "m-1",
        label: "자녀 관리",
        children: [],
      });

      const result = await service.getMenuById("m-1");

      expect(result.id).toBe("m-1");
      expect(mockPrismaService.appMenu.findUnique).toHaveBeenCalledWith({
        where: { id: "m-1" },
        include: { children: true },
      });
    });

    it("메뉴가 없으면 NotFoundException 을 던진다", async () => {
      mockPrismaService.appMenu.findUnique.mockResolvedValue(null);

      await expect(service.getMenuById("missing")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ==================== syncMenus ====================

  describe("syncMenus", () => {
    it("트랜잭션 내부에서 기존 메뉴 deleteMany 후 createMany 로 벌크 생성한다", async () => {
      // $transaction 모킹: 콜백을 즉시 실행하되 tx 도 mockPrismaService.appMenu 를 공유하도록 구성
      mockPrismaService.$transaction.mockImplementation(
        async (cb: (tx: typeof mockPrismaService) => unknown) =>
          cb(mockPrismaService),
      );

      mockPrismaService.appMenu.deleteMany.mockResolvedValue({ count: 3 });
      mockPrismaService.appMenu.createMany.mockResolvedValue({ count: 2 });
      mockPrismaService.appMenu.findMany.mockResolvedValueOnce([
        { id: "new-1", label: "자녀 관리", order: 1 },
        { id: "new-2", label: "수업 목록", order: 2 },
      ]);

      // syncMenus 내부에서 userType 이 강제로 덮어쓰여지지만,
      // DTO 타입을 만족시키기 위해 userType 필드를 포함시킨다.
      const inputMenus: CreateAppMenuDto[] = [
        {
          userType: UserType.PARENT,
          label: "자녀 관리",
          icon: "face",
          href: "/children",
          order: 1,
        },
        {
          userType: UserType.PARENT,
          label: "수업 목록",
          icon: "list_alt",
          href: "/classes",
          order: 2,
        },
      ];

      const result = await service.syncMenus(UserType.PARENT, inputMenus);

      expect(mockPrismaService.appMenu.deleteMany).toHaveBeenCalledWith({
        where: { userType: UserType.PARENT },
      });
      expect(mockPrismaService.appMenu.createMany).toHaveBeenCalledTimes(1);
      const createManyArg =
        mockPrismaService.appMenu.createMany.mock.calls[0][0];
      expect(createManyArg.data).toHaveLength(2);
      expect(createManyArg.data[0].userType).toBe(UserType.PARENT);
      expect(result).toHaveLength(2);
    });
  });

  // ==================== 회귀: 자녀 관리 서브는 1개여야 한다 ====================

  describe("PARENT '자녀 관리' 그룹 회귀 방어", () => {
    it("PARENT 그룹 조회 결과에서 '자녀 관리' 대메뉴의 children 길이는 1 이어야 한다", async () => {
      // seed.ts / migrate-remove-child-add-menu.ts 정책 — 서브는 '자녀 관리' 하나만
      mockPrismaService.appMenu.findMany.mockResolvedValue([
        {
          id: "parent-group-1",
          userType: UserType.PARENT,
          label: "자녀 관리",
          parentId: null,
          children: [
            {
              id: "child-1",
              label: "자녀 관리",
              href: "/children",
              icon: "face",
              order: 1,
              children: [],
            },
          ],
        },
      ]);

      const result = await service.getMenusByUserType(UserType.PARENT);
      const childManageGroup = result.find(
        (m: { label: string }) => m.label === "자녀 관리",
      );

      expect(childManageGroup).toBeDefined();
      expect(childManageGroup.children).toHaveLength(1);
      expect(childManageGroup.children[0].href).toBe("/children");
      expect(childManageGroup.children[0].label).toBe("자녀 관리");

      // '자녀 등록' 이 children 안에 있으면 안 된다
      const hasChildAdd = childManageGroup.children.some(
        (c: { href: string }) => c.href === "/children/add",
      );
      expect(hasChildAdd).toBe(false);
    });
  });
});
