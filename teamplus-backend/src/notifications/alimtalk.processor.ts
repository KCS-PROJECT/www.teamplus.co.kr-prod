import { Process, Processor } from "@nestjs/bull";
import { Logger } from "@nestjs/common";
import { Job } from "bull";
import { AlimtalkGateway } from "./alimtalk.gateway";
import { PrismaService } from "@/prisma/prisma.service";
import { SendAlimtalkDto } from "./dto/alimtalk.dto";

interface AlimtalkJobData {
  dto: SendAlimtalkDto;
  notificationId: string;
}

@Processor("alimtalk")
export class AlimtalkProcessor {
  private readonly logger = new Logger(AlimtalkProcessor.name);

  constructor(
    private readonly alimtalkGateway: AlimtalkGateway,
    private readonly prisma: PrismaService,
  ) {}

  @Process("send-alimtalk")
  async handleSendAlimtalk(job: Job<AlimtalkJobData>): Promise<void> {
    const { dto, notificationId } = job.data;
    const attempt = job.attemptsMade + 1;

    this.logger.log(`알림톡 발송 처리: jobId=${job.id} (시도: ${attempt}/3)`);

    try {
      const result = await this.alimtalkGateway.sendAlimtalk(dto);

      await this.prisma.alimtalkLog.updateMany({
        where: { notificationId, status: "pending" },
        data: {
          status: "sent",
          sentAt: new Date(),
          responseData: result.responseData,
        },
      });

      this.logger.log(`알림톡 발송 완료: jobId=${job.id}`);
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `알림톡 발송 실패: jobId=${job.id} (시도: ${attempt}/3)`,
        err.message,
      );

      // 3회 모두 실패한 경우 (attemptsMade는 0-indexed)
      const isLastAttempt = job.attemptsMade >= 2;
      if (isLastAttempt) {
        await this.prisma.alimtalkLog.updateMany({
          where: { notificationId, status: "pending" },
          data: {
            status: "failed",
            responseData: {
              error: err.message,
              retryCount: attempt,
            },
          },
        });
      }

      // Bull이 backoff 설정에 따라 자동 재시도하도록 에러 재throw
      throw error;
    }
  }
}
