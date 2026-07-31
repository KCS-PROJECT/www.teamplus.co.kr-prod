import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { RefundRequestService } from "./refund-request.service";

/**
 * RefundReminderService — 환불 요청 미응답 리마인더(N3) + 처리기한 초과 에스컬레이션(N4).
 *
 * 매일 09:00 KST 실행.
 *  - REFUND_REMINDER_DAYS(기본 2일) 초과 → 소속 감독/아카데미 재알림
 *  - REFUND_ESCALATION_DAYS(기본 3일) 초과 → 운영자(ADMIN/SYSTEM/OPER) 에스컬레이션 +
 *    소비자 지연 안내. 대금 환급은 청약철회 통지 후 3영업일 내가 원칙이라
 *    (전자상거래법 §18) 감독 미처리로 무기한 방치되는 상태를 남기지 않는다.
 * 금전 이동 자동 실행은 하지 않는다(오환불 위험) — 개입 경로만 강제.
 */
@Injectable()
export class RefundReminderService {
  private readonly logger = new Logger(RefundReminderService.name);
  private readonly reminderDays: number;
  private readonly escalationDays: number;

  constructor(private readonly refundRequestService: RefundRequestService) {
    const parsed = Number(process.env.REFUND_REMINDER_DAYS);
    this.reminderDays = Number.isFinite(parsed) && parsed > 0 ? parsed : 2;
    const parsedEsc = Number(process.env.REFUND_ESCALATION_DAYS);
    this.escalationDays =
      Number.isFinite(parsedEsc) && parsedEsc > 0 ? parsedEsc : 3;
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

    // 리마인더 실패가 에스컬레이션을 막지 않도록 분리 실행.
    try {
      const escalated = await this.refundRequestService.escalateStalePending(
        this.escalationDays,
      );
      if (escalated > 0) {
        this.logger.warn(`환불 요청 처리기한 초과 ${escalated}건 에스컬레이션`);
      }
    } catch (error) {
      this.logger.error(
        `환불 요청 에스컬레이션 실패: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
