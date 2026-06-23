/**
 * API Cache Utility
 * 클라이언트 사이드 API 응답 캐싱
 */

/**
 * 캐시 아이템 구조
 */
interface CacheItem<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

/**
 * 캐시 옵션
 */
export interface CacheOptions {
  /** 캐시 TTL (ms) - 기본: 5분 */
  ttl?: number;
  /** 캐시 키 프리픽스 */
  prefix?: string;
  /** 스토리지 유형 */
  storage?: "memory" | "sessionStorage" | "localStorage";
}

// 상수 정의
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5분
const MAX_MEMORY_ITEMS = 100;
const CACHE_PREFIX = "teamplus_cache_";

/**
 * 메모리 캐시 스토어
 */
const memoryCache = new Map<string, CacheItem<unknown>>();

/**
 * 캐시 키 생성
 */
function createCacheKey(key: string, prefix?: string): string {
  return `${CACHE_PREFIX}${prefix ? `${prefix}_` : ""}${key}`;
}

/**
 * 만료 여부 확인
 */
function isExpired(item: CacheItem<unknown>): boolean {
  return Date.now() > item.expiresAt;
}

/**
 * 메모리 캐시 정리 (LRU 방식)
 */
function cleanMemoryCache(): void {
  if (memoryCache.size <= MAX_MEMORY_ITEMS) return;

  // 가장 오래된 항목들 삭제
  const entries = Array.from(memoryCache.entries()).sort(
    (a, b) => a[1].timestamp - b[1].timestamp,
  );

  const toDelete = entries.slice(0, entries.length - MAX_MEMORY_ITEMS);
  toDelete.forEach(([key]) => memoryCache.delete(key));
}

/**
 * 캐시에서 데이터 가져오기
 */
export function getFromCache<T>(
  key: string,
  options: CacheOptions = {},
): T | null {
  const { prefix, storage = "memory" } = options;
  const cacheKey = createCacheKey(key, prefix);

  try {
    if (storage === "memory") {
      const item = memoryCache.get(cacheKey) as CacheItem<T> | undefined;
      if (item && !isExpired(item)) {
        return item.data;
      }
      memoryCache.delete(cacheKey);
      return null;
    }

    // 브라우저 환경 체크
    if (typeof window === "undefined") return null;

    const storageApi =
      storage === "localStorage" ? localStorage : sessionStorage;
    const cached = storageApi.getItem(cacheKey);

    if (!cached) return null;

    const item: CacheItem<T> = JSON.parse(cached);
    if (isExpired(item)) {
      storageApi.removeItem(cacheKey);
      return null;
    }

    return item.data;
  } catch {
    return null;
  }
}

/**
 * 캐시에 데이터 저장
 */
export function setToCache<T>(
  key: string,
  data: T,
  options: CacheOptions = {},
): void {
  const { ttl = DEFAULT_TTL_MS, prefix, storage = "memory" } = options;
  const cacheKey = createCacheKey(key, prefix);
  const now = Date.now();

  const item: CacheItem<T> = {
    data,
    timestamp: now,
    expiresAt: now + ttl,
  };

  try {
    if (storage === "memory") {
      memoryCache.set(cacheKey, item);
      cleanMemoryCache();
      return;
    }

    // 브라우저 환경 체크
    if (typeof window === "undefined") return;

    const storageApi =
      storage === "localStorage" ? localStorage : sessionStorage;
    storageApi.setItem(cacheKey, JSON.stringify(item));
  } catch {
    // 스토리지가 가득 찬 경우 무시
  }
}

/**
 * 캐시에서 특정 키 삭제
 */
export function removeFromCache(key: string, options: CacheOptions = {}): void {
  const { prefix, storage = "memory" } = options;
  const cacheKey = createCacheKey(key, prefix);

  if (storage === "memory") {
    memoryCache.delete(cacheKey);
    return;
  }

  if (typeof window === "undefined") return;

  const storageApi = storage === "localStorage" ? localStorage : sessionStorage;
  storageApi.removeItem(cacheKey);
}

/**
 * 특정 프리픽스의 모든 캐시 삭제
 */
export function clearCacheByPrefix(
  prefix: string,
  storage: "memory" | "sessionStorage" | "localStorage" = "memory",
): void {
  const fullPrefix = createCacheKey("", prefix);

  if (storage === "memory") {
    memoryCache.forEach((_, key) => {
      if (key.startsWith(fullPrefix)) {
        memoryCache.delete(key);
      }
    });
    return;
  }

  if (typeof window === "undefined") return;

  const storageApi = storage === "localStorage" ? localStorage : sessionStorage;
  const keysToRemove: string[] = [];

  for (let i = 0; i < storageApi.length; i++) {
    const key = storageApi.key(i);
    if (key?.startsWith(fullPrefix)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => storageApi.removeItem(key));
}

/**
 * 모든 캐시 삭제
 */
export function clearAllCache(
  storage: "memory" | "sessionStorage" | "localStorage" | "all" = "all",
): void {
  if (storage === "memory" || storage === "all") {
    memoryCache.clear();
  }

  if (typeof window === "undefined") return;

  const clearStorage = (storageApi: Storage) => {
    const keysToRemove: string[] = [];
    for (let i = 0; i < storageApi.length; i++) {
      const key = storageApi.key(i);
      if (key?.startsWith(CACHE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => storageApi.removeItem(key));
  };

  if (storage === "sessionStorage" || storage === "all") {
    clearStorage(sessionStorage);
  }

  if (storage === "localStorage" || storage === "all") {
    clearStorage(localStorage);
  }
}

/**
 * 캐시된 API 요청 래퍼
 *
 * @example
 * ```typescript
 * const data = await cachedRequest(
 *   'user-profile',
 *   () => api.get('/profile'),
 *   { ttl: 60000 } // 1분 캐시
 * );
 * ```
 */
export async function cachedRequest<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: CacheOptions = {},
): Promise<T> {
  // 캐시에서 먼저 확인
  const cached = getFromCache<T>(key, options);
  if (cached !== null) {
    return cached;
  }

  // 캐시에 없으면 요청 실행
  const data = await fetcher();

  // 결과 캐싱
  setToCache(key, data, options);

  return data;
}

/**
 * 프리셋: API 응답 캐시 (5분)
 */
export const apiCacheOptions: CacheOptions = {
  ttl: DEFAULT_TTL_MS,
  storage: "memory",
  prefix: "api",
};

/**
 * 프리셋: 사용자 데이터 캐시 (10분)
 */
export const userCacheOptions: CacheOptions = {
  ttl: 10 * 60 * 1000,
  storage: "memory",
  prefix: "user",
};

/**
 * 프리셋: 세션 캐시 (브라우저 세션 동안 유지)
 */
export const sessionCacheOptions: CacheOptions = {
  ttl: 30 * 60 * 1000, // 30분
  storage: "sessionStorage",
  prefix: "session",
};

const cacheService = {
  get: getFromCache,
  set: setToCache,
  remove: removeFromCache,
  clearByPrefix: clearCacheByPrefix,
  clearAll: clearAllCache,
  cachedRequest,
};

export default cacheService;
