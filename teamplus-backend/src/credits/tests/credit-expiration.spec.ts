import { Test, TestingModule } from "@nestjs/testing";
import { CreditExpiryService } from "../credit-expiry.service";
import { CreditDomainService } from "../credit-domain.service";
import { PrismaService } from "@/prisma/prisma.service";
import { SystemLogService } from "@/logger/system-log.service";

/**
 * CreditExpiryService — 만료 크레딧 소멸 배치 (PR-B 위임 계약)
 *
 * [재작성 2026-07-24] 구 spec 은 PR-B(CreditDomainService 위임) 이전 계약
 * (totalCredits/usedCredits 필드·직접 creditTransaction 생성·NotificationsService 주입)
 * 이라 DI 부터 실패하던 상태였다. 현행 계약으로 정비:
 *  - 소멸 = creditDomain.expireRemaining 위임 (이월+소진+expired 트랜잭션 일괄)
 *  - actor = SYSTEM 사용자 (lazy 조회)
 *  - sendExpiryWarnings(만료 사전 알림)는 폐기되어 테스트 없음.
 */
describe("CreditExpiryService", () => {
  let service: CreditExpiryService;
  let prisma: jest.Mocked<PrismaService>;

  const mockPrismaTransaction = jest.fn();
  const mockExpireRemaining = jest.fn();
  const mockSystemLogCron = jest.fn();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditExpiryService,
        {
          provide: PrismaService,
          useValue: {
            memberCredit: { findMany: jest.fn() },
            user: {
              findFirst: jest
                .fn()
                .mockResolvedValue({ id: "system-user-1" }),
            },
            $transaction: mockPrismaTransaction,
          },
        },
        {
          provide: CreditDomainService,
          useValue: { expireRemaining: mockExpireRemaining },
        },
        {
          provide: SystemLogService,
          useValue: { cron: mockSystemLogCron },
        },
      ],
    }).compile();

    service = module.get<CreditExpiryService>(CreditExpiryService);
    prisma = module.get(PrismaService);
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
          classId: "class-1",
          totalSessions: 10,
          usedSessions: 10,
          expiresAt: new Date("2020-01-01"),
          user: { id: "user-1" },
        },
      ]);

      const result = await service.processExpiredCredits();

      expect(result).toEqual({ processedCount: 0 });
      expect(mockPrismaTransaction).not.toHaveBeenCalled();
    });

    it("잔여 크레딧이 있는 만료 건은 $transaction 안에서 expireRemaining 에 위임한다", async () => {
      (prisma.memberCredit.findMany as jest.Mock).mockResolvedValue([
        {
          id: "credit-1",
          userId: "user-1",
          classId: "class-1",
          totalSessions: 10,
          usedSessions: 5,
          expiresAt: new Date("2020-01-01"),
          user: { id: "user-1" },
        },
      ]);

      mockPrismaTransaction.mockImplementation(async (fn) => {
        const tx = {
          enrollment: {
            findFirst: jest.fn().mockResolvedValue(null),
            update: jest.fn(),
          },
          classRegistration: {
            findUnique: jest.fn().mockResolvedValue(null),
            update: jest.fn(),
          },
        };
        await fn(tx);
        return {};
      });

      const result = await service.processExpiredCredits();

      expect(result.processedCount).toBe(1);
      expect(mockPrismaTransaction).toHaveBeenCalledTimes(1);
      // 소멸은 도메인 단일 진입점(expireRemaining)에 SYSTEM actor 로 위임한다.
      expect(mockExpireRemaining).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          memberCreditId: "credit-1",
          actorUserId: "system-user-1",
        }),
      );
    });
  });
});
