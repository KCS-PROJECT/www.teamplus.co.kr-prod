import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { PrismaService } from "@/prisma/prisma.service";
import { SendAlimtalkDto } from "./dto/alimtalk.dto";

@Injectable()
export class NotificationQueue {
  private readonly logger = new Logger(NotificationQueue.name);

  constructor(
    @InjectQueue("alimtalk") private readonly alimtalkQueue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 알림톡 발송 작업 추가
   *
   * Bull Queue에 작업 등록: 3회 재시도, exponential backoff (1s → 2s → 4s)
   */
  async addJob(dto: SendAlimtalkDto, notificationId: string): Promise<string> {
    const job = await this.alimtalkQueue.add(
      "send-alimtalk",
      { dto, notificationId },
      {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    this.logger.log(
      `알림톡 작업 추가: jobId=${job.id} (notificationId: ${notificationId})`,
    );

    await this.prisma.alimtalkLog.create({
      data: {
        notificationId,
        phone: dto.phone,
        templateCode: dto.templateCode,
        status: "pending",
      },
    });

    return job.id.toString();
  }

  /**
   * 큐 상태 조회
   */
  async getQueueStatus(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }> {
    const [waiting, active, completed, failed] = await Promise.all([
      this.alimtalkQueue.getWaitingCount(),
      this.alimtalkQueue.getActiveCount(),
      this.alimtalkQueue.getCompletedCount(),
      this.alimtalkQueue.getFailedCount(),
    ]);

    return { waiting, active, completed, failed };
  }
}
