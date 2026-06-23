import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:app_links/app_links.dart';
import '../constants/api_constants.dart';

/// TEAMPLUS 범용 딥링크 핸들러
///
/// 지원하는 URL 스킴:
///   teamplus://class/:classId        → 수업 상세 (WebView)
///   teamplus://attendance/:scheduleId → 출석 체크인 (WebView)
///   teamplus://payment/:paymentId    → 결제 상세 (WebView)
///   teamplus://notice/:noticeId      → 공지 상세 (WebView)
///   teamplus://identity-callback     → 본인인증 콜백 (별도 처리)
///   kakao3135b23ea4171cc782e24807bcfa9a51://kakaolink?path=... → 카카오톡 공유 딥링크
///
/// Universal Links / App Links (운영 — 2026-05-27 도메인 전환):
///   https://teamplusweb.icetimes.co.kr/classes/:classId
///   https://teamplusweb.icetimes.co.kr/attendance/:scheduleId
///   https://teamplusweb.icetimes.co.kr/payment/:paymentId
///   https://teamplusweb.icetimes.co.kr/notices/:noticeId
///   (host 화이트리스트는 kUniversalLinkHosts — 운영 teamplusweb 단일)
class DeepLinkHandler {
  static DeepLinkHandler? _instance;
  final AppLinks _appLinks = AppLinks();
  StreamSubscription<Uri>? _linkSubscription;

  /// WebViewScreen이 등록하는 콜백 — 기존 WebView 내에서 Next.js 라우팅 수행.
  /// null이면 GoRouter fallback 사용.
  static void Function(String webPath)? onNavigateInWebView;

  /// Cold start 시 WebView 준비 전에 수신된 딥링크 경로.
  /// WebViewScreen 로드 완료 후 consumePendingPath()로 소비.
  static String? _pendingDeepLinkPath;

  static String? consumePendingPath() {
    final path = _pendingDeepLinkPath;
    _pendingDeepLinkPath = null;
    return path;
  }

  DeepLinkHandler._();

  factory DeepLinkHandler() {
    _instance ??= DeepLinkHandler._();
    return _instance!;
  }

  /// 딥링크 핸들러 초기화
  ///
  /// [navigatorKey]: 전역 NavigatorKey (GoRouter에 접근하기 위해 사용)
  Future<void> initialize(
      {required GlobalKey<NavigatorState> navigatorKey}) async {
    // 앱 종료 상태에서 딥링크로 실행된 경우 처리
    final initialUri = await _appLinks.getInitialLink();
    if (initialUri != null) {
      debugPrint('[DeepLink] 앱 시작 딥링크: $initialUri');
      // 앱 초기화 완료 후 처리 (약간의 지연 필요)
      Future.delayed(const Duration(milliseconds: 500), () {
        _handleUri(initialUri, navigatorKey: navigatorKey);
      });
    }

    // 앱 실행 중 딥링크 수신
    _linkSubscription = _appLinks.uriLinkStream.listen(
      (uri) {
        debugPrint('[DeepLink] 포그라운드 딥링크 수신: $uri');
        _handleUri(uri, navigatorKey: navigatorKey);
      },
      onError: (err) {
        debugPrint('[DeepLink] 딥링크 수신 오류: $err');
      },
    );
  }

  /// URI 라우팅 처리
  void _handleUri(Uri uri, {required GlobalKey<NavigatorState> navigatorKey}) {
    debugPrint(
        '[DeepLink] URI 처리: scheme=${uri.scheme}, host=${uri.host}, path=${uri.path}');

    // identity-callback은 IdentityDeepLinkHandler에서 처리
    if (uri.host == 'identity-callback') {
      debugPrint('[DeepLink] 본인인증 콜백 → IdentityDeepLinkHandler에 위임');
      return;
    }

    final webPath = resolveWebPath(uri);
    if (webPath == null) {
      debugPrint('[DeepLink] 처리 불가한 URI: $uri');
      return;
    }

    final targetUrl = '${ApiConstants.webAppUrl}$webPath';
    debugPrint('[DeepLink] WebView 이동: $targetUrl');

    // 기존 WebView가 활성 상태면 내부 라우팅으로 즉시 이동
    if (onNavigateInWebView != null) {
      debugPrint('[DeepLink] 기존 WebView 내 라우팅: $webPath');
      onNavigateInWebView!(webPath);
      return;
    }

    // Cold start: WebView 미준비 → pending 저장 (WebView 로드 완료 후 소비)
    _pendingDeepLinkPath = webPath;
    debugPrint('[DeepLink] WebView 미준비 → pending 저장: $webPath');

    // WebView 미활성 시 GoRouter fallback
    final context = navigatorKey.currentContext;
    if (context == null) {
      debugPrint('[DeepLink] context 없음 - 네비게이션 불가');
      return;
    }

    GoRouter.of(context).pushNamed(
      'webview',
      extra: {
        'url': targetUrl,
        'title': 'TEAMPLUS',
        'showAppBar': false,
        'showBottomNav': true,
      },
    );
  }

