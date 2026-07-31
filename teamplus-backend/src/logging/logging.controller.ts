/**
 * POST /api/v1/logs/activity & /api/v1/logs/client-error — 클라이언트 활동 수신 (v8.6 P2-4, 2026-05-20)
 *
 * 4개 클라이언트 (Flutter App / Web / Admin / Home)가 forward하는 활동 batch를
 * 1) 카테고리별 파일 (log/YYYY/MM/DD/{category}.log)에 기록
 * 2) UserActivityLog Prisma 모델에 DB 영속화 (이중화 — 파일은 안전망)
 *
 * 인증: @Public() — 비로그인 사용자 활동(페이지 뷰 등)도 수집 가능
 *
 * Rate Limit: 전역 100req/min 은 무인증 적재 엔드포인트로는 과하게 관대해
 * 로그 오염·저장공간 고갈 경로였다. 엔드포인트별 @Throttle 로 조인다
 * (배치 전송이라 클라이언트 1대의 정상 호출 빈도는 분당 수 회 수준).
 * 배치 크기도 서버에서 상한을 강제해 1회 요청의 적재량을 제한한다.
 */
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Ip,
  Logger,
  Post,
  Headers,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiTags, ApiOperation, ApiBody } from "@nestjs/swagger";
import { Public } from "../auth/public.decorator";
import { LoggerService } from "../logger/logger.service";
import { PrismaService } from "../prisma/prisma.service";

interface ClientLogEvent {
  ts?: string;
  category?: string;
  level?: string;
  action?: string;
  message?: string;
  url?: string;
  resource?: string;
  status?: number;
  durationMs?: number;
  userId?: string;
  sessionId?: string;
  requestId?: string;
  meta?: Record<string, unknown>;
  error?: { name: string; message: string; stack?: string };
}

interface ActivityBatchDto {
  events?: ClientLogEvent[];
  source?: string; // web | admin | home | app
  platform?: string;
  ip?: string;
  userAgent?: string;
}

/** 1회 요청으로 적재할 수 있는 이벤트 상한 (초과분은 버리고 경고). */
const MAX_EVENTS_PER_BATCH = 50;

@ApiTags("Logs")
@Controller("api/v1/logs")
export class LoggingController {
  private readonly nestLogger = new Logger(LoggingController.name);

