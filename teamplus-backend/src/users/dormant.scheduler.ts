import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "@/prisma/prisma.service";
import { NotificationsService } from "@/notifications/notifications.service";

const DORMANT_DAYS = 365;
const WARN_DAYS = [30, 7, 1];

@Injectable()
export class DormantScheduler {
  private readonly logger = new Logger(DormantScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * 매일 자정 실행: 365일 미로그인 계정 휴면 전환 + 경고 알림
   */
  @Cron("0 0 * * *", { timeZone: "Asia/Seoul" })
  async runDormantCheck(): Promise<void> {
    this.logger.log("[Dormant] 휴면 계정 점검 시작");
    await Promise.all([this.convertDormant(), this.sendWarningNotifications()]);
    this.logger.log("[Dormant] 휴면 계정 점검 완료");
  }

  private async convertDormant(): Promise<void> {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - DORMANT_DAYS);

    const targets = await this.prisma.user.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { lastLoginAt: { lte: threshold } },
          { lastLoginAt: null, createdAt: { lte: threshold } },
        ],
      },
      select: { id: true, email: true, firstName: true, lastName: true },
    });

    if (targets.length === 0) return;

    await this.prisma.user.updateMany({
      where: { id: { in: targets.map((u) => u.id) } },
      data: { status: "DORMANT", dormantAt: new Date() },
    });

    this.logger.log(`[Dormant] ${targets.length}명 휴면 전환 완료`);

    // [2026-05-14 N+1 해소] for...of await 를 Promise.allSettled 병렬 처리로 전환.
    //   알림 실패는 휴면 전환에 영향 없음 (allSettled 로 무시).
    await Promise.allSettled(
      targets.map((user) =>
        this.notifications.createNotification({
          userId: user.id,
          title: "휴면 계정 전환 안내",
          message:
            "1년간 로그인이 없어 휴면 계정으로 전환되었습니다. 로그인 시 즉시 복구됩니다.",
          notificationType: "account_dormant",
        }),
      ),
    );
  }

  private async sendWarningNotifications(): Promise<void> {
    for (const days of WARN_DAYS) {
      const from = new Date();
      from.setDate(from.getDate() - (DORMANT_DAYS - days));
      from.setHours(0, 0, 0, 0);
      const to = new Date(from);
      to.setDate(to.getDate() + 1);

      const targets = await this.prisma.user.findMany({
        where: {
          status: "ACTIVE",
          OR: [
            { lastLoginAt: { gte: from, lt: to } },
            { lastLoginAt: null, createdAt: { gte: from, lt: to } },
          ],
        },
        select: { id: true },
      });

      // [2026-05-14 N+1 해소] 일괄 병렬 발송.
      await Promise.allSettled(
        targets.map((user) =>
          this.notifications.createNotification({
            userId: user.id,
            title: "휴면 전환 예정 안내",
            message: `${days}일 후 장기 미접속으로 휴면 계정으로 전환됩니다. 지금 로그인하여 계정을 유지하세요.`,
            notificationType: "dormant_warning",
          }),
        ),
      );

      if (targets.length > 0) {
        this.logger.log(
          `[Dormant] D-${days} 경고 알림 ${targets.length}명 발송`,
        );
      }
    }
  }
}
