/**
 * JWT 형식 검증 헬퍼.
 *
 * 클라이언트 측 사전 가드 — 백엔드 `RefreshTokenDto @IsJWT` 와 동일 의도.
 * stale/garbage 토큰이 `/auth/refresh` 로 전송되어 400 BadRequest 사이클을
 * 일으키는 것을 차단한다.
 *
 * 만료 여부는 검증하지 않는다 (만료 검증은 서버의 jwt.verify 가 401 로 응답).
 *
 * 단일 SoT — services/api-client.ts 등 모든 호출자가 이 헬퍼를 사용.
 * 회귀 가드 unit test 도 이 진입점만 잠그면 된다.
 */

/**
 * 토큰이 JWT 형식인지 검증한다 (segment 기반).
 *
 * 규칙:
 *  - null / undefined / 빈 문자열 → false
 *  - `string` 이 아니면 → false
 *  - `.` 로 split 했을 때 정확히 3 개 segment 가 아니면 false
 *  - 각 segment 가 비어있으면 false
 *
 * @example
 *   isJwtFormat(null)         // false
 *   isJwtFormat('')           // false
 *   isJwtFormat('a.b.c')      // true (형식만 검증, 만료 무관)
 *   isJwtFormat('a..c')       // false
 *   isJwtFormat('garbage')    // false
 */
export function isJwtFormat(token: string | null | undefined): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  return parts.every((p) => p.length > 0);
}
