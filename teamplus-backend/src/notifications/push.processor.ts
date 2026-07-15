import { Process, Processor } from "@nestjs/bull";
import { Logger } from "@nestjs/common";
import { Job } from "bull";
import {
  NotificationsService,
  AdminPushJobData,
} from "./notifications.service";

/**
 * 관리자 광역(all/role) Push 브로드캐스트 큐 프로세서.
 *
 * sendAdminPush 가 HTTP 요청 스레드에서 500청크 순차 발송 + 백오프 sleep 을
 * 동기 수행하던 것(B5)을 큐로 분리 — 요청은 즉시 접수 응답하고, 발송 결과는
 * PushNotificationLog(queued → sent/partial/failed) 로 추적한다.
 *
 * attempts:1 정책 — 부분 성공 후 Bull 재시도는 중복 푸시를 유발하므로 잡 레벨
 * 재시도를 하지 않는다 (청크 단위 재시도는 FcmService 내부 것만 사용).
 * 실패는 재throw 하지 않고 로그 행에 기록해 잡을 종결시킨다.
 */
@Processor("push")
export class PushProcessor {
  private readonly logger = new Logger(PushProcessor.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  @Process("send-admin-push")
  async handleSendAdminPush(job: Job<AdminPushJobData>): Promise<void> {
    this.logger.log(
      `Admin Push 큐 처리 시작: jobId=${job.id}, pushLogId=${job.data.pushLogId}, ` +
        `targetType=${job.data.targetType}`,
    );

    try {
      await this.notificationsService.executeAdminPushJob(job.data);
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Admin Push 큐 처리 실패: pushLogId=${job.data.pushLogId} — ${err.message}`,
      );
      await this.notificationsService.markAdminPushJobFailed(
        job.data.pushLogId,
        err.message,
      );
    }
  }
}
