import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NotificationsService } from "./notifications.service";
import { PrismaService } from "@/prisma/prisma.service";
import { NotificationQueue } from "./notification.queue";
import { RedisService } from "@/redis/redis.service";
import { FcmService } from "./fcm.service";

describe("NotificationsService", () => {
  let service: NotificationsService;
  let prismaService: PrismaService;

  const mockNotificationQueue = {
    addPaymentConfirmation: jest.fn(),
    addMembershipApproval: jest.fn(),
    addClassReminder: jest.fn(),
    addAttendanceConfirmation: jest.fn(),
    addCreditExpiry: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, any> = {
        KAKAO_ALIMTALK_ENABLED: "true",
        KAKAO_SENDER_KEY: "test-sender-key",
      };
      return config[key];
    }),
  };

  // 캐시는 항상 miss(null)로 동작시켜 DB 경로가 실행되도록 한다.
  const mockRedisService = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };

  // 푸시는 fire-and-forget — 발송 0건으로 고정해 테스트 흐름에 영향 없게 한다.
  const mockFcmService = {
    sendToTokens: jest
      .fn()
      .mockResolvedValue({ successCount: 0, failureCount: 0, invalidTokens: [] }),
    sendPushToUsers: jest
      .fn()
      .mockResolvedValue({ successCount: 0, failureCount: 0, invalidTokens: [] }),
    sendPushNotification: jest
      .fn()
      .mockResolvedValue({ successCount: 0, failureCount: 0, invalidTokens: [] }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: PrismaService,
          useValue: {
            notification: {
              create: jest.fn(),
              findMany: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
              count: jest.fn(),
            },
            alimtalkLog: {
              create: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              findMany: jest.fn(),
              count: jest.fn(),
            },
            team: {
              findUnique: jest.fn(),
            },
            teamMember: {
              findMany: jest.fn(),
            },
          },
        },
        {
          provide: NotificationQueue,
          useValue: mockNotificationQueue,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: FcmService,
          useValue: mockFcmService,
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getTeamManagerUserIds", () => {
    it("팀 소유 감독(coachId)과 승인된 코치/매니저를 합집합·중복제거로 반환한다", async () => {
      (prismaService.team.findUnique as jest.Mock).mockResolvedValue({
        coachId: "director-1",
      });
      (prismaService.teamMember.findMany as jest.Mock).mockResolvedValue([
        { userId: "coach-1" },
        { userId: "coach-2" },
        { userId: "director-1" }, // 감독이 멤버로도 잡혀도 중복 제거
      ]);

      const ids = await service.getTeamManagerUserIds("team-1");

      expect(prismaService.teamMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            teamId: "team-1",
            approvalStatus: "approved",
            leftAt: null,
            roleInTeam: { in: ["HEAD_COACH", "COACH", "MANAGER"] },
          }),
        }),
      );
      expect(ids.sort()).toEqual(["coach-1", "coach-2", "director-1"]);
    });

    it("팀 소유 감독이 없고 코치만 있어도 코치 목록을 반환한다", async () => {
      (prismaService.team.findUnique as jest.Mock).mockResolvedValue({
        coachId: null,
      });
      (prismaService.teamMember.findMany as jest.Mock).mockResolvedValue([
        { userId: "coach-1" },
      ]);

      const ids = await service.getTeamManagerUserIds("team-1");

      expect(ids).toEqual(["coach-1"]);
    });
  });

  describe("createNotification", () => {
    it("should create a notification successfully", async () => {
      const mockNotification = {
        id: "notification-1",
        userId: "user-1",
        notificationType: "payment_success",
        title: "결제 완료",
        message: "₩240,000를 결제하셨습니다.",
        isRead: false,
        createdAt: new Date("2026-01-04T10:00:00Z"),
      };

      (prismaService.notification.create as jest.Mock).mockResolvedValue(
        mockNotification,
      );

      const result = await service.createNotification({
        userId: "user-1",
        notificationType: "payment_success",
        title: "결제 완료",
        message: "₩240,000를 결제하셨습니다.",
      });

      expect(result.id).toBe("notification-1");
      expect(result.isRead).toBe(false);
      expect(prismaService.notification.create).toHaveBeenCalledWith({
        data: {
          userId: "user-1",
          notificationType: "payment_success",
          title: "결제 완료",
          message: "₩240,000를 결제하셨습니다.",
          isRead: false,
          linkUrl: null,
        },
      });
    });

    it("should include all required fields in response", async () => {
      const mockNotification = {
        id: "notification-1",
        userId: "user-1",
        notificationType: "membership_approved",
        title: "가입 승인",
        message: "ACE 클럽 가입이 승인되었습니다.",
        isRead: false,
        createdAt: new Date(),
      };

      (prismaService.notification.create as jest.Mock).mockResolvedValue(
        mockNotification,
      );

      const result = await service.createNotification({
        userId: "user-1",
        notificationType: "membership_approved",
        title: "가입 승인",
        message: "ACE 클럽 가입이 승인되었습니다.",
      });

      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("userId");
      expect(result).toHaveProperty("notificationType");
      expect(result).toHaveProperty("title");
      expect(result).toHaveProperty("message");
      expect(result).toHaveProperty("isRead");
      expect(result).toHaveProperty("createdAt");
    });
  });

  describe("getUserNotifications", () => {
    it("should retrieve user notifications with default limit", async () => {
      const mockNotifications = [
        {
          id: "notification-1",
          userId: "user-1",
          notificationType: "payment_success",
          title: "결제 완료",
          message: "₩240,000를 결제하셨습니다.",
          isRead: false,
          createdAt: new Date(),
        },
        {
          id: "notification-2",
          userId: "user-1",
          notificationType: "membership_approved",
          title: "가입 승인",
          message: "ACE 클럽 가입이 승인되었습니다.",
          isRead: true,
          createdAt: new Date(),
        },
      ];

      (prismaService.notification.findMany as jest.Mock).mockResolvedValue(
        mockNotifications,
      );

      const result = await service.getUserNotifications("user-1");

      expect(result).toHaveLength(2);
      expect(prismaService.notification.findMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        orderBy: { createdAt: "desc" },
        take: 20,
        skip: 0,
        select: {
          id: true,
          notificationType: true,
          title: true,
          message: true,
          isRead: true,
          createdAt: true,
          linkUrl: true,
        },
      });
    });

    it("should retrieve user notifications with custom limit and skip", async () => {
      const mockNotifications = [
        {
          id: "notification-1",
          userId: "user-1",
          notificationType: "payment_success",
          title: "결제 완료",
          message: "₩240,000를 결제하셨습니다.",
          isRead: false,
          createdAt: new Date(),
        },
      ];

      (prismaService.notification.findMany as jest.Mock).mockResolvedValue(
        mockNotifications,
      );

      const result = await service.getUserNotifications("user-1", 10, 5);

      expect(result).toHaveLength(1);
      expect(prismaService.notification.findMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        orderBy: { createdAt: "desc" },
        take: 10,
        skip: 5,
        select: {
          id: true,
          notificationType: true,
          title: true,
          message: true,
          isRead: true,
          createdAt: true,
          linkUrl: true,
        },
      });
    });

    it("should return empty array when no notifications found", async () => {
      (prismaService.notification.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getUserNotifications("user-1");

      expect(result).toEqual([]);
    });
  });

  describe("getNotification", () => {
    it("should retrieve notification with alimtalk log", async () => {
      const mockNotification = {
        id: "notification-1",
        userId: "user-1",
        notificationType: "payment_success",
        title: "결제 완료",
        message: "₩240,000를 결제하셨습니다.",
        isRead: false,
        createdAt: new Date(),
        alimtalkLog: {
          id: "alimtalk-1",
          phone: "01012345678",
          status: "sent",
          sentAt: new Date(),
        },
      };

      (prismaService.notification.findUnique as jest.Mock).mockResolvedValue(
        mockNotification,
      );

      const result = await service.getNotification("notification-1", "user-1");

      expect(result.id).toBe("notification-1");
      expect(result.alimtalkLog).toBeTruthy();
      expect(result.alimtalkLog!.status).toBe("sent");
    });

    it("should retrieve notification without alimtalk log", async () => {
      const mockNotification = {
        id: "notification-1",
        userId: "user-1",
        notificationType: "payment_success",
        title: "결제 완료",
        message: "₩240,000를 결제하셨습니다.",
        isRead: false,
        createdAt: new Date(),
        alimtalkLog: null,
      };

      (prismaService.notification.findUnique as jest.Mock).mockResolvedValue(
        mockNotification,
      );

      const result = await service.getNotification("notification-1", "user-1");

      expect(result.id).toBe("notification-1");
      expect(result.alimtalkLog).toBeNull();
    });

    it("should throw NotFoundException when notification not found", async () => {
      (prismaService.notification.findUnique as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(
        service.getNotification("non-existent-id", "user-1"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("markAsRead", () => {
    it("should mark notification as read successfully", async () => {
      const mockNotification = {
        id: "notification-1",
        userId: "user-1",
        isRead: false,
        notificationType: "payment_success",
        title: "결제 완료",
        message: "₩240,000를 결제하셨습니다.",
        createdAt: new Date(),
      };

      const updatedNotification = {
        ...mockNotification,
        isRead: true,
      };

      (prismaService.notification.findUnique as jest.Mock).mockResolvedValue(
        mockNotification,
      );
      (prismaService.notification.update as jest.Mock).mockResolvedValue(
        updatedNotification,
      );

      const result = await service.markAsRead("notification-1", "user-1");

      expect(result.isRead).toBe(true);
      expect(prismaService.notification.update).toHaveBeenCalledWith({
        where: { id: "notification-1" },
        data: { isRead: true, readAt: expect.any(Date) },
      });
    });

    it("should throw BadRequestException when already read", async () => {
      const mockNotification = {
        id: "notification-1",
        userId: "user-1",
        isRead: true,
      };

      (prismaService.notification.findUnique as jest.Mock).mockResolvedValue(
        mockNotification,
      );

      await expect(
        service.markAsRead("notification-1", "user-1"),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw NotFoundException when notification not found", async () => {
      (prismaService.notification.findUnique as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(
        service.markAsRead("non-existent-id", "user-1"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("getUnreadCount", () => {
    it("should return unread count for user", async () => {
      (prismaService.notification.count as jest.Mock).mockResolvedValue(5);

      const result = await service.getUnreadCount("user-1");

      expect(result.unreadCount).toBe(5);
      expect(prismaService.notification.count).toHaveBeenCalledWith({
        where: {
          userId: "user-1",
          isRead: false,
        },
      });
    });

    it("should return 0 when no unread notifications", async () => {
      (prismaService.notification.count as jest.Mock).mockResolvedValue(0);

      const result = await service.getUnreadCount("user-1");

      expect(result.unreadCount).toBe(0);
    });
  });

  describe("deleteNotification", () => {
    it("should delete notification successfully", async () => {
      const mockNotification = {
        id: "notification-1",
        userId: "user-1",
      };

      (prismaService.notification.findUnique as jest.Mock).mockResolvedValue(
        mockNotification,
      );
      (prismaService.notification.delete as jest.Mock).mockResolvedValue(
        mockNotification,
      );

      const result = await service.deleteNotification("notification-1", "user-1");

      expect(result.id).toBe("notification-1");
      expect(prismaService.notification.delete).toHaveBeenCalledWith({
        where: { id: "notification-1" },
      });
    });

    it("should throw NotFoundException when notification not found", async () => {
      (prismaService.notification.findUnique as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(
        service.deleteNotification("non-existent-id", "user-1"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("createAlimtalkLog", () => {
    it("should create alimtalk log successfully", async () => {
      const mockNotification = {
        id: "notification-1",
        userId: "user-1",
      };

      const mockAlimtalkLog = {
        id: "alimtalk-1",
        notificationId: "notification-1",
        phone: "01012345678",
        templateCode: "PAYMENT_SUCCESS",
        status: "pending",
        createdAt: new Date(),
      };

      (prismaService.notification.findUnique as jest.Mock).mockResolvedValue(
        mockNotification,
      );
      (prismaService.alimtalkLog.create as jest.Mock).mockResolvedValue(
        mockAlimtalkLog,
      );

      const result = await service.createAlimtalkLog(
        "notification-1",
        "01012345678",
        "PAYMENT_SUCCESS",
      );

      expect(result.status).toBe("pending");
      expect(result.phone).toBe("01012345678");
      expect(prismaService.alimtalkLog.create).toHaveBeenCalledWith({
        data: {
          notificationId: "notification-1",
          phone: "01012345678",
          templateCode: "PAYMENT_SUCCESS",
          status: "pending",
        },
      });
    });

    it("should throw NotFoundException when notification not found", async () => {
      (prismaService.notification.findUnique as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(
        service.createAlimtalkLog(
          "non-existent-id",
          "01012345678",
          "PAYMENT_SUCCESS",
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("updateAlimtalkStatus", () => {
    it("should update alimtalk status to sent", async () => {
      const mockAlimtalkLog = {
        id: "alimtalk-1",
        status: "pending",
      };

      const updatedLog = {
        id: "alimtalk-1",
        status: "sent",
        sentAt: new Date(),
      };

      (prismaService.alimtalkLog.findUnique as jest.Mock).mockResolvedValue(
        mockAlimtalkLog,
      );
      (prismaService.alimtalkLog.update as jest.Mock).mockResolvedValue(
        updatedLog,
      );

      const result = await service.updateAlimtalkStatus("alimtalk-1", "sent");

      expect(result.status).toBe("sent");
      expect(prismaService.alimtalkLog.update).toHaveBeenCalledWith({
        where: { id: "alimtalk-1" },
        data: {
          status: "sent",
          sentAt: expect.any(Date),
          responseData: null,
        },
      });
    });

    it("should update alimtalk status to failed", async () => {
      const mockAlimtalkLog = {
        id: "alimtalk-1",
        status: "pending",
      };

      const updatedLog = {
        id: "alimtalk-1",
        status: "failed",
        sentAt: null,
      };

      (prismaService.alimtalkLog.findUnique as jest.Mock).mockResolvedValue(
        mockAlimtalkLog,
      );
      (prismaService.alimtalkLog.update as jest.Mock).mockResolvedValue(
        updatedLog,
      );

      const result = await service.updateAlimtalkStatus("alimtalk-1", "failed");

      expect(result.status).toBe("failed");
    });

    it("should throw NotFoundException when alimtalk log not found", async () => {
      (prismaService.alimtalkLog.findUnique as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(
        service.updateAlimtalkStatus("non-existent-id", "sent"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw BadRequestException when not pending", async () => {
      const mockAlimtalkLog = {
        id: "alimtalk-1",
        status: "sent",
      };

      (prismaService.alimtalkLog.findUnique as jest.Mock).mockResolvedValue(
        mockAlimtalkLog,
      );

      await expect(
        service.updateAlimtalkStatus("alimtalk-1", "sent"),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("getFailedAlimtalks", () => {
    it("should retrieve failed alimtalk logs", async () => {
      const mockFailedLogs = [
        {
          id: "alimtalk-1",
          notificationId: "notification-1",
          phone: "01012345678",
          templateCode: "PAYMENT_SUCCESS",
          status: "failed",
          createdAt: new Date(),
          notification: {
            title: "결제 완료",
            message: "₩240,000를 결제하셨습니다.",
          },
        },
      ];

      (prismaService.alimtalkLog.findMany as jest.Mock).mockResolvedValue(
        mockFailedLogs,
      );

      const result = await service.getFailedAlimtalks(10);

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe("failed");
      expect(prismaService.alimtalkLog.findMany).toHaveBeenCalledWith({
        where: { status: "failed" },
        include: { notification: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
    });

    it("should return empty array when no failed logs", async () => {
      (prismaService.alimtalkLog.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getFailedAlimtalks();

      expect(result).toEqual([]);
    });
  });

  describe("getNotificationStats", () => {
    it("should calculate notification statistics for all users", async () => {
      const mockNotifications = [
        {
          id: "notification-1",
          notificationType: "payment_success",
          isRead: true,
        },
        {
          id: "notification-2",
          notificationType: "payment_success",
          isRead: false,
        },
        {
          id: "notification-3",
          notificationType: "membership_approved",
          isRead: false,
        },
        {
          id: "notification-4",
          notificationType: "class_created",
          isRead: true,
        },
      ];

      (prismaService.notification.count as jest.Mock)
        .mockResolvedValueOnce(4) // total
        .mockResolvedValueOnce(2); // unread

      (prismaService.notification.findMany as jest.Mock).mockResolvedValue(
        mockNotifications,
      );

      (prismaService.alimtalkLog.count as jest.Mock)
        .mockResolvedValueOnce(3) // sent
        .mockResolvedValueOnce(1) // failed
        .mockResolvedValueOnce(0); // pending

      const result = await service.getNotificationStats();

      expect(result.totalNotifications).toBe(4);
      expect(result.unreadCount).toBe(2);
      expect(result.readCount).toBe(2);
      expect(result.typeStats.payment_success).toBe(2);
      expect(result.typeStats.membership_approved).toBe(1);
      expect(result.typeStats.class_created).toBe(1);
      expect(result.alimtalk.sent).toBe(3);
      expect(result.alimtalk.failed).toBe(1);
      expect(result.alimtalk.pending).toBe(0);
    });

    it("should calculate statistics for specific user", async () => {
      const mockNotifications = [
        {
          id: "notification-1",
          notificationType: "payment_success",
          isRead: false,
        },
      ];

      (prismaService.notification.count as jest.Mock)
        .mockResolvedValueOnce(1) // total
        .mockResolvedValueOnce(1); // unread

      (prismaService.notification.findMany as jest.Mock).mockResolvedValue(
        mockNotifications,
      );

      (prismaService.alimtalkLog.count as jest.Mock)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      const result = await service.getNotificationStats("user-1");

      expect(result.totalNotifications).toBe(1);
      expect(result.unreadCount).toBe(1);
      expect(result.readCount).toBe(0);
      expect(prismaService.notification.count).toHaveBeenCalledWith({
        where: { userId: "user-1", isRead: false },
      });
    });
  });

  describe("createStandardNotification", () => {
    it("should create payment_success notification with template data", async () => {
      const mockNotification = {
        id: "notification-1",
        userId: "user-1",
        notificationType: "payment_success",
        title: "결제 완료",
        message: "₩240,000를 결제하셨습니다. (주문번호: ORD-1234567890-abc123)",
        isRead: false,
        createdAt: new Date(),
      };

      (prismaService.notification.create as jest.Mock).mockResolvedValue(
        mockNotification,
      );

      const result = await service.createStandardNotification(
        "user-1",
        "payment_success",
        {
          amount: "240,000",
          orderNumber: "ORD-1234567890-abc123",
        },
      );

      expect(result.notificationType).toBe("payment_success");
      const createCall = (prismaService.notification.create as jest.Mock).mock
        .calls[0][0];
      expect(createCall.data.message).toContain("240,000");
      expect(createCall.data.message).toContain("ORD-1234567890-abc123");
    });

    it("should create membership_approved notification", async () => {
      const mockNotification = {
        id: "notification-1",
        userId: "user-1",
        notificationType: "membership_approved",
        title: "가입 승인",
        message: "ACE 클럽 가입이 승인되었습니다.",
        isRead: false,
        createdAt: new Date(),
      };

      (prismaService.notification.create as jest.Mock).mockResolvedValue(
        mockNotification,
      );

      const result = await service.createStandardNotification(
        "user-1",
        "membership_approved",
        {
          name: "ACE 클럽",
        },
      );

      expect(result.notificationType).toBe("membership_approved");
    });

    it("should create class_cancelled notification", async () => {
      const mockNotification = {
        id: "notification-1",
        userId: "user-1",
        notificationType: "class_cancelled",
        title: "수업 취소",
        message: "피겨 스케이팅 101 수업이 취소되었습니다. (2026-01-05)",
        isRead: false,
        createdAt: new Date(),
      };

      (prismaService.notification.create as jest.Mock).mockResolvedValue(
        mockNotification,
      );

      const result = await service.createStandardNotification(
        "user-1",
        "class_cancelled",
        {
          className: "피겨 스케이팅 101",
          cancelDate: "2026-01-05",
        },
      );

      expect(result.notificationType).toBe("class_cancelled");
    });

    it("should throw BadRequestException for unsupported type", async () => {
      await expect(
        service.createStandardNotification("user-1", "unsupported_type", {}),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("renderTemplate", () => {
    it("should render template with single variable", () => {
      const template = "Welcome {{name}}!";
      const result = NotificationsService.renderTemplate(template, {
        name: "John",
      });

      expect(result).toBe("Welcome John!");
    });

    it("should render template with multiple variables", () => {
      const template = "{{clubName}} 클럽 가입이 {{status}}되었습니다.";
      const result = NotificationsService.renderTemplate(template, {
        clubName: "ACE",
        status: "승인",
      });

      expect(result).toBe("ACE 클럽 가입이 승인되었습니다.");
    });

    it("should handle template with no variables", () => {
      const template = "안녕하세요!";
      const result = NotificationsService.renderTemplate(template, {});

      expect(result).toBe("안녕하세요!");
    });

    it("should handle missing variables gracefully", () => {
      const template = "{{firstName}} {{lastName}}입니다.";
      const result = NotificationsService.renderTemplate(template, {
        firstName: "Kim",
      });

      expect(result).toBe("Kim {{lastName}}입니다.");
    });

    it("should handle complex amounts and special characters", () => {
      const template =
        "₩{{amount}}를 결제하셨습니다. (주문번호: {{orderNumber}})";
      const result = NotificationsService.renderTemplate(template, {
        amount: "240,000",
        orderNumber: "ORD-1234567890-abc123",
      });

      expect(result).toBe(
        "₩240,000를 결제하셨습니다. (주문번호: ORD-1234567890-abc123)",
      );
    });
  });
});
