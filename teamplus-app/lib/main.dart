import 'dart:async';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart' show kIsWeb, kDebugMode;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_native_splash/flutter_native_splash.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'core/router/deep_link_handler.dart';
import 'core/security/app_lock_manager.dart';
import 'app.dart' show TeamplusApp;
import 'core/security/ssl_pinning_service.dart';
import 'core/constants/app_environment.dart';
import 'core/notification/push_notification_service.dart';
import 'core/storage/offline_cache_service.dart';
import 'core/storage/database/local_db_service.dart';
import 'core/diagnostics/boot_timeline.dart';
import 'core/auth/token_storage.dart';
import 'core/constants/api_constants.dart';
import 'core/network/api_client.dart';
import 'core/webview/webview_preloader.dart';
import 'core/navigation/navigator_key.dart';
import 'core/logging/app_logger.dart';
import 'core/logging/app_provider_observer.dart';
import 'package:go_router/go_router.dart';

// 전역 Navigator Key — core/navigation/navigator_key.dart SoT 에서 re-export.
//   webview_bridge / app_router 등이 main.dart show navigatorKey 형태로 의존하므로
//   호환성 유지를 위해 같은 이름으로 노출한다.
export 'core/navigation/navigator_key.dart' show navigatorKey;

/// 🚀 Cold Start 최적화
///
/// **정책**: runApp() 까지 걸리는 시간이 첫 페인트를 막는다. 따라서
///   - 첫 페인트에 **반드시 필요한 것**만 await (환경·SystemChrome 2종)
///   - 나머지(FCM/Hive/SSL/AppLock/DeepLink)는 전부 `unawaited()`로
///     백그라운드 초기화 → 첫 프레임 이후에 완료됨
///
/// **효과**: main() 동기 체인 ~600-2500ms → <50ms
///
/// **안전장치**:
///   - 각 서비스는 싱글톤이며 내부적으로 idempotent 해야 함 (중복 init 안전)
///   - 첫 사용 지점(API client / Splash redirect)에서 `await future` 로 대기
///   - 실패 시에도 앱 실행은 계속 (try/catch 유지)
Future<void> _deferredInit() async {
  final futures = <Future<void>>[
    // 2026-05-16: SharedPreferences warmup — 첫 디스크 읽기(300-500ms)를
    //   _deferredInit 백그라운드로 이전하여 Splash isOnboardingCompleted() 호출 시
    //   이미 캐시 적중 상태가 되도록 한다. 콜드 스타트 SLA 4s 대응.
    () async {
      try {
        await SharedPreferences.getInstance();
        debugPrint('[Cold] SharedPreferences warmup 완료');
      } catch (e) {
        debugPrint('⚠️ SharedPreferences warmup 실패 (백그라운드): $e');
      }
    }(),
    () async {
      try {
        await SslPinningService().initialize();
      } catch (e) {
        debugPrint('⚠️ SSL Pinning 초기화 실패 (백그라운드): $e');
      }
    }(),
    () async {
      try {
        await OfflineCacheService.initialize();
      } catch (e) {
        debugPrint('⚠️ 오프라인 캐시 초기화 실패 (백그라운드): $e');
      }
    }(),
    // 2026-05-22 Phase A: SQLite(drift) 로컬 DB 초기화.
    //   - LocalDbService.initialize() 는 idempotent.
    //   - 실패 시 미초기화 상태로 두고 앱 진행 — 첫 사용 지점에서 StateError 발생.
    //   - Phase C 에서 OfflineCacheService.initialize() 제거 예정.
    () async {
      try {
        await LocalDbService.instance.initialize();
      } catch (e) {
        debugPrint('⚠️ LocalDb 초기화 실패 (백그라운드): $e');
      }
    }(),
    () async {
      try {
        await appLockManager.initialize();
      } catch (e) {
        debugPrint('⚠️ AppLockManager 초기화 실패 (백그라운드): $e');
      }
    }(),
    () async {
      try {
        await DeepLinkHandler().initialize(navigatorKey: navigatorKey);
      } catch (e) {
        debugPrint('⚠️ DeepLinkHandler 초기화 실패 (백그라운드): $e');
      }
    }(),
    if (!kIsWeb)
      () async {
        // Firebase 초기화 → FCM 초기화 순차 체인.
        // 설정 파일(GoogleService-Info.plist / google-services.json)이 없거나
        // 네이티브 Firebase 초기화가 실패하면 FCM 단계를 graceful하게 건너뛴다.
        try {
          if (Firebase.apps.isEmpty) {
            await Firebase.initializeApp();
          }
        } catch (e) {
          debugPrint('⚠️ Firebase 초기화 실패 — FCM 비활성화: $e');
          return;
        }

        try {
          await PushNotificationService().initialize();
        } catch (e) {
          debugPrint('⚠️ Push notification 초기화 실패 (백그라운드): $e');
        }
      }(),
  ];
  // 병렬 대기 — 서로 의존성 없음
  await Future.wait(futures, eagerError: false);
  debugPrint('[main] 🚀 _deferredInit 완료');
}

