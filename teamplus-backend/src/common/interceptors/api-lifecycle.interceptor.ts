import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request, Response } from "express";
import { Observable } from "rxjs";
import { finalize, tap } from "rxjs/operators";
import { randomUUID } from "crypto";
import * as Sentry from "@sentry/node";
import {
  ApiLifecycleContext,
  ClientPlatform,
  REQUEST_CONTEXT_KEY,
} from "./api-lifecycle.types";
import { UserActivityService } from "./user-activity.service";
import { IS_PUBLIC_KEY } from "../../auth/public.decorator";
import { extractClientIp } from "../utils/extract-client-ip.util";
import { LoggerService } from "../../logger/logger.service";
import { truncateForLog } from "../utils/truncate-for-log.util";
import { TransactionLogService } from "../../transaction-log/transaction-log.service";

/**
 * ApiLifecycleInterceptor
 *
 * 전역 인터셉터: 인증 여부와 무관하게 모든 API 요청에 대해
 * - Pre-processing (요청 수신 직후):
 *   · X-Request-ID 생성 또는 echo
 *   · X-Client-Platform / X-Client-Version 파싱
 *   · 요청 컨텍스트 (req[REQUEST_CONTEXT_KEY]) 주입
 *   · 응답 헤더에 X-Request-ID / X-Server-Time 설정
 *
 * - Post-processing (응답 완료 또는 에러 발생 직후, RxJS finalize):
 *   · durationMs 계산 후 응답 헤더 X-Response-Time 설정
 *   · 인증된 사용자(userId)가 존재하면 UserActivityService.touch() 호출
 *     (Public 엔드포인트 또는 미인증 요청은 skip)
 *
 * JwtStrategy가 req.user를 주입한 이후에 실행되도록 등록 순서는 JwtAuthGuard 다음.
 * (NestJS Guard → Interceptor 순서 보장)
 */
