import { Test, TestingModule } from "@nestjs/testing";
import { AppService } from "./app.service";

describe("AppService", () => {
  let service: AppService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AppService],
    }).compile();

    service = module.get<AppService>(AppService);
  });

  describe("getHello", () => {
    it("should return welcome message", () => {
      const result = service.getHello();

      expect(result.message).toBe("Welcome to TEAMPLUS API");
      expect(result.version).toBe("1.0.0");
      expect(result.docs).toBe("/api/docs");
    });

    it("should include environment", () => {
      const result = service.getHello();

      expect(result.environment).toBeDefined();
    });

    it("should have correct response structure", () => {
      const result = service.getHello();

      expect(result).toHaveProperty("message");
      expect(result).toHaveProperty("version");
      expect(result).toHaveProperty("docs");
      expect(result).toHaveProperty("environment");
    });
  });

  describe("getHealth", () => {
    it("should return ok status", () => {
      const result = service.getHealth();

      expect(result.status).toBe("ok");
    });

    it("should return timestamp", () => {
      const result = service.getHealth();

      expect(result.timestamp).toBeDefined();
      expect(typeof result.timestamp).toBe("string");
    });

    it("should return uptime as number", () => {
      const result = service.getHealth();

      expect(result.uptime).toBeDefined();
      expect(typeof result.uptime).toBe("number");
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });

    it("should include environment", () => {
      const result = service.getHealth();

      expect(result.environment).toBeDefined();
    });

    it("should have correct response structure", () => {
      const result = service.getHealth();

      expect(result).toHaveProperty("status");
      expect(result).toHaveProperty("timestamp");
      expect(result).toHaveProperty("uptime");
      expect(result).toHaveProperty("environment");
    });

    it("should return valid ISO timestamp", () => {
      const result = service.getHealth();
      const date = new Date(result.timestamp);

      expect(date instanceof Date).toBe(true);
      expect(isNaN(date.getTime())).toBe(false);
    });
  });
});
