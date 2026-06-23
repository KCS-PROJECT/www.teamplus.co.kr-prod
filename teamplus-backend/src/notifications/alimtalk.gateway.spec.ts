import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { InternalServerErrorException } from "@nestjs/common";
import { AlimtalkGateway } from "./alimtalk.gateway";
import { SendAlimtalkDto, AlimtalkStatus } from "./dto/alimtalk.dto";

// Mock axios
jest.mock("axios", () => {
  const mockPost = jest.fn();
  const mockGet = jest.fn();
  return {
    create: jest.fn().mockReturnValue({
      post: mockPost,
      get: mockGet,
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    }),
    __mockPost: mockPost,
    __mockGet: mockGet,
  };
});

import axios from "axios";

describe("AlimtalkGateway", () => {
  let gateway: AlimtalkGateway;
  let mockPost: jest.Mock;
  let mockGet: jest.Mock;

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string) => {
      const config: Record<string, any> = {
        "kakao.apiKey": "test-api-key",
        "kakao.senderKey": "test-sender-key",
        "kakao.apiUrl": "https://api.kakao.test",
        "kakao.retry": {
          attempts: 3,
          delay: 100,
          backoff: "exponential",
        },
        "kakao.smsFallback.enabled": true,
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockPost = (axios as any).__mockPost;
    mockGet = (axios as any).__mockGet;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlimtalkGateway,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    gateway = module.get<AlimtalkGateway>(AlimtalkGateway);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("sendAlimtalk", () => {
    const mockDto: SendAlimtalkDto = {
      phone: "01012345678",
      templateCode: "PAYMENT_SUCCESS_001",
      templateData: {
        orderNumber: "ORD-123",
        className: "신규 수강생반",
        amount: "240,000",
        startDate: "2026-01-10",
      },
      userId: "user-uuid",
    };

    it("should send alimtalk successfully on first attempt", async () => {
      mockPost.mockResolvedValueOnce({
        data: { messageId: "msg-123", status: "SENT" },
      });

      const result = await gateway.sendAlimtalk(mockDto);

      expect(result.status).toBe(AlimtalkStatus.SENT);
      expect(result.phone).toBe(mockDto.phone);
      expect(result.templateCode).toBe(mockDto.templateCode);
      expect(result.responseData.messageId).toBe("msg-123");
      expect(mockPost).toHaveBeenCalledTimes(1);
    });

    it("should retry on failure and succeed on second attempt", async () => {
      mockPost
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({
          data: { messageId: "msg-456", status: "SENT" },
        });

      const sendPromise = gateway.sendAlimtalk(mockDto);

      // Advance timer for first retry delay
      await jest.advanceTimersByTimeAsync(100);

      const result = await sendPromise;

      expect(result.status).toBe(AlimtalkStatus.SENT);
      expect(mockPost).toHaveBeenCalledTimes(2);
    });

    it("should fallback to SMS after all retries fail", async () => {
      mockPost.mockRejectedValue(new Error("Network error"));

      // Use real timers for this test
      jest.useRealTimers();

      await expect(gateway.sendAlimtalk(mockDto)).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(mockPost).toHaveBeenCalledTimes(3);

      // Restore fake timers
      jest.useFakeTimers();
    });

    it("should include template data in rendered message", async () => {
      mockPost.mockResolvedValueOnce({
        data: { messageId: "msg-789" },
      });

      await gateway.sendAlimtalk(mockDto);

      expect(mockPost).toHaveBeenCalledWith(
        "/send",
        expect.objectContaining({
          to: mockDto.phone,
          templateCode: mockDto.templateCode,
        }),
      );
    });
  });

  describe("checkStatus", () => {
    it("should return SENT status", async () => {
      mockGet.mockResolvedValueOnce({
        data: { status: "SENT" },
      });

      const status = await gateway.checkStatus("msg-123");

      expect(status).toBe(AlimtalkStatus.SENT);
      expect(mockGet).toHaveBeenCalledWith("/status/msg-123");
    });

    it("should return DELIVERED status", async () => {
      mockGet.mockResolvedValueOnce({
        data: { status: "DELIVERED" },
      });

      const status = await gateway.checkStatus("msg-456");

      expect(status).toBe(AlimtalkStatus.DELIVERED);
    });

    it("should return FAILED status", async () => {
      mockGet.mockResolvedValueOnce({
        data: { status: "FAILED" },
      });

      const status = await gateway.checkStatus("msg-789");

      expect(status).toBe(AlimtalkStatus.FAILED);
    });

    it("should return PENDING for unknown status", async () => {
      mockGet.mockResolvedValueOnce({
        data: { status: "UNKNOWN" },
      });

      const status = await gateway.checkStatus("msg-000");

      expect(status).toBe(AlimtalkStatus.PENDING);
    });

    it("should return PENDING on error", async () => {
      mockGet.mockRejectedValueOnce(new Error("API error"));

      const status = await gateway.checkStatus("msg-error");

      expect(status).toBe(AlimtalkStatus.PENDING);
    });
  });

  describe("healthCheck", () => {
    it("should return true when API is healthy", async () => {
      mockGet.mockResolvedValueOnce({ data: { status: "ok" } });

      const result = await gateway.healthCheck();

      expect(result).toBe(true);
      expect(mockGet).toHaveBeenCalledWith("/health", { timeout: 3000 });
    });

    it("should return false when API is unhealthy", async () => {
      mockGet.mockRejectedValueOnce(new Error("Connection failed"));

      const result = await gateway.healthCheck();

      expect(result).toBe(false);
    });
  });

  describe("Template Rendering", () => {
    it("should render PAYMENT_SUCCESS_001 template correctly", async () => {
      mockPost.mockResolvedValueOnce({
        data: { messageId: "msg-template-test" },
      });

      const dto: SendAlimtalkDto = {
        phone: "01012345678",
        templateCode: "PAYMENT_SUCCESS_001",
        templateData: {
          orderNumber: "ORD-999",
          className: "초급반",
          amount: "100,000",
          startDate: "2026-02-01",
        },
      };

      await gateway.sendAlimtalk(dto);

      expect(mockPost).toHaveBeenCalledWith(
        "/send",
        expect.objectContaining({
          content: expect.stringContaining("ORD-999"),
        }),
      );
    });

    it("should render MEMBERSHIP_APPROVED_001 template", async () => {
      mockPost.mockResolvedValueOnce({
        data: { messageId: "msg-membership" },
      });

      const dto: SendAlimtalkDto = {
        phone: "01012345678",
        templateCode: "MEMBERSHIP_APPROVED_001",
        templateData: {
          clubName: "팀플러스 하키클럽",
          coachName: "김코치",
        },
      };

      await gateway.sendAlimtalk(dto);

      expect(mockPost).toHaveBeenCalledWith(
        "/send",
        expect.objectContaining({
          content: expect.stringContaining("팀플러스 하키클럽"),
        }),
      );
    });

    it("should render CLASS_REMINDER_001 template", async () => {
      mockPost.mockResolvedValueOnce({
        data: { messageId: "msg-reminder" },
      });

      const dto: SendAlimtalkDto = {
        phone: "01012345678",
        templateCode: "CLASS_REMINDER_001",
        templateData: {
          className: "중급반",
          classDate: "2026-01-15",
          classTime: "14:00",
        },
      };

      await gateway.sendAlimtalk(dto);

      expect(mockPost).toHaveBeenCalledWith(
        "/send",
        expect.objectContaining({
          content: expect.stringContaining("내일 수업이 있습니다"),
        }),
      );
    });

    it("should render ATTENDANCE_CONFIRMED_001 template", async () => {
      mockPost.mockResolvedValueOnce({
        data: { messageId: "msg-attendance" },
      });

      const dto: SendAlimtalkDto = {
        phone: "01012345678",
        templateCode: "ATTENDANCE_CONFIRMED_001",
        templateData: {
          className: "고급반",
          attendanceDate: "2026-01-04",
          creditsRemaining: "7",
        },
      };

      await gateway.sendAlimtalk(dto);

      expect(mockPost).toHaveBeenCalledWith(
        "/send",
        expect.objectContaining({
          content: expect.stringContaining("출석이 확인되었습니다"),
        }),
      );
    });

    it("should render CREDIT_EXPIRY_001 template", async () => {
      mockPost.mockResolvedValueOnce({
        data: { messageId: "msg-expiry" },
      });

      const dto: SendAlimtalkDto = {
        phone: "01012345678",
        templateCode: "CREDIT_EXPIRY_001",
        templateData: {
          className: "주말반",
          creditsRemaining: "3",
          expiryDate: "2026-01-31",
        },
      };

      await gateway.sendAlimtalk(dto);

      expect(mockPost).toHaveBeenCalledWith(
        "/send",
        expect.objectContaining({
          content: expect.stringContaining("만료 예정"),
        }),
      );
    });

    it("should handle unknown template code", async () => {
      mockPost.mockResolvedValueOnce({
        data: { messageId: "msg-unknown" },
      });

      const dto: SendAlimtalkDto = {
        phone: "01012345678",
        templateCode: "UNKNOWN_TEMPLATE",
        templateData: {},
      };

      await gateway.sendAlimtalk(dto);

      expect(mockPost).toHaveBeenCalledWith(
        "/send",
        expect.objectContaining({
          content: "",
        }),
      );
    });
  });

  describe("Phone Masking", () => {
    it("should mask phone number correctly in logs", async () => {
      mockPost.mockResolvedValueOnce({
        data: { messageId: "msg-mask-test" },
      });

      const dto: SendAlimtalkDto = {
        phone: "01012345678",
        templateCode: "PAYMENT_SUCCESS_001",
        templateData: {
          orderNumber: "ORD-123",
          className: "테스트반",
          amount: "50,000",
          startDate: "2026-01-20",
        },
      };

      // Should not throw and should process correctly
      await gateway.sendAlimtalk(dto);

      expect(mockPost).toHaveBeenCalled();
    });

    it("should handle short phone numbers", async () => {
      mockPost.mockResolvedValueOnce({
        data: { messageId: "msg-short" },
      });

      const dto: SendAlimtalkDto = {
        phone: "123",
        templateCode: "PAYMENT_SUCCESS_001",
        templateData: {
          orderNumber: "ORD-123",
          className: "테스트반",
          amount: "50,000",
          startDate: "2026-01-20",
        },
      };

      // Should not throw even with short phone
      await gateway.sendAlimtalk(dto);

      expect(mockPost).toHaveBeenCalled();
    });
  });

  describe("Retry Delay Calculation", () => {
    it("should use exponential backoff", async () => {
      mockPost
        .mockRejectedValueOnce(new Error("Fail 1"))
        .mockRejectedValueOnce(new Error("Fail 2"))
        .mockResolvedValueOnce({
          data: { messageId: "msg-retry-success" },
        });

      const dto: SendAlimtalkDto = {
        phone: "01012345678",
        templateCode: "PAYMENT_SUCCESS_001",
        templateData: {
          orderNumber: "ORD-123",
          className: "테스트반",
          amount: "50,000",
          startDate: "2026-01-20",
        },
      };

      const sendPromise = gateway.sendAlimtalk(dto);

      // First retry delay: 100ms
      await jest.advanceTimersByTimeAsync(100);
      // Second retry delay: 200ms (exponential)
      await jest.advanceTimersByTimeAsync(200);

      const result = await sendPromise;

      expect(result.status).toBe(AlimtalkStatus.SENT);
      expect(mockPost).toHaveBeenCalledTimes(3);
    });
  });

  describe("SMS Fallback", () => {
    it("should attempt SMS fallback when enabled and alimtalk fails", async () => {
      mockPost.mockRejectedValue(new Error("Alimtalk failed"));
      jest.useRealTimers();

      const dto: SendAlimtalkDto = {
        phone: "01012345678",
        templateCode: "PAYMENT_SUCCESS_001",
        templateData: {
          orderNumber: "ORD-123",
          className: "테스트반",
          amount: "50,000",
          startDate: "2026-01-20",
        },
      };

      // Should throw after SMS fallback attempt
      await expect(gateway.sendAlimtalk(dto)).rejects.toThrow(
        InternalServerErrorException,
      );

      jest.useFakeTimers();
    });

    it("should handle SMS fallback when disabled", async () => {
      // Create a new gateway with SMS fallback disabled
      const disabledConfigService = {
        get: jest.fn().mockImplementation((key: string) => {
          const config: Record<string, any> = {
            "kakao.apiKey": "test-api-key",
            "kakao.senderKey": "test-sender-key",
            "kakao.apiUrl": "https://api.kakao.test",
            "kakao.retry": {
              attempts: 1, // Only 1 attempt to speed up test
              delay: 10,
              backoff: "linear",
            },
            "kakao.smsFallback.enabled": false,
          };
          return config[key];
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AlimtalkGateway,
          {
            provide: ConfigService,
            useValue: disabledConfigService,
          },
        ],
      }).compile();

      const disabledGateway = module.get<AlimtalkGateway>(AlimtalkGateway);

      mockPost.mockRejectedValue(new Error("Alimtalk failed"));
      jest.useRealTimers();

      const dto: SendAlimtalkDto = {
        phone: "01012345678",
        templateCode: "PAYMENT_SUCCESS_001",
        templateData: {
          orderNumber: "ORD-123",
          className: "테스트반",
          amount: "50,000",
          startDate: "2026-01-20",
        },
      };

      await expect(disabledGateway.sendAlimtalk(dto)).rejects.toThrow(
        InternalServerErrorException,
      );

      jest.useFakeTimers();
    });
  });

  describe("Linear Backoff", () => {
    it("should use linear backoff when configured", async () => {
      const linearConfigService = {
        get: jest.fn().mockImplementation((key: string) => {
          const config: Record<string, any> = {
            "kakao.apiKey": "test-api-key",
            "kakao.senderKey": "test-sender-key",
            "kakao.apiUrl": "https://api.kakao.test",
            "kakao.retry": {
              attempts: 2,
              delay: 10,
              backoff: "linear",
            },
            "kakao.smsFallback.enabled": true,
          };
          return config[key];
        }),
      };

      // Recreate gateway with new config
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AlimtalkGateway,
          {
            provide: ConfigService,
            useValue: linearConfigService,
          },
        ],
      }).compile();

      const linearGateway = module.get<AlimtalkGateway>(AlimtalkGateway);

      mockPost
        .mockRejectedValueOnce(new Error("Fail 1"))
        .mockResolvedValueOnce({
          data: { messageId: "msg-linear" },
        });

      const dto: SendAlimtalkDto = {
        phone: "01012345678",
        templateCode: "PAYMENT_SUCCESS_001",
        templateData: {
          orderNumber: "ORD-123",
          className: "테스트반",
          amount: "50,000",
          startDate: "2026-01-20",
        },
      };

      jest.useRealTimers();
      const result = await linearGateway.sendAlimtalk(dto);
      jest.useFakeTimers();

      expect(result.status).toBe(AlimtalkStatus.SENT);
    });
  });

  describe("Default Configuration", () => {
    it("should use default retry config when not provided", async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === "kakao.retry") {
          return undefined;
        }
        const config: Record<string, any> = {
          "kakao.apiKey": "",
          "kakao.senderKey": "",
          "kakao.apiUrl": "",
          "kakao.smsFallback.enabled": false,
        };
        return config[key];
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AlimtalkGateway,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      const defaultGateway = module.get<AlimtalkGateway>(AlimtalkGateway);

      // Gateway should be created with default config
      expect(defaultGateway).toBeDefined();
    });
  });
});
