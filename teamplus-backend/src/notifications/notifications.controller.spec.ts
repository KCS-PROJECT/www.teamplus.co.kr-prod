import { Test, TestingModule } from "@nestjs/testing";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { BadRequestException, NotFoundException } from "@nestjs/common";

describe("NotificationsController", () => {
  let controller: NotificationsController;

  const mockUserId = "user-uuid";
  const mockNotificationId = "notification-uuid";
  const mockRequest = { user: { id: mockUserId } } as any;

  const mockNotification = {
    id: mockNotificationId,
    userId: mockUserId,
    notificationType: "payment_success",
    title: "결제 완료",
    message: "₩240,000를 결제하셨습니다.",
    isRead: false,
    createdAt: new Date("2026-01-04T10:00:00Z"),
  };

  const mockNotificationStats = {
    totalNotifications: 100,
    unreadCount: 25,
    readCount: 75,
    typeStats: {
      payment_success: 30,
      membership_approved: 20,
      class_created: 50,
    },
    alimtalk: {
      sent: 85,
      failed: 5,
      pending: 10,
    },
  };

  const mockNotificationsService = {
    getUserNotifications: jest.fn(),
    getNotification: jest.fn(),
    getUnreadCount: jest.fn(),
    markAsRead: jest.fn(),
    deleteNotification: jest.fn(),
    getNotificationStats: jest.fn(),
    getFailedAlimtalks: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
      ],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /api/v1/notifications", () => {
    it("should return user notifications with default pagination", async () => {
      const notifications = [
        mockNotification,
        { ...mockNotification, id: "notification-2" },
      ];
      mockNotificationsService.getUserNotifications.mockResolvedValue(
        notifications,
      );

      const result = await controller.getUserNotifications(mockRequest);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(
        mockNotificationsService.getUserNotifications,
      ).toHaveBeenCalledWith(mockUserId, 20, 0, undefined);
    });

    it("should return notifications with custom limit", async () => {
      mockNotificationsService.getUserNotifications.mockResolvedValue([
        mockNotification,
      ]);

      const result = await controller.getUserNotifications(mockRequest, "5");

      expect(result.length).toBe(1);
      expect(
        mockNotificationsService.getUserNotifications,
      ).toHaveBeenCalledWith(mockUserId, 5, 0, undefined);
    });

    it("should return notifications with custom skip", async () => {
      mockNotificationsService.getUserNotifications.mockResolvedValue([
        mockNotification,
      ]);

      await controller.getUserNotifications(mockRequest, "10", "5");

      expect(
        mockNotificationsService.getUserNotifications,
      ).toHaveBeenCalledWith(mockUserId, 10, 5, undefined);
    });

    it("should return empty array if no notifications", async () => {
      mockNotificationsService.getUserNotifications.mockResolvedValue([]);

      const result = await controller.getUserNotifications(mockRequest);

      expect(result).toEqual([]);
    });
  });

  describe("GET /api/v1/notifications/:notificationId", () => {
    it("should return notification details", async () => {
      mockNotificationsService.getNotification.mockResolvedValue(
        mockNotification,
      );

      const result = await controller.getNotification(
        mockRequest,
        mockNotificationId,
      );

      expect(result.id).toBe(mockNotificationId);
      expect(result.notificationType).toBe("payment_success");
      expect(mockNotificationsService.getNotification).toHaveBeenCalledWith(
        mockNotificationId,
        mockUserId,
      );
    });

    it("should throw NotFoundException if notification not found", async () => {
      mockNotificationsService.getNotification.mockRejectedValue(
        new NotFoundException("알림을 찾을 수 없습니다."),
      );

      await expect(controller.getNotification(mockRequest, "non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("GET /api/v1/notifications/stats/unread", () => {
    it("should return unread count", async () => {
      mockNotificationsService.getUnreadCount.mockResolvedValue({
        unreadCount: 5,
      });

      const result = await controller.getUnreadCount(mockRequest);

      expect(result.unreadCount).toBe(5);
      expect(mockNotificationsService.getUnreadCount).toHaveBeenCalledWith(
        mockUserId,
      );
    });

    it("should return zero if no unread notifications", async () => {
      mockNotificationsService.getUnreadCount.mockResolvedValue({
        unreadCount: 0,
      });

      const result = await controller.getUnreadCount(mockRequest);

      expect(result.unreadCount).toBe(0);
    });
  });

  describe("PATCH /api/v1/notifications/:notificationId/read", () => {
    it("should mark notification as read", async () => {
      const readNotification = { ...mockNotification, isRead: true };
      mockNotificationsService.markAsRead.mockResolvedValue(readNotification);

      const result = await controller.markAsRead(mockRequest, mockNotificationId);

      expect(result.isRead).toBe(true);
      expect(mockNotificationsService.markAsRead).toHaveBeenCalledWith(
        mockNotificationId,
        mockUserId,
      );
    });

    it("should throw NotFoundException if notification not found", async () => {
      mockNotificationsService.markAsRead.mockRejectedValue(
        new NotFoundException("알림을 찾을 수 없습니다."),
      );

      await expect(controller.markAsRead(mockRequest, "non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should throw BadRequestException if already read", async () => {
      mockNotificationsService.markAsRead.mockRejectedValue(
        new BadRequestException("이미 읽은 알림입니다."),
      );

      await expect(controller.markAsRead(mockRequest, mockNotificationId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("DELETE /api/v1/notifications/:notificationId", () => {
    it("should delete notification", async () => {
      const deletedNotification = { id: mockNotificationId };
      mockNotificationsService.deleteNotification.mockResolvedValue(
        deletedNotification,
      );

      const result = await controller.deleteNotification(
        mockRequest,
        mockNotificationId,
      );

      expect(result.id).toBe(mockNotificationId);
      expect(mockNotificationsService.deleteNotification).toHaveBeenCalledWith(
        mockNotificationId,
        mockUserId,
      );
    });

    it("should throw NotFoundException if notification not found", async () => {
      mockNotificationsService.deleteNotification.mockRejectedValue(
        new NotFoundException("알림을 찾을 수 없습니다."),
      );

      await expect(
        controller.deleteNotification(mockRequest, "non-existent"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("GET /api/v1/notifications/admin/stats", () => {
    it("should return notification stats", async () => {
      mockNotificationsService.getNotificationStats.mockResolvedValue(
        mockNotificationStats,
      );

      const result = await controller.getNotificationStats();

      expect(result.totalNotifications).toBe(100);
      expect(result.unreadCount).toBe(25);
      expect(result.readCount).toBe(75);
      expect(
        mockNotificationsService.getNotificationStats,
      ).toHaveBeenCalledWith(undefined);
    });

    it("should return stats filtered by userId", async () => {
      mockNotificationsService.getNotificationStats.mockResolvedValue({
        ...mockNotificationStats,
        totalNotifications: 10,
      });

      await controller.getNotificationStats(mockUserId);

      expect(
        mockNotificationsService.getNotificationStats,
      ).toHaveBeenCalledWith(mockUserId);
    });

    it("should return stats with alimtalk info", async () => {
      mockNotificationsService.getNotificationStats.mockResolvedValue(
        mockNotificationStats,
      );

      const result = await controller.getNotificationStats();

      expect(result.alimtalk).toBeDefined();
      expect(result.alimtalk.sent).toBe(85);
      expect(result.alimtalk.failed).toBe(5);
    });
  });

  describe("GET /api/v1/notifications/admin/failed-alimtalks", () => {
    const mockFailedAlimtalks = [
      {
        id: "alimtalk-1",
        phone: "010-1234-5678",
        templateCode: "payment_success",
        status: "failed",
        errorMessage: "전송 실패",
        createdAt: new Date("2026-01-04T10:00:00Z"),
      },
    ];

    it("should return failed alimtalks with default limit", async () => {
      mockNotificationsService.getFailedAlimtalks.mockResolvedValue(
        mockFailedAlimtalks,
      );

      const result = await controller.getFailedAlimtalks();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(mockNotificationsService.getFailedAlimtalks).toHaveBeenCalledWith(
        10,
      );
    });

    it("should return failed alimtalks with custom limit", async () => {
      mockNotificationsService.getFailedAlimtalks.mockResolvedValue(
        mockFailedAlimtalks,
      );

      await controller.getFailedAlimtalks("5");

      expect(mockNotificationsService.getFailedAlimtalks).toHaveBeenCalledWith(
        5,
      );
    });

    it("should return empty array if no failed alimtalks", async () => {
      mockNotificationsService.getFailedAlimtalks.mockResolvedValue([]);

      const result = await controller.getFailedAlimtalks();

      expect(result).toEqual([]);
    });
  });

  describe("Error Handling", () => {
    it("should propagate service errors correctly", async () => {
      const error = new BadRequestException("Service error");
      mockNotificationsService.markAsRead.mockRejectedValue(error);

      await expect(controller.markAsRead(mockRequest, mockNotificationId)).rejects.toThrow(
        error,
      );
    });

    it("should handle unexpected errors", async () => {
      mockNotificationsService.getNotification.mockRejectedValue(
        new Error("Unexpected error"),
      );

      await expect(
        controller.getNotification(mockRequest, mockNotificationId),
      ).rejects.toThrow(Error);
    });
  });

  describe("API Response Format", () => {
    it("should return correct notification structure", async () => {
      mockNotificationsService.getNotification.mockResolvedValue(
        mockNotification,
      );

      const result = await controller.getNotification(
        mockRequest,
        mockNotificationId,
      );

      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("notificationType");
      expect(result).toHaveProperty("title");
      expect(result).toHaveProperty("message");
      expect(result).toHaveProperty("isRead");
      expect(result).toHaveProperty("createdAt");
    });

    it("should return correct stats structure", async () => {
      mockNotificationsService.getNotificationStats.mockResolvedValue(
        mockNotificationStats,
      );

      const result = await controller.getNotificationStats();

      expect(result).toHaveProperty("totalNotifications");
      expect(result).toHaveProperty("unreadCount");
      expect(result).toHaveProperty("readCount");
      expect(result).toHaveProperty("typeStats");
      expect(result).toHaveProperty("alimtalk");
    });
  });
});
