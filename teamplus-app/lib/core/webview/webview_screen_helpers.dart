// part of webview_screen.dart — 순수(stateless) 헬퍼 함수 분리.
// 인증/로그인/회원가입 경로 판별 · 색상 밝기/HEX 파싱 · userType→대시보드 경로 매핑.
// M2 리팩터 2026-06-24: 인스턴스 상태에 의존하지 않는 메서드를 library-private
// top-level 함수로 이동. 호출부는 unqualified 라 그대로 resolve 되어 동작/접근성 변경 없음.
part of 'webview_screen.dart';

/// 현재 URL 이 로그인·회원가입·계정찾기·온보딩·스플래시 등
/// **PTR 미적용 경로**인지 판별.
///
/// substring(`url.contains('/login')`) 매칭은 `/login-history` 같은 다른 경로를
/// 잘못 매칭할 수 있으므로 `Uri.parse` 의 path 만 정확히 비교한다.
/// 끝의 `/` 는 정규화하고, 하위 경로(`/login/something`)도 인증 경로로 본다.
bool _isAuthPathUrl(String? url) {
  if (url == null || url.isEmpty) return false;
  String path;
  try {
    path = Uri.parse(url).path;
  } catch (_) {
    // Uri.parse 실패 시 보수적 fallback (쿼리·해시 제거)
    path = url.split('?').first.split('#').first;
  }
  if (path.length > 1 && path.endsWith('/')) {
    path = path.substring(0, path.length - 1);
  }
  const authPaths = <String>[
    '/login',
    '/signup',
    '/register',
    '/find-id',
    '/find-password',
    '/forgot-password',
    '/password-reset-complete',
    '/onboarding',
    '/splash',
  ];
  for (final authPath in authPaths) {
    if (path == authPath || path.startsWith('$authPath/')) {
      return true;
    }
  }
  return false;
}

/// 현재 URL 이 **로그인 화면**(`/login`)인지 정확히 판별.
///
/// `_isAuthPathUrl` 은 회원가입·비밀번호찾기 등 인증 플로우 전체를 포함하지만,
/// 하드웨어 백키 "한 번 더 누르면 종료" 는 앱 진입점인 로그인 화면에만 적용한다.
/// (회원가입/비밀번호찾기 등 하위 화면에서는 백키로 로그인 복귀가 자연스러우므로
///  기존 history back 로직을 그대로 탄다. — 2026-05-26 사용자 직접 지시)
bool _isLoginRootUrl(String? url) {
  if (url == null || url.isEmpty) return false;
  String path;
  try {
    path = Uri.parse(url).path;
  } catch (_) {
    path = url.split('?').first.split('#').first;
  }
  if (path.length > 1 && path.endsWith('/')) {
    path = path.substring(0, path.length - 1);
  }
  return path == '/login';
}

/// 현재 URL 이 **회원가입 화면**(`/signup`)인지 정확히 판별.
///
/// 가입 완료 환영(A13) '둘러보기' 진입 경로(webview `/signup/`)에서 soft/hardware
/// 백키 시 로그인(`/login/`)으로 보내기 위한 판별. `_isLoginRootUrl` 과 동일하게
/// trailing slash 를 정규화하고 루트 경로만 정확히 비교한다.
bool _isSignupRootUrl(String? url) {
  if (url == null || url.isEmpty) return false;
  String path;
  try {
    path = Uri.parse(url).path;
  } catch (_) {
    path = url.split('?').first.split('#').first;
  }
  if (path.length > 1 && path.endsWith('/')) {
    path = path.substring(0, path.length - 1);
  }
  return path == '/signup';
}

/// 색상이 밝은지 어두운지 판단
/// 밝으면 true (어두운 아이콘 사용), 어두우면 false (밝은 아이콘 사용)
bool _isColorBright(Color color) {
  // 상대 휘도(Relative Luminance) 계산
  final luminance = color.computeLuminance();
  return luminance > 0.5;
}

/// HEX 색상 문자열을 Color로 변환
/// [hexColor]: '#FFFFFF' 또는 'FFFFFF' 형식
Color? _parseHexColor(String hexColor) {
  try {
    String hex = hexColor.replaceFirst('#', '');
    if (hex.length == 6) {
      hex = 'FF$hex'; // 알파 채널 추가
    }
    return Color(int.parse(hex, radix: 16));
  } catch (e) {
    debugPrint('[WebView] 색상 파싱 실패: $hexColor - $e');
    return null;
  }
}

/// 사용자 타입에 따른 대시보드 경로 반환
///
/// ⚠️ trailing slash 필수 — `teamplus-web/next.config.js` 의 `trailingSlash: true`
/// 설정으로 slash 없는 경로는 HTTP 308 redirect 발생. WebView 흰 화면 시간을
/// 늘리는 원인이므로 처음부터 trailing slash 포함 (splash_screen.dart 동일 패턴).
String _getDashboardPathByUserType(String? userType) {
  if (userType == null) return '/login/';

  final normalizedType = userType.toLowerCase();
  switch (normalizedType) {
    case 'parent':
      return '/parent/';
    case 'coach':
      return '/coach/';
    case 'admin':
      return '/admin/';
    case 'child':
    case 'teen': // TEEN은 child로 매핑
      return '/child/';
    case 'director':
      return '/director/';
    default:
      return '/login/';
  }
}
