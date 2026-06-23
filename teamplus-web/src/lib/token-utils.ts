/**
 * Token Utils — JWT 만료/exp 파싱 SoT.
 *
 * 이전: `api-client.ts` 의 `isTokenExpiringSoon` + `web-token-storage.ts` 의
 *   `isTokenExpired` 가 5분 버퍼 로직을 각자 정의하여 회귀 위험 (한쪽만
 *   수정하면 다른 쪽이 무시).
 * 이제: 모든 호출자가 본 파일의 `isTokenExpired(token, bufferSec)` 와
 *   `getTokenExpiryMs(token)` 를 사용한다.
 *
 * - JWT base64url → JSON payload 파싱
 * - exp(초 단위 unix epoch) → ms 변환
 * - 만료 임박 판단 시 bufferSec 만큼 앞당겨 검사
 */

const DEFAULT_BUFFER_SEC = 5 * 60; // 5분

/**
 * JWT payload 의 exp 클레임을 ms 단위 unix epoch 로 반환.
 * 파싱 실패 또는 exp 없음 → null.
 */
export function getTokenExpiryMs(token: string | null | undefined): number | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // base64url → base64 보정
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '==='.slice((b64.length + 3) % 4);
    const payloadJson =
      typeof atob === 'function'
        ? atob(padded)
        : Buffer.from(padded, 'base64').toString('utf-8');
    const payload = JSON.parse(payloadJson) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * 토큰이 (현재 + bufferSec) 시점에 만료되었거나 곧 만료되는지 확인.
 *
 * - exp 를 알 수 없으면 false (false-negative 정책 — 만료된 것처럼 다루지 않음)
 * - 호출자(api-client, web-token-storage, AuthContext) 는 이 결과를 보고
 *   refresh 시도 또는 storage 클리어 결정.
 *
 * 호환성 (이전 함수명):
 *  - `isTokenExpiringSoon(token)` ≡ `isTokenExpired(token)` (5분 default)
 *  - `isTokenExpired(token)`      ≡ `isTokenExpired(token, 5분)` (storage 정리용 동일)
 */
export function isTokenExpired(
  token: string | null | undefined,
  bufferSec: number = DEFAULT_BUFFER_SEC,
): boolean {
  const expMs = getTokenExpiryMs(token);
  if (!expMs) return false;
  const nowMs = Date.now();
  return nowMs > expMs - bufferSec * 1000;
}

/**
 * 토큰의 잔여 유효 시간 (ms). 만료/파싱 실패 시 0.
 *
 * cookie maxAge 등 만료 시간을 JWT exp 에 맞출 때 사용.
 *  - 이전 cookie 만료 7일 하드코딩 → JWT exp 기반으로 동기화하여
 *    "쿠키는 살아있는데 토큰은 만료" 미들웨어 회귀 차단.
 */
export function getTokenRemainingMs(token: string | null | undefined): number {
  const expMs = getTokenExpiryMs(token);
  if (!expMs) return 0;
  return Math.max(0, expMs - Date.now());
}

/**
 * cookie maxAge 초 단위. 0 미만이면 0.
 */
export function getTokenRemainingCookieSec(
  token: string | null | undefined,
): number {
  return Math.floor(getTokenRemainingMs(token) / 1000);
}