  constructor(
    private readonly appLogger: LoggerService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 클라이언트 활동 batch 수신 — 4 클라이언트 공용
   */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // 무인증 적재 — IP 당 1분 20회
  @Post("activity")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "클라이언트 활동 batch 수신 (Flutter/Web/Admin/Home)",
    description: `무인증 엔드포인트라 IP 당 1분 20회 · 1회 최대 ${MAX_EVENTS_PER_BATCH}건으로 제한됩니다.`,
  })
  @ApiBody({ description: "ActivityEvent[] batch" })
  async receiveActivity(
    @Body() dto: ActivityBatchDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent?: string,
  ): Promise<{ success: true; accepted: number; persisted: number }> {
    const rawEvents = Array.isArray(dto?.events) ? dto.events : [];
    if (rawEvents.length === 0) {
      return { success: true, accepted: 0, persisted: 0 };
    }

    // 배치 상한 초과분은 조용히 버리지 않고 경고를 남긴다(클라이언트 버그·공격 구분용).
    const events = rawEvents.slice(0, MAX_EVENTS_PER_BATCH);
    if (rawEvents.length > events.length) {
      this.nestLogger.warn(
        `[LOGS] 배치 상한 초과 — ${rawEvents.length}건 중 ${events.length}건만 처리 (ip=${ip})`,
      );
    }

    const source = dto?.source ?? "unknown";
    let persisted = 0;

    // 1) 각 이벤트를 카테고리 파일에 기록
    for (const ev of events) {
      try {
        const ctx = {
          ts: ev.ts,
          userId: ev.userId,
          sessionId: ev.sessionId,
          requestId: ev.requestId,
          action: ev.action,
          url: ev.url,
          resource: ev.resource,
          status: ev.status,
          durationMs: ev.durationMs,
          source,
          platform: dto?.platform,
          ip,
          userAgent,
          meta: ev.meta,
        };

        if (
          ev.error ||
          ev.category === "error" ||
          (ev.status !== undefined && ev.status >= 400)
        ) {
          // 클라이언트 에러 → 자동 분류 라우팅
          this.appLogger.error(
            ev.message ??
              `[CLIENT_${source.toUpperCase()}] ${ev.action ?? "ERROR"}`,
            ev.error ? new Error(ev.error.message) : undefined,
            ctx,
          );
        } else if (ev.action === "API_CALL") {
          this.appLogger.access(
            (ev.level as any) ?? "info",
            ev.message ?? `${ev.action} ${ev.resource ?? ev.url ?? ""}`,
            ctx,
          );
        } else if (ev.action === "LOGIN" || ev.action === "LOGOUT") {
          this.appLogger.authLog(
            (ev.level as any) ?? "info",
            ev.message ?? `${ev.action} ${ev.userId ?? ""}`,
            ctx,
          );
        } else {
          this.appLogger.activity(
            (ev.level as any) ?? "info",
            ev.message ??
              `${ev.action ?? "EVENT"} ${ev.url ?? ev.resource ?? ""}`,
            ctx,
          );
        }
      } catch (err) {
        this.nestLogger.warn(
          `[LOGS] 개별 이벤트 처리 실패: ${(err as Error).message}`,
        );
      }
    }

    // 2) UserActivityLog DB 영속화 (batch insert) — 실패해도 파일은 이미 기록
    try {
      const dbRecords = events.map((ev) => ({
        userId: ev.userId ?? null,
        sessionId: ev.sessionId ?? null,
        platform: dto?.platform ?? source,
        action: ev.action ?? "EVENT",
        category: ev.category ?? null,
        resource: ev.resource ?? ev.url ?? null,
        metadata: (ev.meta ?? null) as any,
        ipAddress: ip ?? null,
        userAgent: userAgent ?? null,
        durationMs: ev.durationMs ?? null,
        createdAt: ev.ts ? new Date(ev.ts) : new Date(),
      }));
      const result = await this.prisma.userActivityLog.createMany({
        data: dbRecords,
        skipDuplicates: true,
      });
      persisted = result.count;
    } catch (err) {
      this.nestLogger.warn(
        `[LOGS] DB 영속화 실패 (파일은 정상 기록됨): ${(err as Error).message}`,
      );
    }

    return { success: true, accepted: events.length, persisted };
  }

  /**
   * 클라이언트 단일 에러 수신 — 스택 trace 포함 상세 기록
   */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 무인증 — IP 당 1분 10회
  @Post("client-error")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "클라이언트 단일 에러 보고 (스택 trace 포함)",
    description: "무인증 엔드포인트라 IP 당 1분 10회로 제한됩니다.",
  })
  receiveClientError(
    @Body()
    dto: {
      message: string;
      error?: { name: string; message: string; stack?: string };
      url?: string;
      userId?: string;
      sessionId?: string;
      source?: string;
      breadcrumbs?: Array<{ ts: string; category: string; message: string }>;
    },
    @Ip() ip: string,
    @Headers("user-agent") userAgent?: string,
  ): { success: true } {
    try {
      const error = dto.error ? new Error(dto.error.message) : undefined;
      if (error && dto.error?.name) error.name = dto.error.name;
      if (error && dto.error?.stack) error.stack = dto.error.stack;

      this.appLogger.error(dto.message, error, {
        url: dto.url,
        userId: dto.userId,
        sessionId: dto.sessionId,
        source: dto.source ?? "client",
        ip,
        userAgent,
        breadcrumbs: dto.breadcrumbs,
      } as any);
    } catch {
      /* swallow */
    }
    return { success: true };
  }
}
