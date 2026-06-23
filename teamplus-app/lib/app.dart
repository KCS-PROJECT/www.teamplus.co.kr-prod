import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/router/app_router.dart';
import 'core/router/deep_link_handler.dart';
import 'core/theme/app_theme.dart';
import 'core/security/app_lock_manager.dart';
import 'core/security/ssl_pinning_service.dart';
import 'core/constants/app_environment.dart';
import 'core/navigation/navigator_key.dart';
import 'core/storage/secure_storage_service.dart';
import 'core/websocket/websocket_service.dart';
import 'core/maintenance/maintenance_service.dart';

/// 앱 테마 모드 Provider (Web ↔ Native 동기화)
/// - Web에서 테마 변경 시 WebViewBridge.onThemeChange 콜백을 통해 업데이트
/// - 기본값: ThemeMode.light (시스템 다크 모드 무시, 라이트 강제)
///   2026-05-19: iOS 시뮬레이터 다크모드에서 본인인증 화면이 검게 표시되는 이슈로 라이트 고정.
/// - Riverpod 3.x: Notifier 패턴 사용 (`.setMode(value)`)
class AppThemeModeNotifier extends Notifier<ThemeMode> {
  @override
  ThemeMode build() => ThemeMode.light;

  void setMode(ThemeMode mode) => state = mode;
}

final appThemeModeProvider =
    NotifierProvider<AppThemeModeNotifier, ThemeMode>(AppThemeModeNotifier.new);

/// 환경별 엔트리포인트에서 호출하는 공통 부트스트랩 함수
Future<void> appMain(EnvironmentType environment) async {
  WidgetsFlutterBinding.ensureInitialized();

  // 환경 설정 초기화
  AppEnvironment.instance.initialize(forceEnvironment: environment);

  // 세로 모드만 허용
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  // 시스템 UI 모드 설정
  // - Android: edge-to-edge 고정 — 시스템 status bar / navigation bar 가
  //   콘텐츠 위에 투명하게 떠 있어 토글로 인한 viewport 변동(밀림 현상)이 없음.
  // - iOS: manual 모드 — native method channel(`com.kr.www.teamplus/status_bar`)로
  //   status bar 가시성 직접 제어 (CustomFlutterViewController.prefersStatusBarHidden).
  await SystemChrome.setEnabledSystemUIMode(
    Platform.isAndroid ? SystemUiMode.edgeToEdge : SystemUiMode.manual,
    overlays: Platform.isAndroid
        ? null
        : [SystemUiOverlay.top, SystemUiOverlay.bottom],
  );

  // 🎨 글로벌 StatusBar / NavigationBar 스타일 SoT (main.dart 와 동일 정책)
  // AppBar 가 없는 화면에서도 StatusBar 아이콘이 항상 보이도록 명시 적용.
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.dark, // Android: status bar 아이콘
    statusBarBrightness: Brightness.light, // iOS: status bar 배경(light bg)
    systemNavigationBarColor: Colors.white,
    systemNavigationBarIconBrightness: Brightness.dark,
    systemNavigationBarDividerColor: Colors.transparent,
  ));

  // SSL Pinning 초기화
  try {
    await SslPinningService().initialize();
  } catch (e) {
    debugPrint('⚠️ SSL Pinning 초기화 실패 (앱 실행은 계속됨): $e');
  }

  // AppLockManager 초기화
  await appLockManager.initialize();

  // DeepLinkHandler 초기화
  await DeepLinkHandler().initialize(navigatorKey: navigatorKey);

  runApp(const ProviderScope(child: TeamplusApp()));
}

/// 앱 루트 위젯 — 라이프사이클(생체인증 잠금 + WebSocket 재연결/해제) SoT.
///
/// **2026-05-20 통합**: 기존 main.dart 의 중복 정의를 제거하고 app.dart 를
/// 단일 SoT 로 통합. main_local/dev/prod.dart (appMain 경유) 와 main.dart
/// (자체 main() 경유) 양쪽 entry point 가 동일한 클래스를 사용한다.
///
/// **라이프사이클 동작**:
/// - `onPause`: 30초 유예 타이머 시작 → 만료 시 WebSocket disconnect.
///   알림 트레이/제어센터 등 짧은 백그라운드 전환에서 불필요한 해제 방지.
/// - `onResume`: 타이머 취소 + 토큰 있을 시 WebSocket 재연결 + 생체인증 잠금 확인.
/// - `dispose`: 타이머 정리 + observer 해제 + WebSocketService dispose.
class TeamplusApp extends ConsumerStatefulWidget {
  const TeamplusApp({super.key});

  @override
  ConsumerState<TeamplusApp> createState() => _TeamplusAppState();
}

