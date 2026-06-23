import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { RedisService } from "./redis.service";

// Mock ioredis with configurable behavior
const mockRedisMethods = {
  on: jest.fn(),
  ping: jest.fn().mockResolvedValue("PONG"),
  quit: jest.fn().mockResolvedValue(undefined),
  set: jest.fn().mockResolvedValue("OK"),
  setex: jest.fn().mockResolvedValue("OK"),
  get: jest.fn().mockResolvedValue(null),
  del: jest.fn().mockResolvedValue(1),
  keys: jest.fn().mockResolvedValue([]),
  exists: jest.fn().mockResolvedValue(0),
  expire: jest.fn().mockResolvedValue(1),
  ttl: jest.fn().mockResolvedValue(-1),
  incr: jest.fn().mockResolvedValue(1),
  incrby: jest.fn().mockResolvedValue(5),
  hset: jest.fn().mockResolvedValue(1),
  hget: jest.fn().mockResolvedValue(null),
  hgetall: jest.fn().mockResolvedValue({}),
  hdel: jest.fn().mockResolvedValue(1),
};

jest.mock("ioredis", () => {
  return jest.fn().mockImplementation(() => mockRedisMethods);
});

describe("RedisService", () => {
  let service: RedisService;

  const mockRedisConfig = {
    host: "localhost",
    port: 6379,
    password: "",
    db: 0,
    connectTimeout: 5000,
    commandTimeout: 5000,
    maxRetriesPerRequest: 3,
    enableOfflineQueue: true,
    retryStrategy: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue(mockRedisConfig),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
  });

  describe("getConnectionStatus", () => {
    it("should return connection status", () => {
      const result = service.getConnectionStatus();
      expect(typeof result).toBe("boolean");
    });

    it("should return false when not connected", () => {
      // Service starts disconnected
      expect(service.getConnectionStatus()).toBe(false);
    });
  });

  describe("set", () => {
    it("should skip when not connected", async () => {
      await service.set("test-key", "test-value");
      // Should not throw, just log warning
    });

    it("should skip with TTL when not connected", async () => {
      await service.set("test-key", "test-value", 300);
      // Should not throw
    });

    it("should skip object value when not connected", async () => {
      await service.set("test-key", { foo: "bar" });
      // Should not throw
    });
  });

  describe("get", () => {
    it("should return null when not connected", async () => {
      const result = await service.get("test-key");
      expect(result).toBeNull();
    });

    it("should return null with generic type when not connected", async () => {
      const result = await service.get<{ foo: string }>("test-key");
      expect(result).toBeNull();
    });
  });

  describe("del", () => {
    it("should skip when not connected", async () => {
      await service.del("test-key");
      // Should not throw
    });

    it("should skip array of keys when not connected", async () => {
      await service.del(["key1", "key2"]);
      // Should not throw
    });
  });

  describe("delByPattern", () => {
    it("should skip when not connected", async () => {
      await service.delByPattern("test:*");
      // Should not throw
    });
  });

  describe("exists", () => {
    it("should return false when not connected", async () => {
      const result = await service.exists("test-key");
      expect(result).toBe(false);
    });
  });

  describe("expire", () => {
    it("should skip when not connected", async () => {
      await service.expire("test-key", 300);
      // Should not throw
    });
  });

  describe("ttl", () => {
    it("should return -1 when not connected", async () => {
      const result = await service.ttl("test-key");
      expect(result).toBe(-1);
    });
  });

  describe("incr", () => {
    it("should return 0 when not connected", async () => {
      const result = await service.incr("counter");
      expect(result).toBe(0);
    });
  });

  describe("incrby", () => {
    it("should return 0 when not connected", async () => {
      const result = await service.incrby("counter", 5);
      expect(result).toBe(0);
    });
  });

  describe("hset", () => {
    it("should skip when not connected", async () => {
      await service.hset("hash-key", "field", "value");
      // Should not throw
    });

    it("should skip object value when not connected", async () => {
      await service.hset("hash-key", "field", { foo: "bar" });
      // Should not throw
    });
  });

  describe("hget", () => {
    it("should return null when not connected", async () => {
      const result = await service.hget("hash-key", "field");
      expect(result).toBeNull();
    });

    it("should return null with generic type when not connected", async () => {
      const result = await service.hget<{ foo: string }>("hash-key", "field");
      expect(result).toBeNull();
    });
  });

  describe("hgetall", () => {
    it("should return null when not connected", async () => {
      const result = await service.hgetall("hash-key");
      expect(result).toBeNull();
    });

    it("should return null with generic type when not connected", async () => {
      const result = await service.hgetall<Record<string, string>>("hash-key");
      expect(result).toBeNull();
    });
  });

  describe("hdel", () => {
    it("should skip when not connected", async () => {
      await service.hdel("hash-key", "field");
      // Should not throw
    });

    it("should skip array of fields when not connected", async () => {
      await service.hdel("hash-key", ["field1", "field2"]);
      // Should not throw
    });
  });

  describe("getClient", () => {
    it("should return null when not connected", () => {
      const client = service.getClient();
      expect(client).toBeNull();
    });
  });

  describe("Graceful Degradation", () => {
    it("should handle all operations gracefully when disconnected", async () => {
      // All operations should complete without throwing
      expect(service.getConnectionStatus()).toBe(false);
      expect(await service.get("key")).toBeNull();
      expect(await service.exists("key")).toBe(false);
      expect(await service.ttl("key")).toBe(-1);
      expect(await service.incr("key")).toBe(0);
      expect(await service.incrby("key", 5)).toBe(0);
      expect(await service.hget("key", "field")).toBeNull();
      expect(await service.hgetall("key")).toBeNull();
      expect(service.getClient()).toBeNull();

      // Void operations should not throw
      await expect(service.set("key", "value")).resolves.toBeUndefined();
      await expect(service.del("key")).resolves.toBeUndefined();
      await expect(service.delByPattern("key:*")).resolves.toBeUndefined();
      await expect(service.expire("key", 300)).resolves.toBeUndefined();
      await expect(
        service.hset("key", "field", "value"),
      ).resolves.toBeUndefined();
      await expect(service.hdel("key", "field")).resolves.toBeUndefined();
    });
  });
});

