import { Test, TestingModule } from "@nestjs/testing";
import { ShopService } from "./shop.service";
import { PrismaService } from "@/prisma/prisma.service";
import { ViewCounterService } from "@/common/view-counter/view-counter.service";

/**
 * Phase C-D (2026-05-20) — alias dual emit 완전 제거 후 canonical only spec.
 *
 * 이력:
 *   - T3 라운드 2: `depth`/`sortOrder` dual emit 도입.
 *   - Phase 6: admin `c.level`/`c.displayOrder` 마이그레이션.
 *   - Phase C-A/B/C: DTO deprecated 마크 + 요청 displayOrder 추가.
 *   - Phase C-D: alias 매퍼/DTO/요청 키 완전 제거 — canonical only.
 *
 * 검증 포인트:
 *   - mapToCategoryResponse: `level`/`displayOrder`/`description`/`isActive` 노출, alias 부재
 *   - createCategory/updateCategory: `displayOrder` 만 수용 (sortOrder 키 제거됨)
 */

interface CategoryMapperShape {
  mapToCategoryResponse(category: unknown): {
    id: string;
    name: string;
    level: number;
    parentId: string | null;
    displayOrder: number;
    description: string | undefined;
    isActive: boolean;
    children?: Array<{
      level: number;
      displayOrder: number;
      [key: string]: unknown;
    }>;
    // alias 키는 더 이상 존재하지 않음
    depth?: undefined;
    sortOrder?: undefined;
  };
}

interface CategoryServiceShape extends CategoryMapperShape {
  createCategory(data: unknown): Promise<unknown>;
  updateCategory(categoryId: string, data: unknown): Promise<unknown>;
}

describe("ShopService.mapToCategoryResponse — canonical only (Phase C-D)", () => {
  let service: CategoryMapperShape;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShopService,
        { provide: PrismaService, useValue: {} },
        { provide: ViewCounterService, useValue: {} },
      ],
    }).compile();
    service = module.get<ShopService>(
      ShopService,
    ) as unknown as CategoryMapperShape;
  });

  it("level/displayOrder 노출, alias depth/sortOrder 부재", () => {
    const input = {
      id: "cat-1",
      name: "스케이트",
      level: 1,
      parentId: null,
      displayOrder: 0,
      description: "아이스하키 장비",
      isActive: true,
      children: [],
    };
    const result = service.mapToCategoryResponse(input);
    expect(result.level).toBe(1);
    expect(result.displayOrder).toBe(0);
    expect("depth" in result).toBe(false); // alias 제거 확인
    expect("sortOrder" in result).toBe(false); // alias 제거 확인
  });

  it("description null → undefined 정규화", () => {
    const input = {
      id: "cat-3",
      name: "CCM",
      level: 4,
      parentId: "cat-2",
      displayOrder: 0,
      description: null,
      isActive: true,
      children: [],
    };
    const result = service.mapToCategoryResponse(input);
    expect(result.description).toBeUndefined();
  });

  it("isActive SELECT 직접 노출 (true/false 양쪽)", () => {
    const inputInactive = {
      id: "cat-4",
      name: "비활성",
      level: 1,
      parentId: null,
      displayOrder: 0,
      description: "비활성 카테고리",
      isActive: false,
      children: [],
    };
    const result = service.mapToCategoryResponse(inputInactive);
    expect(result.isActive).toBe(false);
    expect(result.description).toBe("비활성 카테고리");
  });

  it("children 빈 배열 → undefined 로 정규화", () => {
    const input = {
      id: "cat-5",
      name: "leaf",
      level: 4,
      parentId: "cat-2",
      displayOrder: 0,
      description: null,
      isActive: true,
      children: [],
    };
    const result = service.mapToCategoryResponse(input);
    expect(result.children).toBeUndefined();
  });

  it("children 재귀 매핑 (canonical level/displayOrder 전파, alias 부재)", () => {
    const input = {
      id: "parent",
      name: "parent",
      level: 1,
      parentId: null,
      displayOrder: 0,
      description: null,
      isActive: true,
      children: [
        {
          id: "child",
          name: "child",
          level: 2,
          parentId: "parent",
          displayOrder: 3,
          description: null,
          isActive: true,
          children: [],
        },
      ],
    };
    const result = service.mapToCategoryResponse(input);
    expect(result.children).toHaveLength(1);
    expect(result.children![0].level).toBe(2);
    expect(result.children![0].displayOrder).toBe(3);
    expect("depth" in result.children![0]).toBe(false);
    expect("sortOrder" in result.children![0]).toBe(false);
  });
});

/**
 * 요청 DTO canonical only (Phase C-D) — `displayOrder` 만 수용.
 *
 * service createCategory / updateCategory 가 `displayOrder` 키만 인식하고
 * Prisma displayOrder 컬럼에 매핑하는지 확인.
 *
 * Prisma mock: shopCategory.create / update / findUnique 만 mocking.
 */
describe("ShopService — 요청 DTO canonical only (Phase C-D)", () => {
  let service: CategoryServiceShape;
  const prismaMock = {
    shopCategory: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    Object.values(prismaMock.shopCategory).forEach((fn) => fn.mockReset());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShopService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ViewCounterService, useValue: {} },
      ],
    }).compile();
    service = module.get<ShopService>(
      ShopService,
    ) as unknown as CategoryServiceShape;
  });

  it("createCategory: displayOrder 입력 시 그대로 사용", async () => {
    prismaMock.shopCategory.create.mockResolvedValueOnce({
      id: "cat-1",
      displayOrder: 7,
    });
    await service.createCategory({ name: "스케이트", displayOrder: 7 });
    expect(prismaMock.shopCategory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ displayOrder: 7 }),
      }),
    );
  });

  it("createCategory: displayOrder 미입력 시 0 으로 기본값", async () => {
    prismaMock.shopCategory.create.mockResolvedValueOnce({
      id: "cat-2",
      displayOrder: 0,
    });
    await service.createCategory({ name: "스틱" });
    expect(prismaMock.shopCategory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ displayOrder: 0 }),
      }),
    );
  });

  it("updateCategory: displayOrder 입력 시 그대로 사용", async () => {
    prismaMock.shopCategory.findUnique.mockResolvedValueOnce({ id: "cat-1" });
    prismaMock.shopCategory.update.mockResolvedValueOnce({
      id: "cat-1",
      displayOrder: 5,
    });
    await service.updateCategory("cat-1", { displayOrder: 5 });
    expect(prismaMock.shopCategory.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cat-1" },
        data: expect.objectContaining({ displayOrder: 5 }),
      }),
    );
  });

  it("updateCategory: displayOrder 미입력 시 undefined (컬럼 미변경)", async () => {
    prismaMock.shopCategory.findUnique.mockResolvedValueOnce({ id: "cat-1" });
    prismaMock.shopCategory.update.mockResolvedValueOnce({ id: "cat-1" });
    await service.updateCategory("cat-1", { name: "갱신" });
    expect(prismaMock.shopCategory.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cat-1" },
        data: expect.objectContaining({ displayOrder: undefined }),
      }),
    );
  });
});
