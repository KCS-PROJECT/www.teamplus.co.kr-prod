import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { HealthController } from "./health.controller";
import { PrismaModule } from "@/prisma/prisma.module";
import { RedisModule } from "@/redis/redis.module";

/**
 * HealthModule (NEW-05 — 2026-05-21 신규)
 *
 * AWS ALB / K8s readiness probe 대응. `/api/v1/health` 엔드포인트 노출.
 *
 * 의존성:
 *  - TerminusModule  : @nestjs/terminus 헬스 인디케이터
 *  - PrismaModule    : DB SELECT 1 헬스 체크
 *  - RedisModule     : Redis PING 헬스 체크
 */
@Module({
  imports: [TerminusModule, PrismaModule, RedisModule],
  controllers: [HealthController],
})
export class HealthModule {}
