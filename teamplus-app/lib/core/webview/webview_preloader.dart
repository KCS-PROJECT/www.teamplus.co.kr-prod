import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

/// ⚡ Next.js WebView 프리로더 (Cold Start 최적화 — 1초 로딩 목표)
///
/// **문제**: 실제 [InAppWebView] 가 마운트되기 전까지 Next.js 번들(HTML / JS /
/// CSS / 폰트) 다운로드가 시작되지 않아, 사용자는 Splash 가 끝난 후에도
/// 1.5~3 초 동안 흰 화면을 보게 된다.
///
/// **해법**: Splash 표시 중 [HeadlessInAppWebView] 로 동일 URL 을 백그라운드
/// 로드하여 WebView 캐시(Android `WebView` / iOS `WKWebsiteDataStore`)에
/// HTML / JS / CSS 를 미리 적재. 실제 [InAppWebView] 는 같은 데이터스토어를
/// 공유하므로 캐시 히트로 즉시 페인트된다.
///
/// **설계 원칙**:
///   - Idempotent: 같은 URL 재호출 시 no-op.
///   - 실패해도 앱 실행 계속 (try/catch, 로그만).
///   - 로드 완료 후 일정 시간 뒤 자동 dispose (자원 누수 방지).
///   - 디버그 모드에서는 캐시 비활성 상태이므로 효과가 없지만 호출은 허용.
class WebViewPreloader {
  WebViewPreloader._();
  static final WebViewPreloader instance = WebViewPreloader._();

  HeadlessInAppWebView? _headless;
  String? _preloadedUrl;
  Timer? _disposeTimer;
  Completer<void>? _loadCompleter;
  bool _loadCompleted = false;

