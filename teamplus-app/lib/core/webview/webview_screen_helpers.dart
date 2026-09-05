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

/// 히스토리 엔트리가 **앱 웹(teamplus-web) 소속**인지 판별.
///
/// 토스 결제창처럼 외부 도메인으로 나갔다 돌아오면 그 엔트리가 WebView 히스토리에
/// 그대로 남는다. 결제 세션은 이탈 즉시 만료되므로 되짚어 들어가면 토스가 소유한
/// "이미 종료된 세션입니다" 화면(버튼 없음 — 앱에서 빠져나올 수단 없음)이 뜬다.
/// `_safeHistoryBackSteps` 는 이 판정으로 외부 엔트리에서 되짚기를 중단한다.
///
/// 호스트만 비교한다 — dev/prod 로 scheme·port 가 달라지지만 앱 웹 호스트는 하나다.
/// base 파싱 실패 등 판정 불가 시에는 true(기존 동작 유지)로 보수적 폴백한다.
bool _isAppWebEntry(Uri? url) {
  if (url == null) return true;
  final base = Uri.tryParse(ApiConstants.webAppUrl);
  if (base == null || base.host.isEmpty || url.host.isEmpty) return true;
  return url.host == base.host;
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

/// 현재 URL 이 **역할 메인(홈) 화면**인지 판별.
///
/// [2026-07-17 BACKKEY FIX] 하드웨어 백키가 메인 화면에서 종료 확인 팝업을
/// 띄우도록 하기 위한 판별. 앱은 로그인 → 역할 홈 리다이렉트로 진입하므로 홈에서도
/// WebView 내부 history(`canGoBack()==true`)가 남아, 기존 `_onHardwareBack` 의
/// canGoBack→goBack 분기가 종료 확인에 **영영 도달하지 못하는** 회귀가 있었다
/// (로그인 화면으로 goBack → 인증됨이라 다시 홈으로 리다이렉트 → 홈에 갇힘).
/// 로그인 루트 특례(`_isLoginRootUrl`)와 동일하게, 홈이면 canGoBack 을 무시하고
/// 곧장 종료 확인(세션 클리어 후 종료)으로 보낸다.
///
/// 경로 집합은 web `ROLE_HOME_PATHS`(nav-home-paths.ts) 와 동기화한다.
bool _isRoleHomeUrl(String? url) {
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
  const roleHomePaths = <String>[
    '/admin',
    '/director',
    '/academy-director',
    '/coach',
    '/parent',
    '/student',
    '/child',
    '/teen',
  ];
  return roleHomePaths.contains(path);
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
