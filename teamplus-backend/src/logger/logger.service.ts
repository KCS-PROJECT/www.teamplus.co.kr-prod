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

/* ==============================================================
 * PII 부분 마스킹 함수 — [2026-07-30 SECURITY]
 *
 * 이름·이메일·주소 등은 [REDACTED] 로 전부 지우면 장애 추적(동일 사용자 요청 상관관계
 * 확인)이 불가해진다. 그래서 완전 삭제가 아니라 **식별성만 제거**하는 부분 마스킹을 쓴다.
 * 반면 비밀값(비밀번호·토큰·CI/DI)은 흔적조차 남길 이유가 없어 SENSITIVE_KEYS 로 전부 삭제.
 * ============================================================== */

/** 홍길동 → 홍*동 / 김철 → 김* */
function maskName(v: string): string {
  const s = v.trim();
  if (s.length <= 1) return "*";
  if (s.length === 2) return `${s[0]}*`;
  return `${s[0]}${"*".repeat(s.length - 2)}${s[s.length - 1]}`;
}

/** user@example.com → us***@example.com (도메인은 유지 — 소속 파악·스팸 진단용) */
function maskEmail(v: string): string {
  const at = v.lastIndexOf("@");
  if (at <= 0) return maskName(v);
  const local = v.slice(0, at);
  const domain = v.slice(at);
  const keep = local.slice(0, Math.min(2, local.length));
  return `${keep}***${domain}`;
}

/** 01012345678 → 010-****-5678 (앞 3 + 뒤 4 유지) */
function maskPhone(v: string): string {
  const digits = v.replace(/[^0-9]/g, "");
  if (digits.length < 7) return "*".repeat(Math.max(1, v.length));
  return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
}

/** 19900315 / 1990-03-15 → 1990-**-** (연도만 유지 — 연령 통계 진단용) */
function maskBirth(v: string): string {
  const digits = v.replace(/[^0-9]/g, "");
  if (digits.length < 4) return "****";
  return `${digits.slice(0, 4)}-**-**`;
}

/** "서울시 강남구 삼성동 123-45" → "서울시 ***" (행정구역 첫 토큰만 유지) */
function maskAddress(v: string): string {
  const first = v.trim().split(/\s+/)[0] ?? "";
  return first ? `${first} ***` : "***";
}

/** 06236 → 06*** */
function maskZip(v: string): string {
  return v.length <= 2 ? "***" : `${v.slice(0, 2)}***`;
}

/** 성별 등 1~2자 코드는 형태 보존 의미가 없어 통째로 가린다. */
function maskWhole(_v: string): string {
  return "***";
}

/**
 * 부분 마스킹 대상 키 → 마스킹 함수 매핑 (모두 lowercase 정확일치).
 *
 * `name` 을 포함한 이유: `social-login.dto.ts` 등 실제 사람 이름을 담는 필드가 bare `name`
 * 이라 제외하면 실명이 그대로 적재된다. 대가로 팀/상품명 같은 엔티티 이름도 부분 마스킹되지만,
 * 로그 추적은 url·id·requestId 로 충분하므로 개인정보 보호를 우선한다.
 */
const PII_MASKERS: ReadonlyMap<string, (v: string) => string> = new Map([
  // ── 이메일
  ...(
    [
      "email",
      "useremail",
      "targetemail",
      "recipientemail",
      "contactemail",
    ] as const
  ).map((k) => [k, maskEmail] as [string, (v: string) => string]),
  // ── 사람 이름
  ...(
    [
      "name",
      "firstname",
      "lastname",
      "fullname",
      "username",
      "verifiedname",
      "receivername",
      "recipientname",
      "sendername",
      "membername",
      "parentname",
      "childname",
      "studentname",
      "guardianname",
      "applicantname",
      "orderername",
      "buyername",
      "holdername",
      "accountholder",
      "depositorname",
    ] as const
  ).map((k) => [k, maskName] as [string, (v: string) => string]),
  // ── 전화번호
  ...(
    [
      "phone",
      "mobile",
      "tel",
      "telephone",
      "phonenumber",
      "verifiedphone",
      "contactphone",
      "receiverphone",
      "recipientphone",
      "parentphone",
      "guardianphone",
      "emergencycontact",
    ] as const
  ).map((k) => [k, maskPhone] as [string, (v: string) => string]),
  // ── 생년월일
  ...(["birth", "birthday", "birthdate", "verifiedbirth"] as const).map(
    (k) => [k, maskBirth] as [string, (v: string) => string],
  ),
  // ── 주소
  ...(
    [
      "address",
      "address1",
      "address2",
      "addressdetail",
      "detailaddress",
      "baseaddress",
      "roadaddress",
      "jibunaddress",
    ] as const
  ).map((k) => [k, maskAddress] as [string, (v: string) => string]),
  // ── 우편번호
  ...(["zipcode", "postcode", "postalcode"] as const).map(
    (k) => [k, maskZip] as [string, (v: string) => string],
  ),
  // ── 성별
  ...(["gender", "verifiedgender", "sex"] as const).map(
    (k) => [k, maskWhole] as [string, (v: string) => string],
  ),
]);

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
    // [2026-07-30] 고유식별정보·결제 비밀값 — 부분 마스킹으로도 남겨선 안 되는 값.
    //   ci/di 는 연계정보(고유식별정보 준용)라 로그 파일 적재 자체가 위반 소지.
    "ci",
    "di",
    "cihash",
    "rrn",
    "residentnumber",
    "cardnumber",
    "cvv",
    "cvc",
    "privatekey",
    "apikey",
    "clientsecret",
    "apisecret",
    "signature",
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
      const lower = key.toLowerCase();
      if (this.SENSITIVE_KEYS.includes(lower)) {
        sanitized[key] = "[REDACTED]";
        continue;
      }
      // [2026-07-30 SECURITY] 이름·이메일·전화·주소 등 PII 는 부분 마스킹.
      //   문자열일 때만 적용 — 숫자/객체 값(예: address 객체)은 아래 재귀로 내려가 하위 키에서 처리.
      const masker = PII_MASKERS.get(lower);
      if (masker && typeof sanitized[key] === "string" && sanitized[key]) {
        sanitized[key] = masker(sanitized[key]);
        continue;
      }
      if (typeof sanitized[key] === "object" && sanitized[key] !== null) {
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