class _TeamplusAppState extends ConsumerState<TeamplusApp>
    with WidgetsBindingObserver {
  late AppLifecycleListener _lifecycleListener;
  Timer? _backgroundTimer;

  /// 시스템 점검 차단 알럿 중복 표시 방지 플래그.
  bool _maintenanceDialogShown = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);

    // 🔐 앱 라이프사이클 리스너 등록
    // onHide에서 _onAppPaused 바인딩 제거 — iOS에서 알림 트레이/제어센터만 내려도
    // onHide가 발동하여 WebSocket이 불필요하게 해제되는 문제 방지
    _lifecycleListener = AppLifecycleListener(
      onResume: _onAppResumed,
      onPause: _onAppPaused,
    );
  }

  @override
  void dispose() {
    _backgroundTimer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    _lifecycleListener.dispose();
    WebSocketService().dispose();
    super.dispose();
  }

  /// 앱이 백그라운드로 전환될 때 호출
  void _onAppPaused() {
    debugPrint('[teamplusApp] 앱 백그라운드 전환 — 30초 유예 후 WebSocket 해제');
    // 짧은 백그라운드 전환(알림 드로어, 권한 대화상자)에서 불필요한 해제 방지
    _backgroundTimer?.cancel();
    _backgroundTimer = Timer(const Duration(seconds: 30), () {
      debugPrint('[teamplusApp] 30초 경과 — WebSocket disconnect');
      WebSocketService().disconnect();
    });
  }

  /// 앱이 포그라운드로 돌아올 때 호출
  Future<void> _onAppResumed() async {
    debugPrint('[teamplusApp] 앱 재개됨 - 생체인증 잠금 확인');

    // 백그라운드 타이머 취소 (30초 이내 복귀 시 disconnect 방지)
    _backgroundTimer?.cancel();
    _backgroundTimer = null;

    // 🛠 시스템 점검 재검사 — 사용 도중 점검이 시작됐으면, 기존 단일 GoRouter 로
    //   `/webview` 부팅 게이트를 **새 key 로 재진입**시킨다. 이때 새
    //   `InitialDestinationGate` State 가 생성되어 콜드 부팅과 동일하게
    //   MaintenanceService.check() 를 재실행 → 점검 활성이면 M4(SystemMaintenanceScreen)
    //   를 고정(진입 불가), 점검 종료 시엔 자연스럽게 정상 트리로 fail-through 한다.
    //
    //   설계 근거(왜 위젯 트리 rebirth 가 아니라 GoRouter 재게이트인가):
    //   - 이 앱은 (a) 전역 단일 navigatorKey 를 공유하는 단일 GoRouter,
    //     (b) 전역 WebSocket 싱글톤 구조다. ProviderScope 서브트리를 재생성하면
    //     goRouterProvider 가 재실행되어 **새 GoRouter+Navigator** 가 동일 navigatorKey
    //     로 생성 → `Duplicate GlobalKey` 빨간화면 크래시(app_router.dart:80-94 에
    //     명문화된 시나리오)를 유발하고, TeamplusApp.dispose() → WebSocketService.dispose()
    //     로 싱글톤이 영구 사망(되돌리는 경로 없음)한다.
    //   - `router.go('/webview', extra:{gateKey:UniqueKey()})` 는 **기존 GoRouter 내부
    //     네비게이션**이라 새 GoRouter/Navigator 를 만들지 않고(크래시 회피),
    //     ProviderScope 도 리셋하지 않는다(WebSocket 싱글톤 생존).
    //   - `gateKey`(UniqueKey)는 `/webview` builder 에서 InitialDestinationGate 의 key
    //     로 전달된다. GoRouter 는 같은 location 의 MaterialPage 를 page key 로 재사용할
    //     수 있으나, 그 안의 게이트 위젯 key 가 매번 달라지므로 Flutter 의 element
    //     reconciliation 규칙상 기존 State 가 폐기되고 **새 State 가 강제 생성**된다.
    //
    //   순서: WebSocket 재연결/생체인증보다 **먼저** 수행하여, 점검 활성 시 불필요한
    //     재연결·잠금 프롬프트를 피한다. 재진입은 라이프사이클 이벤트가 아니므로
    //     _onAppResumed 를 재유발하지 않는다(무한 루프 없음).
    //   네트워크 실패 시 MaintenanceService fail-open → isUnderMaintenance=false →
    //     아래 정상 흐름(WebSocket 재연결 + 생체인증)으로 진행.
    final maintenance = await ref.read(maintenanceServiceProvider).check();
    if (maintenance.isUnderMaintenance) {
      try {
        // 새 key 게이트로 재진입 → InitialDestinationGate 재마운트 → 점검 재검사 → M4.
        final router = ref.read(goRouterProvider);
        router.go('/webview', extra: {'gateKey': UniqueKey()});
      } catch (_) {
        // router 접근 불가 등 예외 → 폴백: 닫기 불가 차단 다이얼로그로 진입 차단 보장.
        await _showMaintenanceBlockingDialog(maintenance);
      }
      return;
    }

    // WebSocket 재연결 (토큰 유효성 확인 후)
    final wsService = WebSocketService();
    if (!wsService.isConnected) {
      debugPrint('[teamplusApp] WebSocket 재연결 — 토큰 유효성 확인');
      final storage = SecureStorageService();
      final token = await storage.getAccessToken();
      if (token != null) {
        // 토큰이 있으면 재연결 (만료 시 서버에서 token_expired 이벤트 수신 → 자동 갱신)
        wsService.connect(namespace: 'notifications');
      } else {
        debugPrint('[teamplusApp] 토큰 없음 — WebSocket 재연결 스킵');
      }
    }

    // 생체인증 잠금이 필요한지 확인
    final shouldLock = await appLockManager.shouldShowBiometricLock();

    if (shouldLock && mounted) {
      // 생체인증 프롬프트 표시
      final router = ref.read(goRouterProvider);

      router.pushNamed(
        'biometric-lock',
        extra: {
          'title': '생체인증',
          'message': '앱을 사용하기 위해 생체인증이 필요합니다.',
          'onSuccess': () {
            debugPrint('[teamplusApp] 생체인증 성공 - 앱 잠금 해제');
            appLockManager.unlockAppAfterBiometric();
            if (mounted) {
              Navigator.of(context).pop();
            }
          },
          'onCancel': () {
            debugPrint('[teamplusApp] 생체인증 취소');
            // 취소 시 WebView 로 리다이렉트.
            // [2026-05-19] 네이티브 /login 폐기 — InitialDestinationGate 가
            //   token 부재 시 자동으로 Next.js /login/ URL 을 WebView 에 로드.
            router.go('/webview');
          },
          'showCancel': true,
        },
      );
    }
  }

  /// 시스템 점검 차단 알럿 — 닫을 수 없는 모달(앱을 닫도록 안내).
  ///
  /// **용도(폴백)**: 정상 경로는 `_onAppResumed` 가 `/webview` 부팅 게이트를 새 key 로
  /// 재진입시켜 M4(SystemMaintenanceScreen)를 고정하는 것이다. 이 다이얼로그는 그
  /// 재진입이 불가능한 예외 상황(`goRouterProvider` 접근 실패 등)에서만 호출되는
  /// 폴백 경로로, 어떤 경우에도 사용자가 점검 중 진입하지 못하도록 보장한다.
  ///
  /// `barrierDismissible: false` + `PopScope(canPop: false)` + 버튼 없음 →
  /// 어떤 방법으로도 닫을 수 없어, 사용 도중 점검이 시작되면 사용자가
  /// 더 이상 앱을 진행할 수 없다 (goal: "앱을 닫아 주세요").
  Future<void> _showMaintenanceBlockingDialog(MaintenanceStatus status) async {
    if (_maintenanceDialogShown) return;
    final dialogContext = navigatorKey.currentContext;
    if (dialogContext == null) return;
    _maintenanceDialogShown = true;

    // 관리자가 등록한 공지 제목·내용을 그대로 표시(동적). 없으면 기본 문구.
    final title = (status.title != null && status.title!.isNotEmpty)
        ? status.title!
        : '시스템 점검 중';
    final body = (status.content != null && status.content!.isNotEmpty)
        ? '${status.content!}\n\n앱을 닫아 주세요.'
        : '서비스 점검이 진행 중입니다.\n점검이 끝난 뒤 다시 이용해 주세요.\n앱을 닫아 주세요.';

    await showDialog<void>(
      context: dialogContext,
      barrierDismissible: false,
      useRootNavigator: true,
      builder: (ctx) => PopScope(
        canPop: false,
        child: AlertDialog(
          title: Text(title),
          // 내용이 길어도 다 볼 수 있게 스크롤 처리.
          content: SingleChildScrollView(child: Text(body)),
        ),
      ),
    );
    // 버튼이 없어 정상 경로로는 닫히지 않지만, 방어적으로 플래그 복원.
    _maintenanceDialogShown = false;
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(goRouterProvider);
    final themeMode = ref.watch(appThemeModeProvider);

    return MaterialApp.router(
      title: '팀플러스',
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: themeMode,
      routerConfig: router,
      debugShowCheckedModeBanner: false,
      // ♿ 접근성: 시스템 폰트 크기(Dynamic Type / Android font scale) 존중 +
      //   극단치(0.85~1.4)로 제한해 레이아웃 깨짐 방지.
      //   iOS VoiceOver / Android TalkBack 자동 채택, Semantics 트리 그대로 유지.
      //
      // ⚠️ 글로벌 NativeBackGuard 미사용:
      //   builder 위치는 Router 외부 → BackButtonListener / PopScope 모두 미작동
      //   (BackButtonListener 는 Router.of(context) null check 부팅 즉시 fail).
      //   대신 stack 루트 네이티브 페이지에 직접 wrap 한다 (dashboard/coach-dashboard).
      builder: (context, child) {
        final mq = MediaQuery.of(context);
        final systemScale = mq.textScaler.scale(1.0);
        final clamped = systemScale.clamp(0.85, 1.4);
        return MediaQuery(
          data: mq.copyWith(textScaler: TextScaler.linear(clamped)),
          child: child ?? const SizedBox.shrink(),
        );
      },
    );
  }
}
