import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { LoggerService } from "../../logger/logger.service";
import { classifyError, ErrorCategory } from "../../logger/file-path.util";
import {
  ApiLifecycleContext,
  REQUEST_CONTEXT_KEY,
} from "../interceptors/api-lifecycle.types";

/**
 * 통합 API 응답 인터페이스
 * 모든 에러 응답은 이 형식을 따름
 */
interface ApiErrorResponse {
  success: false;
  statusCode: number;
  timestamp: string;
  path: string;
  method: string;
  message: string;
  errors?: ValidationError[];
  errorCode?: string;
  /** 401 응답 시 클라이언트가 이동할 기본 경로 — 클라이언트 라우팅 힌트 */
  redirectTo?: string;
  /** v8.6: 에러 카테고리 (server·transaction·client·auth·database·external) — 응답 헤더 X-Error-Log-Category와 동일 */
  errorCategory?: string;
  /** v8.7: 요청 추적 ID — 응답 헤더 X-Request-ID 와 동일. 클라이언트 디버깅·로그 매칭용. */
  requestId?: string;
}

interface ValidationError {
  field: string;
  message: string;
}

/**
 * 글로벌 Exception Filter
 * 모든 예외를 일관된 형식으로 변환하여 응답
 *
 * 처리 대상:
 * - HttpException (NestJS 기본 예외)
 * - Prisma 예외 (DB 관련)
 * - 일반 JavaScript 예외
 * - 알 수 없는 예외
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  /**
   * v8.6 (2026-05-20): LoggerService 주입 — main.ts에서 app.get(LoggerService) 후 인스턴스에 전달
   * - 404 등 NestJS Router 단에서 처리되어 ApiLifecycleInterceptor 미진입 케이스 커버
   * - 모든 4xx/5xx 응답을 errors/{category}.log + errors/_all.jsonl에 분류 기록
   * - 응답 헤더 X-Error-Log-File·X-Error-Log-Category·X-Error-Log-All 자동 주입
   */
  constructor(private readonly appLogger?: LoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message, errors, errorCode } =
      this.getExceptionDetails(exception);

    // 민감정보 마스킹된 로깅
    this.logException(request, status, message, exception);

    // 401 표준화: 클라이언트가 일관되게 로그인 유도를 처리할 수 있도록
    // errorCode와 redirectTo 힌트를 항상 주입한다.
    const isUnauthorized = status === HttpStatus.UNAUTHORIZED;
    const normalizedErrorCode = isUnauthorized
      ? (errorCode ?? "AUTH_REQUIRED")
      : errorCode;
    const normalizedMessage =
      isUnauthorized && (!message || message === "Unauthorized")
        ? "로그인이 필요합니다."
        : message;

    // 요청 추적 컨텍스트 — errorAs 로그 메타와 응답 body 양쪽에서 쓰도록 상단에서 단일 추출.
    const lifecycleCtx = (
      request as Request & { [REQUEST_CONTEXT_KEY]?: ApiLifecycleContext }
    )[REQUEST_CONTEXT_KEY];
    const requestId = lifecycleCtx?.requestId;
    const clientPlatform = request.headers["x-client-platform"] as
      | string
      | undefined;

    // v8.6: 카테고리 자동 분류 + 파일 위치 응답 헤더 주입 (사용자 요구 "에러 발생 시 어디에 저장됐는지")
    let errorCategory: ErrorCategory | null = null;
    if (this.appLogger && status >= 400) {
      const prismaCode =
        exception instanceof Prisma.PrismaClientKnownRequestError
          ? exception.code
          : undefined;
      errorCategory = classifyError({
        status,
        prismaCode,
        exceptionName: exception instanceof Error ? exception.name : undefined,
      });

      // 분류된 카테고리에 기록 + _all.jsonl 통합 인덱스 + stdout 안내 메시지
      this.appLogger.errorAs(
        errorCategory,
        `[${status}] ${request.method} ${request.url} — ${normalizedMessage}`,
        exception instanceof Error ? exception : undefined,
        {
          method: request.method,
          url: request.url,
          status,
          errorCode: normalizedErrorCode,
          prismaCode,
          // 웹/Flutter 클라이언트 식별용 — IP 는 처리방침 고지된 접속 로그 항목.
          ip: request.ip,
          requestId,
          clientPlatform,
        },
      );

      // 응답 헤더 — 운영자가 어떤 파일을 봐야 하는지 즉시 확인
      try {
        const paths = this.appLogger.getErrorLogPaths(errorCategory);
        if (!response.headersSent) {
          response.setHeader("X-Error-Log-Category", errorCategory);
          response.setHeader("X-Error-Log-File", paths.file);
          response.setHeader("X-Error-Log-All", paths.all);
        }
      } catch {
        /* 헤더 주입 실패는 swallow */
      }
    }

    // v8.7 — 응답 헤더 X-Request-ID 와 동일한 값을 body 에도 노출 → 클라이언트가
    //   디버깅 시 어떤 요청의 에러인지 즉시 매칭 가능 (OUT 로그·헤더·body 3중 동기화).
    //   lifecycleCtx·requestId 는 errorAs 메타와 공유하기 위해 catch 상단에서 단일 추출.
    const errorResponse: ApiErrorResponse = {
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message: normalizedMessage,
      ...(errors && { errors }),
      ...(normalizedErrorCode && { errorCode: normalizedErrorCode }),
      ...(isUnauthorized && { redirectTo: "/login" }),
      // v8.6: 응답 body에도 errorCategory 포함 (응답 헤더 못 보는 클라이언트도 인지)
      ...(errorCategory && { errorCategory }),
      // v8.7: requestId — 응답 헤더 X-Request-ID 와 동일
      ...(requestId && { requestId }),
    };

    response.status(status).json(errorResponse);
  }

  private getExceptionDetails(exception: unknown): {
    status: number;
    message: string;
    errors?: ValidationError[];
    errorCode?: string;
  } {
    // HttpException (NestJS 표준 예외)
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      // ValidationPipe 에러 처리
      if (typeof exceptionResponse === "object" && exceptionResponse !== null) {
        const response = exceptionResponse as Record<string, unknown>;

        // class-validator 에러 배열 처리
        if (Array.isArray(response.message)) {
          return {
            status,
            message: "입력값 검증에 실패했습니다.",
            errors: response.message.map((msg: string) => ({
              field: this.extractFieldFromMessage(msg),
              message: msg,
            })),
            errorCode: "VALIDATION_ERROR",
          };
        }

        return {
          status,
          message: String(response.message || exception.message),
          errorCode: String(response.error || "HTTP_ERROR"),
        };
      }

      return {
        status,
        message: exception.message,
      };
    }

    // Prisma 예외 처리
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.handlePrismaError(exception);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: "데이터베이스 검증 오류가 발생했습니다.",
        errorCode: "DB_VALIDATION_ERROR",
      };
    }

    // 일반 Error 객체
    if (exception instanceof Error) {
      // JWT 관련 에러
      if (exception.name === "JsonWebTokenError") {
        return {
          status: HttpStatus.UNAUTHORIZED,
          message: "유효하지 않은 인증 토큰입니다.",
          errorCode: "INVALID_TOKEN",
        };
      }

      if (exception.name === "TokenExpiredError") {
        return {
          status: HttpStatus.UNAUTHORIZED,
          message: "인증 토큰이 만료되었습니다.",
          errorCode: "TOKEN_EXPIRED",
        };
      }

      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: "서버 오류가 발생했습니다.",
        errorCode: "INTERNAL_ERROR",
      };
    }

    // 알 수 없는 예외
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: "알 수 없는 오류가 발생했습니다.",
      errorCode: "UNKNOWN_ERROR",
    };
  }

  private handlePrismaError(error: Prisma.PrismaClientKnownRequestError): {
    status: number;
    message: string;
    errorCode: string;
  } {
    switch (error.code) {
      // Unique constraint violation
      case "P2002": {
        const target = error.meta?.target as string[] | undefined;
        const field = target?.[0] || "필드";
        return {
          status: HttpStatus.CONFLICT,
          message: `이미 사용 중인 ${this.getKoreanFieldName(field)}입니다.`,
          errorCode: "DUPLICATE_ENTRY",
        };
      }

      // Foreign key constraint violation
      case "P2003":
        return {
          status: HttpStatus.BAD_REQUEST,
          message: "참조하는 데이터가 존재하지 않습니다.",
          errorCode: "FOREIGN_KEY_ERROR",
        };

      // Record not found
      case "P2025":
        return {
          status: HttpStatus.NOT_FOUND,
          message: "요청한 데이터를 찾을 수 없습니다.",
          errorCode: "NOT_FOUND",
        };

      // Invalid data
      case "P2000":
        return {
          status: HttpStatus.BAD_REQUEST,
          message: "입력된 데이터가 너무 깁니다.",
          errorCode: "DATA_TOO_LONG",
        };

      // Required field missing
      case "P2011":
        return {
          status: HttpStatus.BAD_REQUEST,
          message: "필수 입력 항목이 누락되었습니다.",
          errorCode: "REQUIRED_FIELD_MISSING",
        };

      // Column does not exist in the database
      case "P2022": {
        const column = (error.meta?.column as string) || "필드";
        this.logger.error(
          `[P2022] 스키마-DB 불일치: 컬럼 '${column}'이 DB에 존재하지 않습니다. 마이그레이션을 확인하세요.`,
        );
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message:
            "데이터베이스 스키마가 동기화되지 않았습니다. 관리자에게 문의하세요.",
          errorCode: "DB_SCHEMA_MISMATCH",
        };
      }

      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: "데이터베이스 오류가 발생했습니다.",
          errorCode: `DB_ERROR_${error.code}`,
        };
    }
  }

  private extractFieldFromMessage(message: string): string {
    // class-validator 메시지에서 필드명 추출 시도
    const match = message.match(/^(\w+)/);
    return match ? match[1] : "unknown";
  }

  private getKoreanFieldName(field: string): string {
    const fieldNames: Record<string, string> = {
      email: "이메일",
      phone: "전화번호",
      teamCode: "클럽 코드",
      orderNumber: "주문번호",
    };
    return fieldNames[field] || field;
  }

  private logException(
    request: Request,
    status: number,
    message: string,
    exception: unknown,
  ): void {
    // 민감정보 마스킹
    const sanitizedUrl = this.sanitizeUrl(request.url);
    const sanitizedBody = this.sanitizeBody(request.body);

    const logContext = {
      method: request.method,
      url: sanitizedUrl,
      body: sanitizedBody,
      userAgent: request.headers["user-agent"]?.substring(0, 100),
      ip: request.ip,
    };

    if (status >= 500) {
      this.logger.error(
        `[${status}] ${message}`,
        exception instanceof Error ? exception.stack : String(exception),
        JSON.stringify(logContext),
      );
    } else if (status >= 400) {
      this.logger.warn(`[${status}] ${message}`, JSON.stringify(logContext));
    }
  }

  private sanitizeUrl(url: string): string {
    // URL에서 민감한 파라미터 마스킹
    return url.replace(/(password|token|secret|key)=([^&]*)/gi, "$1=***");
  }

  private sanitizeBody(body: unknown): Record<string, unknown> {
    if (!body || typeof body !== "object") return {};

    const sensitiveFields = [
      "password",
      "newPassword",
      "currentPassword",
      "token",
      "refreshToken",
      "accessToken",
      "secret",
      "cardNumber",
      "cvv",
      "ci",
      "di",
    ];

    const sanitized = { ...body } as Record<string, unknown>;

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = "***";
      }
    }

    return sanitized;
  }
}
