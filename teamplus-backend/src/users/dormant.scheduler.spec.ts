import { Test, TestingModule } from "@nestjs/testing";
import { DormantScheduler } from "./dormant.scheduler";
import { PrismaService } from "@/prisma/prisma.service";
import { NotificationsService } from "@/notifications/notifications.service";

/**
 * DormantScheduler 테스트
 *
 * NOTE: @Cron 데코레이터는 @nestjs/schedule의 ScheduleModule이 없으면
 * 자동 실행되지 않습니다. runDormantCheck() 를 직접 호출하여 테스트합니다.
 */
describe("DormantScheduler", () => {
  let scheduler: DormantScheduler;

  const mockPrismaService = {
    user: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const mockNotificationsService = {
    createNotification: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DormantScheduler,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    scheduler = module.get<DormantScheduler>(DormantScheduler);
    jest.clearAllMocks();
  });

  // ── convertDormant (365일 미접속 → 휴면 전환) ─────────────────────────────

  describe("runDormantCheck - convertDormant", () => {
    it("365일 미접속 ACTIVE 사용자를 DORMANT로 전환한다", async () => {
      const dormantUser = {
        id: "user-dormant",
        email: "dormant@test.com",
        firstName: "길동",
        lastName: "홍",
      };

      // 첫 findMany: convertDormant targets (365일 미접속)
      // 이후 sendWarningNotifications의 3개 findMany
      mockPrismaService.user.findMany
        .mockResolvedValueOnce([dormantUser]) // 365일 대상
        .mockResolvedValueOnce([]) // D-30 경고 대상
        .mockResolvedValueOnce([]) // D-7 경고 대상
        .mockResolvedValueOnce([]); // D-1 경고 대상

      mockPrismaService.user.updateMany.mockResolvedValue({ count: 1 });
      mockNotificationsService.createNotification.mockResolvedValue({});

      await scheduler.runDormantCheck();

      expect(mockPrismaService.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ["user-dormant"] } },
          data: expect.objectContaining({ status: "DORMANT" }),
        }),
      );
    });

    it("365일 미접속 대상이 없으면 updateMany를 호출하지 않는다", async () => {
      mockPrismaService.user.findMany.mockResolvedValue([]);

      await scheduler.runDormantCheck();

      expect(mockPrismaService.user.updateMany).not.toHaveBeenCalled();
    });

    it("휴면 전환 후 account_dormant 알림을 발송한다", async () => {
      const dormantUser = {
        id: "user-dormant",
        email: "dormant@test.com",
        firstName: "길동",
        lastName: "홍",
      };

      mockPrismaService.user.findMany
        .mockResolvedValueOnce([dormantUser])
        .mockResolvedValue([]);

      mockPrismaService.user.updateMany.mockResolvedValue({ count: 1 });
      mockNotificationsService.createNotification.mockResolvedValue({});

      await scheduler.runDormantCheck();

      expect(mockNotificationsService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-dormant",
          notificationType: "account_dormant",
        }),
      );
    });
  });

  // ── sendWarningNotifications (D-30/7/1 경고 알림) ────────────────────────

  describe("runDormantCheck - sendWarningNotifications", () => {
    it("D-30 경고 대상 사용자에게 dormant_warning 알림을 발송한다", async () => {
      const warnUser = { id: "user-warn" };

      mockPrismaService.user.findMany
        .mockResolvedValueOnce([]) // convertDormant: 없음
        .mockResolvedValueOnce([warnUser]) // D-30 경고
        .mockResolvedValueOnce([]) // D-7 경고
        .mockResolvedValueOnce([]); // D-1 경고

      mockNotificationsService.createNotification.mockResolvedValue({});

      await scheduler.runDormantCheck();

      expect(mockNotificationsService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-warn",
          notificationType: "dormant_warning",
        }),
      );
    });

    it("알림 발송 실패가 발생해도 전체 스케줄러 실행이 중단되지 않는다", async () => {
      const dormantUser = {
        id: "user-1",
        email: "a@test.com",
        firstName: "A",
        lastName: "B",
      };

      mockPrismaService.user.findMany
        .mockResolvedValueOnce([dormantUser])
        .mockResolvedValue([]);

      mockPrismaService.user.updateMany.mockResolvedValue({ count: 1 });
      // 알림 발송 실패 시뮬레이션
      mockNotificationsService.createNotification.mockRejectedValue(
        new Error("Notification service unavailable"),
      );

      // 에러가 전파되지 않아야 함 (catch 블록에서 처리)
      await expect(scheduler.runDormantCheck()).resolves.not.toThrow();
    });
  });

  // ── 이미 DORMANT 상태인 사용자 중복 처리 방지 ────────────────────────────

  describe("중복 휴면 전환 방지", () => {
    it("DORMANT 상태 사용자는 where 조건에서 status=ACTIVE 필터로 제외된다", async () => {
      mockPrismaService.user.findMany.mockResolvedValue([]);

      await scheduler.runDormantCheck();

      const firstCall = mockPrismaService.user.findMany.mock.calls[0][0];
      expect(firstCall.where.status).toBe("ACTIVE");
    });
  });
});
