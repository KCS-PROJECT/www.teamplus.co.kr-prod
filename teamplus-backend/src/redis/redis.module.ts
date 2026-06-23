import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import redisConfig from "@/config/redis.config";
import { RedisService } from "./redis.service";
import { RedisThrottlerStorage } from "./redis-throttler.storage";

@Global() // Redis를 전역 모듈로 설정하여 모든 모듈에서 사용 가능
@Module({
  imports: [
    ConfigModule.forFeature(redisConfig), // Redis 설정 로드
  ],
  providers: [RedisService, RedisThrottlerStorage],
  exports: [RedisService, RedisThrottlerStorage], // 다른 모듈에서 사용할 수 있도록 export
})
export class RedisModule {}