describe("RedisService (Connected)", () => {
  let service: RedisService;

  const mockRedisConfig = {
    host: "localhost",
    port: 6379,
    password: "",
    db: 0,
    connectTimeout: 5000,
    commandTimeout: 5000,
    maxRetriesPerRequest: 3,
    enableOfflineQueue: true,
    retryStrategy: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue(mockRedisConfig),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Reset all mock implementations
    Object.keys(mockRedisMethods).forEach((key) => {
      const method = mockRedisMethods[key as keyof typeof mockRedisMethods];
      if (typeof method === "function" && "mockClear" in method) {
        method.mockClear();
      }
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);

    // Simulate connection by triggering connect event and setting isConnected
    await service.onModuleInit();
    // Force connected state for testing
    (service as any).isConnected = true;
  });

  describe("set (connected)", () => {
    it("should set string value without TTL", async () => {
      await service.set("test-key", "test-value");
      expect(mockRedisMethods.set).toHaveBeenCalledWith(
        "test-key",
        "test-value",
      );
    });

    it("should set string value with TTL", async () => {
      await service.set("test-key", "test-value", 300);
      expect(mockRedisMethods.setex).toHaveBeenCalledWith(
        "test-key",
        300,
        "test-value",
      );
    });

    it("should serialize object values", async () => {
      const obj = { foo: "bar", count: 42 };
      await service.set("test-key", obj);
      expect(mockRedisMethods.set).toHaveBeenCalledWith(
        "test-key",
        JSON.stringify(obj),
      );
    });

    it("should serialize object values with TTL", async () => {
      const obj = { name: "test" };
      await service.set("test-key", obj, 600);
      expect(mockRedisMethods.setex).toHaveBeenCalledWith(
        "test-key",
        600,
        JSON.stringify(obj),
      );
    });

    it("should handle set errors gracefully", async () => {
      mockRedisMethods.set.mockRejectedValueOnce(new Error("Set failed"));
      await expect(service.set("key", "value")).resolves.toBeUndefined();
    });
  });

  describe("get (connected)", () => {
    it("should get string value", async () => {
      mockRedisMethods.get.mockResolvedValueOnce("test-value");
      const result = await service.get("test-key");
      expect(result).toBe("test-value");
      expect(mockRedisMethods.get).toHaveBeenCalledWith("test-key");
    });

    it("should parse JSON value", async () => {
      const obj = { foo: "bar" };
      mockRedisMethods.get.mockResolvedValueOnce(JSON.stringify(obj));
      const result = await service.get<{ foo: string }>("test-key");
      expect(result).toEqual(obj);
    });

    it("should return raw string if not valid JSON", async () => {
      mockRedisMethods.get.mockResolvedValueOnce("plain-string");
      const result = await service.get("test-key");
      expect(result).toBe("plain-string");
    });

    it("should return null for missing key", async () => {
      mockRedisMethods.get.mockResolvedValueOnce(null);
      const result = await service.get("missing-key");
      expect(result).toBeNull();
    });

    it("should handle get errors gracefully", async () => {
      mockRedisMethods.get.mockRejectedValueOnce(new Error("Get failed"));
      const result = await service.get("key");
      expect(result).toBeNull();
    });
  });

  describe("del (connected)", () => {
    it("should delete single key", async () => {
      await service.del("test-key");
      expect(mockRedisMethods.del).toHaveBeenCalledWith("test-key");
    });

    it("should delete multiple keys", async () => {
      await service.del(["key1", "key2", "key3"]);
      expect(mockRedisMethods.del).toHaveBeenCalledWith("key1", "key2", "key3");
    });

    it("should handle del errors gracefully", async () => {
      mockRedisMethods.del.mockRejectedValueOnce(new Error("Del failed"));
      await expect(service.del("key")).resolves.toBeUndefined();
    });
  });

  describe("delByPattern (connected)", () => {
    it("should delete keys matching pattern", async () => {
      mockRedisMethods.keys.mockResolvedValueOnce([
        "user:1",
        "user:2",
        "user:3",
      ]);
      await service.delByPattern("user:*");
      expect(mockRedisMethods.keys).toHaveBeenCalledWith("user:*");
      expect(mockRedisMethods.del).toHaveBeenCalledWith(
        "user:1",
        "user:2",
        "user:3",
      );
    });

    it("should not call del when no keys match", async () => {
      mockRedisMethods.keys.mockResolvedValueOnce([]);
      await service.delByPattern("nonexistent:*");
      expect(mockRedisMethods.del).not.toHaveBeenCalled();
    });

    it("should handle delByPattern errors gracefully", async () => {
      mockRedisMethods.keys.mockRejectedValueOnce(new Error("Keys failed"));
      await expect(service.delByPattern("pattern:*")).resolves.toBeUndefined();
    });
  });

  describe("exists (connected)", () => {
    it("should return true when key exists", async () => {
      mockRedisMethods.exists.mockResolvedValueOnce(1);
      const result = await service.exists("existing-key");
      expect(result).toBe(true);
    });

    it("should return false when key does not exist", async () => {
      mockRedisMethods.exists.mockResolvedValueOnce(0);
      const result = await service.exists("missing-key");
      expect(result).toBe(false);
    });

    it("should handle exists errors gracefully", async () => {
      mockRedisMethods.exists.mockRejectedValueOnce(new Error("Exists failed"));
      const result = await service.exists("key");
      expect(result).toBe(false);
    });
  });

  describe("expire (connected)", () => {
    it("should set TTL on key", async () => {
      await service.expire("test-key", 3600);
      expect(mockRedisMethods.expire).toHaveBeenCalledWith("test-key", 3600);
    });

    it("should handle expire errors gracefully", async () => {
      mockRedisMethods.expire.mockRejectedValueOnce(new Error("Expire failed"));
      await expect(service.expire("key", 300)).resolves.toBeUndefined();
    });
  });

  describe("ttl (connected)", () => {
    it("should return TTL value", async () => {
      mockRedisMethods.ttl.mockResolvedValueOnce(3600);
      const result = await service.ttl("test-key");
      expect(result).toBe(3600);
    });

    it("should handle ttl errors gracefully", async () => {
      mockRedisMethods.ttl.mockRejectedValueOnce(new Error("TTL failed"));
      const result = await service.ttl("key");
      expect(result).toBe(-1);
    });
  });

  describe("incr (connected)", () => {
    it("should increment key value", async () => {
      mockRedisMethods.incr.mockResolvedValueOnce(5);
      const result = await service.incr("counter");
      expect(result).toBe(5);
      expect(mockRedisMethods.incr).toHaveBeenCalledWith("counter");
    });

    it("should handle incr errors gracefully", async () => {
      mockRedisMethods.incr.mockRejectedValueOnce(new Error("Incr failed"));
      const result = await service.incr("counter");
      expect(result).toBe(0);
    });
  });

  describe("incrby (connected)", () => {
    it("should increment key by amount", async () => {
      mockRedisMethods.incrby.mockResolvedValueOnce(15);
      const result = await service.incrby("counter", 10);
      expect(result).toBe(15);
      expect(mockRedisMethods.incrby).toHaveBeenCalledWith("counter", 10);
    });

    it("should handle incrby errors gracefully", async () => {
      mockRedisMethods.incrby.mockRejectedValueOnce(new Error("Incrby failed"));
      const result = await service.incrby("counter", 5);
      expect(result).toBe(0);
    });
  });

  describe("hset (connected)", () => {
    it("should set hash field with string value", async () => {
      await service.hset("hash-key", "field", "value");
      expect(mockRedisMethods.hset).toHaveBeenCalledWith(
        "hash-key",
        "field",
        "value",
      );
    });

    it("should serialize object values in hash", async () => {
      const obj = { nested: "data" };
      await service.hset("hash-key", "field", obj);
      expect(mockRedisMethods.hset).toHaveBeenCalledWith(
        "hash-key",
        "field",
        JSON.stringify(obj),
      );
    });

    it("should handle hset errors gracefully", async () => {
      mockRedisMethods.hset.mockRejectedValueOnce(new Error("Hset failed"));
      await expect(
        service.hset("key", "field", "value"),
      ).resolves.toBeUndefined();
    });
  });

  describe("hget (connected)", () => {
    it("should get hash field value", async () => {
      mockRedisMethods.hget.mockResolvedValueOnce("field-value");
      const result = await service.hget("hash-key", "field");
      expect(result).toBe("field-value");
    });

    it("should parse JSON hash field value", async () => {
      const obj = { nested: "data" };
      mockRedisMethods.hget.mockResolvedValueOnce(JSON.stringify(obj));
      const result = await service.hget<{ nested: string }>(
        "hash-key",
        "field",
      );
      expect(result).toEqual(obj);
    });

    it("should return null for missing field", async () => {
      mockRedisMethods.hget.mockResolvedValueOnce(null);
      const result = await service.hget("hash-key", "missing-field");
      expect(result).toBeNull();
    });

    it("should handle hget errors gracefully", async () => {
      mockRedisMethods.hget.mockRejectedValueOnce(new Error("Hget failed"));
      const result = await service.hget("key", "field");
      expect(result).toBeNull();
    });
  });

  describe("hgetall (connected)", () => {
    it("should get all hash fields", async () => {
      const hashData = { field1: "value1", field2: "value2" };
      mockRedisMethods.hgetall.mockResolvedValueOnce(hashData);
      const result = await service.hgetall("hash-key");
      expect(result).toEqual(hashData);
    });

    it("should handle hgetall errors gracefully", async () => {
      mockRedisMethods.hgetall.mockRejectedValueOnce(
        new Error("Hgetall failed"),
      );
      const result = await service.hgetall("key");
      expect(result).toBeNull();
    });
  });

  describe("hdel (connected)", () => {
    it("should delete single hash field", async () => {
      await service.hdel("hash-key", "field");
      expect(mockRedisMethods.hdel).toHaveBeenCalledWith("hash-key", "field");
    });

    it("should delete multiple hash fields", async () => {
      await service.hdel("hash-key", ["field1", "field2"]);
      expect(mockRedisMethods.hdel).toHaveBeenCalledWith(
        "hash-key",
        "field1",
        "field2",
      );
    });

    it("should handle hdel errors gracefully", async () => {
      mockRedisMethods.hdel.mockRejectedValueOnce(new Error("Hdel failed"));
      await expect(service.hdel("key", "field")).resolves.toBeUndefined();
    });
  });

  describe("getClient (connected)", () => {
    it("should return client when connected", () => {
      const client = service.getClient();
      expect(client).not.toBeNull();
    });
  });

  describe("onModuleDestroy", () => {
    it("should quit Redis client on destroy", async () => {
      await service.onModuleDestroy();
      expect(mockRedisMethods.quit).toHaveBeenCalled();
    });
  });

  describe("Connection Events", () => {
    it("should register event handlers on init", async () => {
      expect(mockRedisMethods.on).toHaveBeenCalledWith(
        "connect",
        expect.any(Function),
      );
      expect(mockRedisMethods.on).toHaveBeenCalledWith(
        "ready",
        expect.any(Function),
      );
      expect(mockRedisMethods.on).toHaveBeenCalledWith(
        "error",
        expect.any(Function),
      );
      expect(mockRedisMethods.on).toHaveBeenCalledWith(
        "close",
        expect.any(Function),
      );
      expect(mockRedisMethods.on).toHaveBeenCalledWith(
        "reconnecting",
        expect.any(Function),
      );
    });
  });

  describe("Initialization Failure", () => {
    it("should handle connection timeout gracefully", async () => {
      mockRedisMethods.ping.mockImplementationOnce(
        () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 100),
          ),
      );

      // Create a new service with failing ping
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      const failingService = module.get<RedisService>(RedisService);

      // Should not throw
      await expect(failingService.onModuleInit()).resolves.toBeUndefined();
      expect(failingService.getConnectionStatus()).toBe(false);
    });
  });
});
