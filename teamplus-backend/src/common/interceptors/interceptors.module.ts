import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { RedisModule } from "../../redis/redis.module";
import { ApiLifecycleInterceptor } from "./api-lifecycle.interceptor";
import { UserActivityService } from "./user-activity.service";

/**
 * InterceptorsModule
 *
 * 전역 API 전처리/후처리 인터셉터 및 의존 서비스를 제공.
 * `app.module.ts`에서 APP_INTERCEPTOR 토큰으로 등록한다.
 */
@Global()
@Module({
  imports: [PrismaModule, RedisModule],
  providers: [UserActivityService, ApiLifecycleInterceptor],
  exports: [UserActivityService, ApiLifecycleInterceptor],
})
export class InterceptorsModule {}
