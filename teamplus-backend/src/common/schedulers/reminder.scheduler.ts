import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class ReminderScheduler {
  private readonly logger = new Logger(ReminderScheduler.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 1시간마다: 미응답 RSVP 리마인드
   * - 24시간 전에 생성된 PENDING RSVP 중 미응답 건 조회
   * - 해당 사용자에게 알림 생성
   */
  // ─── RSVP_DISABLED_2026-05-28 ─── BEGIN ─────────────────────────
  // [STATUS] cron 비활성 — 신규 자동 생성 차단 후 기존 PENDING 잔여 데이터에 매시간 알림 발송 방지
  // [WHY] RSVP 기능 미완성 (학부모 /rsvp API 경로 오류, 코치 /coach-rsvp 진입점 0개) + 백데이터 6건 전수 검증 결과 비즈니스 출처 0건
  // [TO RE-ENABLE] 아래 @Cron 데코레이터 주석 해제
  // [TO DELETE] grep "RSVP_DISABLED_2026-05-28" 으로 일괄 검색 → handleRsvpReminder 함수 통째 삭제
  // [REF] docs/Planning/RSVP_FEATURE_ANALYSIS.md §6
  // @Cron(CronExpression.EVERY_HOUR)
  // ─── RSVP_DISABLED_2026-05-28 ─── END ───────────────────────────
  async handleRsvpReminder() {
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const pendingRsvps = await this.prisma.classRsvp.findMany({
        where: {
          status: "PENDING",
          createdAt: { lt: twentyFourHoursAgo },
        },
        include: {
          schedule: {
            select: {
              id: true,
              scheduledDate: true,
              class: { select: { className: true } },
            },
          },
        },
      });

      if (pendingRsvps.length === 0) return;

      // 중복 알림 방지: 최근 24시간 이내 동일 사용자에게 rsvp_reminder 발송 이력 확인
      const recentNotifications = await this.prisma.notification.findMany({
        where: {
          notificationType: "rsvp_reminder",
          createdAt: { gte: twentyFourHoursAgo },
        },
        select: { userId: true },
      });
      const recentlyNotifiedUserIds = new Set(
        recentNotifications.map((n) => n.userId),
      );

      const notifications = pendingRsvps
        .filter((rsvp) => !recentlyNotifiedUserIds.has(rsvp.userId))
        .map((rsvp) => ({
          userId: rsvp.userId,
          notificationType: "rsvp_reminder",
          title: "수업 참석 응답 요청",
          message: `"${rsvp.schedule.class?.className ?? "수업"}" 참석 여부를 응답해주세요.`,
          isRead: false,
        }));

      if (notifications.length === 0) return;

      const result = await this.prisma.notification.createMany({
        data: notifications,
      });

      this.logger.log(
        `RSVP 리마인드 알림 ${result.count}건 생성 (미응답 ${pendingRsvps.length}건)`,
      );
    } catch (error) {
      this.logger.error("RSVP 리마인드 처리 실패", error);
    }
  }

  /**
   * 매일 오전 9시: 미결제 Enrollment 리마인드
   * - status가 'pending' 또는 'approved'이고 생성 후 48시간 경과한 건
   * - 해당 학부모(requestedBy)에게 결제 독촉 알림 생성
   */
  @Cron("0 9 * * *")
  async handlePaymentReminder() {
    try {
      const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

      const unpaidEnrollments = await this.prisma.enrollment.findMany({
        where: {
          status: { in: ["pending", "approved"] },
          requestedAt: { lt: fortyEightHoursAgo },
        },
        include: {
          child: { select: { firstName: true, lastName: true } },
          class: { select: { className: true } },
        },
      });

      if (unpaidEnrollments.length === 0) return;

      // 중복 알림 방지: 최근 24시간 이내 동일 사용자에게 payment_reminder 발송 이력 확인
      const recentPaymentNotifs = await this.prisma.notification.findMany({
        where: {
          notificationType: "payment_reminder",
          createdAt: { gte: fortyEightHoursAgo },
        },
        select: { userId: true },
      });
      const recentlyNotifiedIds = new Set(
        recentPaymentNotifs.map((n) => n.userId),
      );

      const notifications = unpaidEnrollments
        .filter(
          (enrollment) => !recentlyNotifiedIds.has(enrollment.requestedBy),
        )
        .map((enrollment) => ({
          userId: enrollment.requestedBy,
          notificationType: "payment_reminder",
          title: "수강신청 결제 안내",
          message: `${enrollment.child?.lastName ?? ""}${enrollment.child?.firstName ?? ""}의 "${enrollment.class.className}" 수강신청 결제가 아직 완료되지 않았습니다.`,
          isRead: false,
        }));

      if (notifications.length === 0) return;

      const result = await this.prisma.notification.createMany({
        data: notifications,
      });

      this.logger.log(
        `미결제 리마인드 알림 ${result.count}건 생성 (미결제 ${unpaidEnrollments.length}건)`,
      );
    } catch (error) {
      this.logger.error("미결제 리마인드 처리 실패", error);
    }
  }

  /**
   * 매일 자정: 만료된 Enrollment 자동 처리
   * - expiresAt이 지난 pending/pending_approval/approved Enrollment
   * - status를 'expired'로 일괄 변경
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleExpiredEnrollments() {
    try {
      const now = new Date();

      const result = await this.prisma.enrollment.updateMany({
        where: {
          expiresAt: { lt: now },
          status: { in: ["pending", "pending_approval", "approved"] },
        },
        data: { status: "expired" },
      });

      if (result.count > 0) {
        this.logger.log(`만료 Enrollment ${result.count}건 자동 처리 완료`);
      }
    } catch (error) {
      this.logger.error("만료 Enrollment 처리 실패", error);
    }
  }
}
