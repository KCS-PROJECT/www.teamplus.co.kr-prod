import { Test, TestingModule } from "@nestjs/testing";
import { CreditExpiryService } from "../credit-expiry.service";
import { PrismaService } from "@/prisma/prisma.service";
import { NotificationsService } from "@/notifications/notifications.service";

describe("CreditExpiryService", () => {
  let service: CreditExpiryService;
  let prisma: jest.Mocked<PrismaService>;
  let notifications: jest.Mocked<NotificationsService>;

  const mockPrismaTransaction = jest.fn();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditExpiryService,
        {
          provide: PrismaService,
          useValue: {
            memberCredit: {
              findMany: jest.fn(),
              update: jest.fn(),
            },
            creditTransaction: {
              create: jest.fn(),
            },
            $transaction: mockPrismaTransaction,
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            createNotification: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<CreditExpiryService>(CreditExpiryService);
    prisma = module.get(PrismaService);
    notifications = module.get(NotificationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("processExpiredCredits", () => {
    it("소멸할 크레딧이 없으면 processedCount=0을 반환한다", async () => {
      (prisma.memberCredit.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.processExpiredCredits();

      expect(result).toEqual({ processedCount: 0 });
      expect(mockPrismaTransaction).not.toHaveBeenCalled();
    });

    it("잔여 크레딧이 없는 만료 건은 처리하지 않는다", async () => {
      (prisma.memberCredit.findMany as jest.Mock).mockResolvedValue([
        {
          id: "credit-1",
          userId: "user-1",
          totalCredits: 10,
          usedCredits: 10,
          expiresAt: new Date("2020-01-01"),
          user: { id: "user-1" },
        },
      ]);

      const result = await service.processExpiredCredits();

      expect(result).toEqual({ processedCount: 0 });
      expect(mockPrismaTransaction).not.toHaveBeenCalled();
    });

    it("잔여 크레딧이 있는 만료 건은 $transaction으로 처리한다", async () => {
      const expiredCredit = {
        id: "credit-1",
        userId: "user-1",
        totalCredits: 10,
        usedCredits: 5,
        expiresAt: new Date("2020-01-01"),
        user: { id: "user-1" },
      };

      (prisma.memberCredit.findMany as jest.Mock).mockResolvedValue([
        expiredCredit,
      ]);

      mockPrismaTransaction.mockImplementation(async (fn) => {
        const tx = {
          memberCredit: { update: jest.fn().mockResolvedValue({}) },
          creditTransaction: { create: jest.fn().mockResolvedValue({}) },
        };
        await fn(tx);
        return {};
      });

      const result = await service.processExpiredCredits();

      expect(result.processedCount).toBe(1);
      expect(mockPrismaTransaction).toHaveBeenCalledTimes(1);
    });

    it("트랜잭션 내에서 CreditTransaction(type=expired)을 생성한다", async () => {
      const expiredCredit = {
        id: "credit-2",
        userId: "user-2",
        totalCredits: 20,
        usedCredits: 8,
        expiresAt: new Date("2020-06-01"),
        user: { id: "user-2" },
      };

      (prisma.memberCredit.findMany as jest.Mock).mockResolvedValue([
        expiredCredit,
      ]);

      let capturedTxCreate: jest.Mock | undefined;

      mockPrismaTransaction.mockImplementation(async (fn) => {
        const mockCreate = jest.fn().mockResolvedValue({});
        const tx = {
          memberCredit: { update: jest.fn().mockResolvedValue({}) },
          creditTransaction: { create: mockCreate },
        };
        await fn(tx);
        capturedTxCreate = mockCreate;
        return {};
      });

      await service.processExpiredCredits();

      expect(capturedTxCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "expired",
            amount: 12, // totalCredits(20) - usedCredits(8)
            balanceAfter: 0,
          }),
        }),
      );
    });
  });

  describe("sendExpiryWarnings", () => {
    it("만료 예정 크레딧이 없으면 totalNotifications=0을 반환한다", async () => {
      (prisma.memberCredit.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.sendExpiryWarnings();

      expect(result).toEqual({ totalNotifications: 0 });
      expect(notifications.createNotification).not.toHaveBeenCalled();
    });

    it("잔여 크레딧이 있는 사용자에게만 알림을 발송한다", async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      (prisma.memberCredit.findMany as jest.Mock).mockResolvedValueOnce([
        {
          id: "c1",
          userId: "u1",
          totalCredits: 5,
          usedCredits: 5,
          expiresAt: tomorrow,
          user: { id: "u1" },
        },
        {
          id: "c2",
          userId: "u2",
          totalCredits: 10,
          usedCredits: 3,
          expiresAt: tomorrow,
          user: { id: "u2" },
        },
      ]);

      // 나머지 두 경우(3일, 7일)는 빈 배열 반환
      (prisma.memberCredit.findMany as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.sendExpiryWarnings();

      expect(notifications.createNotification).toHaveBeenCalledTimes(1);
      expect(notifications.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "u2" }),
      );
      expect(result.totalNotifications).toBe(1);
    });
  });
});
