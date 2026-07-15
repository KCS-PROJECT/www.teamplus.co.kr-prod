import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "@/prisma/prisma.service";

/**
 * UserDevice stale 토큰 정리 스케줄러 (B8).
 *
 * user_devices 는 비활성화만 되고 삭제·정리 경로가 없어 무한 증가하던 문제를
 * 해소한다. lastSeenAt 은 registerDevice 가 앱 실행마다 touch 하므로(전제 실사
 * 완료 — users-me.controller.ts commonData) 장기 미접속 판정 기준으로 유효하다.
 *
 * 규칙:
 *  1) isActive=true  && lastSeenAt < 270일 → 비활성화 (FCM 토큰 자연 만료 한참 경과)
 *  2) isActive=false && updatedAt  < 90일 → 물리 삭제 (이력 보존 가치 소멸)
 *
 * 운영 안전장치 — **기본은 dry-run**: 실제 정리는 env
 * `DEVICE_CLEANUP_DRY_RUN=false` 를 명시해야 활성화된다. 도입 후 최소 2주간
 * dry-run 카운트 로그로 임계값(270/90일)의 실측 영향 규모를 검증한 뒤 전환한다.
 */
@Injectable()
export class DeviceCleanupScheduler {
  private readonly logger = new Logger(DeviceCleanupScheduler.name);

  private static readonly STALE_ACTIVE_DAYS = 270;
  private static readonly PURGE_INACTIVE_DAYS = 90;
  /** 큐 발송이 이 시간(분) 넘게 'queued' 로 남아 있으면 유실로 간주하고 실패 종결 */
  private static readonly STALE_QUEUED_PUSH_MINUTES = 15;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private isDryRun(): boolean {
    return (
      (this.configService.get<string>("DEVICE_CLEANUP_DRY_RUN") ?? "true")
        .toString()
        .toLowerCase() !== "false"
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, {
    name: "device-cleanup",
    timeZone: "Asia/Seoul",
  })
  async handleDeviceCleanup(): Promise<void> {
    const now = Date.now();
    const staleActiveCutoff = new Date(
      now - DeviceCleanupScheduler.STALE_ACTIVE_DAYS * 24 * 60 * 60 * 1000,
    );
    const purgeInactiveCutoff = new Date(
      now - DeviceCleanupScheduler.PURGE_INACTIVE_DAYS * 24 * 60 * 60 * 1000,
    );

    const staleActiveWhere = {
      isActive: true,
      lastSeenAt: { lt: staleActiveCutoff },
    };
    const purgeInactiveWhere = {
      isActive: false,
      updatedAt: { lt: purgeInactiveCutoff },
    };

    try {
      if (this.isDryRun()) {
        const [staleCount, purgeCount] = await Promise.all([
          this.prisma.userDevice.count({ where: staleActiveWhere }),
          this.prisma.userDevice.count({ where: purgeInactiveWhere }),
        ]);
        this.logger.log(
          `[DRY-RUN] 디바이스 정리 대상: 비활성화 예정 ${staleCount}건 ` +
            `(active·lastSeenAt<${DeviceCleanupScheduler.STALE_ACTIVE_DAYS}d), ` +
            `삭제 예정 ${purgeCount}건 ` +
            `(inactive·updatedAt<${DeviceCleanupScheduler.PURGE_INACTIVE_DAYS}d). ` +
            `실제 정리는 DEVICE_CLEANUP_DRY_RUN=false 로 활성화.`,
        );
        return;
      }

      const deactivated = await this.prisma.userDevice.updateMany({
        where: staleActiveWhere,
        data: { isActive: false },
      });
      const purged = await this.prisma.userDevice.deleteMany({
        where: purgeInactiveWhere,
      });

      this.logger.log(
        `디바이스 정리 완료: 비활성화 ${deactivated.count}건, 삭제 ${purged.count}건`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(`디바이스 정리 실패: ${err.message}`);
    }
  }

  /**
   * 관리자 광역 Push 큐(sendAdminPush all/role)의 stale 'queued' 로그 정리.
   *
   * pushNotificationLog 를 status='queued' 로 커밋한 뒤 pushQueue.add 가 Redis 에
   * 영속되기 전(또는 워커가 executeAdminPushJob 도중 crash) 프로세스가 죽으면 로그가
   * 'queued' 로 영구 잔존한다(Bull attempts:1 이라 stalled 복구 없음). 정상 잡은
   * 수 초 내 종결되므로, STALE_QUEUED_PUSH_MINUTES 를 넘긴 'queued' 는 유실로
   * 판정해 'failed' 로 종결한다(관리자 이력에서 미종결 상태 방지). dry-run 무관.
   */
  @Cron(CronExpression.EVERY_30_MINUTES, {
    name: "stale-queued-push-reconcile",
    timeZone: "Asia/Seoul",
  })
  async reconcileStaleQueuedPush(): Promise<void> {
    const cutoff = new Date(
      Date.now() -
        DeviceCleanupScheduler.STALE_QUEUED_PUSH_MINUTES * 60 * 1000,
    );
    try {
      const result = await this.prisma.pushNotificationLog.updateMany({
        where: { status: "queued", createdAt: { lt: cutoff } },
        data: {
          status: "failed",
          metadata: JSON.stringify({
            error: "stale_queued_reconciled",
            reconciledAt: new Date().toISOString(),
          }),
        },
      });
      if (result.count > 0) {
        this.logger.warn(
          `stale 'queued' Push 로그 ${result.count}건을 failed 로 종결 ` +
            `(${DeviceCleanupScheduler.STALE_QUEUED_PUSH_MINUTES}분 초과 미종결)`,
        );
      }
    } catch (error) {
      const err = error as Error;
      this.logger.error(`stale queued push 정리 실패: ${err.message}`);
    }
  }
}