/// 백그라운드 초기화 Future — Splash 등 "토큰 읽기 직전" 지점에서 await
Future<void>? deferredInitFuture;

/// 🎨 Native splash → WebView 첫 paint 핸드오프 (2026-05-20 v18, Phase 5)
///
/// **SoT**: `claudedocs/SPEC_LOADER_IMPECCABLE_2026-05-20.md` §3.4 ·
/// `docs/Design/LOADING_TIMING_POLICY.md`
///
/// **문제 (As-Is)**: Flutter 앱 초기화 완료 시점에 native_splash 가 자동으로 hide
/// 되고, WebView 의 첫 paint 가 아직 도착하지 않은 짧은 구간(50-500ms)에 흰/검은
/// 화면 깜빡임 발생.
///
/// **해결 (To-Be)**:
/// - `FlutterNativeSplash.preserve()` 로 자동 hide 차단
/// - WebView 첫 paint 완료 → Web 측에서 `nativeBridge.ui.signalFirstPaint()` 호출
///   → `WebViewBridge._handleUIRequest` 의 `signalFirstPaint` case → 본 헬퍼 호출
/// - 5초 failsafe Timer — paint 신호가 영원히 안 오는 경우(네트워크 실패, JS 에러
///   등)에도 splash 가 stuck 되지 않도록 보호망
///
/// **Idempotent**: boolean 가드로 정확히 1회만 실행. 중복 호출 시 즉시 return.
bool _nativeSplashRemoved = false;
Timer? _nativeSplashFailsafeTimer;

void removeNativeSplashOnce({String trigger = 'unknown'}) {
  if (_nativeSplashRemoved) return;
  _nativeSplashRemoved = true;
  _nativeSplashFailsafeTimer?.cancel();
  _nativeSplashFailsafeTimer = null;
  try {
    FlutterNativeSplash.remove();
    BootTimeline.instance.mark('native_splash_removed_$trigger');
    debugPrint('[Boot] 🎨 FlutterNativeSplash.remove() · trigger=$trigger');
  } catch (e) {
    debugPrint('⚠️ FlutterNativeSplash.remove() 실패 (trigger=$trigger): $e');
  }
}