  /// InAppWebView 실제 마운트와 같은 UA 패밀리를 쓰되 플랫폼 분기.
  /// Next.js SSR/미들웨어가 UA 로 플랫폼을 판별하므로 동일 체계 유지가 중요.
  ///
  /// **public static** 으로 공개하여 [webview_screen.dart] 등 모든 WebView
  /// 초기화 지점에서 동일 UA 를 참조할 수 있도록 단일화.
  ///
  /// **Chrome/Safari 토큰 필수**: KG이니시스·NICE 등 일부 PG/통합인증사가
  /// UA 에 표준 Chrome(Android) / Safari(iOS) 토큰이 없으면 비표준 브라우저로
  /// 판단해 본인인증을 즉시 거부(`FAILURE_TYPE_PG`)한다. native 식별자
  /// `teamplusApp/1.0` 은 끝에 유지하여 `environment.ts` 의 native 판별과
  /// SSR/미들웨어 분기는 그대로 유지.
  static String get platformUserAgent {
    if (Platform.isIOS) {
      return 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) '
          'AppleWebKit/605.1.15 (KHTML, like Gecko) '
          'Version/17.0 Mobile/15E148 Safari/604.1 '
          'teamplusApp/1.0';
    }
    return 'Mozilla/5.0 (Linux; Android 14; Mobile) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/120.0.0.0 Mobile Safari/537.36 '
        'teamplusApp/1.0';
  }

  /// URL path 에 trailing slash 자동 보정 (Next.js `trailingSlash:true` 308 redirect 회피).
  ///
  /// 규칙:
  ///   - path 가 비었거나 `/` 만 있으면 그대로 (root URL)
  ///   - 마지막 segment 에 `.` 포함 (`*.js`, `*.css` 등 파일 확장자) → 그대로
  ///   - 그 외 → trailing slash 추가
  /// query / fragment 는 보존.
  static String _ensureTrailingSlash(String url) {
    try {
      final uri = Uri.parse(url);
      final path = uri.path;
      if (path.isEmpty || path == '/' || path.endsWith('/')) return url;
      final lastSeg = uri.pathSegments.isNotEmpty ? uri.pathSegments.last : '';
      if (lastSeg.contains('.')) return url; // 파일 확장자 보호
      return uri.replace(path: '$path/').toString();
    } catch (_) {
      return url;
    }
  }

  /// [url] 을 백그라운드에서 로드하여 WebView 캐시를 warm-up.
  ///
  /// - 진행 중이면서 같은 URL 이면 기존 future 반환 (idempotent).
  /// - 이미 완료된 상태이고 headless 가 살아 있으면 재호출 시 재로드.
  /// - 다른 URL 로 호출되면 기존 headless 는 dispose 후 새로 시작.
  /// - 반환 Future 는 페이지 로드 완료 시 resolve (실패 시 6s timeout).
  ///
  /// **trailing slash 자동 보정**: caller 가 누락해도 안전하도록 내부에서 보정한다.
  /// splash_screen.dart 가 이미 보정된 path 를 전달하지만, 미래의 다른 caller 가
  /// 누락해 308 redirect 가 발생하지 않도록 방어 가드.
  Future<void> preload(String rawUrl) async {
    if (kIsWeb) return;
    final url = _ensureTrailingSlash(rawUrl);

    // 같은 URL 이 이미 완료되었거나 진행 중이면 기존 결과를 재사용한다.
    // Splash 단계의 두 번째 preload 호출이 완료된 headless 를 dispose/reload 하며
    // 실제 WebView 캐시 hit 기회를 줄이는 회귀를 막는다.
    if (_preloadedUrl == url && _headless != null && _loadCompleter != null) {
      if (_loadCompleted || _loadCompleter!.isCompleted) {
        return;
      }
      return _loadCompleter!.future;
    }

    // 그 외 경우 전부 리셋 — dispose 후 completer/url 초기화를
    // _disposeInternal 이 담당하므로 안전하게 재시작
    await _disposeInternal();

    _preloadedUrl = url;
    _loadCompleter = Completer<void>();
    _loadCompleted = false;

    try {
      _headless = HeadlessInAppWebView(
        initialUrlRequest: URLRequest(url: WebUri(url)),
        initialSettings: InAppWebViewSettings(
          // 프리로드는 JS 실행까지 진행해야 Next.js 번들이 파싱됨
          javaScriptEnabled: true,
          cacheEnabled: true,
          clearCache: false,
          useShouldOverrideUrlLoading: false,
          userAgent: WebViewPreloader.platformUserAgent,
          // 렌더 비용 최소화
          supportZoom: false,
          builtInZoomControls: false,
          displayZoomControls: false,
          useWideViewPort: true,
          disallowOverScroll: true,
        ),
        onLoadStop: (controller, url) async {
          debugPrint('[WebViewPreloader] ✅ preload 완료: $url');
          _completeIfPending();
          // 로드 완료 후 5초 뒤 자동 dispose — 캐시는 OS에 남음
          _scheduleDispose();
        },
        onReceivedError: (controller, request, error) {
          debugPrint('[WebViewPreloader] ⚠️ preload 오류: ${error.description}');
          _completeIfPending();
          // 에러 발생 시 즉시 리소스 회수 (6s timeout 기다리지 않음)
          unawaited(_disposeInternal());
        },
      );

      await _headless!.run();
      debugPrint('[WebViewPreloader] 🚀 preload 시작: $url');

      // 6초 내 완료 안 되면 timeout (백그라운드 자원 누수 방지)
      unawaited(
        _loadCompleter!.future.timeout(
          const Duration(seconds: 6),
          onTimeout: () {
            debugPrint('[WebViewPreloader] ⏱ preload 6s timeout');
            unawaited(_disposeInternal());
          },
        ),
      );
    } catch (e) {
      debugPrint('[WebViewPreloader] preload 예외: $e');
      _completeIfPending();
      unawaited(_disposeInternal());
    }

    return _loadCompleter!.future;
  }

  void _completeIfPending() {
    final c = _loadCompleter;
    _loadCompleted = true;
    if (c != null && !c.isCompleted) c.complete();
  }

  void _scheduleDispose() {
    _disposeTimer?.cancel();
    _disposeTimer = Timer(
      const Duration(seconds: 5),
      () => unawaited(_disposeInternal()),
    );
  }

  /// 현재 preload 완료를 기다린다 (이미 완료면 즉시 반환).
  /// WebViewScreen 이 마운트되기 직전 호출하면 캐시 준비 완료를 보장.
  Future<void> waitForCompletion() async {
    if (_loadCompleter == null) return;
    return _loadCompleter!.future;
  }

  /// 내부 headless 인스턴스 해제. 캐시는 OS 에 남지만 상태는 **완전 리셋** 되어
  /// 같은 URL 로 재호출 시에도 다시 preload 가 수행된다.
  Future<void> _disposeInternal() async {
    _disposeTimer?.cancel();
    _disposeTimer = null;
    final headless = _headless;
    _headless = null;
    _preloadedUrl = null;
    _loadCompleter = null;
    _loadCompleted = false;
    try {
      await headless?.dispose();
    } catch (_) {
      // swallow — 이미 dispose 된 경우
    }
  }

  /// 외부 dispose (로그아웃 등에서 호출 가능 — 통상 불필요)
  Future<void> dispose() async {
    await _disposeInternal();
  }
}
