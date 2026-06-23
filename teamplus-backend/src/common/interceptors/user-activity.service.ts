import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RedisService } from "../../redis/redis.service";

/**
 * UserActivityService
 *
 * 인증된 사용자의 `lastActiveAt`을 5분 throttle 기반으로 갱신한다.
 * - Redis SET NX EX 300 으로 throttle key 확보
 * - 확보 성공한 경우에만 `prisma.user.update` 호출 (fire-and-forget)
 * - Redis 장애 시 graceful degradation: 원 요청 영향 없이 업데이트만 skip
 */
@Injectable()
export class UserActivityService {
  private readonly logger = new Logger(UserActivityService.name);
  /** throttle window (초) */
  private readonly THROTTLE_SECONDS = 300;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * 사용자 활동 기록 (non-blocking, 실패해도 요청 응답에 영향 없음)
   */
  async touch(userId: string): Promise<void> {
    if (!userId) return;

    const throttleKey = `user:active:${userId}`;
    try {
      const locked = await this.redis.setIfNotExists(
        throttleKey,
        "1",
        this.THROTTLE_SECONDS,
      );
      if (!locked) return;

      // 비동기 DB update — 실패해도 무시 (catch는 호출자 보호용)
      await this.prisma.user
        .update({
          where: { id: userId },
          data: { lastActiveAt: new Date() },
          select: { id: true },
        })
        .catch((error: unknown) => {
          this.logger.debug(
            `user.lastActiveAt update failed for ${userId}: ${
              error instanceof Error ? error.message : "unknown"
            }`,
          );
        });
    } catch (error: unknown) {
      // Redis 장애: degraded — 다음 요청에서 재시도
      this.logger.debug(
        `UserActivityService throttle lock failed for ${userId}: ${
          error instanceof Error ? error.message : "unknown"
        }`,
      );
    }
  }
}