  /// Universal Links / App Links 로 수신되는 TEAMPLUS 웹 호스트.
  ///
  /// 2026-05-27 운영 도메인 전환(app.teamplus.com → teamplusweb.icetimes.co.kr).
  /// 2026-06-15 레거시 *.teamplus.com 제거 — 전 도메인 패밀리 DNS SERVFAIL(폐기).
  ///   죽은 도메인을 host allowlist 에 남기면 (1) Play Console autoVerify 검증이
  ///   영구 실패해 "확인되지 않은 도메인" 오류를 유발하고, (2) 도메인 재등록 시
  ///   피싱 Universal Link 가 신뢰 호스트로 통과될 수 있어 완전 제거한다.
  ///
  /// 운영 도메인 체계(icetimes.co.kr):
  ///   - teamplusweb.icetimes.co.kr   → 사용자 웹(앱 WebView 로드 대상) ★딥링크 대상
  ///   - teamplusadmin.icetimes.co.kr → 관리자(앱 미로드) · 딥링크 비대상(보안)
  ///   - teamplus.icetimes.co.kr      → 홍보 홈페이지 · 딥링크 비대상
  /// 앱은 사용자 웹만 로드하므로 딥링크 host 는 teamplusweb 만 등록한다.
  ///
  /// iOS AASA(apple-app-site-association)·Android assetlinks(autoVerify) 서빙
  /// 도메인과 일치해야 한다. 도메인 추가/변경 시 다음과 반드시 함께 동기화:
  ///   - ios/Runner/Runner.entitlements · RunnerRelease.entitlements (associated-domains)
  ///   - android/app/src/main/AndroidManifest.xml (intent-filter host)
  ///   - teamplus-web/src/lib/deeplink.ts (DEEPLINK_HOSTS)
  static const Set<String> kUniversalLinkHosts = {
    'teamplusweb.icetimes.co.kr', // 운영 사용자 웹 (유일한 활성 딥링크 도메인)
  };

  /// host 가 TEAMPLUS Universal Link / App Link 호스트인지 판정.
  ///
  /// 고정 목록(kUniversalLinkHosts) + 현재 실행 환경의 web host(dev/home/local)
  /// 를 함께 인식하여 도메인/환경 전환에도 자동 대응한다.
  static bool isUniversalLinkHost(String host) {
    if (host.isEmpty) return false;
    if (kUniversalLinkHosts.contains(host)) return true;
    try {
      final envHost = Uri.parse(ApiConstants.webAppUrl).host;
      return envHost.isNotEmpty && envHost == host;
    } catch (_) {
      return false;
    }
  }

  /// URI를 WebApp 경로로 변환 (순수 함수 — 회귀 테스트 대상)
  ///
  /// 커스텀 스킴(teamplus://), 카카오 공유 링크,
  /// Universal Links / App Links(`https://{host}/...`) 모두 지원.
  @visibleForTesting
  static String? resolveWebPath(Uri uri) {
    final host = uri.host;
    final pathSegments = uri.pathSegments;

    // teamplus:// 스킴 처리
    if (uri.scheme == 'teamplus') {
      return _mapteamplusScheme(host, pathSegments, uri.queryParameters);
    }

    // kakao{appkey}://kakaolink?path=/classes/123
    if (uri.scheme == 'kakao3135b23ea4171cc782e24807bcfa9a51') {
      return _mapKakaoLink(uri.queryParameters);
    }

    // https://<TEAMPLUS host> 처리 (Universal Links / App Links)
    // 운영 teamplusweb.icetimes.co.kr (+ 현재 실행 환경 web host) 만 매칭.
    if (uri.scheme == 'https' && isUniversalLinkHost(host)) {
      return _mapUniversalLink(pathSegments, uri.queryParameters);
    }

    return null;
  }

