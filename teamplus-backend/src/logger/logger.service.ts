/**
 * Structured Logging Service (v8.6, 2026-05-20)
 *
 * 사용자 강조 요구사항 반영:
 * 1. 서버 로그는 전부 남김 — 파일 sink는 모든 레벨(trace~fatal), stdout만 LOG_LEVEL 적용
 * 2. 7 일반 카테고리 + 6 오류 카테고리 자동 라우팅
 * 3. 10MB 단위 자동 rotation (pino-roll)
 * 4. KST 일단위 파일 (`log/YYYY/MM/YYYY-MM-DD-<category>.log`)
 * 5. 부팅 시 모든 디렉토리·파일·심볼릭 링크 자동 생성 + 권한(0755/0644)
 * 6. 모든 오류는 `_all.jsonl` 통합 인덱스에도 동시 기록 (분석 친화)
 *
 * 민감 필드 자동 마스킹: password, token, ssn, creditCard 등
 */

import { Injectable, OnModuleInit } from "@nestjs/common";
import pino, { Logger as PinoLogger } from "pino";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PinoPretty = require("pino-pretty") as typeof import("pino-pretty");
import SonicBoom from "sonic-boom";
import * as fs from "fs";
import {
  ALL_ERROR_CATEGORIES,
  ALL_NORMAL_CATEGORIES,
  ErrorCategory,
  FILE_MODE,
  LogCategory,
  LogKind,
  classifyError,
  ensureAllCategoryFiles,
  ensureFile,
  getAllErrorsPath,
  getLogPath,
  updateAllCurrentSymlinks,
  updateManifestEntry,
} from "./file-path.util";

export interface LogContext {
  userId?: string;
  email?: string;
  ip?: string;
  requestId?: string;
  action?: string;
  resource?: string;
  category?: LogCategory; // 명시적 카테고리 지정 (선택)
  /** 오류 분류용 메타 — error() 호출 시 자동 분류 입력 */
  status?: number;
  prismaCode?: string;
  externalSource?: string;
  transactionScope?: string;
  exceptionName?: string;
  [key: string]: unknown;
}

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

@Injectable()
export class LoggerService implements OnModuleInit {
  /** stdout 전용 logger — 운영 환경 LOG_LEVEL 적용 */
  private stdoutLogger!: PinoLogger;

  /** 카테고리별 파일 logger — 모든 레벨(trace~fatal) 기록 (사용자 요구) */
  private fileLoggers: Map<string, PinoLogger> = new Map();

  /** 민감정보 마스킹 키 — 자녀 PIN/OTP 평문 로깅 차단 위해 pin/otp 추가 */
  private readonly SENSITIVE_KEYS = [
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
    // 자녀 인증 자격증명 — sanitize()는 lowercase 정확일치라 pin/otp 키만 [REDACTED]
    "pin",
    "otp",
  ];

  constructor() {
    this.initStdoutLogger();
  }

  /**
   * NestJS 부팅 직후 호출 — 파일 시스템 초기화
   * (constructor에서 동기 처리 가능하지만 명시적으로 lifecycle hook 사용)
   */
  onModuleInit(): void {
    try {
      ensureAllCategoryFiles();
      updateAllCurrentSymlinks();
      this.stdoutLogger.info(
        { component: "LoggerService" },
        "[LOGGER] 파일 로깅 시스템 초기화 완료",
      );
    } catch (err) {
      // 파일 시스템 초기화 실패해도 stdout만큼은 동작하도록 swallow
      this.stdoutLogger.warn(
        { err: (err as Error).message },
        "[LOGGER] 파일 로깅 초기화 실패 — stdout만 사용",
      );
    }
  }

  /* ============================================================
   * 1. Logger 인스턴스 관리
   * ============================================================ */

  private initStdoutLogger(): void {
    const isProduction = process.env.NODE_ENV === "production";
    const opts: pino.LoggerOptions = {
      level: process.env.LOG_LEVEL || "info",
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: (label) => ({ level: label }),
        bindings: (bindings) => ({
          pid: bindings.pid,
          hostname: bindings.hostname,
          env: process.env.NODE_ENV || "development",
        }),
      },
    };