void main() {
  // ignore: avoid_print
  print('[Boot] main() 진입');
  BootTimeline.instance.start();
  WidgetsFlutterBinding.ensureInitialized();

  // 🎨 Native splash auto-hide 차단 — WebView 첫 paint 신호까지 유지
  //   SPEC: claudedocs/SPEC_LOADER_IMPECCABLE_2026-05-20.md §3.4
  //   기본 동작은 ensureInitialized 직후 즉시 hide 되므로 반드시 ensureInitialized
  //   호출 직후 한 줄로 preserve 를 등록한다.
  try {
    FlutterNativeSplash.preserve(widgetsBinding: WidgetsBinding.instance);
    BootTimeline.instance.mark('native_splash_preserved');
  } catch (e) {
    // preserve 실패 시 자동 hide 로 폴백 — 기능 안전 우선
    debugPrint('⚠️ FlutterNativeSplash.preserve() 실패 — 자동 hide 로 폴백: $e');
    _nativeSplashRemoved = true;
  }

  // ⏱️ Failsafe — 5초 후에도 signalFirstPaint 가 없으면 강제 hide.
  //   WebView 로드 실패 / JS 에러 / 네트워크 단절 등 극단적 시나리오 대응.
  //   정상 케이스(콜드 스타트 ~2.5s)에서는 signalFirstPaint 가 먼저 도착해 cancel.
  _nativeSplashFailsafeTimer = Timer(const Duration(seconds: 5), () {
    if (!_nativeSplashRemoved) {
      debugPrint('[Boot] ⚠️ Native splash failsafe 5s 도달 — 강제 hide');
      removeNativeSplashOnce(trigger: 'failsafe-5s');
    }
  });

  BootTimeline.instance.mark('widgets_binding_ready');
  // ignore: avoid_print
  print('[Boot] WidgetsBinding ready');

  // 🌍 환경 설정 초기화 (동기 — 매우 빠름)
  // 빌드 시 둘 중 하나로 환경 선택 (대소문자 무시):
  //   --dart-define=APP_ENV=local|home|dev|prod   ← 권장 (README/docs SoT)
  //   --dart-define=ENV=local|dev|prod            ← 동일 효과 (legacy alias)
  // 미지정 시: Debug → LOCAL, Release → PROD (자동 감지)
  //
  // ⚠️ 잘못된 키 (예: NEW_ENV=dev) 는 무시되고 자동 감지로 폴백된다.
  //   release 빌드에서 자동 감지는 PROD 로 떨어지므로, dev 서버 의도라면
  //   반드시 APP_ENV 또는 ENV 키를 사용해야 한다.
  const envFromAppEnv = String.fromEnvironment('APP_ENV', defaultValue: '');
  const envFromEnv = String.fromEnvironment('ENV', defaultValue: '');
  final envRaw = envFromAppEnv.isNotEmpty ? envFromAppEnv : envFromEnv;
  final envMap = {
    'local': EnvironmentType.local,
    'home': EnvironmentType.home,
    'dev': EnvironmentType.dev,
    'development': EnvironmentType.dev,
    'prod': EnvironmentType.prod,
    'production': EnvironmentType.prod,
  };
  EnvironmentType? forced;
  if (envRaw.isNotEmpty) {
    forced = envMap[envRaw.toLowerCase()];
    if (forced == null) {
      // ignore: avoid_print
      print(
        '[Boot] ⚠️ Unknown env value "$envRaw" '
        '(APP_ENV/ENV expects local|home|dev|prod) — falling back to auto detect.',
      );
    }
  } else {
    // ignore: avoid_print
    print(
      '[Boot] ℹ️ No APP_ENV/ENV dart-define detected — '
      'auto detect by build mode (release→PROD, debug→LOCAL). '
      'Hint: --dart-define=APP_ENV=dev for dev server.',
    );
  }
  AppEnvironment.instance.initialize(forceEnvironment: forced);
  // [보안 2026-06-07] release 로그에 백엔드 인프라(api/web URL) 노출 방지 — 디버그에서만 출력
  if (kDebugMode) {
    // ignore: avoid_print
    print(
      '[Boot] env=${AppEnvironment.instance.config.type.name} '
      'api=${AppEnvironment.instance.config.apiBaseUrl} '
      'web=${AppEnvironment.instance.config.webAppUrl}',
    );
  }

  // 세로 모드 + StatusBar
  unawaited(SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]));
  // [수정 2026-05-19 v12] 시스템 UI 모드: splash → 로그인 동안 statusbar 영역
  //   완전 숨김. 이전엔 Android=edgeToEdge, iOS=manual+[top,bottom] 호출로 매번
  //   statusbar 가 표시 모드로 강제되어 InitialDestinationGate 의 hide 명령과
  //   race 깜빡임 유발. 첫 호출부터 manual+[bottom] 로 통일하여 race 0.
  //   대시보드 등 일반 페이지 진입 시 해당 페이지의 useNativeUI({ showStatusBar:
  //   true }) 가 setEnabledSystemUIMode(manual+[top,bottom]) 으로 자연 복원.
  unawaited(SystemChrome.setEnabledSystemUIMode(
    SystemUiMode.manual,
    overlays: const [SystemUiOverlay.bottom],
  ));

  // 🎨 글로벌 StatusBar / NavigationBar 스타일 SoT — splash 청색 톤으로 통일.
  //   InitialDestinationGate._splashOverlayStyle 와 1:1 매칭하여 race 없음.
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light, // 어두운 청색 배경 → 흰 icons
    statusBarBrightness: Brightness.dark, // iOS: 어두운 배경
    systemNavigationBarColor: Color(0xFF1E40AF),
    systemNavigationBarIconBrightness: Brightness.light,
    // [2026-05-26] divider 투명화 — navbar 배경 청색 위 1px 줄무늬 잔존 방지.
    //   app.dart 글로벌 SoT(Colors.transparent)와 정렬.
    systemNavigationBarDividerColor: Colors.transparent,
  ));

  // 🚀 무거운 초기화는 백그라운드로 — runApp 을 막지 않음
  // Splash 는 첫 사용 지점에서 `await deferredInitFuture` 로 안전하게 대기
  deferredInitFuture = _deferredInit();

  // ⚡ Round 4: Preload 조기화 — Splash 마운트(200ms+)를 기다리지 않고
  //    main() 시점에서 AuthBundle 읽기 + Preload 트리거. warm-up 시간을
  //    320ms 이상 추가 확보하여 WebView 마운트 시 캐시 히트율을 높인다.
  //    fire-and-forget, 실패해도 앱 실행 계속.
  _triggerEarlyPreload();

  // 🔐 AuthGuardInterceptor 콜백 등록 — 미로그인 상태에서 인증 필요 API 호출 시
  //    즉시 /login 으로 유도하고 원 경로를 query로 보존.
  //    앱 부팅 시 1회 등록 (싱글톤 ApiClient 기준).
  ApiClient().onAuthRequired = _redirectToLoginFromApi;

  BootTimeline.instance.mark('run_app');
  // ignore: avoid_print
  print('[Boot] runApp 호출 직전');

  // [2026-05-14] Sentry init — SENTRY_DSN dart-define 활성 시에만 실제 전송.
  //   미설정 시 enabled: false → no-op. uncaught exception 자동 캡처 + ApiLifecycle
  //   SLA 위반 자동 보고.
  const sentryDsn = String.fromEnvironment('SENTRY_DSN', defaultValue: '');
  if (sentryDsn.isNotEmpty) {
    SentryFlutter.init(
      (options) {
        options.dsn = sentryDsn;
        options.environment = AppEnvironment.instance.config.type.name;
        options.tracesSampleRate =
            AppEnvironment.instance.config.type == EnvironmentType.prod
                ? 0.1
                : 1.0;
        // 민감 정보 자동 제거 (Authorization 헤더, 카드번호 등)
        options.beforeSend = (event, hint) {
          final req = event.request;
          if (req != null) {
            final headers = Map<String, String>.from(req.headers);
            headers.remove('Authorization');
            headers.remove('authorization');
            headers.remove('Cookie');
            headers.remove('cookie');
            return event.copyWith(
              request: req.copyWith(headers: headers),
            );
          }
          return event;
        };
      },
      appRunner: () => runApp(
        ProviderScope(
          observers: [AppLogProviderObserver()],
          child: const TeamplusApp(),
        ),
      ),
    );
  } else {
    runApp(
      ProviderScope(
        observers: [AppLogProviderObserver()],
        child: const TeamplusApp(),
      ),
    );
  }
  // ignore: avoid_print
  print('[Boot] runApp 호출 완료');

  // 🔔 푸시 알림 탭 → 알림함 이동 (foreground 로컬알림 탭 + background/terminated FCM 탭이
  //   모두 notificationStream 으로 합류). navigatorKey 미준비(콜드스타트 극초기) 시 무시.
  PushNotificationService().notificationStream.listen((_) {
    final ctx = navigatorKey.currentContext;
    if (ctx == null) return;
    try {
      GoRouter.of(ctx).go('/notifications');
    } catch (e) {
      debugPrint('[PushNotification] 알림 라우팅 실패: $e');
    }
  });

  // v8.6 (2026-05-20) — 통합 로깅 시스템 비동기 초기화 (runApp 차단 안 함)
  () async {
    try {
      await AppLogger.instance.initialize(
        backendBaseUrl: ApiConstants.baseUrl,
        platform: kIsWeb ? 'web' : 'app',
      );
    } catch (e) {
      // ignore: avoid_print
      print('[Boot] AppLogger 초기화 실패 (무시): $e');
    }
  }();
}

