/**
 * Server Logger — teamplus-web 통합 로깅 (v8.6, 2026-05-20)
 *
 * Node 표준 fs만 사용 — pino/sonic-boom 의존성 0.
 * Backend(teamplus-backend/src/logger/logger.service.ts)와 동일한 API/카테고리.
 *
 * 사용:
 *   import { serverLogger } from '@/lib/server-log/server-logger';
 *   serverLogger.access('info', 'GET /api/x 200 5ms', { requestId, userId });
 *   serverLogger.errorAs('client', '[404] GET /x', err, { ... });
 *
 * @server-only — Route Handler / middleware / server component만 import
 */

import * as fs from "fs";
import {
  ALL_ERROR_CATEGORIES,
  ALL_NORMAL_CATEGORIES,
  classifyError,
  ensureAllCategoryFiles,
  ensureFile,
  ErrorCategory,
  FILE_MODE,
  formatDate,
  getAllErrorsPath,
  getGlobalIndexPath,
  getLogPath,
  LogCategory,
  LogKind,
  LogLevel,
  rotateAllIfExceeded,
  updateAllCurrentSymlinks,
} from "./file-path.util";

// SSR 호환 — 서버 환경에서만 동작 (Edge runtime은 fs 사용 불가)
const isServer = typeof window === "undefined";

/** 민감정보 마스킹 키 (12 필드 — backend와 동일) */
const SENSITIVE_KEYS = new Set([
  "password",
  "passwordhash",
  "refreshtoken",
  "accesstoken",
  "authtoken",
  "encrypteddata",
  "iv",
  "authtag",
  "creditcard",
  "ssn",
  "socialnumber",
  "crypto_secret_key",
]);

function sanitize(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  if (Array.isArray(data)) return data.map(sanitize);

  const sanitized: Record<string, unknown> = { ...(data as Record<string, unknown>) };
  for (const key of Object.keys(sanitized)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof sanitized[key] === "object" && sanitized[key] !== null) {
      sanitized[key] = sanitize(sanitized[key]);
    }
  }
  return sanitized;
}

/* ============================================================
 * 코어 로거 — JSON Lines 형식 파일 직접 append (race condition 최소화)
 * ============================================================ */

let initialized = false;
let writeCounter = 0;
const ROTATE_CHECK_INTERVAL = 100; // 매 100회 write마다 회전 체크 (사용자 요구 P6)

/** 부팅 시 1회 호출 — 디렉토리/파일/심볼릭 링크 일괄 생성 */
export function initServerLogger(): void {
  if (!isServer || initialized) return;
  try {
    ensureAllCategoryFiles();
    updateAllCurrentSymlinks();
    initialized = true;

    // 초기화 로그를 system.log에 즉시 기록
    writeLogLine("info", { type: "normal", category: "system" }, {
      msg: "[server-logger] 통합 로깅 시스템 초기화 완료",
      ts: new Date().toISOString(),
    });
  } catch (err) {
    // stdout만 (파일 실패 시에도 동작 보장)
    console.error("[server-logger] 초기화 실패:", err);
  }
}

/** 코어 write — 카테고리 파일에 JSON 1줄 append */
function writeLogLine(
  level: LogLevel,
  kind: LogKind,
  payload: Record<string, unknown>,
): void {
  if (!isServer) return;
  try {
    // 자동 초기화 — 첫 호출 시 자동 ensureFile
    if (!initialized) {
      try {
        ensureAllCategoryFiles();
        updateAllCurrentSymlinks();
        initialized = true;
      } catch {
        /* swallow */
      }
    }

    const filePath = getLogPath(kind);
    ensureFile(filePath);

    const entry = {
      level,
      time: new Date().toISOString(),
      category: kind.category,
      type: kind.type,
      env: process.env.NODE_ENV || "development",
      pid: process.pid,
      project: process.env.LOG_PROJECT || "web",
      ...(sanitize(payload) as Record<string, unknown>),
    };

    fs.appendFileSync(filePath, JSON.stringify(entry) + "\n", {
      mode: FILE_MODE,
    });

    // 매 100회 write마다 회전 체크 (v8.6 P6 — 10MB 자동 회전)
    writeCounter += 1;
    if (writeCounter >= ROTATE_CHECK_INTERVAL) {
      writeCounter = 0;
      try {
        const result = rotateAllIfExceeded();
        if (result.total > 0) {
          // eslint-disable-next-line no-console
          console.log(
            `[server-logger] 회전 완료 ${result.total}개 파일 (10MB 초과)`,
          );
        }
      } catch {
        /* 회전 실패는 swallow */
      }
    }

    // 오류면 _all.jsonl 통합 인덱스에도 동시 기록
    if (kind.type === "error") {
      const allPath = getAllErrorsPath();
      ensureFile(allPath);
      fs.appendFileSync(allPath, JSON.stringify(entry) + "\n", {
        mode: FILE_MODE,
      });

      // stdout 안내 — 어떤 파일에 저장됐는지 확인 가능
      // eslint-disable-next-line no-console
      console.log(
        `[ERROR_LOG_LOCATION] ${kind.category} → ${filePath} + ${allPath}`,
      );
    }

    // 글로벌 인덱스 (전 카테고리 시간순)
    try {
      fs.appendFileSync(
        getGlobalIndexPath(),
        JSON.stringify({
          ts: entry.time,
          level: entry.level,
          category: entry.category,
          type: entry.type,
          file: filePath,
        }) + "\n",
        { mode: FILE_MODE },
      );
    } catch {
      /* 글로벌 인덱스 실패는 swallow */
    }
  } catch (err) {
    // 파일 쓰기 실패 시 stdout만
    // eslint-disable-next-line no-console
    console.error("[server-logger] write 실패:", err);
  }
}

