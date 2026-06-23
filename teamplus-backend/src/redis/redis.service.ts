import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    try {
      const redisConfig = this.configService.get("redis");

      this.client = new Redis({
        host: redisConfig.host,
        port: redisConfig.port,
        password: redisConfig.password,
        db: redisConfig.db,
        connectTimeout: redisConfig.connectTimeout,
        commandTimeout: redisConfig.commandTimeout,
        maxRetriesPerRequest: redisConfig.maxRetriesPerRequest,
        enableOfflineQueue: redisConfig.enableOfflineQueue,
        retryStrategy: redisConfig.retryStrategy,
      });

      // 연결 이벤트 핸들러
      this.client.on("connect", () => {
        this.isConnected = true;
        this.logger.log("Redis 연결 성공");
      });

      this.client.on("ready", () => {
        this.logger.log("Redis 준비 완료");
      });

      this.client.on("error", (error) => {
        this.isConnected = false;
        this.logger.error(`Redis 연결 오류: ${error.message}`);
        // Graceful degradation: 연결 실패 시에도 서버는 계속 실행
      });

      this.client.on("close", () => {
        this.isConnected = false;
        this.logger.warn("Redis 연결 종료");
      });

      this.client.on("reconnecting", () => {
        this.logger.log("Redis 재연결 시도 중...");
      });

      // 연결 대기 (타임아웃 포함)
      await Promise.race([
        this.client.ping(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Redis 연결 타임아웃")), 5000),
        ),
      ]);

      this.isConnected = true;
      this.logger.log("Redis 초기화 완료");
    } catch (error) {
      this.isConnected = false;
      this.logger.error(
        `Redis 초기화 실패: ${error.message}. 캐싱 없이 계속 실행됩니다.`,
      );
      // Graceful degradation: Redis 없이도 애플리케이션 실행
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
      this.logger.log("Redis 연결 종료");
    }
  }

  /**
   * Redis 연결 상태 확인
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * 값 설정 (TTL 포함)
   */
  async set(
    key: string,
    value: string | number | object,
    ttl?: number,
  ): Promise<void> {
    if (!this.isConnected) {
      this.logger.warn("Redis 연결 없음: set 작업 건너뜀");
      return;
    }

    try {
      const serializedValue =
        typeof value === "object" ? JSON.stringify(value) : String(value);

      if (ttl) {
        await this.client.setex(key, ttl, serializedValue);
      } else {
        await this.client.set(key, serializedValue);
      }
    } catch (error) {
      this.logger.error(`Redis set 실패 (${key}): ${error.message}`);
    }
  }

  /**
   * 원자적 락 획득: 키가 없을 때만 값을 설정하고 TTL 부여 (SET NX EX).
   * 반환 true = 락 획득 성공, false = 이미 누군가 점유 중 (중복 요청).
   * Redis 미연결 시 fail-open (true) — 애플리케이션이 중단되는 것을 피함.
   */
  async setIfNotExists(
    key: string,
    value: string | number,
    ttlSeconds: number,
  ): Promise<boolean> {
    if (!this.isConnected) {
      this.logger.warn("Redis 연결 없음: setIfNotExists 건너뜀 (락 무시)");
      return true;
    }
    try {
      const result = await this.client.set(
        key,
        String(value),
        "EX",
        ttlSeconds,
        "NX",
      );
      return result === "OK";
    } catch (error) {
      this.logger.error(`Redis setIfNotExists 실패 (${key}): ${error.message}`);
      return true;
    }
  }

  /**
   * 값 가져오기
   */
  async get<T = string>(key: string): Promise<T | null> {
    if (!this.isConnected) {
      this.logger.warn("Redis 연결 없음: get 작업 건너뜀");
      return null;
    }

    try {
      const value = await this.client.get(key);

      if (!value) {
        return null;
      }

      // JSON 파싱 시도
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as T;
      }
    } catch (error) {
      this.logger.error(`Redis get 실패 (${key}): ${error.message}`);
      return null;
    }
  }

  /**
   * 값 삭제
   */
  async del(key: string | string[]): Promise<void> {
    if (!this.isConnected) {
      this.logger.warn("Redis 연결 없음: del 작업 건너뜀");
      return;
    }

    try {
      const keys = Array.isArray(key) ? key : [key];
      await this.client.del(...keys);
    } catch (error) {
      this.logger.error(`Redis del 실패: ${error.message}`);
    }
  }

  /**
   * 패턴으로 키 조회 — SCAN 기반 (KEYS 의 O(N) 전체 블로킹 회피).
   * 로그인 핫패스(세션 존재 검사)에서 호출되므로 비차단 순회가 필수.
   */
  async keysByPattern(pattern: string): Promise<string[]> {
    if (!this.isConnected) {
      this.logger.warn("Redis 연결 없음: keysByPattern 작업 건너뜀");
      return [];
    }

    try {
      const keys: string[] = [];
      let cursor = "0";
      do {
        const [nextCursor, batch] = await this.client.scan(
          cursor,
          "MATCH",
          pattern,
          "COUNT",
          100,
        );
        cursor = nextCursor;
        keys.push(...batch);
      } while (cursor !== "0");
      return keys;
    } catch (error) {
      this.logger.error(
        `Redis keysByPattern 실패 (${pattern}): ${error.message}`,
      );
      return [];
    }
  }

  /**
   * 패턴으로 키 삭제 (SCAN 기반 — keysByPattern 공유)
   */
  async delByPattern(pattern: string): Promise<void> {
    if (!this.isConnected) {
      this.logger.warn("Redis 연결 없음: delByPattern 작업 건너뜀");
      return;
    }

    try {
      const keys = await this.keysByPattern(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch (error) {
      this.logger.error(
        `Redis delByPattern 실패 (${pattern}): ${error.message}`,
      );
    }
  }

  /**
   * 키 존재 여부 확인
   */
  async exists(key: string): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error(`Redis exists 실패 (${key}): ${error.message}`);
      return false;
    }
  }

  /**
   * TTL 설정
   */
  async expire(key: string, ttl: number): Promise<void> {
    if (!this.isConnected) {
      this.logger.warn("Redis 연결 없음: expire 작업 건너뜀");
      return;
    }

    try {
      await this.client.expire(key, ttl);
    } catch (error) {
      this.logger.error(`Redis expire 실패 (${key}): ${error.message}`);
    }
  }

  /**
   * TTL 가져오기
   */
  async ttl(key: string): Promise<number> {
    if (!this.isConnected) {
      return -1;
    }

    try {
      return await this.client.ttl(key);
    } catch (error) {
      this.logger.error(`Redis ttl 실패 (${key}): ${error.message}`);
      return -1;
    }
  }

  /**
   * 증가 (increment)
   */
  async incr(key: string): Promise<number> {
    if (!this.isConnected) {
      this.logger.warn("Redis 연결 없음: incr 작업 건너뜀");
      return 0;
    }

    try {
      return await this.client.incr(key);
    } catch (error) {
      this.logger.error(`Redis incr 실패 (${key}): ${error.message}`);
      return 0;
    }
  }

  /**
   * 증가 (increment by amount)
   */
  async incrby(key: string, amount: number): Promise<number> {
    if (!this.isConnected) {
      this.logger.warn("Redis 연결 없음: incrby 작업 건너뜀");
      return 0;
    }

    try {
      return await this.client.incrby(key, amount);
    } catch (error) {
      this.logger.error(`Redis incrby 실패 (${key}): ${error.message}`);
      return 0;
    }
  }

  /**
   * Hash 설정
   */
  async hset(
    key: string,
    field: string,
    value: string | number | object,
  ): Promise<void> {
    if (!this.isConnected) {
      this.logger.warn("Redis 연결 없음: hset 작업 건너뜀");
      return;
    }

    try {
      const serializedValue =
        typeof value === "object" ? JSON.stringify(value) : String(value);
      await this.client.hset(key, field, serializedValue);
    } catch (error) {
      this.logger.error(`Redis hset 실패 (${key}): ${error.message}`);
    }
  }

  /**
   * Hash 가져오기
   */
  async hget<T = string>(key: string, field: string): Promise<T | null> {
    if (!this.isConnected) {
      this.logger.warn("Redis 연결 없음: hget 작업 건너뜀");
      return null;
    }

    try {
      const value = await this.client.hget(key, field);

      if (!value) {
        return null;
      }

      try {
        return JSON.parse(value) as T;
      } catch {
        return value as T;
      }
    } catch (error) {
      this.logger.error(`Redis hget 실패 (${key}.${field}): ${error.message}`);
      return null;
    }
  }

  /**
   * Hash 전체 가져오기
   */
  async hgetall<T = Record<string, string>>(key: string): Promise<T | null> {
    if (!this.isConnected) {
      this.logger.warn("Redis 연결 없음: hgetall 작업 건너뜀");
      return null;
    }

    try {
      const value = await this.client.hgetall(key);
      return value as T;
    } catch (error) {
      this.logger.error(`Redis hgetall 실패 (${key}): ${error.message}`);
      return null;
    }
  }

  /**
   * Hash 삭제
   */
  async hdel(key: string, field: string | string[]): Promise<void> {
    if (!this.isConnected) {
      this.logger.warn("Redis 연결 없음: hdel 작업 건너뜀");
      return;
    }

    try {
      const fields = Array.isArray(field) ? field : [field];
      await this.client.hdel(key, ...fields);
    } catch (error) {
      this.logger.error(`Redis hdel 실패 (${key}): ${error.message}`);
    }
  }

  /**
   * 원시 클라이언트 접근 (고급 사용)
   */
  getClient(): Redis | null {
    return this.isConnected ? this.client : null;
  }
}