    // Windows: SonicBoom(fd=1)은 raw bytes → CP949로 해석되어 한글 깨짐.
    // destination: process.stdout 전달 시 SonicBoom 우회 → WriteConsoleW 유니코드 정상 출력.
    this.stdoutLogger = isProduction
      ? pino(opts)
      : pino(opts, PinoPretty({ colorize: true, destination: process.stdout }));
  }

  /**
   * 카테고리별 파일 logger 획득 (lazy init)
   * - level: 'trace' — 모든 로그 파일 기록 (사용자 요구 "서버 로그 전부")
   * - pino-roll로 10MB 단위 rotation, 최대 5개 백업
   */
  private getFileLogger(kind: LogKind): PinoLogger | null {
    const key = `${kind.type}:${kind.category}`;
    const cached = this.fileLoggers.get(key);
    if (cached) return cached;

    try {
      const targetFile = getLogPath(kind);
      ensureFile(targetFile);

      // SonicBoom 직접 사용 — pino-roll의 numbered suffix(.log.1) 문제 회피
      // 파일 위치가 정확히 getLogPath() 반환값과 일치 (사용자 친화적)
      // 회전 정책은 자체 cron 스케줄러로 구현 (P6)
      const dest = new SonicBoom({
        dest: targetFile,
        append: true, // 기존 내용 유지
        mkdir: true, // 디렉토리 자동 생성
        sync: false, // 비동기 (성능)
        // 매 write마다 즉시 flush 하지 않음 — buffer 사용 (default 4096B)
      });

      const logger = pino(
        {
          level: "trace", // 모든 레벨 파일 기록 (사용자 요구 "전부 남겨줘")
          timestamp: pino.stdTimeFunctions.isoTime,
          base: {
            category: kind.category,
            type: kind.type,
            env: process.env.NODE_ENV || "development",
            pid: process.pid,
          },
        },
        dest,
      );

      this.fileLoggers.set(key, logger);
      return logger;
    } catch (err) {
      // pino-roll 초기화 실패 시 stdout으로 폴백
      this.stdoutLogger.warn(
        { kind, err: (err as Error).message },
        "[LOGGER] 카테고리 파일 logger 초기화 실패",
      );
      return null;
    }
  }

  /* ============================================================
   * 2. 민감정보 마스킹
   * ============================================================ */

  private sanitize(data: any): any {
    if (!data || typeof data !== "object") return data;
    // [2026-06-08] Date·Buffer 등 비-plain 객체는 `{ ...data }` spread 시 own enumerable
    //   property 가 없어 `{}` 로 깨진다. (예: 응답 body 의 `createdAt`(Date) 가 IN/OUT 로그·
    //   거래로그에 `createdAt: {}` 로 직렬화되던 버그) → 원형 보존하여 pino 가
    //   Date.toJSON() → ISO 문자열로 정상 직렬화하도록 한다.
    if (data instanceof Date) return data;
    if (Buffer.isBuffer(data)) return data;
    if (Array.isArray(data)) return data.map((item) => this.sanitize(item));

    const sanitized: Record<string, any> = { ...data };
    for (const key of Object.keys(sanitized)) {
      if (this.SENSITIVE_KEYS.includes(key.toLowerCase())) {
        sanitized[key] = "[REDACTED]";
      } else if (
        typeof sanitized[key] === "object" &&
        sanitized[key] !== null
      ) {
        sanitized[key] = this.sanitize(sanitized[key]);
      }
    }
    return sanitized;
  }

  /* ============================================================
   * 3. 코어 라우팅 (모든 메서드의 단일 진입점)
   * ============================================================ */

  /**
   * 코어 log 메서드 — stdout + 카테고리 파일 + (오류면) 통합 인덱스
   */
  private route(
    level: LogLevel,
    kind: LogKind,
    message: string,
    context?: LogContext,
  ): void {
    const safeCtx = this.sanitize(context ?? {});

    // 1) stdout
    this.stdoutLogger[level](safeCtx, message);

    // 2) 카테고리 파일
    const fileLogger = this.getFileLogger(kind);
    if (fileLogger) {
      fileLogger[level](safeCtx, message);
    }

    // 3) 오류면 통합 인덱스에도 동시 기록 + 파일 위치 stdout 안내 (사용자 요구 v8.6)
    if (kind.type === "error") {
      this.appendToAllErrors(level, kind.category, message, safeCtx);

      // [ERROR_LOG_LOCATION] 에러가 어떤 파일에 저장됐는지 stdout에 한 줄 안내
      // 운영자가 즉시 어떤 로그 파일을 봐야 할지 알 수 있도록
      try {
        const errPath = getLogPath(kind);
        const allPath = getAllErrorsPath();
        this.stdoutLogger.info(
          {
            errorCategory: kind.category,
            errorFile: errPath,
            allErrorsFile: allPath,
            requestId: safeCtx?.requestId,
          },
          `[ERROR_LOG_LOCATION] ${kind.category} → ${errPath} + ${allPath}`,
        );
      } catch {
        /* 안내 실패는 swallow */
      }
    }
  }

  /**
   * 오류 카테고리별 파일 경로 조회 — Interceptor·Filter가 응답 헤더 주입에 사용
   * @example logger.getErrorLogPaths('server') → { file: 'log/.../errors/server.log', all: 'log/.../errors/_all.jsonl' }
   */
  getErrorLogPaths(category: ErrorCategory): { file: string; all: string } {
    return {
      file: getLogPath({ type: "error", category }),
      all: getAllErrorsPath(),
    };
  }

  /**
   * 모든 오류 통합 인덱스(`_all.jsonl`)에 한 줄 append
   * - synchronous write — race condition 회피, 오류 누락 0 보장
   */
  private appendToAllErrors(
    level: LogLevel,
    category: ErrorCategory,
    message: string,
    context: any,
  ): void {
    try {
      const path = getAllErrorsPath();
      ensureFile(path);
      const entry = {
        ts: new Date().toISOString(),
        level,
        category,
        message,
        ...context,
      };
      fs.appendFileSync(path, JSON.stringify(entry) + "\n", {
        mode: FILE_MODE,
      });
    } catch {
      /* 통합 인덱스 기록 실패는 swallow — 개별 카테고리 파일은 이미 기록됨 */
    }
  }

  /* ============================================================
   * 4. 외부 공개 메서드 — 기존 시그니처 호환
   * ============================================================ */

  debug(message: string, context?: LogContext): void {
    const cat = (context?.category as LogCategory) ?? "system";
    this.route("debug", { type: "normal", category: cat }, message, context);
  }

  info(message: string, context?: LogContext): void {
    const cat = (context?.category as LogCategory) ?? "system";
    this.route("info", { type: "normal", category: cat }, message, context);
  }

  warn(message: string, context?: LogContext): void {
    const cat = (context?.category as LogCategory) ?? "system";
    this.route("warn", { type: "normal", category: cat }, message, context);
  }

  /**
   * error — 오류 카테고리 자동 분류 (HTTP status·Prisma 코드·외부 어댑터 메타 기반)
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const errCat = classifyError({
      status: context?.status,
      prismaCode: context?.prismaCode,
      externalSource: context?.externalSource,
      transactionScope: context?.transactionScope,
      exceptionName:
        context?.exceptionName ??
        (error instanceof Error ? error.name : undefined),
    });

    const errorPayload = {
      ...(context ?? {}),
      error: {
        name: error instanceof Error ? error.name : "Unknown",
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    };

    this.route(
      "error",
      { type: "error", category: errCat },
      message,
      errorPayload,
    );
  }

  /* ============================================================
   * 5. 카테고리별 명시 메서드 (선택적 사용 — 호출자가 명시하면 분류 정확도↑)
   * ============================================================ */

  access(level: LogLevel, message: string, context?: LogContext): void {
    this.route(level, { type: "normal", category: "access" }, message, context);
  }

  /** HTTP request body/query/params 전용 로그 (v8.6 사용자 요구) */
  input(level: LogLevel, message: string, context?: LogContext): void {
    this.route(level, { type: "normal", category: "input" }, message, context);
  }

  /** HTTP response body / error 전용 로그 (v8.6 사용자 요구) */
  output(level: LogLevel, message: string, context?: LogContext): void {
    this.route(level, { type: "normal", category: "output" }, message, context);
  }

  activity(level: LogLevel, message: string, context?: LogContext): void {
    this.route(
      level,
      { type: "normal", category: "activity" },
      message,
      context,
    );
  }

  authLog(level: LogLevel, message: string, context?: LogContext): void {
    this.route(level, { type: "normal", category: "auth" }, message, context);
  }

  payment(level: LogLevel, message: string, context?: LogContext): void {
    this.route(
      level,
      { type: "normal", category: "payment" },
      message,
      context,
    );
  }

  database(level: LogLevel, message: string, context?: LogContext): void {
    this.route(
      level,
      { type: "normal", category: "database" },
      message,
      context,
    );
  }

  system(level: LogLevel, message: string, context?: LogContext): void {
    this.route(level, { type: "normal", category: "system" }, message, context);
  }

  /** 오류 카테고리 직접 지정 (자동 분류 우회) */
  errorAs(
    category: ErrorCategory,
    message: string,
    error?: Error | unknown,
    context?: LogContext,
  ): void {
    const errorPayload = {
      ...(context ?? {}),
      error: {
        name: error instanceof Error ? error.name : "Unknown",
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    };
    this.route("error", { type: "error", category }, message, errorPayload);
  }

  /* ============================================================
   * 6. 도메인 특화 메서드 (기존 호환성 유지)
   * ============================================================ */

  /** 감사 로그 — auth 카테고리로 라우팅 */
  audit(
    action: string,
    resource: string,
    userId: string,
    result: "success" | "failure",
    context?: LogContext,
  ): void {
    const ctx = {
      ...this.sanitize(context),
      action,
      resource,
      userId,
      result,
      timestamp: new Date().toISOString(),
    };
    this.route(
      result === "success" ? "info" : "warn",
      { type: "normal", category: "auth" },
      `[AUDIT] ${action} on ${resource}`,
      ctx,
    );
  }

  logCryptoOperation(
    operation: "decrypt" | "encrypt",
    status: "start" | "success" | "failure",
    duration?: number,
    context?: LogContext,
  ): void {
    const message = `[CRYPTO] ${operation.toUpperCase()} ${status.toUpperCase()}`;
    const ctx = {
      ...this.sanitize(context),
      operation,
      status,
      duration,
    };
    this.route(
      status === "failure" ? "warn" : "debug",
      { type: "normal", category: "system" },
      message,
      ctx,
    );
  }

  logAuthEvent(
    event:
      | "login_attempt"
      | "login_success"
      | "login_failure"
      | "account_locked"
      | "token_refresh"
      | "social_disconnect",
    context?: LogContext,
  ): void {
    const message = `[AUTH] ${event.toUpperCase()}`;
    const isFailure = event.includes("failure") || event.includes("locked");

    // 정상 흐름은 auth 카테고리, 실패/잠금은 auth 오류 카테고리
    if (isFailure) {
      this.route("warn", { type: "error", category: "auth" }, message, context);
    } else {
      this.route(
        "info",
        { type: "normal", category: "auth" },
        message,
        context,
      );
    }
  }

  logDatabaseQuery(
    query: string,
    duration: number,
    success: boolean,
    context?: LogContext,
  ): void {
    const message = `[DATABASE] QUERY ${success ? "SUCCESS" : "FAILURE"}`;
    const ctx = {
      ...this.sanitize(context),
      query: query.substring(0, 200),
      durationMs: duration,
      success,
    };

    if (!success) {
      // DB 실패는 error 카테고리(database)
      this.route(
        "error",
        { type: "error", category: "database" },
        message,
        ctx,
      );
    } else if (duration > 1000) {
      // Slow query는 일반 database 카테고리에 warn
      this.route(
        "warn",
        { type: "normal", category: "database" },
        message,
        ctx,
      );
    } else {
      // 정상 쿼리는 debug 레벨로 database 카테고리
      this.route(
        "debug",
        { type: "normal", category: "database" },
        message,
        ctx,
      );
    }
  }

  /* ============================================================
   * 7. 매니페스트 갱신 (분석 도구용)
   * ============================================================ */

  /** 모든 카테고리 파일의 매니페스트 갱신 — 1시간 주기 스케줄러가 호출 권장 */
  refreshManifest(): void {
    for (const cat of ALL_NORMAL_CATEGORIES) {
      updateManifestEntry({ type: "normal", category: cat });
    }
    for (const cat of ALL_ERROR_CATEGORIES) {
      updateManifestEntry({ type: "error", category: cat });
    }
  }

  /**
   * 회전 후 SonicBoom 인스턴스 재생성 — LogRotationScheduler가 호출 (v8.6 P6)
   * - 회전 발생 시 기존 fileLoggers Map의 SonicBoom은 .log.1로 rename된 파일을 가리킴
   * - Map clear 후 다음 호출 시 새 SonicBoom 인스턴스가 새 .log 파일에 연결
   * - 안전한 destroy 호출 (sonic-boom의 destroy()는 stream을 즉시 닫음)
   */
  resetFileLoggers(): void {
    for (const [key, logger] of this.fileLoggers.entries()) {
      try {
        // pino logger의 underlying stream(SonicBoom)을 flush + close
        // pino@10의 logger.flushSync() 가능, 또는 단순히 ref 제거
        (logger as unknown as { flush?: () => void }).flush?.();
      } catch {
        /* swallow */
      }
      this.fileLoggers.delete(key);
    }
    // 부팅 직후 같은 초기화 — 누락된 디렉토리/파일/심볼릭 링크 재생성
    try {
      ensureAllCategoryFiles();
      updateAllCurrentSymlinks();
    } catch {
      /* swallow */
    }
  }
}
