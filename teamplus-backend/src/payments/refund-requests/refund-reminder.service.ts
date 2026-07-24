import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { RefundRequestService } from "./refund-request.service";

/**
 * RefundReminderService — 환불 요청 N일 미응답 리마인더 (N3).
 *
 * 매일 09:00 KST, pending 상태 + createdAt 이 REFUND_REMINDER_DAYS(기본 2일) 이전인
 * 요청의 소속 감독/아카데미에게 재알림한다. SLA 자동 처리(승인/거절)는 하지 않는다.
 * (ReminderScheduler·CreditExpiry 등 기존 일 09:00 스케줄 태스크와 동일 패턴)
 */
@Injectable()
export class RefundReminderService {
  private readonly logger = new Logger(RefundReminderService.name);
  private readonly reminderDays: number;

  constructor(private readonly refundRequestService: RefundRequestService) {
    const parsed = Number(process.env.REFUND_REMINDER_DAYS);
    this.reminderDays = Number.isFinite(parsed) && parsed > 0 ? parsed : 2;
  }

  @Cron("0 9 * * *")
  async handleRefundReminder(): Promise<void> {
    try {
      const sent = await this.refundRequestService.remindPending(
        this.reminderDays,
      );
      if (sent > 0) {
        this.logger.log(`환불 요청 미처리 리마인더 ${sent}건 발송`);
      }
    } catch (error) {
      this.logger.error(
        `환불 요청 리마인더 처리 실패: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
