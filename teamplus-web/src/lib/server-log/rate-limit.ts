/**
 * Rate Limiter — 메모리 기반 sliding window (v8.6 P5-1, 2026-05-20)
 *
 * /api/log Route Handler에 60 req/min/IP 적용.
 * Redis 없이도 동작 — 단일 인스턴스 가정.
 * 운영 분산 환경에서는 Redis 기반 분산 카운터로 교체 필요.
 *
 * @server-only
 */

interface WindowEntry {
  count: number;
  resetAt: number; // epoch ms
}

const WINDOWS = new Map<string, WindowEntry>();
const WINDOW_SIZE_MS = 60_000; // 1분
const MAX_KEYS = 10_000; // 메모리 보호 — 키 개수 한도

/** IP별 카운터 — 한도 초과 시 false 반환 + retryAfterSec */
export function checkRateLimit(
  key: string,
  limit: number = 60,
  windowMs: number = WINDOW_SIZE_MS,
): { ok: boolean; remaining: number; retryAfterSec: number; resetAt: number } {
  const now = Date.now();

  // 메모리 보호 — 키 개수 초과 시 만료된 entry 정리
  if (WINDOWS.size > MAX_KEYS) {
    for (const [k, v] of WINDOWS.entries()) {
      if (v.resetAt < now) WINDOWS.delete(k);
    }
  }

  const entry = WINDOWS.get(key);

  // 만료된 window — 새 window 시작
  if (!entry || entry.resetAt < now) {
    WINDOWS.set(key, { count: 1, resetAt: now + windowMs });
    return {
      ok: true,
      remaining: limit - 1,
      retryAfterSec: 0,
      resetAt: now + windowMs,
    };
  }

  // 한도 초과
  if (entry.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSec: Math.ceil((entry.resetAt - now) / 1000),
      resetAt: entry.resetAt,
    };
  }

  // 카운터 증가
  entry.count += 1;
  return {
    ok: true,
    remaining: limit - entry.count,
    retryAfterSec: 0,
    resetAt: entry.resetAt,
  };
}

/** IP 추출 — Next.js Route Handler용 헬퍼 */
export function extractClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return req.headers.get("x-real-ip") ?? "unknown";
}
