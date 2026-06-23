import { Injectable } from "@nestjs/common";
import { ThrottlerStorage } from "@nestjs/throttler";
import { RedisService } from "./redis.service";
import { ConfigService } from "@nestjs/config";

/**
 * Redis 기반 ThrottlerStorage 구현
 * IP 기반 레이트 리미팅을 Redis에 저장
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly keyPrefix: string;

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    const redisConfig = this.configService.get("redis");
    this.keyPrefix = redisConfig.keyPrefix.rateLimit;
  }

  /**
   * 요청 횟수 증가 및 TTL 설정
   */
  async increment(
    key: string,
    ttl: number,
  ): Promise<{
    totalHits: number;
    timeToExpire: number;
  }> {
    const redisKey = `${this.keyPrefix}${key}`;
    // Nest Throttler ttl is milliseconds, Redis EXPIRE expects seconds.
    const ttlInSeconds = Math.max(1, Math.ceil(ttl / 1000));

    // Redis가 연결되지 않은 경우 graceful degradation
    if (!this.redisService.getConnectionStatus()) {
      return {
        totalHits: 0,
        timeToExpire: ttlInSeconds,
      };
    }

    try {
      // 요청 횟수 증가
      const totalHits = await this.redisService.incr(redisKey);

      // 첫 요청인 경우 TTL 설정
      if (totalHits === 1) {
        await this.redisService.expire(redisKey, ttlInSeconds);
      }

      // 남은 TTL 가져오기
      let timeToExpire = await this.redisService.ttl(redisKey);

      // Legacy bug guard:
      // 이전 버전에서 ms 값을 초로 저장해 비정상적으로 긴 TTL(예: 60000초)이 남아있을 수 있음
      // 현재 요청의 TTL 기준으로 과도하게 긴 키는 정상 TTL로 즉시 보정
      if (timeToExpire > ttlInSeconds * 2) {
        await this.redisService.expire(redisKey, ttlInSeconds);
        timeToExpire = ttlInSeconds;
      }

      return {
        totalHits,
        timeToExpire: timeToExpire > 0 ? timeToExpire : ttlInSeconds,
      };
    } catch (error) {
      // Redis 오류 시 graceful degradation (레이트 리미팅 우회)
      return {
        totalHits: 0,
        timeToExpire: ttlInSeconds,
      };
    }
  }
}
