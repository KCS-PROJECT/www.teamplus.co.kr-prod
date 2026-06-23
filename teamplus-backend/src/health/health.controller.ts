import { Controller, Get } from "@nestjs/common";
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  HealthCheckResult,
  HealthIndicatorResult,
} from "@nestjs/terminus";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { Public } from "@/auth/public.decorator";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";

/**
 * HealthController (NEW-05 — 2026-05-21 신규)
 *
 * `/api/v1/health` 엔드포인트 — AWS ALB/K8s liveness/readiness probe 대응.
 *
 * 점검 항목:
 *  1) PostgreSQL — `SELECT 1` (Prisma raw query)
 *  2) Redis      — `PING`
 *  3) 메모리     — RSS 300MB 미만 / Heap 250MB 미만
 *
 * 기존 `GET /health` (app.controller.ts) 는 단순 200 응답으로 유지하여
 * 외부 모니터링(Uptime Robot 등) 호환성을 보존하고, 운영 헬스 체크는 본 컨트롤러를 사용한다.
 */
@ApiTags("Health Check")
@Controller("api/v1/health")
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  @ApiOperation({
    summary: "운영 헬스 체크 (DB·Redis·메모리)",
    description:
      "AWS ALB / K8s readiness probe 용. 의존성 1개라도 실패 시 503.",
  })
  @ApiResponse({ status: 200, description: "모든 의존성 정상" })
  @ApiResponse({ status: 503, description: "의존성 1개 이상 실패" })
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.checkDatabase(),
      () => this.checkRedis(),
      () => this.memory.checkRSS("memory_rss", 300 * 1024 * 1024),
      () => this.memory.checkHeap("memory_heap", 250 * 1024 * 1024),
    ]);
  }

  @Public()
  @Get("liveness")
  @ApiOperation({ summary: "Liveness probe (프로세스 살아있음)" })
  liveness(): { status: string; timestamp: string } {
    return { status: "ok", timestamp: new Date().toISOString() };
  }

  /**
   * PostgreSQL 헬스 체크 (Prisma raw query)
   */
  private async checkDatabase(): Promise<HealthIndicatorResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { database: { status: "up" } };
    } catch (err) {
      return {
        database: {
          status: "down",
          message: (err as Error).message,
        },
      };
    }
  }

  /**
   * Redis 헬스 체크 (PING)
   */
  private async checkRedis(): Promise<HealthIndicatorResult> {
    try {
      const client = this.redis.getClient();
      if (!client) {
        return {
          redis: { status: "down", message: "Redis client not initialized" },
        };
      }
      const pong = await client.ping();
      if (pong !== "PONG") {
        throw new Error(`Unexpected PING response: ${pong}`);
      }
      return { redis: { status: "up" } };
    } catch (err) {
      return {
        redis: {
          status: "down",
          message: (err as Error).message,
        },
      };
    }
  }
}
