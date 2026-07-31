/**
 * 무인증·`@SkipThrottle()` 엔드포인트의 페이지네이션 파라미터 상한.
 *
 * [2026-07-30 보안] 기존에는 `parseInt(limit, 10)` 결과를 그대로 Prisma `take` 로
 * 넘기는 곳이 있었다. 통합 검색은 4개 테이블(클럽·수업·코치·공지)을 `contains` 로
 * 병렬 조회하므로 `?limit=1000000` 한 번에 전체 스캔 + 백만 행 직렬화가 동시에
 * 일어난다. 인증도 rate limit 도 없는 경로였어서 단일 IP 로 커넥션 풀을
 * 고갈시킬 수 있었다.
 *
 * 같은 저장소의 `teams.service.ts` 는 이미 `Math.min(limit ?? 50, 100)` 로
 * 클램프하고 있었고, 무인증 경로만 빠져 있던 일관성 결손이다.
 */

/**
 * `limit` 쿼리 파라미터를 [1, max] 로 클램프한다.
 *
 * NaN·음수·Infinity 를 흡수한다 — `parseInt("abc")` 는 NaN 이고
 * `Math.min(NaN, 50)` 도 NaN 이므로 유한성 검사가 먼저 와야 한다.
 */
export function clampLimit(
  raw: string | undefined,
  fallback: number,
  max = 50,
): number {
  const n = raw === undefined ? fallback : Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

/** `offset` 을 [0, max] 로 클램프한다 — 깊은 페이지네이션의 대량 스캔 방지. */
export function clampOffset(raw: string | undefined, max = 1000): number {
  const n = raw === undefined ? 0 : Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, max);
}
