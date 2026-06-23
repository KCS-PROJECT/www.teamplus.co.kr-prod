import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { CreditsService } from "./credits.service";
import { PrismaService } from "@/prisma/prisma.service";

describe("CreditsService", () => {
  let service: CreditsService;
  let prismaService: PrismaService;

  const mockUserId = "user-123";
  const mockMemberId = "member-456";
  const mockCreditId = "credit-789";

  const mockUser = {
    id: mockMemberId,
    email: "member@test.com",
    phone: "01012345678",
    userType: "CHILD",
  };

  const mockCredit = {
    id: mockCreditId,
    userId: mockUserId,
    memberId: mockMemberId,
    totalCredits: 8,
    usedCredits: 2,
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days from now
    issuedDate: new Date(),
    paymentId: "payment-123",
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditsService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
            },
            memberCredit: {
              create: jest.fn(),
              findFirst: jest.fn(),
              findMany: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<CreditsService>(CreditsService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("issueCredit", () => {
    it("should successfully issue credit to member", async () => {
      const newCredit = { ...mockCredit, usedCredits: 0 };
      jest
        .spyOn(prismaService.user, "findUnique")
        .mockResolvedValue(mockUser as any);
      jest
        .spyOn(prismaService.memberCredit, "create")
        .mockResolvedValue(newCredit as any);

      const result = await service.issueCredit(
        mockUserId,
        mockMemberId,
        8,
        "payment-123",
      );

      expect(result.memberId).toBe(mockMemberId);
      expect(result.totalCredits).toBe(8);
      expect(result.usedCredits).toBe(0);
      expect(result.remainingCredits).toBe(8);
      expect(prismaService.memberCredit.create).toHaveBeenCalledWith({
        data: {
          userId: mockUserId,
          memberId: mockMemberId,
          totalCredits: 8,
          usedCredits: 0,
          expiresAt: expect.any(Date),
          paymentId: "payment-123",
        },
      });
    });

    it("should throw NotFoundException if member does not exist", async () => {
      jest.spyOn(prismaService.user, "findUnique").mockResolvedValue(null);

      await expect(
        service.issueCredit(mockUserId, mockMemberId, 8),
      ).rejects.toThrow(NotFoundException);
    });

    it("should set expiration date 90 days from now", async () => {
      jest
        .spyOn(prismaService.user, "findUnique")
        .mockResolvedValue(mockUser as any);
      jest
        .spyOn(prismaService.memberCredit, "create")
        .mockResolvedValue(mockCredit as any);

      await service.issueCredit(mockUserId, mockMemberId, 8);

      const createCall = jest.spyOn(prismaService.memberCredit, "create").mock
        .calls[0][0];
      const expiresAt = createCall.data.expiresAt as Date;
      const now = new Date();
      const daysDiff =
        (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

      expect(daysDiff).toBeGreaterThan(89);
      expect(daysDiff).toBeLessThan(91);
    });
  });

  describe("getAvailableCredit", () => {
    it("should retrieve available credit successfully", async () => {
      jest
        .spyOn(prismaService.memberCredit, "findFirst")
        .mockResolvedValue(mockCredit as any);

      const result = await service.getAvailableCredit(mockMemberId);

      expect(result.memberId).toBe(mockMemberId);
      expect(result.remainingCredits).toBe(6);
      expect(result.totalCredits).toBe(8);
    });

    it("should throw NotFoundException if no available credit", async () => {
      jest
        .spyOn(prismaService.memberCredit, "findFirst")
        .mockResolvedValue(null);

      await expect(service.getAvailableCredit(mockMemberId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should throw BadRequestException if all credits are used", async () => {
      const fullyUsedCredit = { ...mockCredit, usedCredits: 8 };
      jest
        .spyOn(prismaService.memberCredit, "findFirst")
        .mockResolvedValue(fullyUsedCredit as any);

      await expect(service.getAvailableCredit(mockMemberId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should return credit expiring soonest first", async () => {
      jest
        .spyOn(prismaService.memberCredit, "findFirst")
        .mockResolvedValue(mockCredit as any);

      await service.getAvailableCredit(mockMemberId);

      expect(prismaService.memberCredit.findFirst).toHaveBeenCalledWith({
        where: {
          memberId: mockMemberId,
          expiresAt: {
            gte: expect.any(Date),
          },
        },
        orderBy: {
          expiresAt: "asc",
        },
      });
    });
  });

  describe("getMemberCredits", () => {
    it("should retrieve all available credits for member", async () => {
      const mockCredits = [
        mockCredit,
        { ...mockCredit, id: "credit-2", totalCredits: 4, usedCredits: 0 },
      ];
      jest
        .spyOn(prismaService.memberCredit, "findMany")
        .mockResolvedValue(mockCredits as any);

      const result = await service.getMemberCredits(mockMemberId);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result[0].remainingCredits).toBe(6);
      expect(result[1].remainingCredits).toBe(4);
    });

    it("should return empty array if no credits", async () => {
      jest.spyOn(prismaService.memberCredit, "findMany").mockResolvedValue([]);

      const result = await service.getMemberCredits(mockMemberId);

      expect(result).toEqual([]);
    });

    it("should order credits by expiration date ascending", async () => {
      jest
        .spyOn(prismaService.memberCredit, "findMany")
        .mockResolvedValue([] as any);

      await service.getMemberCredits(mockMemberId);

      expect(prismaService.memberCredit.findMany).toHaveBeenCalledWith({
        where: {
          memberId: mockMemberId,
          expiresAt: {
            gte: expect.any(Date),
          },
        },
        orderBy: {
          expiresAt: "asc",
        },
      });
    });
  });

  describe("useCredit", () => {
    it("should successfully use credit", async () => {
      const updatedCredit = { ...mockCredit, usedCredits: 3 };
      jest
        .spyOn(prismaService.memberCredit, "findUnique")
        .mockResolvedValue(mockCredit as any);
      jest
        .spyOn(prismaService.memberCredit, "update")
        .mockResolvedValue(updatedCredit as any);

      const result = await service.useCredit(mockCreditId, 1);

      expect(result.usedCredits).toBe(3);
      expect(result.remainingCredits).toBe(5);
      expect(prismaService.memberCredit.update).toHaveBeenCalledWith({
        where: { id: mockCreditId },
        data: { usedCredits: 3 },
      });
    });

    it("should throw NotFoundException if credit does not exist", async () => {
      jest
        .spyOn(prismaService.memberCredit, "findUnique")
        .mockResolvedValue(null);

      await expect(service.useCredit(mockCreditId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should throw BadRequestException if credit is expired", async () => {
      const expiredCredit = {
        ...mockCredit,
        expiresAt: new Date(Date.now() - 1000),
      };
      jest
        .spyOn(prismaService.memberCredit, "findUnique")
        .mockResolvedValue(expiredCredit as any);

      await expect(service.useCredit(mockCreditId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should throw BadRequestException if insufficient credits", async () => {
      jest
        .spyOn(prismaService.memberCredit, "findUnique")
        .mockResolvedValue(mockCredit as any);

      // Trying to use 10 credits when only 6 remaining
      await expect(service.useCredit(mockCreditId, 10)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should use default amount of 1 if not specified", async () => {
      const updatedCredit = { ...mockCredit, usedCredits: 3 };
      jest
        .spyOn(prismaService.memberCredit, "findUnique")
        .mockResolvedValue(mockCredit as any);
      jest
        .spyOn(prismaService.memberCredit, "update")
        .mockResolvedValue(updatedCredit as any);

      await service.useCredit(mockCreditId);

      expect(prismaService.memberCredit.update).toHaveBeenCalledWith({
        where: { id: mockCreditId },
        data: { usedCredits: 3 },
      });
    });
  });

  describe("restoreCredit", () => {
    it("should successfully restore credit", async () => {
      const restoredCredit = { ...mockCredit, usedCredits: 1 };
      jest
        .spyOn(prismaService.memberCredit, "findUnique")
        .mockResolvedValue(mockCredit as any);
      jest
        .spyOn(prismaService.memberCredit, "update")
        .mockResolvedValue(restoredCredit as any);

      const result = await service.restoreCredit(mockCreditId, 1);

      expect(result.usedCredits).toBe(1);
      expect(result.remainingCredits).toBe(7);
    });

    it("should not allow used credits to go below 0", async () => {
      const creditWithOnlyOne = { ...mockCredit, usedCredits: 1 };
      jest
        .spyOn(prismaService.memberCredit, "findUnique")
        .mockResolvedValue(creditWithOnlyOne as any);
      jest
        .spyOn(prismaService.memberCredit, "update")
        .mockResolvedValue(mockCredit as any);

      await service.restoreCredit(mockCreditId, 5); // Try to restore more than used

      expect(prismaService.memberCredit.update).toHaveBeenCalledWith({
        where: { id: mockCreditId },
        data: { usedCredits: 0 },
      });
    });

    it("should throw NotFoundException if credit does not exist", async () => {
      jest
        .spyOn(prismaService.memberCredit, "findUnique")
        .mockResolvedValue(null);

      await expect(service.restoreCredit(mockCreditId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should use default amount of 1 if not specified", async () => {
      const restoredCredit = { ...mockCredit, usedCredits: 1 };
      jest
        .spyOn(prismaService.memberCredit, "findUnique")
        .mockResolvedValue(mockCredit as any);
      jest
        .spyOn(prismaService.memberCredit, "update")
        .mockResolvedValue(restoredCredit as any);

      await service.restoreCredit(mockCreditId);

      expect(prismaService.memberCredit.update).toHaveBeenCalledWith({
        where: { id: mockCreditId },
        data: { usedCredits: 1 },
      });
    });
  });

  describe("getCredit", () => {
    it("should successfully retrieve credit details", async () => {
      jest
        .spyOn(prismaService.memberCredit, "findUnique")
        .mockResolvedValue(mockCredit as any);

      const result = await service.getCredit(mockCreditId);

      expect(result.id).toBe(mockCreditId);
      expect(result.totalCredits).toBe(8);
      expect(result.remainingCredits).toBe(6);
      expect(result.isExpired).toBe(false);
    });

    it("should indicate when credit is expired", async () => {
      const expiredCredit = {
        ...mockCredit,
        expiresAt: new Date(Date.now() - 1000),
      };
      jest
        .spyOn(prismaService.memberCredit, "findUnique")
        .mockResolvedValue(expiredCredit as any);

      const result = await service.getCredit(mockCreditId);

      expect(result.isExpired).toBe(true);
    });

    it("should throw NotFoundException if credit does not exist", async () => {
      jest
        .spyOn(prismaService.memberCredit, "findUnique")
        .mockResolvedValue(null);

      await expect(service.getCredit(mockCreditId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("getExpiredCredits", () => {
    it("should retrieve all expired credits for member", async () => {
      const expiredCredits = [
        {
          ...mockCredit,
          id: "credit-1",
          expiresAt: new Date(Date.now() - 1000),
        },
        {
          ...mockCredit,
          id: "credit-2",
          expiresAt: new Date(Date.now() - 2000),
        },
      ];
      jest
        .spyOn(prismaService.memberCredit, "findMany")
        .mockResolvedValue(expiredCredits as any);

      const result = await service.getExpiredCredits(mockMemberId);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
    });

    it("should return empty array if no expired credits", async () => {
      jest.spyOn(prismaService.memberCredit, "findMany").mockResolvedValue([]);

      const result = await service.getExpiredCredits(mockMemberId);

      expect(result).toEqual([]);
    });

    it("should order expired credits by expiration date descending (most recent first)", async () => {
      jest
        .spyOn(prismaService.memberCredit, "findMany")
        .mockResolvedValue([] as any);

      await service.getExpiredCredits(mockMemberId);

      expect(prismaService.memberCredit.findMany).toHaveBeenCalledWith({
        where: {
          memberId: mockMemberId,
          expiresAt: {
            lt: expect.any(Date),
          },
        },
        orderBy: {
          expiresAt: "desc",
        },
      });
    });
  });

  describe("getCreditStats", () => {
    it("should calculate comprehensive credit statistics", async () => {
      const mockAllCredits = [
        { ...mockCredit, id: "credit-1", totalCredits: 8, usedCredits: 2 },
        {
          ...mockCredit,
          id: "credit-2",
          totalCredits: 8,
          usedCredits: 8,
          expiresAt: new Date(Date.now() - 1000),
        },
      ];
      jest
        .spyOn(prismaService.memberCredit, "findMany")
        .mockResolvedValue(mockAllCredits as any);

      const result = await service.getCreditStats(mockMemberId);

      expect(result.memberId).toBe(mockMemberId);
      expect(result.totalIssued).toBe(16);
      expect(result.totalUsed).toBe(10);
      expect(result.totalRemaining).toBe(6);
      expect(result.availableRemaining).toBe(6);
      expect(result.availableCreditCount).toBe(1);
      expect(result.expiredCreditCount).toBe(1);
      expect(result.allCredits).toBe(2);
    });

    it("should return zero statistics if member has no credits", async () => {
      jest.spyOn(prismaService.memberCredit, "findMany").mockResolvedValue([]);

      const result = await service.getCreditStats(mockMemberId);

      expect(result.totalIssued).toBe(0);
      expect(result.totalUsed).toBe(0);
      expect(result.totalRemaining).toBe(0);
      expect(result.availableCreditCount).toBe(0);
      expect(result.expiredCreditCount).toBe(0);
    });

    it("should correctly separate available and expired credits", async () => {
      const now = new Date();
      const mockAllCredits = [
        {
          ...mockCredit,
          id: "credit-1",
          totalCredits: 8,
          usedCredits: 2,
          expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        },
        {
          ...mockCredit,
          id: "credit-2",
          totalCredits: 8,
          usedCredits: 4,
          expiresAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
        },
      ];
      jest
        .spyOn(prismaService.memberCredit, "findMany")
        .mockResolvedValue(mockAllCredits as any);

      const result = await service.getCreditStats(mockMemberId);

      expect(result.availableCreditCount).toBe(1);
      expect(result.expiredCreditCount).toBe(1);
      expect(result.availableRemaining).toBe(6);
    });
  });
});
