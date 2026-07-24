import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";

export type SystemLogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";
export type SystemLogCategory =
  | "boot" // 서버 기동/종료
  | "error" // 서버 오류 (5xx)
  | "cron" // 스케줄러(@Cron) 실행
  | "perf" // 성능 경고 (SLA 초과)
  | "system"; // 기타 시스템 이벤트

export interface SystemLogEntry {
  level: SystemLogLevel;
  category: SystemLogCategory;
  /** 로그 모듈/이벤트 식별자 (예: SERVER_BOOT, SLA_BREACH, cron 이름) */
  action: string;
  message: string;
  /** 관련 리소스 (예: API 경로, cron job 이름) */
  resource?: string;
  /** 소요 시간(ms) — 성능/cron 로그에 사용 */
  durationMs?: number;
  meta?: Record<string, unknown>;
}

/**
 * SystemLogService — 서버 운영 로그(에러·기동·cron·성능)를 DB에 영속화.
 *
 * 저장소는 `UserActivityLog` 를 `platform='backend'` 로 재사용한다(스키마 변경 없음).
 *   - 앱 사용 통계(`getAppStatistics`)는 `platform IN ('web','app')` 으로 조회하므로
 *     backend 로그는 통계에 절대 섞이지 않는다(자동 격리).
 *   - admin `시스템로그` 페이지가 `platform='backend'` 를 조회해 표시한다.
 *
 * 기록은 fire-and-forget(비동기, 실패 삼킴) — 로깅이 요청/기동 흐름을 막지 않는다.
 */
@Injectable()
export class SystemLogService {
  private readonly logger = new Logger(SystemLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  record(entry: SystemLogEntry): void {
    void this.prisma.userActivityLog
      .create({
        data: {
          platform: "backend",
          action: entry.action,
          category: entry.category,
          resource: entry.resource ?? null,
          durationMs: entry.durationMs ?? null,
          metadata: {
            level: entry.level,
            message: entry.message,
            ...(entry.meta ?? {}),
          } as object,
        },
      })
      .catch((e) => {
        // DB 기록 실패는 파일 로그에만 남기고 삼킨다(무한 루프 방지).
        this.logger.warn(
          `시스템로그 DB 저장 실패 (${entry.action}): ${(e as Error).message}`,
        );
      });
  }

  // 편의 메서드
  boot(message: string, meta?: Record<string, unknown>): void {
    this.record({ level: "INFO", category: "boot", action: "SERVER_BOOT", message, meta });
  }

  serverError(message: string, resource?: string, meta?: Record<string, unknown>): void {
    this.record({ level: "ERROR", category: "error", action: "SERVER_ERROR", message, resource, meta });
  }

  perf(message: string, resource: string, durationMs: number, meta?: Record<string, unknown>): void {
    this.record({ level: "WARN", category: "perf", action: "SLA_BREACH", message, resource, durationMs, meta });
  }

  cron(
    jobName: string,
    message: string,
    opts?: { level?: SystemLogLevel; durationMs?: number; meta?: Record<string, unknown> },
  ): void {
    this.record({
      level: opts?.level ?? "INFO",
      category: "cron",
      action: `CRON_${jobName}`,
      message,
      resource: jobName,
      durationMs: opts?.durationMs,
      meta: opts?.meta,
    });
  }
}
