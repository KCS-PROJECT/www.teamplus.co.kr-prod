import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "@/prisma/prisma.service";
import { NotificationsService } from "@/notifications/notifications.service";

/**
 * 레슨/수업 확정 배치 서비스
 *
 * 매일 18시(KST) 실행:
 * 1. 다음 날 수업 일정(ClassSchedule) 조회
 * 2. RSVP status=ATTENDING인 건을 확정 처리
 * 3. RSVP status=PENDING(미응답)인 건을 DECLINED 처리
 * 4. 미확정 건에 대해 대기자(Waitlist) 승격 시도
 * 5. 참석 확정자에게 알림 발송
 */
@Injectable()
export class LessonConfirmationService {
  private readonly logger = new Logger(LessonConfirmationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * 매일 18시(KST) 다음 날 수업 확정 배치
   */
  @Cron("0 18 * * *", { timeZone: "Asia/Seoul" })
  async confirmNextDayLessons(): Promise<void> {
    this.logger.log("=== 레슨 확정 배치 시작 ===");

    try {
      // 다음 날 날짜 범위 계산 (KST 기준)
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const startOfDay = new Date(tomorrow);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(tomorrow);
      endOfDay.setHours(23, 59, 59, 999);

      // 다음 날 수업 일정 조회 (취소되지 않은 일정만)
      const schedules = await this.prisma.classSchedule.findMany({
        where: {
          scheduledDate: {
            gte: startOfDay,
            lte: endOfDay,
          },
          isCancelled: false,
        },
        select: {
          id: true,
          classId: true,
          scheduledDate: true,
          class: {
            select: {
              id: true,
              className: true,
              capacity: true,
            },
          },
        },
      });

      if (schedules.length === 0) {
        this.logger.log("다음 날 수업 일정 없음 — 배치 종료");
        return;
      }

      this.logger.log(`다음 날 수업 일정 ${schedules.length}건 처리 시작`);

      let confirmedCount = 0;
      let declinedCount = 0;

      for (const schedule of schedules) {
        const result = await this.processScheduleConfirmation(schedule);
        confirmedCount += result.confirmed;
        declinedCount += result.declined;
      }

      this.logger.log(
        `=== 레슨 확정 배치 완료: 확정 ${confirmedCount}건, 미응답 처리 ${declinedCount}건 ===`,
      );
    } catch (error) {
      this.logger.error(`레슨 확정 배치 실패: ${error.message}`, error.stack);
    }
  }

  /**
   * 개별 수업 일정의 RSVP 확정 처리
   */
  private async processScheduleConfirmation(schedule: {
    id: string;
    classId: string;
    scheduledDate: Date;
    class: { id: string; className: string; capacity: number };
  }): Promise<{ confirmed: number; declined: number }> {
    const className = schedule.class?.className || "수업";

    // 해당 일정의 RSVP 목록 조회
    const rsvps = await this.prisma.classRsvp.findMany({
      where: { scheduleId: schedule.id },
      select: {
        id: true,
        userId: true,
        childId: true,
        status: true,
      },
    });

    const pendingRsvps = rsvps.filter((r) => r.status === "PENDING");
    const attendingRsvps = rsvps.filter((r) => r.status === "ATTENDING");

    // PENDING(미응답) → DECLINED 일괄 처리
    if (pendingRsvps.length > 0) {
      await this.prisma.classRsvp.updateMany({
        where: {
          scheduleId: schedule.id,
          status: "PENDING",
        },
        data: {
          status: "DECLINED",
          respondedAt: new Date(),
          note: "마감 시간 미응답으로 자동 불참 처리",
        },
      });

      // 미응답자에게 알림
      for (const rsvp of pendingRsvps) {
        this.notificationsService
          .createNotification({
            userId: rsvp.userId,
            notificationType: "rsvp_auto_declined",
            title: "수업 참석 미응답 처리",
            message: `${className} 수업에 미응답하여 자동으로 불참 처리되었습니다.`,
          })
          .catch((err) =>
            this.logger.warn(
              `미응답 알림 발송 실패: userId=${rsvp.userId}, error=${err.message}`,
            ),
          );
      }
    }

    // 참석 확정자에게 확정 알림
    for (const rsvp of attendingRsvps) {
      this.notificationsService
        .createNotification({
          userId: rsvp.userId,
          notificationType: "lesson_confirmed",
          title: "수업 참석 확정",
          message: `내일 ${className} 수업 참석이 확정되었습니다.`,
        })
        .catch((err) =>
          this.logger.warn(
            `확정 알림 발송 실패: userId=${rsvp.userId}, error=${err.message}`,
          ),
        );
    }

    // 불참 처리 후 대기자(Waitlist) 승격 시도
    if (pendingRsvps.length > 0) {
      await this.tryPromoteWaitlist(schedule.classId, pendingRsvps.length);
    }

    return {
      confirmed: attendingRsvps.length,
      declined: pendingRsvps.length,
    };
  }

  /**
   * 대기자 승격 시도
   * 불참 처리된 인원만큼 대기자를 승격시킴
   */
  private async tryPromoteWaitlist(
    classId: string,
    slotsAvailable: number,
  ): Promise<void> {
    const waitingList = await this.prisma.waitlist.findMany({
      where: {
        classId,
        status: "WAITING",
      },
      orderBy: { position: "asc" },
      take: slotsAvailable,
      select: {
        id: true,
        userId: true,
        classId: true,
      },
    });

    if (waitingList.length === 0) return;

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    for (const entry of waitingList) {
      await this.prisma.waitlist.update({
        where: { id: entry.id },
        data: {
          status: "CONFIRMED",
          notifiedAt: new Date(),
          expiresAt,
        },
      });

      this.notificationsService
        .createNotification({
          userId: entry.userId,
          notificationType: "waitlist_promoted",
          title: "대기 순번이 도래했습니다",
          message: "수업에 자리가 생겼습니다. 24시간 내에 확정해주세요.",
        })
        .catch((err) =>
          this.logger.warn(
            `대기자 승격 알림 실패: userId=${entry.userId}, error=${err.message}`,
          ),
        );
    }

    this.logger.log(
      `대기자 승격: classId=${classId}, ${waitingList.length}명 승격`,
    );
  }
}
