/**
 * `isJwtFormat` 회귀 가드.
 *
 * 이 헬퍼는 `/auth/refresh` 호출 전 클라이언트 측 사전 검증으로 사용된다.
 * 백엔드 `RefreshTokenDto @IsJWT` 와 동일한 의도 — invalid 토큰이 백엔드로
 * 전달되어 400 BadRequest 사이클을 일으키지 않도록 차단.
 *
 * 이 테스트가 깨지면 `BadRequestException at ValidationPipe` 버그 재발 가능.
 */
import { isJwtFormat } from '../jwt-format';

describe('isJwtFormat — 거부 케이스 (invalid)', () => {
  test('null → false', () => {
    expect(isJwtFormat(null)).toBe(false);
  });

  test('undefined → false', () => {
    expect(isJwtFormat(undefined)).toBe(false);
  });

  test('빈 문자열 → false', () => {
    expect(isJwtFormat('')).toBe(false);
  });

  test('non-string (jest cast: number) → false', () => {
    // 타입 시스템을 우회한 garbage 값도 안전하게 거부.
    expect(isJwtFormat(123 as unknown as string)).toBe(false);
  });

  test('garbage 토큰 (segment 0 개) → false', () => {
    expect(isJwtFormat('garbage')).toBe(false);
  });

  test('segment 2 개 (`.` 1 개) → false', () => {
    expect(isJwtFormat('a.b')).toBe(false);
  });

  test('segment 4 개 → false', () => {
    expect(isJwtFormat('a.b.c.d')).toBe(false);
  });

  test('첫 segment 비어있음 → false', () => {
    expect(isJwtFormat('.b.c')).toBe(false);
  });

  test('중간 segment 비어있음 (`a..c`) → false', () => {
    expect(isJwtFormat('a..c')).toBe(false);
  });

  test('마지막 segment 비어있음 → false', () => {
    expect(isJwtFormat('a.b.')).toBe(false);
  });

  test('모든 segment 비어있음 (`..`) → false', () => {
    expect(isJwtFormat('..')).toBe(false);
  });
});

describe('isJwtFormat — 허용 케이스 (valid 형식)', () => {
  test('최소 길이 segment 3 개 → true', () => {
    // 만료 여부는 검증하지 않음 — 형식만.
    expect(isJwtFormat('a.b.c')).toBe(true);
  });

  test('실제 JWT 예시 (만료될 수도 있는 토큰) → true', () => {
    const realLike =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    expect(isJwtFormat(realLike)).toBe(true);
  });

  test('base64url 특수문자(`-`, `_`) 포함 segment → true', () => {
    expect(isJwtFormat('a-b.c_d.e-f_g')).toBe(true);
  });
});

describe('isJwtFormat — 백엔드 호출 차단 시나리오 (실제 버그 재현)', () => {
  // 사용자가 본 BadRequestException 의 정확한 원인 케이스들.
  // 이 모두가 false 를 반환해야 클라이언트가 호출 자체를 건너뛴다.

  test('과거 버전의 stale 토큰 (형식 다름) → 차단', () => {
    expect(isJwtFormat('legacy-session-id-abc123')).toBe(false);
  });

  test('localStorage 에서 잘못 읽어온 base64 데이터 → 차단', () => {
    expect(isJwtFormat('YWJjZGVmZ2hpams=')).toBe(false);
  });

  test('빈 객체 직렬화 결과 같은 garbage → 차단', () => {
    expect(isJwtFormat('null')).toBe(false);
    expect(isJwtFormat('undefined')).toBe(false);
    expect(isJwtFormat('{}')).toBe(false);
  });
});