/// API 전처리 가드에서 미로그인 감지 시 호출되는 글로벌 리다이렉트.
/// - navigatorKey 의 context 가 아직 마운트되지 않았거나 이미 /webview 인 경우 skip
///
/// [2026-05-19] 네이티브 /login 폐기에 따라 /webview 로 통합.
///   InitialDestinationGate 가 token 부재를 감지해 자동으로 Next.js /login/ URL
///   을 WebView 에 로드한다. 원 경로 보존은 WebView 측(Next.js) 에서 처리하므로
///   네이티브 redirect query 는 더 이상 필요하지 않다.
bool _loginRedirectInFlight = false;
void _redirectToLoginFromApi(String requestPath) {
  try {
    final ctx = navigatorKey.currentContext;
    if (ctx == null) return;
    if (_loginRedirectInFlight) return;

    final currentLocation =
        GoRouter.of(ctx).routerDelegate.currentConfiguration.uri.toString();
    // 이미 /webview 에 있다면 InitialDestinationGate 가 알아서 /login/ 로 보냄.
    if (currentLocation.startsWith('/webview')) return;

    _loginRedirectInFlight = true;
    // microtask 로 next frame 에서 이동 — 현재 요청 흐름 완료 후 동작
    // ctx 대신 navigatorKey 를 다시 조회해 async gap 이후 안전성 확보
    Future<void>.microtask(() {
      try {
        final currentCtx = navigatorKey.currentContext;
        if (currentCtx == null) return;
        // ignore: use_build_context_synchronously — navigatorKey.currentContext is a global accessor
        GoRouter.of(currentCtx).go('/webview');
      } finally {
        _loginRedirectInFlight = false;
      }
    });
  } catch (e) {
    _loginRedirectInFlight = false;
    if (kDebugMode) debugPrint('[AuthGuard] redirect failed: $e');
  }
}

