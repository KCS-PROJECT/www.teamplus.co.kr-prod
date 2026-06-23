import 'package:flutter_test/flutter_test.dart';
import 'package:teamplus_app/core/auth/jwt_format.dart';

/// `isJwtFormatPattern` 회귀 가드.
///
/// 이 헬퍼는 `/auth/refresh` 호출 전 클라이언트 측 사전 검증으로 사용된다.
/// 백엔드 `RefreshTokenDto @IsJWT` 와 동일한 의도 — invalid 토큰이 백엔드로
/// 전달되어 400 BadRequest 사이클을 일으키지 않도록 차단.
///
/// 이 테스트가 깨지면 `BadRequestException at ValidationPipe` 버그가 재발 가능.
void main() {
  group('isJwtFormatPattern — 거부 케이스 (invalid)', () {
    test('null → false', () {
      expect(isJwtFormatPattern(null), isFalse);
    });

    test('빈 문자열 → false', () {
      expect(isJwtFormatPattern(''), isFalse);
    });

    test('garbage 토큰 (segment 0 개) → false', () {
      expect(isJwtFormatPattern('garbage'), isFalse);
    });

    test('segment 2 개 (`.` 1 개) → false', () {
      expect(isJwtFormatPattern('a.b'), isFalse);
    });

    test('segment 4 개 (`.` 3 개) → false', () {
      expect(isJwtFormatPattern('a.b.c.d'), isFalse);
    });

    test('첫 segment 비어있음 → false', () {
      expect(isJwtFormatPattern('.b.c'), isFalse);
    });

    test('중간 segment 비어있음 → false (`.` 두 개 연속)', () {
      expect(isJwtFormatPattern('a..c'), isFalse);
    });

    test('마지막 segment 비어있음 → false', () {
      expect(isJwtFormatPattern('a.b.'), isFalse);
    });

    test('모든 segment 비어있음 (`..`) → false', () {
      expect(isJwtFormatPattern('..'), isFalse);
    });

    test('공백만 있는 토큰 → false (split 결과는 `[" "]` 길이 1)', () {
      // 단일 공백은 segment 1 개라 false. (whitespace 전용 segment 처리)
      expect(isJwtFormatPattern(' '), isFalse);
    });
  });

  group('isJwtFormatPattern — 허용 케이스 (valid 형식)', () {
    test('최소 길이 segment 3 개 → true', () {
      // 만료 여부는 검증하지 않음 — 형식만.
      expect(isJwtFormatPattern('a.b.c'), isTrue);
    });

    test('실제 JWT 예시 (만료될 수도 있는 토큰) → true', () {
      // header.payload.signature (base64url, 만료 무관 형식 검증만)
      const realLike =
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      expect(isJwtFormatPattern(realLike), isTrue);
    });

    test('base64url 특수문자(`-`, `_`) 포함 segment → true', () {
      expect(isJwtFormatPattern('a-b.c_d.e-f_g'), isTrue);
    });

    test('각 segment 가 단일 문자라도 비어있지 않으면 → true', () {
      expect(isJwtFormatPattern('x.y.z'), isTrue);
    });
  });

  group('isJwtFormatPattern — 백엔드 호출 차단 시나리오 (실제 버그 재현)', () {
    /// 사용자가 본 BadRequestException 의 정확한 원인 케이스들.
    /// 이 모두가 false 를 반환해야 클라이언트가 호출 자체를 건너뛴다.
    test('과거 버전의 stale 토큰 (형식 다름) → 차단', () {
      expect(isJwtFormatPattern('legacy-session-id-abc123'), isFalse);
    });

    test('SecureStorage 에서 잘못 읽어온 base64 데이터 → 차단', () {
      // segment 0 개 → false
      expect(isJwtFormatPattern('YWJjZGVmZ2hpams='), isFalse);
    });

    test('빈 객체 직렬화 결과 같은 garbage → 차단', () {
      expect(isJwtFormatPattern('null'), isFalse);
      expect(isJwtFormatPattern('undefined'), isFalse);
      expect(isJwtFormatPattern('{}'), isFalse);
    });
  });
}
