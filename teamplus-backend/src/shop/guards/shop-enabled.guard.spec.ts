import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import {
  ShopEnabledGuard,
  SHOP_DISABLED_ERROR_CODE,
  SHOP_ENABLED_ENV,
  isShopEnabled,
} from "./shop-enabled.guard";
import { ShopController } from "../shop.controller";
import { ShopService } from "../shop.service";

/**
 * 쇼핑몰 피처 플래그 차단 검증 (2026-07-30 · 전자상거래법 리스크 차단).
 *
 * 검증 포인트:
 *   1. `isShopEnabled()` 는 fail-closed — 미설정/빈값/오타는 모두 차단.
 *   2. `ShopController` 클래스 레벨에 `ShopEnabledGuard` 가 실제로 부착되어 있다.
 *   3. 플래그 OFF 시 `@Public()` 상품 목록도 503 `SHOP_DISABLED` 로 차단된다.
 *   4. 플래그 OFF 시 인증 필요 라우트도 인증 판정 이전에 503 으로 차단된다.
 *   5. 플래그 ON 시 정상 통과한다 (게이트가 영구 차단이 아님을 보장).
 */
describe("ShopEnabledGuard", () => {
  const originalEnv = process.env[SHOP_ENABLED_ENV];

  afterAll(() => {
    if (originalEnv === undefined) {
      delete process.env[SHOP_ENABLED_ENV];
    } else {
      process.env[SHOP_ENABLED_ENV] = originalEnv;
    }
  });

  describe("isShopEnabled (fail-closed)", () => {
    it.each([
      [undefined, false],
      ["", false],
      ["false", false],
      ["0", false],
      ["yes", false],
      ["ture", false], // 오타도 차단으로 수렴
      ["true", true],
      ["TRUE", true],
      ["  true  ", true],
    ])("SHOP_ENABLED=%p → %p", (value, expected) => {
      if (value === undefined) {
        delete process.env[SHOP_ENABLED_ENV];
      } else {
        process.env[SHOP_ENABLED_ENV] = value;
      }
      expect(isShopEnabled()).toBe(expected);
    });
  });

  it("ShopController 클래스 레벨에 ShopEnabledGuard 가 부착되어 있다", () => {
    const guards = Reflect.getMetadata("__guards__", ShopController) as
      | unknown[]
      | undefined;
    expect(guards).toBeDefined();
    expect(guards).toContain(ShopEnabledGuard);
  });

  describe("HTTP 경로 차단", () => {
    let app: INestApplication;

    const shopServiceMock = {
      getProducts: jest.fn().mockResolvedValue({ data: [], pagination: {} }),
      getCategories: jest.fn().mockResolvedValue([]),
      createOrder: jest.fn().mockResolvedValue({ id: "order-1" }),
    };

    beforeAll(async () => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        controllers: [ShopController],
        providers: [
          ShopEnabledGuard,
          { provide: ShopService, useValue: shopServiceMock },
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app?.close();
    });

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it("플래그 OFF — @Public() 상품 목록이 503 SHOP_DISABLED 로 차단된다", async () => {
      delete process.env[SHOP_ENABLED_ENV];

      const res = await request(app.getHttpServer()).get(
        "/api/v1/shop/products",
      );

      expect(res.status).toBe(503);
      expect(res.body.error).toBe(SHOP_DISABLED_ERROR_CODE);
      expect(res.body.message).toContain("준비 중");
      expect(shopServiceMock.getProducts).not.toHaveBeenCalled();
    });

    it("플래그 OFF — @Public() 카테고리 목록도 차단된다", async () => {
      delete process.env[SHOP_ENABLED_ENV];

      const res = await request(app.getHttpServer()).get(
        "/api/v1/shop/categories",
      );

      expect(res.status).toBe(503);
      expect(shopServiceMock.getCategories).not.toHaveBeenCalled();
    });

    it("플래그 OFF — 인증 필요 주문 생성이 인증 판정 이전에 503 으로 차단된다", async () => {
      delete process.env[SHOP_ENABLED_ENV];

      const res = await request(app.getHttpServer())
        .post("/api/v1/shop/orders")
        .send({ items: [] });

      // 401/403 이 아닌 503 — 컨트롤러 레벨 가드가 메서드 레벨 가드보다 먼저 실행됨
      expect(res.status).toBe(503);
      expect(res.body.error).toBe(SHOP_DISABLED_ERROR_CODE);
      expect(shopServiceMock.createOrder).not.toHaveBeenCalled();
    });

    it("플래그 ON — @Public() 상품 목록이 정상 통과한다", async () => {
      process.env[SHOP_ENABLED_ENV] = "true";

      const res = await request(app.getHttpServer()).get(
        "/api/v1/shop/products",
      );

      expect(res.status).toBe(200);
      expect(shopServiceMock.getProducts).toHaveBeenCalledTimes(1);
    });
  });
});