/* ============================================================
 * 외부 공개 API — backend LoggerService와 동일 시그니처
 * ============================================================ */

export interface LogContext {
  requestId?: string;
  userId?: string;
  sessionId?: string;
  url?: string;
  method?: string;
  status?: number;
  durationMs?: number;
  ip?: string;
  userAgent?: string;
  body?: unknown;
  headers?: Record<string, unknown>;
  error?: unknown;
  // 오류 분류 메타
  prismaCode?: string;
  externalSource?: string;
  transactionScope?: string;
  exceptionName?: string;
  [key: string]: unknown;
}

class ServerLoggerImpl {
  /** 카테고리별 메서드 */
  access(level: LogLevel, message: string, ctx?: LogContext): void {
    writeLogLine(level, { type: "normal", category: "access" }, { msg: message, ...ctx });
  }
  input(level: LogLevel, message: string, ctx?: LogContext): void {
    writeLogLine(level, { type: "normal", category: "input" }, { msg: message, ...ctx });
  }
  output(level: LogLevel, message: string, ctx?: LogContext): void {
    writeLogLine(level, { type: "normal", category: "output" }, { msg: message, ...ctx });
  }
  activity(level: LogLevel, message: string, ctx?: LogContext): void {
    writeLogLine(level, { type: "normal", category: "activity" }, { msg: message, ...ctx });
  }
  authLog(level: LogLevel, message: string, ctx?: LogContext): void {
    writeLogLine(level, { type: "normal", category: "auth" }, { msg: message, ...ctx });
  }
  payment(level: LogLevel, message: string, ctx?: LogContext): void {
    writeLogLine(level, { type: "normal", category: "payment" }, { msg: message, ...ctx });
  }
  database(level: LogLevel, message: string, ctx?: LogContext): void {
    writeLogLine(level, { type: "normal", category: "database" }, { msg: message, ...ctx });
  }
  system(level: LogLevel, message: string, ctx?: LogContext): void {
    writeLogLine(level, { type: "normal", category: "system" }, { msg: message, ...ctx });
  }

  /** 통합 메서드 (카테고리 추론) */
  info(message: string, ctx?: LogContext): void {
    const cat = (ctx?.category as LogCategory) ?? "system";
    writeLogLine("info", { type: "normal", category: cat }, { msg: message, ...ctx });
  }
  warn(message: string, ctx?: LogContext): void {
    const cat = (ctx?.category as LogCategory) ?? "system";
    writeLogLine("warn", { type: "normal", category: cat }, { msg: message, ...ctx });
  }
  debug(message: string, ctx?: LogContext): void {
    const cat = (ctx?.category as LogCategory) ?? "system";
    writeLogLine("debug", { type: "normal", category: cat }, { msg: message, ...ctx });
  }

  /** 오류 — 자동 분류 */
  error(message: string, error?: Error | unknown, ctx?: LogContext): void {
    const errCat = classifyError({
      status: ctx?.status,
      prismaCode: ctx?.prismaCode,
      externalSource: ctx?.externalSource,
      transactionScope: ctx?.transactionScope,
      exceptionName:
        ctx?.exceptionName ?? (error instanceof Error ? error.name : undefined),
    });
    writeLogLine(
      "error",
      { type: "error", category: errCat },
      {
        msg: message,
        ...ctx,
        error: error
          ? {
              name: error instanceof Error ? error.name : "Unknown",
              message: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
            }
          : undefined,
      },
    );
  }

  /** 오류 — 카테고리 명시 */
  errorAs(
    category: ErrorCategory,
    message: string,
    error?: Error | unknown,
    ctx?: LogContext,
  ): void {
    writeLogLine(
      "error",
      { type: "error", category },
      {
        msg: message,
        ...ctx,
        error: error
          ? {
              name: error instanceof Error ? error.name : "Unknown",
              message: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
            }
          : undefined,
      },
    );
  }

  /** 에러 카테고리별 파일 경로 조회 — API Route가 응답 헤더 주입에 사용 */
  getErrorLogPaths(category: ErrorCategory): { file: string; all: string } {
    return {
      file: getLogPath({ type: "error", category }),
      all: getAllErrorsPath(),
    };
  }
}

export const serverLogger = new ServerLoggerImpl();

// 자동 초기화 — 모듈 import 시 1회
initServerLogger();
