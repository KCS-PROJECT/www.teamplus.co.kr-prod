import { Test, TestingModule } from "@nestjs/testing";
import { CreditsController } from "./credits.controller";
import { CreditsService } from "./credits.service";
import { BadRequestException, NotFoundException } from "@nestjs/common";

describe("CreditsController", () => {
  let controller: CreditsController;

  const mockMemberId = "member-uuid";
  const mockCreditId = "credit-uuid";
  const mockPaymentId = "payment-uuid";
  const mockUserId = "user-uuid";

  const mockCredit = {
    id: mockCreditId,
    memberId: mockMemberId,
    totalCredits: 8,
    usedCredits: 0,
    remainingCredits: 8,
    expiresAt: new Date("2026-04-04T23:59:59Z"),
    issuedDate: new Date("2026-01-04T10:00:00Z"),
    paymentId: mockPaymentId,
  };

  const mockCreditStats = {
    memberId: mockMemberId,
    totalIssued: 16,
    totalUsed: 3,
    totalRemaining: 13,
    availableRemaining: 13,
    availableCreditCount: 2,
    expiredCreditCount: 0,
    allCredits: 2,
  };

  const mockCreditsService = {
    issueCredit: jest.fn(),
    getAvailableCredit: jest.fn(),
    getMemberCredits: jest.fn(),
    getCredit: jest.fn(),
    getExpiredCredits: jest.fn(),
    getCreditStats: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CreditsController],
      providers: [
        {
          provide: CreditsService,
          useValue: mockCreditsService,
        },
      ],
    }).compile();

    controller = module.get<CreditsController>(CreditsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /api/v1/credits/issue", () => {
    const mockRequest = {
      user: { id: mockUserId },
    } as any;

    it("should issue credit successfully", async () => {
      mockCreditsService.issueCredit.mockResolvedValue(mockCredit);

      const result = await controller.issueCredit(
        mockRequest,
        mockMemberId,
        8,
        mockPaymentId,
      );

      expect(result.id).toBe(mockCreditId);
      expect(result.totalCredits).toBe(8);
      expect(result.usedCredits).toBe(0);
      expect(mockCreditsService.issueCredit).toHaveBeenCalledWith(
        mockUserId,
        mockMemberId,
        8,
        mockPaymentId,
      );
    });

    it("should issue credit without paymentId", async () => {
      mockCreditsService.issueCredit.mockResolvedValue(mockCredit);

      const result = await controller.issueCredit(mockRequest, mockMemberId, 8);

      expect(result.id).toBe(mockCreditId);
      expect(mockCreditsService.issueCredit).toHaveBeenCalledWith(
        mockUserId,
        mockMemberId,
        8,
        undefined,
      );
    });

    it("should throw NotFoundException if member not found", async () => {
      mockCreditsService.issueCredit.mockRejectedValue(
        new NotFoundException("회원을 찾을 수 없습니다."),
      );

      await expect(
        controller.issueCredit(mockRequest, "non-existent", 8),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw BadRequestException if invalid credits amount", async () => {
      mockCreditsService.issueCredit.mockRejectedValue(
        new BadRequestException("유효하지 않은 크레딧 수량입니다."),
      );

      await expect(
        controller.issueCredit(mockRequest, mockMemberId, -1),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("GET /api/v1/credits/available/:memberId", () => {
    it("should return available credit", async () => {
      const availableCredit = {
        ...mockCredit,
        remainingCredits: 6,
        usedCredits: 2,
      };
      mockCreditsService.getAvailableCredit.mockResolvedValue(availableCredit);

      const result = await controller.getAvailableCredit(mockMemberId);

      expect(result.remainingCredits).toBe(6);
      expect(mockCreditsService.getAvailableCredit).toHaveBeenCalledWith(
        mockMemberId,
      );
    });

    it("should throw NotFoundException if no available credits", async () => {
      mockCreditsService.getAvailableCredit.mockRejectedValue(
        new NotFoundException("사용 가능한 크레딧이 없습니다."),
      );

      await expect(controller.getAvailableCredit(mockMemberId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("GET /api/v1/credits/member/:memberId", () => {
    it("should return member credits list", async () => {
      const credits = [
        mockCredit,
        { ...mockCredit, id: "credit-2", usedCredits: 4, remainingCredits: 4 },
      ];
      mockCreditsService.getMemberCredits.mockResolvedValue(credits);

      const result = await controller.getMemberCredits(mockMemberId);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(mockCreditsService.getMemberCredits).toHaveBeenCalledWith(
        mockMemberId,
      );
    });

    it("should return empty array if no credits", async () => {
      mockCreditsService.getMemberCredits.mockResolvedValue([]);

      const result = await controller.getMemberCredits(mockMemberId);

      expect(result).toEqual([]);
    });
  });

  describe("GET /api/v1/credits/:creditId", () => {
    it("should return credit details", async () => {
      mockCreditsService.getCredit.mockResolvedValue(mockCredit);

      const result = await controller.getCredit(mockCreditId);

      expect(result.id).toBe(mockCreditId);
      expect(result.totalCredits).toBe(8);
      expect(mockCreditsService.getCredit).toHaveBeenCalledWith(mockCreditId);
    });

    it("should throw NotFoundException if credit not found", async () => {
      mockCreditsService.getCredit.mockRejectedValue(
        new NotFoundException("크레딧을 찾을 수 없습니다."),
      );

      await expect(controller.getCredit("non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("GET /api/v1/credits/member/:memberId/expired", () => {
    it("should return expired credits", async () => {
      const expiredCredits = [
        {
          ...mockCredit,
          id: "expired-1",
          expiresAt: new Date("2025-12-01T23:59:59Z"),
          remainingCredits: 3,
        },
      ];
      mockCreditsService.getExpiredCredits.mockResolvedValue(expiredCredits);

      const result = await controller.getExpiredCredits(mockMemberId);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(mockCreditsService.getExpiredCredits).toHaveBeenCalledWith(
        mockMemberId,
      );
    });

    it("should return empty array if no expired credits", async () => {
      mockCreditsService.getExpiredCredits.mockResolvedValue([]);

      const result = await controller.getExpiredCredits(mockMemberId);

      expect(result).toEqual([]);
    });
  });

  describe("GET /api/v1/credits/stats/:memberId", () => {
    it("should return credit statistics", async () => {
      mockCreditsService.getCreditStats.mockResolvedValue(mockCreditStats);

      const result = await controller.getCreditStats(mockMemberId);

      expect(result.memberId).toBe(mockMemberId);
      expect(result.totalIssued).toBe(16);
      expect(result.totalUsed).toBe(3);
      expect(result.totalRemaining).toBe(13);
      expect(mockCreditsService.getCreditStats).toHaveBeenCalledWith(
        mockMemberId,
      );
    });

    it("should return stats with all fields", async () => {
      mockCreditsService.getCreditStats.mockResolvedValue(mockCreditStats);

      const result = await controller.getCreditStats(mockMemberId);

      expect(result).toHaveProperty("memberId");
      expect(result).toHaveProperty("totalIssued");
      expect(result).toHaveProperty("totalUsed");
      expect(result).toHaveProperty("totalRemaining");
      expect(result).toHaveProperty("availableRemaining");
      expect(result).toHaveProperty("availableCreditCount");
      expect(result).toHaveProperty("expiredCreditCount");
    });
  });

  describe("Error Handling", () => {
    it("should propagate service errors correctly", async () => {
      const error = new BadRequestException("Service error");
      mockCreditsService.issueCredit.mockRejectedValue(error);

      const mockRequest = { user: { id: mockUserId } } as any;

      await expect(
        controller.issueCredit(mockRequest, mockMemberId, 8),
      ).rejects.toThrow(error);
    });

    it("should handle unexpected errors", async () => {
      mockCreditsService.getAvailableCredit.mockRejectedValue(
        new Error("Unexpected error"),
      );

      await expect(controller.getAvailableCredit(mockMemberId)).rejects.toThrow(
        Error,
      );
    });
  });

  describe("API Response Format", () => {
    it("should return correct issue response structure", async () => {
      mockCreditsService.issueCredit.mockResolvedValue(mockCredit);
      const mockRequest = { user: { id: mockUserId } } as any;

      const result = await controller.issueCredit(mockRequest, mockMemberId, 8);

      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("memberId");
      expect(result).toHaveProperty("totalCredits");
      expect(result).toHaveProperty("usedCredits");
      expect(result).toHaveProperty("remainingCredits");
      expect(result).toHaveProperty("expiresAt");
    });

    it("should return correct stats response structure", async () => {
      mockCreditsService.getCreditStats.mockResolvedValue(mockCreditStats);

      const result = await controller.getCreditStats(mockMemberId);

      expect(typeof result.totalIssued).toBe("number");
      expect(typeof result.totalUsed).toBe("number");
      expect(typeof result.totalRemaining).toBe("number");
    });
  });
});
