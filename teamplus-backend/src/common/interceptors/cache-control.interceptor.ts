import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Response } from "express";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { CACHE_CONTROL_KEY } from "../decorators/cache-control.decorator";

/**
 * CacheControlInterceptor
 *
 * `@CacheControl('private, max-age=60')` 데코레이터가 있는 핸들러의 응답에
 * `Cache-Control` 헤더를 자동 부착한다.
 *
 * 등록: app.module.ts APP_INTERCEPTOR.
 *
 * - 메서드/클래스 양쪽에 명시된 경우 메서드 우선 (`getAllAndOverride`)
 * - 응답이 이미 다른 핸들러에서 `res.setHeader('Cache-Control', ...)` 를 호출했다면
 *   덮어쓰지 않는다 (`getHeader` 검사). 명시적 우선권 부여.
 */
@Injectable()
export class CacheControlInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();

    const value = this.reflector.getAllAndOverride<string>(CACHE_CONTROL_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!value) return next.handle();

    const res = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      tap(() => {
        try {
          if (!res.getHeader("Cache-Control")) {
            res.setHeader("Cache-Control", value);
          }
        } catch {
          /* headers 이미 flush 된 경우 무시 */
        }
      }),
    );
  }
}
