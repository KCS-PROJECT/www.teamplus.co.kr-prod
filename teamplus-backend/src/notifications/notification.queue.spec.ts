import { Test, TestingModule } from "@nestjs/testing";
import { getQueueToken } from "@nestjs/bull";
import { NotificationQueue } from "./notification.queue";
import { PrismaService } from "@/prisma/prisma.service";
import { SendAlimtalkDto } from "./dto/alimtalk.dto";

describe("NotificationQueue", () => {
  let service: NotificationQueue;

  const mockAlimtalkDto: SendAlimtalkDto = {
    phone: "01012345678",
    templateCode: "payment_success",
    templateData: {
      orderNumber: "ORD-123",
      amount: "240,000",
      className: "신규 수강생반",
    },
  };

  // Bull Queue mock — addJob/getQueueStatus가 사용하는 메서드만 제공
  const mockQueue = {
    add: jest.fn().mockResolvedValue({ id: 42 }),
    getWaitingCount: jest.fn().mockResolvedValue(1),
    getActiveCount: jest.fn().mockResolvedValue(2),
    getCompletedCount: jest.fn().mockResolvedValue(3),
    getFailedCount: jest.fn().mockResolvedValue(4),
  };

  const mockPrismaService = {
    alimtalkLog: {
      create: jest.fn().mockResolvedValue({
        id: "log-uuid",
        notificationId: "notification-uuid",
        phone: mockAlimtalkDto.phone,
        templateCode: mockAlimtalkDto.templateCode,
        status: "pending",
      }),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationQueue,
        {
          provide: getQueueToken("alimtalk"),
          useValue: mockQueue,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<NotificationQueue>(NotificationQueue);
  });

  describe("addJob", () => {
    it("should add a job to the Bull queue and return the job id", async () => {
      const notificationId = "notification-uuid";

      const jobId = await service.addJob(mockAlimtalkDto, notificationId);

      expect(jobId).toBe("42");
      expect(mockQueue.add).toHaveBeenCalledWith(
        "send-alimtalk",
        { dto: mockAlimtalkDto, notificationId },
        {
          attempts: 3,
          backoff: { type: "exponential", delay: 1000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
    });

    it("should create an alimtalk log with pending status", async () => {
      const notificationId = "notification-uuid";

      await service.addJob(mockAlimtalkDto, notificationId);

      expect(mockPrismaService.alimtalkLog.create).toHaveBeenCalledWith({
        data: {
          notificationId,
          phone: mockAlimtalkDto.phone,
          templateCode: mockAlimtalkDto.templateCode,
          status: "pending",
        },
      });
    });

    it("should create exactly one log entry per job", async () => {
      await service.addJob(mockAlimtalkDto, "notification-uuid");

      expect(mockPrismaService.alimtalkLog.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("getQueueStatus", () => {
    it("should aggregate Bull queue counts", async () => {
      const status = await service.getQueueStatus();

      expect(status).toEqual({
        waiting: 1,
        active: 2,
        completed: 3,
        failed: 4,
      });
      expect(mockQueue.getWaitingCount).toHaveBeenCalledTimes(1);
      expect(mockQueue.getActiveCount).toHaveBeenCalledTimes(1);
      expect(mockQueue.getCompletedCount).toHaveBeenCalledTimes(1);
      expect(mockQueue.getFailedCount).toHaveBeenCalledTimes(1);
    });
  });
});