@Injectable()
export class ApiLifecycleInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ApiLifecycleInterceptor.name);
  /** 활동 추적에서 완전히 제외할 경로 패턴 */
  private readonly EXCLUDE_PATHS: readonly string[] = [
    "/auth/refresh",
    "/auth/login",
    "/health",
    "/metrics",
    "/api/docs",
  ];
  /** 1초 SLA — 이 값을 초과하면 WARN 로그 + Sentry 보고 대상 */
  private readonly SLA_THRESHOLD_MS = 1_000;

  /**
   * 거래로그(DB) 적재 제외 경로 — 무의미/무한 호출 방지.
   * 정책상 GET 포함 모든 API 를 저장하되, health/static/문서/자기조회만 제외.
   * (인증 거래 /auth/* 는 기록 대상이므로 EXCLUDE_PATHS 와 별개 목록)
   */
  private readonly TXLOG_EXCLUDE_PATTERNS: readonly string[] = [
    "/health",
    "/metrics",
    "/api/docs",
    "/uploads/",
    "/_next/",
    "/favicon",
    "/admin/system/logs/transactions", // 자기 조회 — 무한 기록 방지
  ];

  constructor(
    private readonly reflector: Reflector,
    private readonly userActivity: UserActivityService,
    private readonly appLogger: LoggerService,
    private readonly txLog: TransactionLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // HTTP 외 컨텍스트(WS/RPC)에서는 skip
    const type = context.getType();
    if (type !== "http") {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<
      Request & {
        user?: { id?: string; userType?: string };
        [REQUEST_CONTEXT_KEY]?: ApiLifecycleContext;
      }
    >();
    const res = http.getResponse<Response>();

    const ctx = this.buildContext(req);
    req[REQUEST_CONTEXT_KEY] = ctx;
    // v8.7 (2026-05-23): IN/OUT requestId 동일성 보장 — req.requestId 도 동기화.
    // LoggerInterceptor 의 fallback (`lifecycleCtx?.requestId ?? request.requestId`)
    // 경로가 발동되더라도 동일 값. 응답 헤더 X-Request-ID 와도 1:1 매칭.
    (req as Request & { requestId?: string }).requestId = ctx.requestId;

    // 응답 헤더 설정 (안전하게)
    try {
      res.setHeader("X-Request-ID", ctx.requestId);
      res.setHeader("X-Server-Time", new Date().toISOString());
    } catch {
      // 이미 flush된 경우 무시
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const isExcluded = this.EXCLUDE_PATHS.some((p) => req.url?.includes(p));

    // === [v8.6] response body / error 캡처용 변수 ===
    let outputBody: unknown = undefined;
    let outputError: unknown = undefined;

    return next.handle().pipe(
      tap({
        next: (data) => {
          outputBody = data;
        },
        error: (err) => {
          outputError = err;
        },
      }),
      finalize(() => {
        const durationMs = Date.now() - ctx.startAt;
        try {
          if (!res.headersSent) {
            res.setHeader("X-Response-Time", `${durationMs}ms`);
          }
        } catch {
          /* noop */
        }

        // === 1초 SLA 모니터링 ===
        // 1000ms 초과 시 WARN 로그 (자동 알림 파이프라인 트리거 지점)
        if (durationMs > this.SLA_THRESHOLD_MS) {
          this.logger.warn(
            `[SLA_BREACH] ${req.method} ${req.url} took ${durationMs}ms ` +
              `(>${this.SLA_THRESHOLD_MS}ms) ` +
              `requestId=${ctx.requestId} ` +
              `userId=${req.user?.id ?? "-"} ` +
              `role=${req.user?.userType ?? "-"} ` +
              `ip=${ctx.clientIp ?? "-"}`,
          );
          // [2026-05-13 Phase D-5] Sentry SLA 알림 — SENTRY_DSN 활성 시에만 전송.
          //   3초 초과는 'error' 레벨, 1초~3초는 'warning' 레벨.
          //   captureMessage 호출은 dsn 미설정 시 noop.
          try {
            Sentry.withScope((scope) => {
              scope.setTag("type", "SLA_VIOLATION");
              scope.setTag("method", req.method);
              if (ctx.clientIp) scope.setTag("clientIp", ctx.clientIp);
              scope.setExtra("requestId", ctx.requestId);
              scope.setExtra("durationMs", durationMs);
              scope.setExtra("url", req.url);
              scope.setExtra("clientIp", ctx.clientIp ?? null);
              if (req.user?.id) scope.setUser({ id: req.user.id });
              Sentry.captureMessage(
                `[SLA_VIOLATION] ${req.method} ${req.url} took ${durationMs}ms`,
                durationMs > 3000 ? "error" : "warning",
              );
            });
          } catch {
            /* Sentry 미초기화 / 일시 오류는 무시 */
          }
        }

        // 사용자 활동 갱신 (Public·제외 경로 skip + 인증 요청만)
        const userId = req.user?.id;
        if (!isPublic && !isExcluded && userId) {
          ctx.userId = userId;
          ctx.userRole = req.user?.userType;
          // fire-and-forget — 실패해도 요청 응답에 영향 없음
          void this.userActivity.touch(userId);
        }

        // [추가 2026-05-23 v8.8] 로그 가독성용 — userId/userRole/userEmail 노출값 표준화.
        //   ① 1순위: 실제 인증된 JWT (req.user) — **인가에 사용되는 신뢰 가능 값**
        //   ② 2순위: 프론트엔드가 보낸 세션 헤더 (X-Session-User-Id/-Role/-Email)
        //            → Public 라우트(JWT Guard 우회)에서도 "누가 호출했는지" 확인용
        //            → **로깅 전용 — 절대 인가에 사용 금지** (클라이언트 위조 가능)
        //            → 신뢰 구분을 위해 값 끝에 "(session)" 접미사 표기.
        //   ③ 3순위: "anonymous" — 위 두 경로 모두 비어있을 때
        const headerSessionUserId = this.stringHeader(
          req.headers["x-session-user-id"],
        );
        const headerSessionUserRole = this.stringHeader(
          req.headers["x-session-user-role"],
        );
        const headerSessionUserEmail = this.stringHeader(
          req.headers["x-session-user-email"],
        );
        const userIdForLog: string = userId
          ? userId
          : headerSessionUserId
            ? `${headerSessionUserId} (session)`
            : "anonymous";
        const userRoleForLog: string = req.user?.userType
          ? req.user.userType
          : headerSessionUserRole
            ? `${headerSessionUserRole} (session)`
            : "anonymous";
        const userEmailForLog: string | undefined = headerSessionUserEmail
          ? headerSessionUserEmail
          : undefined;

        // === [v8.6 2026-05-20] 모든 HTTP 요청을 access.log에 빠짐없이 기록 ===
        // 사용자 강조 요구사항 "서버 로그 전부 남겨줘" 보장 — Public/제외 경로도 기록
        // 5xx는 errors/server.log, 4xx는 access.log warn 레벨로 자동 분기
        try {
          const statusCode = res.statusCode ?? 0;
          const level =
            statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";
          // [2026-05-23] access 로그도 IN/OUT 와 동일 — userId/userRole "anonymous" 폴백.
          //   userEmail 은 세션 헤더로 전달된 경우에만 포함 (인증 신뢰값과 분리).
          const accessCtx = {
            requestId: ctx.requestId,
            userId: userIdForLog,
            userRole: userRoleForLog,
            userEmail: userEmailForLog,
            method: req.method,
            url: req.url,
            status: statusCode,
            durationMs,
            platform: ctx.platform,
            clientVersion: ctx.clientVersion,
            ip: ctx.clientIp,
            isPublic,
            // v8.7 — 호출 발생 화면 (예: 'teamplus-web/src/components/.../File.tsx')
            viewId: ctx.viewId,
          };
          this.appLogger.access(
            level,
            `${req.method} ${req.url} ${statusCode} ${durationMs}ms`,
            accessCtx,
          );

          // 5xx는 server 오류 파일에 추가 기록 (errors/_all.jsonl 통합 인덱스에도 자동 반영)
          if (statusCode >= 500) {
            this.appLogger.errorAs(
              "server",
              `[5XX] ${req.method} ${req.url} ${statusCode} in ${durationMs}ms`,
              outputError instanceof Error ? outputError : undefined,
              accessCtx,
            );
            // 응답 헤더에 에러 로그 파일 위치 안내 (사용자 요구 v8.6)
            try {
              const paths = this.appLogger.getErrorLogPaths("server");
              if (!res.headersSent) {
                res.setHeader("X-Error-Log-Category", "server");
                res.setHeader("X-Error-Log-File", paths.file);
                res.setHeader("X-Error-Log-All", paths.all);
              }
            } catch {
              /* 헤더 주입 실패 swallow */
            }
          } else if (statusCode >= 400 && statusCode < 500) {
            // 4xx 클라이언트 오류 — client.log + _all.jsonl 기록 + 헤더 안내 (사용자 요구 v8.6)
            this.appLogger.errorAs(
              "client",
              `[4XX] ${req.method} ${req.url} ${statusCode} in ${durationMs}ms`,
              outputError instanceof Error ? outputError : undefined,
              accessCtx,
            );
            try {
              const paths = this.appLogger.getErrorLogPaths("client");
              if (!res.headersSent) {
                res.setHeader("X-Error-Log-Category", "client");
                res.setHeader("X-Error-Log-File", paths.file);
                res.setHeader("X-Error-Log-All", paths.all);
              }
            } catch {
              /* 헤더 주입 실패 swallow */
            }
          }

          // === input 로그 — request body/query/params/headers 분리 기록 (v8.7 2026-05-23) ===
          // LoggerService.sanitize 가 password·token·creditCard 등 12 필드 자동 마스킹.
          // [수정 2026-05-30] 헤더 allow-list 를 논리 그룹(routing/content/cache/proxy/client/
          //   session/agent/auth)으로 구조화 + 빈 값(미전송) 제거 → 로그에서 JSON 형태가 한눈에
          //   들어오도록 가독성 개선. 원본 헤더 키 이름은 보존(검색 호환). authorization/cookie 는
          //   명시 마스킹. 상세: buildLoggableHeaders().
          const loggableHeaders = this.buildLoggableHeaders(req.headers ?? {});

          // [필드 순서 정책 2026-05-23 사용자 요구]
          //   1) body 는 가장 큰 페이로드이므로 로그를 위→아래로 스캔할 때 메타데이터를
          //      먼저 읽고 body 를 마지막에 읽도록 **항상 최하단** 배치.
          //   2) viewId 는 body 직전(메타데이터 마지막)으로 이동 — 검색 편의 + 가독성 모두 확보.
          //   3) userId/userRole 은 "누가 호출했는지" 1차 식별값 — requestId 다음 최상단 고정.
          //      비인증/Public 라우트는 "anonymous" 로 표기 (omit 방지).
          this.appLogger.input("info", `IN  ${req.method} ${req.url}`, {
            requestId: ctx.requestId,
            userId: userIdForLog,
            userRole: userRoleForLog,
            userEmail: userEmailForLog,
            method: req.method,
            url: req.url,
            // GET 등 빈 객체여도 명시적으로 노출 (`query: {}` 가 보여야 디버거가 안심)
            query: req.query ?? {},
            params: (req as Request & { params?: unknown }).params ?? {},
            headers: loggableHeaders,
            ip: ctx.clientIp,
            platform: ctx.platform,
            clientVersion: ctx.clientVersion,
            // v8.7 — 호출 발생 화면 (헤더 외에 top-level 로 노출, 검색 편의)
            viewId: ctx.viewId,
            // body 는 항상 최하단 — 큰 페이로드를 위→아래 스캔의 마지막에 배치.
            body: req.body ?? null,
          });

          // === output 로그 — response body / error 분리 기록 (v8.6 사용자 요구) ===
          // 응답 body 크기 10KB 초과 시 truncate (디스크 폭증 방지)
          // [수정 2026-05-30] 종전 `preview: serialized.substring(0,1024)` 는 JSON 문자열을
          //   문자 단위로 잘라 escape 된 "string object" 조각을 로그에 남겨 가독성·재파싱이
          //   불가했다. → 구조 보존 절단(truncateForLog)으로 교체: JSON 객체 형태를 유지한 채
          //   큰 배열/문자열만 축약하여 로그에서도 정상 JSON 객체로 읽히도록 한다.
          const MAX_OUTPUT_BYTES = 10 * 1024;
          let bodyForLog: unknown = outputBody;
          let bodyTruncated = false;
          let bodySize = 0;
          try {
            if (outputBody !== undefined) {
              const serialized = JSON.stringify(outputBody);
              bodySize = serialized?.length ?? 0;
              if (bodySize > MAX_OUTPUT_BYTES) {
                bodyForLog = {
                  __truncated: true,
                  size: bodySize,
                  // 구조 보존 절단 — JSON 객체 형태 유지 (stringify-substring 금지)
                  body: truncateForLog(outputBody),
                };
                bodyTruncated = true;
              }
            }
          } catch {
            bodyForLog = { __unserializable: true };
          }

          // [필드 순서 정책 2026-05-23 사용자 요구]
          //   IN 로그와 동일 — body 가 항상 최하단, viewId 는 body 바로 위(메타데이터 끝).
          //   error 는 body 직전(viewId 다음)에 배치하여 실패 시 원인 → 응답 순서로 읽힘.
          //   userId/userRole 도 IN 과 동일 정책 — "anonymous" 폴백으로 누가 호출했는지 항상 노출.
          this.appLogger.output(
            outputError ? "error" : statusCode >= 400 ? "warn" : "info",
            `OUT ${req.method} ${req.url} ${statusCode} ${bodySize}bytes${bodyTruncated ? "(truncated)" : ""}`,
            {
              requestId: ctx.requestId,
              userId: userIdForLog,
              userRole: userRoleForLog,
              userEmail: userEmailForLog,
              method: req.method,
              url: req.url,
              status: statusCode,
              durationMs,
              // v8.7 — IN 과 짝 맞춰 OUT 로그에도 viewId 노출
              viewId: ctx.viewId,
              error: outputError
                ? {
                    name:
                      outputError instanceof Error
                        ? outputError.name
                        : "Unknown",
                    message:
                      outputError instanceof Error
                        ? outputError.message
                        : String(outputError),
                    status: (outputError as { status?: number })?.status,
                  }
                : undefined,
              // body 는 항상 최하단 — 큰 페이로드를 위→아래 스캔의 마지막에 배치.
              body: bodyForLog,
            },
          );
        } catch {
          /* 로깅 실패가 요청 응답에 영향 주지 않도록 swallow */
        }

        // === [2026-06-08] 거래로그 DB 적재 — fire-and-forget (본 API 응답 영향 0) ===
        // 정책: GET 포함 모든 API 저장(health/static/문서/자기조회만 제외) · requestId upsert ·
        //   민감값 마스킹 · 10KB truncate 는 TransactionLogService 내부에서 수행. 저장 실패는 swallow.
        try {
          const txPath = req.url ?? "";
          const txExcluded = this.TXLOG_EXCLUDE_PATTERNS.some((p) =>
            txPath.includes(p),
          );
          if (!txExcluded) {
            this.txLog.capture({
              requestId: ctx.requestId,
              occurredAt: new Date(ctx.startAt),
              method: req.method,
              url: req.url,
              httpStatus: this.resolveHttpStatus(res, outputError),
              durationMs,
              outputBody,
              outputError,
              reqHeaders: (req.headers ?? {}) as Record<string, unknown>,
              reqBody: (req as Request & { body?: unknown }).body,
              reqQuery: req.query as unknown,
              reqParams: (req as Request & { params?: unknown }).params,
              resHeaders: this.collectResponseHeaders(res),
              platform: ctx.platform,
              clientVersion: ctx.clientVersion,
              viewId: ctx.viewId,
              ip: ctx.clientIp,
              // 인증 JWT 우선, 없으면 세션헤더(로깅 전용). 둘 다 없으면 undefined(NULL).
              userId: userId ?? headerSessionUserId ?? undefined,
              userRole: req.user?.userType ?? headerSessionUserRole ?? undefined,
              userEmail: headerSessionUserEmail ?? undefined,
              env: process.env.NODE_ENV ?? "development",
            });
          }
        } catch {
          /* 거래로그 진입 실패도 본 요청에 영향 없음 (swallow) */
        }
      }),
    );
  }

  /** 응답 헤더 수집 — set-cookie 등 민감 헤더는 TransactionLogService 가 마스킹 */
  private collectResponseHeaders(res: Response): Record<string, unknown> {
    try {
      return { ...res.getHeaders() } as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  /**
   * 거래로그용 정확한 httpStatus 산출.
   * 정상 응답은 res.statusCode. 예외 시 AllExceptionsFilter 가 인터셉터 finalize 이후에
   * res.status 를 설정하므로 finalize 시점 res.statusCode 가 기본 200 일 수 있다 →
   * 예외 객체(HttpException.getStatus / status / statusCode)에서 실제 상태코드를 추출한다.
   */
  private resolveHttpStatus(res: Response, outputError: unknown): number {
    if (outputError != null) {
      const e = outputError as {
        status?: number;
        statusCode?: number;
        getStatus?: () => number;
      };
      let fromErr: number | undefined;
      try {
        fromErr = typeof e.getStatus === "function" ? e.getStatus() : undefined;
      } catch {
        fromErr = undefined;
      }
      const status = fromErr ?? e.status ?? e.statusCode;
      if (typeof status === "number" && status > 0) return status;
      const sc = res.statusCode ?? 0;
      return sc >= 400 ? sc : 500; // status 미상 예외 → 서버 오류로 간주
    }
    return res.statusCode ?? 0;
  }

  /**
   * [추가 2026-05-30] 로그용 헤더 구조화 — allow-list 헤더를 논리 그룹으로 묶고
   *   빈 값(미전송: undefined/null/'')은 제거하여 로그에서 JSON 구조가 한눈에 들어오도록
   *   가독성을 높인다. 원본 헤더 키 이름은 보존(grep/검색 호환), authorization/cookie 는
   *   명시 마스킹. 값이 하나도 없는 그룹은 통째로 생략한다.
   */
  private buildLoggableHeaders(
    h: Record<string, unknown>,
  ): Record<string, unknown> {
    // 빈 값 제거 — 값이 남으면 객체, 없으면 undefined 반환(그룹 자체 생략용).
    const compact = (
      group: Record<string, unknown>,
    ): Record<string, unknown> | undefined => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(group)) {
        if (v !== undefined && v !== null && v !== "") out[k] = v;
      }
      return Object.keys(out).length > 0 ? out : undefined;
    };

    const groups: Record<string, Record<string, unknown> | undefined> = {
      // 라우팅/CORS
      routing: compact({
        host: h["host"],
        origin: h["origin"],
        referer: h["referer"],
      }),
      // 콘텐츠 협상
      content: compact({
        "content-type": h["content-type"],
        "content-length": h["content-length"],
        accept: h["accept"],
        "accept-language": h["accept-language"],
        "accept-encoding": h["accept-encoding"],
      }),
      // 캐시
      cache: compact({
        "if-none-match": h["if-none-match"],
        "if-modified-since": h["if-modified-since"],
      }),
      // 프록시/IP
      proxy: compact({
        "x-forwarded-for": h["x-forwarded-for"],
        "x-real-ip": h["x-real-ip"],
      }),
      // 클라이언트 식별 (TEAMPLUS 자체 헤더)
      client: compact({
        "x-client-platform": h["x-client-platform"],
        "x-client-version": h["x-client-version"],
        "x-device-id": h["x-device-id"],
        "x-request-id": h["x-request-id"],
        "x-view-id": h["x-view-id"],
      }),
      // 세션 식별 (로깅 전용, 인가 미사용)
      session: compact({
        "x-session-user-id": h["x-session-user-id"],
        "x-session-user-role": h["x-session-user-role"],
        "x-session-user-email": h["x-session-user-email"],
      }),
      // 사용자 에이전트
      agent: compact({ "user-agent": h["user-agent"] }),
      // 민감 헤더 — 명시 마스킹 (sanitize 도 token 키 처리하지만 이중 안전망)
      auth: compact({
        authorization: h.authorization ? "[REDACTED]" : undefined,
        cookie: h.cookie ? "[REDACTED]" : undefined,
      }),
    };

    // 값이 있는 그룹만 노출.
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(groups)) {
      if (v !== undefined) out[k] = v;
    }
    return out;
  }

  /**
   * 요청 헤더에서 lifecycle 컨텍스트 구축
   */
  private buildContext(req: Request): ApiLifecycleContext {
    const headers = req.headers ?? {};

    const requestIdHeader = this.stringHeader(headers["x-request-id"]);
    const requestId =
      requestIdHeader && requestIdHeader.length > 0
        ? requestIdHeader
        : randomUUID();

    const platform = this.normalizePlatform(
      this.stringHeader(headers["x-client-platform"]),
    );
    const clientVersion =
      this.stringHeader(headers["x-client-version"]) ?? "unknown";
    const deviceId = this.stringHeader(headers["x-device-id"]);
    // v8.7 — 호출 발생 화면/컴포넌트 식별자 (프로젝트 루트 기준 경로)
    const viewId = this.stringHeader(headers["x-view-id"]);

    return {
      requestId,
      platform,
      clientVersion,
      startAt: Date.now(),
      deviceId,
      clientIp: extractClientIp(req),
      viewId,
    };
  }

  private stringHeader(value: unknown): string | undefined {
    if (typeof value === "string") return value;
    if (Array.isArray(value) && typeof value[0] === "string") return value[0];
    return undefined;
  }

  private normalizePlatform(raw: string | undefined): ClientPlatform {
    const v = (raw ?? "").toLowerCase();
    if (v === "web") return "web";
    if (v === "admin") return "admin";
    if (v === "ios") return "ios";
    if (v === "android") return "android";
    if (v === "flutter") return "flutter";
    return "unknown";
  }
}
