import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request, Response } from "express";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { SKIP_ENVELOPE_KEY } from "../decorators/skip-envelope.decorator";
import {
  ApiLifecycleContext,
  REQUEST_CONTEXT_KEY,
} from "./api-lifecycle.types";

/**
 * ResponseEnvelopeInterceptor
 *
 * 성공 응답을 클라이언트(web/admin/app) 가 기대하는 `{success:true, data:T}`
 * 형태로 자동 래핑한다. 이미 표준 형태이거나 페이지네이션 메타, stream, file 등은
 * 그대로 통과시켜 회귀를 방지한다.
 *
 * 등록: app.module.ts APP_INTERCEPTOR (LoggerInterceptor 보다 뒤 = 응답 단계에서 가장 안쪽).
 *
 * 통과 조건 (래핑 skip):
 *  - `@SkipEnvelope()` 데코레이터 존재
 *  - 컨트롤러가 이미 `{ success, ... }` 형태 반환 (재래핑 회귀 방지)
 *  - 페이지네이션 형태 `{ total, page, limit, data }` (그대로 클라이언트 호환)
 *  - HTTP 외 컨텍스트(WS/RPC) — `context.getType() !== 'http'`
 *  - 응답 객체가 Buffer / Stream / FileStream — instanceof 검사
 *  - 응답 상태가 204 No Content
 *  - 명시적 null/undefined (NestJS 가 자동으로 204 처리하지만 안전 가드)
 *  - Content-Type 이 application/json 이 아닌 경우 (예: text/csv, application/pdf)
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") {
      return next.handle();
    }

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_ENVELOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return next.handle();

    const res = context.switchToHttp().getResponse<Response>();
    // v8.7 (2026-05-23) — 응답 body 에 requestId 주입을 위해 ctx 조회
    const req = context
      .switchToHttp()
      .getRequest<Request & { [REQUEST_CONTEXT_KEY]?: ApiLifecycleContext }>();
    const requestId = req[REQUEST_CONTEXT_KEY]?.requestId;

    /**
     * v8.7 — 객체 응답에 requestId 키 주입.
     * - Buffer/Stream/non-JSON 은 호출자가 분기 차단 후 진입하므로 여기 도달 시 객체.
     * - 기존 requestId 키가 있으면 보존 (재래핑 회귀 방지).
     * - 응답 헤더 X-Request-ID 와 동일 값 → 클라이언트가 body.requestId 와 헤더 1:1 매칭 가능.
     * - [수정 2026-05-23 사용자 정책] 키 순서 — `success` 다음에 `requestId` 위치 (debugging 가시성).
     *   기존: `{ success, data, requestId }` (requestId 가 맨 뒤) → 변경: `{ success, requestId, data, ... }`.
     */
    const withRequestId = <T extends Record<string, unknown>>(obj: T): T => {
      if (!requestId) return obj;
      // 기존 requestId 가 있어도 success → requestId → rest 순서로 재정렬
      const { success, requestId: existingId, ...rest } = obj as Record<
        string,
        unknown
      >;
      const finalRequestId = existingId ?? requestId;
      // success 가 obj 에 있으면 맨 앞 유지, 없으면 requestId 가 첫 키
      if (success !== undefined) {
        return { success, requestId: finalRequestId, ...rest } as unknown as T;
      }
      return { requestId: finalRequestId, ...rest } as unknown as T;
    };

    return next.handle().pipe(
      map((data: unknown) => {
        if (data === null || data === undefined) return data;

        // 204 No Content 등 본문 없는 응답은 통과
        if (res.statusCode === 204) return data;

        // Buffer / Stream 응답은 통과 (파일 다운로드 등)
        if (Buffer.isBuffer(data)) return data;
        // ReadableStream 흉내 (Node Readable) — pipe 메서드 존재 여부로 판단
        if (typeof (data as { pipe?: unknown }).pipe === "function") {
          return data;
        }

        // 응답 Content-Type 이 JSON 이 아니면 통과 (text/html 등)
        const ct = res.getHeader("content-type");
        if (typeof ct === "string" && ct.length > 0 && !ct.includes("json")) {
          return data;
        }

        if (typeof data !== "object") {
          // 원시값 (string, number, boolean) 도 표준 envelope 으로 래핑
          return withRequestId({ success: true, data });
        }

        const obj = data as Record<string, unknown>;

        // 이미 표준 envelope 인 경우 — requestId 만 주입 후 반환
        if (obj.success === true && "data" in obj) return withRequestId(obj);
        if (obj.success === false) return withRequestId(obj); // 에러 envelope 도 통과 + requestId

        // 페이지네이션 형태 — 그대로 통과 + requestId 주입
        const isPaginated =
          "data" in obj &&
          (("total" in obj && typeof obj.total === "number") ||
            ("page" in obj && typeof obj.page === "number") ||
            ("limit" in obj && typeof obj.limit === "number") ||
            "hasMore" in obj);
        if (isPaginated) return withRequestId(obj);

        return withRequestId({ success: true, data });
      }),
    );
  }
}
