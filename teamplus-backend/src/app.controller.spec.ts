import { Test, TestingModule } from "@nestjs/testing";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";

describe("AppController", () => {
  let controller: AppController;

  const mockAppService = {
    getHealth: jest.fn(),
    getHello: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: mockAppService,
        },
      ],
    }).compile();

    controller = module.get<AppController>(AppController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /health", () => {
    it("should return health check response", async () => {
      const healthResponse = {
        status: "ok",
        timestamp: "2026-01-04T10:00:00Z",
        uptime: 1234.56,
        environment: "development",
      };
      mockAppService.getHealth.mockReturnValue(healthResponse);

      const result = controller.getHealth();

      expect(result.status).toBe("ok");
      expect(result.timestamp).toBeDefined();
      expect(result.uptime).toBeDefined();
      expect(mockAppService.getHealth).toHaveBeenCalled();
    });

    it("should include uptime in response", () => {
      const healthResponse = {
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime: 100.5,
        environment: "development",
      };
      mockAppService.getHealth.mockReturnValue(healthResponse);

      const result = controller.getHealth();

      expect(typeof result.uptime).toBe("number");
    });
  });

  describe("GET /", () => {
    it("should return welcome message", async () => {
      const welcomeResponse = {
        message: "Welcome to TEAMPLUS API",
        version: "1.0.0",
        docs: "/api/docs",
        environment: "development",
      };
      mockAppService.getHello.mockReturnValue(welcomeResponse);

      const result = controller.getHello();

      expect(result.message).toBe("Welcome to TEAMPLUS API");
      expect(result.version).toBe("1.0.0");
      expect(result.docs).toBe("/api/docs");
      expect(mockAppService.getHello).toHaveBeenCalled();
    });

    it("should include docs URL in response", () => {
      const welcomeResponse = {
        message: "Welcome to TEAMPLUS API",
        version: "1.0.0",
        docs: "/api/docs",
        environment: "development",
      };
      mockAppService.getHello.mockReturnValue(welcomeResponse);

      const result = controller.getHello();

      expect(result.docs).toBeDefined();
      expect(typeof result.docs).toBe("string");
    });
  });
});
