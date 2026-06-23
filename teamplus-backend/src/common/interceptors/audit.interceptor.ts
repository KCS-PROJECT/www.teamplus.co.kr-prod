import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import {
  AUDIT_ACTION_KEY,
  type AuditActionOptions,
} from "../decorators/audit-action.decorator";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { extractClientIp } from "../utils/extract-client-ip.util";
import {
  REQUEST_CONTEXT_KEY,
  type ApiLifecycleContext,
} from "./api-lifecycle.types";

/**
 * AuditInterceptor
 *
 * `@AuditAction({ action, resource, includeKeys })` 데코레이터가 부착된
 * 컨트롤러 메서드의 성공 응답 직후 `AuditLog` 를 자동 생성한다.
 *
 * - userId: `req.user.id` (인증된 요청만 — 미인증은 기록하지 않음)
 * - ipAddress: `req.ip`
 * - newValue: includeKeys 로 필터링된 body/params/query 메타 (민감 정보 제외)
 * - 예외 발생 시 기록 skip (실패 액션은 LoggerInterceptor / Sentry 가 담당)
 *
 * Audit 기록 실패 시 원 요청 응답에 영향 없음 (비긴급).
 *
 * 등록: app.module.ts APP_INTERCEPTOR.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();

    const opts = this.reflector.getAllAndOverride<AuditActionOptions>(
      AUDIT_ACTION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!opts) return next.handle();

    const req = context.switchToHttp().getRequest<
      Request & {
        user?: { id?: string };
        [REQUEST_CONTEXT_KEY]?: ApiLifecycleContext;
      }
    >();

    return next.handle().pipe(
      tap(() => {
        const userId = req.user?.id;
        if (!userId) {
          // 인증 없는 요청에서 @AuditAction 호출되면 기록 skip — 정책상 의도된 동작.
          return;
        }

        const newValue = this.extractMeta(req, opts.includeKeys);
        // ApiLifecycleInterceptor 가 이미 추출한 clientIp 우선 사용 — 동일 요청 컨텍스트 일관성 보장.
        const ipAddress =
          req[REQUEST_CONTEXT_KEY]?.clientIp ?? extractClientIp(req);
        // fire-and-forget — 응답 차단 방지.
        const data: Prisma.AuditLogCreateInput = {
          action: opts.action,
          resource: opts.resource,
          ipAddress,
          user: { connect: { id: userId } },
        };
        if (newValue) data.newValue = newValue as Prisma.InputJsonValue;
        void this.prisma.auditLog.create({ data }).catch((err) => {
          this.logger.error(
            `[AuditInterceptor] Failed to record audit log: action=${opts.action}, resource=${opts.resource}`,
            err instanceof Error ? err.stack : String(err),
          );
        });
      }),
    );
  }

  private extractMeta(
    req: Request,
    includeKeys?: string[],
  ): Record<string, unknown> | undefined {
    if (!includeKeys || includeKeys.length === 0) return undefined;

    const sources: Record<string, unknown> = {
      ...(req.params ?? {}),
      ...(req.query ?? {}),
      ...((req.body as Record<string, unknown>) ?? {}),
    };
    const meta: Record<string, unknown> = {};
    for (const key of includeKeys) {
      if (key in sources) {
        const value = sources[key];
        // 민감 정보 마스킹
        if (
          typeof key === "string" &&
          /password|token|secret|cvv|ci|di/i.test(key)
        ) {
          meta[key] = "[REDACTED]";
        } else {
          meta[key] = value;
        }
      }
    }
    return Object.keys(meta).length > 0 ? meta : undefined;
  }
}
