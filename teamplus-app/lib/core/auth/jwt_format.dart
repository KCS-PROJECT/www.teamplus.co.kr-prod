/// JWT 형식 검증 헬퍼.
///
/// 클라이언트 측 사전 가드 — 백엔드 `RefreshTokenDto @IsJWT` 와 동일 의도.
/// stale 또는 garbage 토큰이 `/auth/refresh` 로 전송되어 400 BadRequest
/// 사이클을 일으키는 것을 차단한다.
///
/// 만료 여부는 검증하지 않는다 (만료 검증은 서버의 jwt.verify 가 401 로 응답).
///
/// 양 호출 위치 ([api_client.dart], [websocket_service.dart]) 가 동일 로직을
/// 가지지 않도록 단일 SoT 로 추출. 회귀 가드 unit test 도 이 진입점만 잠그면 된다.
library;

/// 토큰이 JWT 형식인지 검증한다 (segment 기반).
///
/// 규칙:
///  - null 또는 빈 문자열 → false
///  - `.` 로 split 했을 때 정확히 3 개 segment 가 아니면 false
///  - 각 segment 가 비어있으면 false
///
/// 예시:
/// ```dart
/// isJwtFormatPattern(null)               // false
/// isJwtFormatPattern('')                 // false
/// isJwtFormatPattern('a.b.c')            // true (형식만 검증)
/// isJwtFormatPattern('a..c')             // false (빈 segment)
/// isJwtFormatPattern('a.b')              // false (segment 부족)
/// isJwtFormatPattern('a.b.c.d')          // false (segment 초과)
/// isJwtFormatPattern('garbage')          // false
/// ```
bool isJwtFormatPattern(String? token) {
  if (token == null || token.isEmpty) return false;
  final parts = token.split('.');
  if (parts.length != 3) return false;
  return parts.every((p) => p.isNotEmpty);
}
