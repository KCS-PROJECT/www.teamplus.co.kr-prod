/**
 * JWT access token 클라이언트 동기 디코더 (검증 없음)
 *
 * ⚠️ 보안 모델: 본 디코더는 **서명을 검증하지 않는다**. 표시(이름)·라우팅(역할)
 * 임시값 용도로만 사용하며, 실제 인가는 다음 두 레이어가 담당한다.
 *   1) `src/middleware.ts` — 동일 `atob` 디코드 + `exp` + RBAC 경로 검증
 *   2) 백엔드 `JwtAuthGuard` — 서명·블랙리스트 검증
 *
 * 즉, 본 디코더가 만드는 임시 user 는 middleware 가 이미 허용한 토큰과 **동일한
 * 신뢰 모델**이므로 신규 노출 경로를 만들지 않는다. avatarUrl/email 등 미포함
 * 필드는 호출부가 `getProfile()` 백그라운드 호출로 보정한다.
 *
 * SoT: backend `JwtPayload` (`{ sub, userType, name?, exp }`) ·
 *      `src/middleware.ts` `TokenPayload` ({ exp, userType, sub }).
 */
export interface AccessTokenClaims {
  /** userId (JWT `sub`) */
  sub: string;
  /** 백엔드 UserType (원형 문자열) */
  userType: string;
  /** 표시 이름 (optional — payload 에 없을 수 있음) */
  name?: string;
  /** 이메일 (optional — 현재 access token payload 에는 미포함) */
  email?: string;
  /** 만료 (epoch seconds) */
  exp?: number;
}

/**
 * 브라우저에서 JWT access token 의 payload 를 동기 디코드한다.
 * 서명 검증은 하지 않으며, 형식이 깨졌거나 필수 claim(`sub`/`userType`) 이
 * 없으면 `null` 을 반환한다.
 */
export function decodeAccessTokenClaims(
  token: string | null | undefined,
): AccessTokenClaims | null {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    if (typeof atob !== 'function') return null; // SSR/Edge 가드
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json) as Partial<AccessTokenClaims>;
    if (
      !payload ||
      typeof payload.sub !== 'string' ||
      typeof payload.userType !== 'string'
    ) {
      return null;
    }
    return {
      sub: payload.sub,
      userType: payload.userType,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      exp: typeof payload.exp === 'number' ? payload.exp : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * claims 의 `exp` 가 이미 지났는지 판정. `exp` 가 없으면 만료로 간주(안전 기본값).
 */
export function isAccessTokenExpired(
  claims: AccessTokenClaims | null,
): boolean {
  if (!claims || typeof claims.exp !== 'number') return true;
  return claims.exp * 1000 <= Date.now();
}