  /// teamplus:// 스킴 경로 매핑
  ///
  /// teamplus://class/123    → /classes/123
  /// teamplus://attendance/456 → /attendance?scheduleId=456
  /// teamplus://payment/789  → /payment/789
  /// teamplus://notice/101   → /notices/101
  /// teamplus://tbot/seed?access=...&refresh=...&redirect=/
  ///        → /?__auth_seed=`<access>`&__auth_refresh=`<refresh>`&redirect=/
  ///          (tbot 테스트 하네스 전용 — AuthSeedBootstrap.tsx 가 읽어 자동 로그인)
  static String? _mapteamplusScheme(
    String host,
    List<String> pathSegments,
    Map<String, String> queryParams,
  ) {
    switch (host) {
      case 'class':
        final classId = pathSegments.isNotEmpty
            ? pathSegments.first
            : queryParams['classId'];
        if (classId == null || classId.isEmpty) return null;
        return '/classes/$classId';

      case 'attendance':
        final scheduleId = pathSegments.isNotEmpty
            ? pathSegments.first
            : queryParams['scheduleId'];
        if (scheduleId == null || scheduleId.isEmpty) return null;
        return '/attendance?scheduleId=$scheduleId';

      case 'payment':
        final paymentId = pathSegments.isNotEmpty
            ? pathSegments.first
            : queryParams['paymentId'];
        if (paymentId == null || paymentId.isEmpty) return null;
        return '/payment/$paymentId';

      case 'notice':
        final noticeId = pathSegments.isNotEmpty
            ? pathSegments.first
            : queryParams['noticeId'];
        if (noticeId == null || noticeId.isEmpty) return null;
        return '/notices/$noticeId';

      // ── 2026-04-23: tbot 테스트 하네스 seed URL ──────────────────────────
      // `flutter build ios --simulator` 로 공통 빌드 후 각 시뮬에
      // `xcrun simctl openurl <udid> "teamplus://tbot/seed?access=..&refresh=.."`
      // 를 개별 전달하면, 여기서 AuthSeedBootstrap 용 쿼리가 담긴 웹앱 URL 로 변환된다.
      // → 빌드 1회 + 설치 N회 + URL 주입 N회 로 다중 시뮬 고속 로그인이 가능.
      case 'tbot':
        final subHost = pathSegments.isNotEmpty ? pathSegments.first : '';
        if (subHost == 'seed') {
          final access = queryParams['access'] ?? '';
          final refresh = queryParams['refresh'] ?? '';
          final redirect = queryParams['redirect'] ?? '/';
          if (access.isEmpty) {
            debugPrint('[DeepLink] tbot seed 에 access 토큰 누락 · 무시');
            return null;
          }
          // Web 쿼리 스트링으로 직렬화 — AuthSeedBootstrap.tsx 의 계약과 일치
          final q = <String>[
            '__auth_seed=${Uri.encodeQueryComponent(access)}',
            if (refresh.isNotEmpty)
              '__auth_refresh=${Uri.encodeQueryComponent(refresh)}',
            'redirect=${Uri.encodeQueryComponent(redirect)}',
          ].join('&');
          return '/?$q';
        }
        debugPrint('[DeepLink] tbot 알 수 없는 sub-path: $subHost');
        return null;

      default:
        debugPrint('[DeepLink] 알 수 없는 host: $host');
        return null;
    }
  }

  /// 카카오톡 공유 앱링크 매핑
  ///
  /// kakao{appkey}://kakaolink?path=/classes/123 → /classes/123
  static String? _mapKakaoLink(Map<String, String> queryParams) {
    final path = queryParams['path'];
    if (path != null && path.isNotEmpty) {
      debugPrint('[DeepLink] 카카오링크 path=$path');
      return path.startsWith('/') ? path : '/$path';
    }
    debugPrint('[DeepLink] 카카오링크 path 없음 → 홈으로 이동');
    return '/';
  }

  /// Universal Links / App Links 경로 매핑 (`https://{host}/...`)
  static String? _mapUniversalLink(
    List<String> pathSegments,
    Map<String, String> queryParams,
  ) {
    if (pathSegments.isEmpty) return '/';

    final section = pathSegments.first;
    final id = pathSegments.length > 1 ? pathSegments[1] : null;

    switch (section) {
      case 'class':
      case 'classes':
        if (id == null) return '/classes';
        return '/classes/$id';

      case 'attendance':
        final scheduleId = id ?? queryParams['scheduleId'];
        if (scheduleId == null) return '/attendance';
        return '/attendance?scheduleId=$scheduleId';

      case 'payment':
        if (id == null) return '/payment';
        return '/payment/$id';

      case 'notice':
      case 'notices':
        if (id == null) return '/notices';
        return '/notices/$id';

      default:
        // 매핑 불가한 경로는 그대로 전달 (WebView에서 처리)
        return '/${pathSegments.join('/')}';
    }
  }

  /// 리소스 정리
  void dispose() {
    _linkSubscription?.cancel();
  }
}

/// 딥링크 URL 빌더 유틸리티
class DeepLinkBuilder {
  static const String _scheme = 'teamplus';

  /// 수업 상세 딥링크 URL
  static String classDetail(String classId) => '$_scheme://class/$classId';

  /// 출석 체크인 딥링크 URL
  static String attendance(String scheduleId) =>
      '$_scheme://attendance/$scheduleId';

  /// 결제 상세 딥링크 URL
  static String paymentDetail(String paymentId) =>
      '$_scheme://payment/$paymentId';

  /// 공지 상세 딥링크 URL
  static String noticeDetail(String noticeId) => '$_scheme://notice/$noticeId';
}
