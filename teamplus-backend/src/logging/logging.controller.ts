/**
 * POST /api/v1/logs/activity & /api/v1/logs/client-error — 클라이언트 활동 수신 (v8.6 P2-4, 2026-05-20)
 *
 * 4개 클라이언트 (Flutter App / Web / Admin / Home)가 forward하는 활동 batch를
 * 1) 카테고리별 파일 (log/YYYY/MM/DD/{category}.log)에 기록
 * 2) UserActivityLog Prisma 모델에 DB 영속화 (이중화 — 파일은 안전망)
 *
 * Rate Limit: 기본 100req/min 적용 (전역 ThrottlerGuard)
 * 인증: @Public() — 비로그인 사용자 활동(페이지 뷰 등)도 수집 가능
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
  @Post("activity")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "클라이언트 활동 batch 수신 (Flutter/Web/Admin/Home)",
  })
  @ApiBody({ description: "ActivityEvent[] batch" })
  async receiveActivity(
    @Body() dto: ActivityBatchDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent?: string,
  ): Promise<{ success: true; accepted: number; persisted: number }> {
    const events = Array.isArray(dto?.events) ? dto.events : [];
    if (events.length === 0) {
      return { success: true, accepted: 0, persisted: 0 };
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
  @Post("client-error")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "클라이언트 단일 에러 보고 (스택 trace 포함)" })
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
