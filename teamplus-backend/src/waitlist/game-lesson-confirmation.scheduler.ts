import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "@/prisma/prisma.service";
import { NotificationsService } from "@/notifications/notifications.service";
import { WaitlistService } from "./waitlist.service";

/**
 * 게임 레슨 전날 대기자 확정 배치
 *
 * 매일 20:00에 다음 날 수업에 해당하는 CONFIRMED 상태 대기자를 스캔합니다.
 * - 확인 기한이 남아 있으면: 리마인더 알림 발송
 * - 확인 기한이 만료됐으면: EXPIRED 처리 후 다음 대기자 승격
 */
@Injectable()
export class GameLessonConfirmationScheduler {
  private readonly logger = new Logger(GameLessonConfirmationScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly waitlistService: WaitlistService,
  ) {}

  @Cron("0 20 * * *")
  async processNextDayGameLessonConfirmations(): Promise<void> {
    this.logger.log("게임 레슨 전날 확정 배치 시작");

    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const startOfTomorrow = new Date(tomorrow);
      startOfTomorrow.setHours(0, 0, 0, 0);

      const endOfTomorrow = new Date(tomorrow);
      endOfTomorrow.setHours(23, 59, 59, 999);

      // 내일 예정된 수업 스케줄 조회
      const tomorrowSchedules = await this.prisma.classSchedule.findMany({
        where: {
          scheduledDate: { gte: startOfTomorrow, lte: endOfTomorrow },
          isCancelled: false,
        },
        select: { id: true, classId: true },
      });

      if (tomorrowSchedules.length === 0) {
        this.logger.log("내일 예정된 수업이 없습니다.");
        return;
      }

      const classIds = [...new Set(tomorrowSchedules.map((s) => s.classId))];

      // 해당 수업들의 CONFIRMED 상태 대기자 조회
      const confirmedWaitlists = await this.prisma.waitlist.findMany({
        where: {
          classId: { in: classIds },
          status: "CONFIRMED",
        },
        include: {
          class: { select: { id: true, className: true } },
        },
      });

      if (confirmedWaitlists.length === 0) {
        this.logger.log("확정 대기 중인 대기자가 없습니다.");
        return;
      }

      const now = new Date();
      let reminderCount = 0;
      let expiredCount = 0;

      // [2026-05-14 N+1 해소] expired vs reminder 분리 후 일괄 처리.
      //   기존: for...of 안에서 update + promoteNextWaitlist + createNotification 각각 await
      //   변경: updateMany + Promise.all 로 병렬 처리.
      const expiredItems = confirmedWaitlists.filter(
        (w) => w.expiresAt && now > w.expiresAt,
      );
      const reminderItems = confirmedWaitlists.filter(
        (w) => !w.expiresAt || now <= w.expiresAt,
      );

      // 만료 처리 — updateMany 1회 + 중복 제거된 classId 병렬 승격
      if (expiredItems.length > 0) {
        try {
          await this.prisma.waitlist.updateMany({
            where: { id: { in: expiredItems.map((w) => w.id) } },
            data: { status: "EXPIRED" },
          });
          const uniqueClassIds = Array.from(
            new Set(expiredItems.map((w) => w.classId)),
          );
          await Promise.all(
            uniqueClassIds.map((classId) =>
              this.waitlistService
                .promoteNextWaitlist(classId)
                .catch((e) =>
                  this.logger.warn(
                    `승격 실패 classId=${classId}: ${e instanceof Error ? e.message : e}`,
                  ),
                ),
            ),
          );
          expiredCount = expiredItems.length;
        } catch (error) {
          this.logger.error(
            `만료 일괄 처리 실패: ${error instanceof Error ? error.message : error}`,
          );
        }
      }

      // 리마인더 알림 — Promise.all 병렬 발송 (실패는 개별 로깅)
      const reminderResults = await Promise.allSettled(
        reminderItems.map((waitlist) =>
          this.notificationsService.createNotification({
            userId: waitlist.userId,
            notificationType: "waitlist_confirm_reminder",
            title: "내일 수업 확정 알림",
            message: `${waitlist.class?.className || "수업"} 수업이 내일입니다. 아직 확정 신청을 완료하지 않으셨습니다. 기한 내에 확정해 주세요.`,
          }),
        ),
      );
      reminderCount = reminderResults.filter(
        (r) => r.status === "fulfilled",
      ).length;
      reminderResults.forEach((r, idx) => {
        if (r.status === "rejected") {
          this.logger.error(
            `리마인더 발송 실패: waitlistId=${reminderItems[idx].id}, error=${r.reason instanceof Error ? r.reason.message : r.reason}`,
          );
        }
      });

      this.logger.log(
        `게임 레슨 전날 확정 배치 완료: 리마인더=${reminderCount}건, 만료=${expiredCount}건`,
      );
    } catch (error) {
      this.logger.error(
        `게임 레슨 전날 확정 배치 실패: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