/// 앱 시작 즉시 Next.js 번들 Preload 트리거.
/// - AuthBundle 을 미리 읽어 역할별 URL 결정 → 정확한 라우트 chunk warm-up.
/// - runApp 과 병렬 실행되어 첫 프레임 페인트에 영향 없음.
/// - Splash 재진입 시 같은 URL 이면 preload() 자체가 idempotent 이므로 중복 없음.
void _triggerEarlyPreload() {
  unawaited(() async {
    try {
      final bundle = await TokenStorage().readAuthBundle();
      final path = _earlyPreloadPath(bundle.isAuthenticated, bundle.userType);
      final url = '${ApiConstants.webAppUrl}$path';
      BootTimeline.instance.mark('early_preload_triggered');
      await WebViewPreloader.instance.preload(url);
    } catch (e) {
      debugPrint('[main] early preload 실패 (무시): $e');
    }
  }());
}

String _earlyPreloadPath(bool authenticated, String? userType) {
  // [hotfix 2026-05-14] trailing slash 추가 — next.config trailingSlash:true 로
  //   slash 없는 경로는 308 redirect → WebView reload 반복 유발. 처음부터 slash 포함.
  if (!authenticated || userType == null) return '/login/';
  switch (userType.toLowerCase()) {
    case 'parent':
      return '/parent/';
    case 'coach':
      return '/coach/';
    case 'admin':
      return '/admin/';
    case 'director':
      return '/director/';
    case 'child':
    case 'teen':
      return '/child/';
    default:
      return '/login/';
  }
}
