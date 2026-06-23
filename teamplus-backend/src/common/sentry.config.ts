/**
 * Sentry Configuration for NestJS Backend
 *
 * 서버 사이드 에러 트래킹 설정입니다.
 * 환경변수 SENTRY_DSN이 설정된 경우에만 활성화됩니다.
 *
 * 사용법:
 *   main.ts에서 initSentry() 호출 (앱 부트스트랩 전)
 *   SentryExceptionFilter를 전역 필터로 등록
 */

import * as Sentry from "@sentry/node";
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  Injectable,
  Logger,
} from "@nestjs/common";

const logger = new Logger("Sentry");

/**
 * Sentry 초기화
 *
 * main.ts에서 app.listen() 전에 호출합니다.
 * SENTRY_DSN 환경변수가 없으면 초기화하지 않습니다.
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    logger.log("SENTRY_DSN 미설정: Sentry 비활성화");
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",

    // 프로덕션에서만 트레이스 10% 샘플링
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

    // 개발 환경에서는 비활성화
    enabled: process.env.NODE_ENV === "production",

    // 민감 정보 필터링
    beforeSend(event) {
      // 요청 헤더에서 민감 정보 제거
      if (event.request?.headers) {
        delete event.request.headers["authorization"];
        delete event.request.headers["cookie"];
        delete event.request.headers["x-auth-token"];
      }

      // extra에서 민감 키워드 제거
      if (event.extra) {
        const sensitiveKeys = [
          "password",
          "token",
          "secret",
          "key",
          "auth",
          "creditCard",
          "cardNumber",
        ];
        for (const key of Object.keys(event.extra)) {
          if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
            delete event.extra[key];
          }
        }
      }

      return event;
    },

    // 노이즈 제거
    ignoreErrors: ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "socket hang up"],
  });

  logger.log(`Sentry 초기화 완료 (environment: ${process.env.NODE_ENV})`);
}

/**
 * Sentry 예외 필터
 *
 * NestJS 전역 예외 필터로 등록하여 처리되지 않은 예외를 Sentry로 전송합니다.
 * HttpException(4xx)은 비즈니스 로직이므로 전송하지 않습니다.
 * 5xx 에러와 예상치 못한 예외만 전송합니다.
 */
@Catch()
@Injectable()
export class SentryExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SentryExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    // HttpException인 경우 상태 코드 확인
    if (exception instanceof HttpException) {
      const status = exception.getStatus();

      // 4xx 에러는 비즈니스 로직 → Sentry 전송 안 함
      if (status < 500) {
        response.status(status).json(exception.getResponse());
        return;
      }
    }

    // 5xx 또는 예상치 못한 에러 → Sentry 전송
    if (process.env.SENTRY_DSN) {
      Sentry.captureException(exception, {
        extra: {
          url: request?.url,
          method: request?.method,
          body: this.sanitizeBody(request?.body),
          query: request?.query,
          userAgent: request?.headers?.["user-agent"],
        },
        tags: {
          endpoint: request?.url,
          method: request?.method,
        },
      });
    }

    // 에러 응답 전송
    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;
    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : { statusCode: 500, message: "서버 내부 오류가 발생했습니다." };

    this.logger.error(
      `[${request?.method}] ${request?.url} → ${status}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    response.status(status).json(message);
  }

  /**
   * 요청 본문에서 민감 정보 제거
   */
  private sanitizeBody(body: any): any {
    if (!body || typeof body !== "object") return body;

    const sanitized = { ...body };
    const sensitiveFields = [
      "password",
      "passwordHash",
      "token",
      "accessToken",
      "refreshToken",
      "secret",
      "cardNumber",
      "cvv",
      "creditCard",
    ];

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = "[FILTERED]";
      }
    }

    return sanitized;
  }
}
