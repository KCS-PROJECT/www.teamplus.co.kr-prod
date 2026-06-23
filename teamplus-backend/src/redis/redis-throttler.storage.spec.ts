import { ConfigService } from "@nestjs/config";
import { RedisThrottlerStorage } from "./redis-throttler.storage";
import { RedisService } from "./redis.service";

describe("RedisThrottlerStorage", () => {
  const mockRedisService = {
    getConnectionStatus: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
    ttl: jest.fn(),
  } as unknown as RedisService;

  const mockConfigService = {
    get: jest.fn().mockReturnValue({
      keyPrefix: {
        rateLimit: "ratelimit:",
      },
    }),
  } as unknown as ConfigService;

  let storage: RedisThrottlerStorage;

  beforeEach(() => {
    jest.clearAllMocks();
    storage = new RedisThrottlerStorage(mockRedisService, mockConfigService);
  });

  it("should convert ttl milliseconds to seconds when Redis is disconnected", async () => {
    (mockRedisService.getConnectionStatus as jest.Mock).mockReturnValue(false);

    const result = await storage.increment("login:test-ip", 60000);

    expect(result).toEqual({
      totalHits: 0,
      timeToExpire: 60,
    });
  });

  it("should set Redis expire using seconds converted from milliseconds", async () => {
    (mockRedisService.getConnectionStatus as jest.Mock).mockReturnValue(true);
    (mockRedisService.incr as jest.Mock).mockResolvedValue(1);
    (mockRedisService.ttl as jest.Mock).mockResolvedValue(59);

    const result = await storage.increment("login:test-ip", 60000);

    expect(mockRedisService.expire).toHaveBeenCalledWith(
      "ratelimit:login:test-ip",
      60,
    );
    expect(result).toEqual({
      totalHits: 1,
      timeToExpire: 59,
    });
  });

  it("should fallback to converted ttl when redis ttl is not available", async () => {
    (mockRedisService.getConnectionStatus as jest.Mock).mockReturnValue(true);
    (mockRedisService.incr as jest.Mock).mockResolvedValue(2);
    (mockRedisService.ttl as jest.Mock).mockResolvedValue(-1);

    const result = await storage.increment("login:test-ip", 60000);

    expect(mockRedisService.expire).not.toHaveBeenCalled();
    expect(result).toEqual({
      totalHits: 2,
      timeToExpire: 60,
    });
  });

  it("should keep minimum one second ttl when configured ttl is too small", async () => {
    (mockRedisService.getConnectionStatus as jest.Mock).mockReturnValue(true);
    (mockRedisService.incr as jest.Mock).mockResolvedValue(1);
    (mockRedisService.ttl as jest.Mock).mockResolvedValue(1);

    const result = await storage.increment("login:test-ip", 1);

    expect(mockRedisService.expire).toHaveBeenCalledWith(
      "ratelimit:login:test-ip",
      1,
    );
    expect(result.timeToExpire).toBe(1);
  });

  it("should normalize stale oversized ttl values from legacy keys", async () => {
    (mockRedisService.getConnectionStatus as jest.Mock).mockReturnValue(true);
    (mockRedisService.incr as jest.Mock).mockResolvedValue(10);
    (mockRedisService.ttl as jest.Mock).mockResolvedValue(50000);

    const result = await storage.increment("login:test-ip", 60000);

    expect(mockRedisService.expire).toHaveBeenCalledWith(
      "ratelimit:login:test-ip",
      60,
    );
    expect(result).toEqual({
      totalHits: 10,
      timeToExpire: 60,
    });
  });
});
