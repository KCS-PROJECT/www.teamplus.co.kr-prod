/**
 * Logger Interceptor
 *
 * Automatically logs all HTTP requests and responses with:
 * - Request method, path, query params
 * - Response status code and duration
 * - Error handling and stack traces
 * - Sensitive data sanitization
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap, catchError } from "rxjs/operators";
import { Request, Response } from "express";
import { LoggerService } from "./logger.service";
import {
  ApiLifecycleContext,
  REQUEST_CONTEXT_KEY,
} from "../common/interceptors/api-lifecycle.types";

@Injectable()
export class LoggerInterceptor implements NestInterceptor {
  constructor(private logger: LoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.getArgByIndex(0) as Request & {
      user?: { id?: string };
      requestId?: string;
      [REQUEST_CONTEXT_KEY]?: ApiLifecycleContext;
    };
    const response = context.getArgByIndex(1) as Response;

    const { method, url } = request;
    const startTime = Date.now();

    // Extract user info if available (from JWT)
    const userId = request.user?.id;

    // Extract request ID — ApiLifecycleInterceptor가 주입한 context 우선
    // v8.7 (2026-05-23): IN/OUT requestId 동일성 보장 검증.
    //   인터셉터 등록 순서상 ApiLifecycleInterceptor 가 먼저 실행되어 ctx 를 주입하므로
    //   lifecycleCtx 는 항상 존재해야 함. 만약 누락된다면 ApiLifecycle 이 throw 한 비정상
    //   상황 → warn 로그로 즉시 인지 가능하게 (운영 디버깅용).
    const lifecycleCtx = request[REQUEST_CONTEXT_KEY];
    if (!lifecycleCtx) {
      this.logger.warn(
        `[REQUEST_CTX_MISSING] ${method} ${url} — ApiLifecycleInterceptor 미실행 의심`,
        { method, path: url },
      );
    }
    const requestId = lifecycleCtx?.requestId ?? request.requestId;
    const clientPlatform = lifecycleCtx?.platform;
    const clientVersion = lifecycleCtx?.clientVersion;
    // ApiLifecycleInterceptor 가 X-Forwarded-For 우선으로 추출한 clientIp 사용 — req.ip fallback.
    const ip = lifecycleCtx?.clientIp ?? request.ip;

    // Log incoming request — v8.7 (2026-05-23): debug → info 승격으로 stdout 진입 즉시 노출.
    // 기존 ApiLifecycleInterceptor.input 은 finalize 시점에 OUT 과 묶여 찍히므로
    // "요청을 받았다"는 신호가 콘솔에 미리 보이지 않아 IN 라인 누락처럼 보였음.
    // 메시지를 "IN [method] [url]" 형식으로 OUT 과 짝 맞춰 가독성 향상.
    this.logger.access("info", `IN  ${method} ${url}`, {
      method,
      path: url,
      ip,
      userId,
      requestId,
      clientPlatform,
      clientVersion,
    });

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - startTime;
        const statusCode = response.statusCode;

        // Log successful response
        this.logger.info("HTTP response sent", {
          method,
          path: url,
          statusCode,
          durationMs: duration,
          ip,
          userId,
          requestId,
          clientPlatform,
          clientVersion,
        });
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;

        // Log error response
        this.logger.error("HTTP request failed", error, {
          method,
          path: url,
          statusCode: response.statusCode,
          durationMs: duration,
          ip,
          userId,
          requestId,
          clientPlatform,
          clientVersion,
        });

        throw error;
      }),
    );
  }
}
