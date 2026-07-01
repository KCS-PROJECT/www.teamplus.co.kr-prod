import 'dart:async';
import 'dart:collection';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb, kDebugMode;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../router/deep_link_handler.dart';
import 'package:url_launcher/url_launcher.dart';
import '../constants/api_constants.dart';
import '../auth/token_storage.dart';
import '../diagnostics/boot_timeline.dart';
import '../theme/colors.dart';
import 'webview_bridge.dart';
import 'webview_preloader.dart';
import '../../app.dart' show appThemeModeProvider;
import '../../shared/widgets/teamplus_bottom_nav.dart';
import '../../shared/widgets/debug_error_dialog.dart';
import '../../shared/widgets/native_back_guard.dart';

part 'webview_screen_url_handlers.dart';
part 'webview_screen_bridge_script.dart';
part 'webview_screen_helpers.dart';

/// tbot 테스트 하네스용 초기 URL (dart-define INITIAL_URL).
/// 기본값은 빈 문자열 — 릴리스 빌드에서는 영향 없음.
/// tbot 러너가 `flutter run --dart-define INITIAL_URL=<seed>` 로 주입하면
/// WebView 가 해당 URL 로 최초 진입하여 `__auth_seed` 기반 자동 로그인에 사용된다.
const String _kTbotInitialUrl = String.fromEnvironment('INITIAL_URL');

/// WebView 화면 상태
enum WebViewState {
  loading,
  loaded,
  error,
}

/// WebView 화면
class WebViewScreen extends ConsumerStatefulWidget {
  final String? initialUrl;
  final String title;
  final bool showAppBar;
  final bool showBottomNav; // 네이티브 BottomNav 표시 여부
  final UserType? userType; // 사용자 타입 (BottomNav 구성용)
  /// StatusBar 초기 표시 여부.
  ///
  /// 기본 true. `InitialDestinationGate` 가 splash → 로그인 진입 시 false 로
  /// 전달해 statusbar 자체를 가려 transition 깜빡임을 시각적으로 제거한다.
  /// 페이지가 `useNativeUI({ showStatusBar: true })` 호출하면 자동 복원.
  final bool initialShowStatusBar;

  /// Scaffold 초기 backgroundColor.
  ///
  /// 기본 null → 라이트/다크 모드 default 사용. `InitialDestinationGate` 가
  /// splash 청색(#1E40AF) 으로 전달하면 splash → WebView 전환 시 Scaffold 가
  /// 흰색으로 잠깐 보이는 백화 깜빡임을 제거. Web 측에서 `useNativeUI({
  /// scaffoldBackgroundColor })` 호출하면 그 값이 우선.
  final Color? initialScaffoldBackgroundColor;
  // ============================================================
  // MainShellScreen 연동용 콜백 (외부 AppBar/네비게이션 제어)
  // ============================================================
  /// Web에서 요청한 헤더/UI 상태를 상위 위젯으로 전달
  /// - 예: title, showBack, showMenu, hideAll 등
  final void Function(Map<String, dynamic> data)? onHeaderUpdate;

  /// Web에서 요청한 네비게이션 액션을 상위 위젯으로 전달
  /// - 예: navigate, backPressed 등
  final void Function(String action, dynamic data)? onNavigationAction;

  const WebViewScreen({
    super.key,
    this.initialUrl,
    this.title = 'TEAMPLUS',
    this.showAppBar = false, // 하이브리드 앱에서는 기본적으로 AppBar 숨김
    this.showBottomNav = true, // 기본적으로 BottomNav 표시
    this.userType,
    this.initialShowStatusBar = true,
    this.initialScaffoldBackgroundColor,
    this.onHeaderUpdate,
    this.onNavigationAction,
  });

  @override
  ConsumerState<WebViewScreen> createState() => WebViewScreenState();
}

/// `MainShellScreen` 등 외부에서 `GlobalKey<WebViewScreenState>`로 접근할 수 있도록
/// State 클래스를 public 으로 노출합니다.
class WebViewScreenState extends ConsumerState<WebViewScreen>
    with WidgetsBindingObserver {
  // UniqueKey 대신 ValueKey를 사용하여 플랫폼 뷰 충돌 방지
  // 각 WebViewScreen 인스턴스마다 고유한 ID 생성
  late final String _viewId;
  InAppWebViewController? webViewController;
  WebViewBridge? _bridge;
  PullToRefreshController? pullToRefreshController;
  final TokenStorage _tokenStorage = TokenStorage();
  bool _isDisposed = false; // dispose 상태 추적

  // Scaffold 키 (Drawer 제어용)
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();

  // 사용자 정보 (Drawer용)
  String? _userName;
  String? _userEmail;

  // Drawer 위치 ('left' | 'right')
  String _drawerPosition = 'right';

  WebViewState _state = WebViewState.loading;
  String? _errorMessage;
  String? _errorTechnicalDetails; // 디버그용 기술적 상세 정보
  int? _errorStatusCode; // HTTP 상태 코드
  bool _hasCheckedAuth = false; // 인증 체크 중복 방지 플래그
  Timer? _bootFallbackTimer;
  // [2026-05-14] 파란 풀스크린 로딩 페일세이프 — Web 측 `ui.stopLoading()` 호출이
  //   누락/지연되어 `_state = WebViewState.loading` 이 영구 stuck 되는 회귀 차단.
  //   `_state = loading` 진입 시 5초 타이머 시작 → 만료 시 강제 loaded 전환.
  //   `_state = loaded`/`error` 진입 시 timer 취소.
  Timer? _loadingFailsafeTimer;
  String _lastLoadedPath = 'unknown';

  /// 메인 프레임 에러를 사용자에게 노출하기 전 디바운스 (2026-05-11).
  ///
  /// 스플래시 → 온보딩 → /login 으로의 초기 진입 시 iOS WKWebView 가
  /// `controller.loadUrl` 의 연속 호출 / Next.js layout redirect 로 인해
  /// 무해한 cancel/interrupt 에러를 onReceivedError 로 보내는데, 즉시 setState
  /// 하면 에러 화면이 한 프레임 깜빡인다. 350ms 안에 onLoadStart 가
  /// 재호출되면 (= 새 페이지 로딩 시작) 타이머를 취소하여 에러 화면을 표시
  /// 하지 않는다.
  Timer? _errorDebounceTimer;
  static const Duration _kErrorGraceWindow = Duration(milliseconds: 350);

  // BottomNav 관련 상태
  UserType? _userType;
  int _currentNavIndex = 2; // 기본값: 홈 (중앙)
  String? _currentPath;

  // UI 제어 상태 (Web에서 제어 가능)
  // 기본 화면은 첫 프레임부터 StatusBar를 표시한다. 명시적인 fullscreen/loading
  // 브릿지 요청에서만 숨겨 iOS에서 상단 safe-area가 뒤늦게 생기는 레이아웃 점프를 막는다.
  // [2026-05-19 v9] initialShowStatusBar prop 으로 첫 frame 시점 statusbar 가시성
  //   결정 — InitialDestinationGate 가 false 로 전달하면 splash → 로그인 동안 숨김.
  late bool _showStatusBar = widget.initialShowStatusBar;
  bool _showAppBarDynamic = false; // 동적 AppBar 표시 (웹에서 제어)
  late bool _showBottomNavDynamic; // widget.showBottomNav으로 초기화
  String? _dynamicAppBarTitle;

  // AppBar 버튼 제어 상태
  bool _showBackButton = false; // 뒤로가기 버튼 (<)
  bool _showMenuButton = false; // 햄버거 메뉴 버튼
  String _menuButtonPosition = 'left'; // 메뉴 버튼 위치 ('left' | 'right')
  bool _showRefreshButton = false; // 새로고침 버튼 (pull-to-refresh로 대체)
  Color? _appBarColor; // AppBar 커스텀 색상
  Color? _statusBarColor; // StatusBar 커스텀 색상 (Android only)
  Color? _navigationBarColor; // System navigation bar 색 (Android)
  // [수정 2026-05-19 v10] initialScaffoldBackgroundColor prop 으로 첫 frame
  //   시점 Scaffold 배경색 결정 — InitialDestinationGate 가 splash 청색을
  //   전달하면 splash → WebView 전환 시 백화 깜빡임 제거.
  late Color? _scaffoldBackgroundColor =
      widget.initialScaffoldBackgroundColor; // Safe-area Scaffold 배경색 override

  // Scrim 오버레이 — iOS/Android 공통으로 Status Bar · Safe Area · System Navigation Bar
  // 전 영역을 dim 처리하기 위해 Scaffold body 위에 IgnorePointer Container를 얹는다.
  bool _showScrim = false;
  static const Color _defaultScrimColor = Color(0xB3020617); // slate-950 @ 70%
  Color _scrimColor = _defaultScrimColor;
  Color? _scrimBottomColor;

  // 2026-05-16: BottomSheet 모드에서 하단 home indicator dim 비활성을 위한 분기 플래그.
  //   기본 true — Modal/Popup 은 상하단 모두 dim. BottomSheet 는 Web 측에서
  //   `useNativeScrim(isOpen, color, { bottom: false })` 호출 시 false 로 전환되어
  //   하단 Positioned scrim 렌더링을 스킵한다.
  //   SoT: docs/Design/MODAL_DIM_POLICY.md
  bool _scrimBottom = true;

  /// Web 측이 명시적으로 설정한 PullToRefresh override (2026-05-13 신규 — 이슈 D15).
  ///
  /// - `null` : Web 미설정 — `_syncPullToRefreshEnabled` 의 URL 기반 자동 정책 적용
  ///            (인증/온보딩 = 비활성, 그 외 = 활성)
  /// - `true` : 강제 활성화 (URL 무관)
  /// - `false`: 강제 비활성화 (의도치 않은 reload 방지)
  ///
  /// Web → `useNativeUI({ pullToRefreshEnabled: ... })` 또는
  /// Web → `ui.setPullToRefresh(...)` 호출 시 갱신.
  /// 페이지 전환 시 `_resetUIToDefault()` 가 null 로 복원하여 다음 페이지가 자체 옵션을
  /// 다시 명시할 수 있게 한다.
  bool? _pullToRefreshOverride;

  /// FlutterBridge 주입 스크립트 (페이지 로드 전 실행)
  late final UnmodifiableListView<UserScript> _initialUserScripts;

  @override
  void initState() {
    super.initState();
    BootTimeline.instance.mark('webview_init_state');

    // 🔧 고유한 뷰 ID 생성 (플랫폼 뷰 충돌 방지)
    // DateTime과 hashCode를 조합하여 중복되지 않는 ID 생성
    _viewId = 'webview_${DateTime.now().microsecondsSinceEpoch}_$hashCode';
    _showBottomNavDynamic = widget.showBottomNav;
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      BootTimeline.instance.mark('native_first_frame');
    });
    debugPrint(
        '[WebView] 초기화: viewId=$_viewId, showBottomNav=${widget.showBottomNav}');

    // 딥링크 수신 시 기존 WebView 내에서 Next.js 라우팅 수행
    DeepLinkHandler.onNavigateInWebView = _handleDeepLinkNavigation;

    // ⚡ Splash 에서 같은 URL 을 preload 했다면 캐시에 Next.js 자산이
    // 이미 적재된 상태 — InAppWebView 는 같은 WebView 데이터스토어를 공유하므로
    // 대기 없이 즉시 캐시 히트로 페인트. 최대 500ms 대기 후 즉시 진행.
    WebViewPreloader.instance.waitForCompletion().timeout(
      const Duration(milliseconds: 500),
      onTimeout: () {
        debugPrint('[WebView] preload wait 500ms timeout — 즉시 진행');
      },
    ).then((_) {
      debugPrint('[WebView] ✅ preload 캐시 준비 완료 (또는 이미 없음)');
    });

    // 🚀 즉시 StatusBar 상태 적용
    // 첫 프레임부터 status bar 영역을 안정적으로 유지하고, 명시적 fullscreen/loading
    // 브릿지 요청에서만 숨긴다.
    _updateStatusBar();

    // FlutterBridge 주입 스크립트 초기화 (DOCUMENT_START에서 실행)
    _initialUserScripts = UnmodifiableListView([
      UserScript(
        source: _flutterBridgeScript,
        injectionTime: UserScriptInjectionTime.AT_DOCUMENT_START,
      ),
    ]);

    // Pull-to-refresh 컨트롤러 초기화 (웹 플랫폼에서는 미지원)
    //
    // 안전 기본값 enabled=false (2026-05-09):
    //   첫 진입(splash → login)에서 PTR 제스처가 발동되어 reload 되는 경우를 차단.
    //   첫 onLoadStart 콜백에서 URL 을 기준으로 _syncPullToRefreshEnabled() 가 즉시
    //   상태를 동기화한다 (인증/온보딩 화면 = false, 그 외 = true).
    if (!kIsWeb) {
      pullToRefreshController = PullToRefreshController(
        settings: PullToRefreshSettings(
          enabled: false,
          color: AppColors.primary,
          backgroundColor: Colors.white,
        ),
        onRefresh: () async {
          if (webViewController != null) {
            await webViewController!.reload();
          }
        },
      );
    }
  }

  /// PullToRefreshController 의 `enabled` 상태를 현재 URL 에 맞춰 동기화.
  ///
  /// 적용 우선순위 (2026-05-13 — 이슈 D15):
  ///   1. `_pullToRefreshOverride` (Web 측 명시) 가 non-null 이면 그 값을 사용
  ///   2. 그 외에는 URL 기반 자동 정책 — 인증/온보딩 경로 = false, 그 외 = true
  ///
  /// 인증/온보딩 화면에서는 사용자가 화면을 끌어내려도 reload 되지 않도록 비활성화.
  /// flutter_inappwebview 6.x 의 `setEnabled(bool)` 은 Android 는 SwipeRefreshLayout,
  /// iOS 는 UIRefreshControl 의 detach/attach 로 즉시 적용된다.
  Future<void> _syncPullToRefreshEnabled(String? url) async {
    if (kIsWeb) return;
    final controller = pullToRefreshController;
    if (controller == null) return;
    // Web override 우선. null 이면 URL 기반 자동 정책으로 폴백.
    final shouldEnable = _pullToRefreshOverride ?? !_isAuthPathUrl(url);
    try {
      await controller.setEnabled(shouldEnable);
    } catch (e) {
      // 일부 환경(Android 21 미만 등)에서 setEnabled 가 throw 할 수 있음 — 무시.
      debugPrint('[WebView] PullToRefresh setEnabled 실패: $e');
    }
  }

  /// UserType + 사용자 정보 초기화
  ///
  /// ⚡ Cold Start 최적화: 기존 userType/userName/userEmail/drawerPosition 직렬
  /// 4회 I/O → TokenStorage.readAuthBundle() 의 단일 병렬 배치 로드.
  /// Splash 단계에서 이미 캐싱된 경우 추가 I/O 없이 즉시 반환됨.
  Future<void> _initUserType() async {
    if (_isDisposed) return;

    // UserType 결정 (props 우선, 없으면 AuthBundle)
    if (widget.userType != null) {
      if (mounted && !_isDisposed) {
        setState(() {
          _userType = widget.userType;
        });
      }
      // 그래도 Drawer 정보는 필요하므로 bundle 로드
    }

    try {
      final bundle = await _tokenStorage.readAuthBundle();

      if (mounted && !_isDisposed) {
        setState(() {
          // [hotfix 2026-05-14] PARENT 강제 fallback 제거 — DIRECTOR/COACH 토큰이 있는데
          //  fromString 이 null 반환(예: 'ACADEMY_DIRECTOR' 등 신규 userType)하면 PARENT 로 강제
          //  진입 → useRequireRole(['parent','admin']) 거부 → /director 재진입 → 무한 루프.
          //  null 유지 시 _getHomePathByUserType() default 가 /login/ 으로 안전 fallback.
          _userType ??= TeamplusBottomNav.fromString(bundle.userType);
          _userName = bundle.userName;
          _userEmail = bundle.userEmail;
          _drawerPosition = bundle.drawerPosition;
        });
      }
    } catch (e) {
      debugPrint('[WebView] 사용자 정보 로드 실패: $e');
      // [hotfix 2026-05-14] 사용자 정보 로드 실패 시 PARENT 강제 설정 제거 —
      //  미인증 또는 잘못된 userType 으로 /parent 진입 시 무한 reload 루프 유발.
      //  null 유지 → _getHomePathByUserType() default 가 /login/ 으로 안전 fallback.
    }
  }

  /// UI 설정 변경 콜백 (Web에서 호출)
  void _onUIConfigChange(UIConfig config) {
    if (_isDisposed) return; // dispose 상태 체크

    debugPrint('[WebView] UI 설정 변경: $config');

    if (!mounted || _isDisposed) return;

    // ============================================================
    // 상위(MainShell 등)로 UI/헤더 상태 전달
    // - WebViewScreen 내부 UI를 쓰지 않는 경우에도, 상위 AppBar를 갱신할 수 있게 함
    // ============================================================
    if (widget.onHeaderUpdate != null) {
      final payload = <String, dynamic>{};

      // 타이틀
      if (config.appBarTitle != null) {
        payload['title'] = config.appBarTitle;
      }

      // AppBar 버튼
      if (config.showBackButton != null) {
        payload['showBack'] = config.showBackButton;
      }
      if (config.showMenuButton != null) {
        payload['showMenu'] = config.showMenuButton;
      }

      // 전체 UI 숨김(전체화면) 요청: AppBar/BottomNav가 모두 false인 경우로 해석
      if (config.showAppBar != null || config.showBottomNav != null) {
        final showAppBar = config.showAppBar ?? true;
        final showBottomNav = config.showBottomNav ?? true;
        payload['hideAll'] = (showAppBar == false && showBottomNav == false);
      }

      if (payload.isNotEmpty) {
        widget.onHeaderUpdate!(payload);
      }
    }

    setState(() {
      // 🚀 클라이언트 사이드 네비게이션 로딩 상태 제어
      if (config.isLoading != null) {
        if (config.isLoading!) {
          BootTimeline.instance.mark('web_loading_started');
          // 로딩 시작: 스피너 표시
          _state = WebViewState.loading;
          // 로딩 중 StatusBar 숨김 (전체화면 로딩 효과)
          _showStatusBar = false;
          _updateStatusBar();
          // [2026-05-14] 페일세이프 — Web 측 stopLoading 누락 시 5초 후 강제 해제.
          //   BottomNav 클릭 후 페이지 데이터 fetch 실패/지연 등으로 stopLoading 이
          //   호출되지 않아 파란 풀스크린이 영구 stuck 되던 회귀 차단.
          _loadingFailsafeTimer?.cancel();
          _loadingFailsafeTimer = Timer(const Duration(seconds: 5), () {
            if (!mounted || _isDisposed) return;
            if (_state != WebViewState.loading) return;
            debugPrint(
              '[WebView] ⚠️ Loading failsafe — 5s timeout, force unload',
            );
            setState(() {
              _state = WebViewState.loaded;
              _showBottomNavDynamic = widget.showBottomNav;
            });
            _updateStatusBar();
          });
        } else {
          _finishBootTimeline('web_app_ready');
          // 로딩 종료: 스피너 숨김
          _state = WebViewState.loaded;
          // 페일세이프 취소 — 정상 stopLoading 호출 시 더 이상 필요 없음
          _loadingFailsafeTimer?.cancel();
          _loadingFailsafeTimer = null;
          // ⚠️ `_showStatusBar = true` 강제 복원 제거 (2026-05-08):
          //   isLoading=false 신호만으로 status bar 를 강제 켜지 않는다. status bar
          //   on/off 는 Web 측 `useNativeUI({ showStatusBar })` 명시 또는
          //   `ui.showStatusBar()` 호출로만 결정 — Web ↔ Native lifecycle 일치.
          //   widget.showBottomNav=false이면 동적 복원 차단
          _showBottomNavDynamic = widget.showBottomNav;
          _updateStatusBar();
        }
      }

      // 상태바 제어
      if (config.showStatusBar != null) {
        _showStatusBar = config.showStatusBar!;
        _updateStatusBar();
      }

      // AppBar 제어
      //
      // MainShellScreen은 WebView를 기본 showAppBar=false로 생성하지만, 탭 허브
      // 화면은 Web의 useNativeUI({ showAppBar: true }) 요청으로 네이티브 AppBar를
      // 복원해야 한다. widget.showAppBar로 동적 활성화를 막으면 BottomNav 탭
      // 진입 시 상단 AppBar가 영구히 사라진다.
      if (config.showAppBar != null) {
        _showAppBarDynamic = config.showAppBar!;
      }

      // AppBar 타이틀 제어
      if (config.appBarTitle != null) {
        _dynamicAppBarTitle = config.appBarTitle;
      }

      // BottomNav 제어 (widget.showBottomNav=false이면 동적 활성화 차단)
      if (config.showBottomNav != null) {
        _showBottomNavDynamic =
            widget.showBottomNav ? config.showBottomNav! : false;
      }

      // 상태바 스타일 제어
      if (config.statusBarLight != null) {
        _setStatusBarStyle(light: config.statusBarLight!);
      }

      // StatusBar 색상 제어 (Android)
      // 키가 JSON에 존재하면 처리 — 값이 null이면 기본값으로 복원
      if (config.hasStatusBarColorKey) {
        _statusBarColor = config.statusBarColor != null
            ? _parseHexColor(config.statusBarColor!)
            : null;
        _applyStatusBarStyle();
      }

      // System Navigation Bar 색상 제어 (Android)
      if (config.hasNavigationBarColorKey) {
        _navigationBarColor = config.navigationBarColor != null
            ? _parseHexColor(config.navigationBarColor!)
            : null;
        _applyStatusBarStyle();
      }

      // Scaffold 배경색 제어.
      //
      // WebView 자체를 반투명으로 덮는 방식은 합성 충돌이 있지만, 불투명 색으로
      // Scaffold safe-area 배경만 맞추는 것은 안전하다. 전체메뉴처럼 BottomNav 를
      // 숨긴 화면에서 하단 home indicator 영역이 기본 회색 배경으로 드러나는 회귀를 막는다.
      if (config.hasScaffoldBackgroundColorKey) {
        _scaffoldBackgroundColor = config.scaffoldBackgroundColor != null
            ? _parseHexColor(config.scaffoldBackgroundColor!)
            : null;
      }

      // Scrim 오버레이 제어 — iOS는 SystemUiOverlayStyle 색상 필드를 무시하므로
      // Stack 위 IgnorePointer Container로 Safe Area 전 영역을 공통 dim 처리한다.
      if (config.showScrim != null) {
        _showScrim = config.showScrim!;
      }
      if (config.scrimColor != null) {
        final parsed = _parseHexColor(config.scrimColor!);
        if (parsed != null) _scrimColor = parsed;
      } else if (config.showScrim == false) {
        // Scrim 해제 시 색상도 기본값으로 리셋
        _scrimColor = _defaultScrimColor;
      }
      if (config.scrimBottomColor != null) {
        _scrimBottomColor = _parseHexColor(config.scrimBottomColor!);
      } else if (config.showScrim == false) {
        _scrimBottomColor = null;
      }
      // 2026-05-16: scrimBottom 분기 — BottomSheet 모드에서 하단 dim 비활성.
      //   null 전달 시 기본값 true 유지(상하단 모두 dim).
      //   showScrim=false 일 때도 _scrimBottom 을 true 로 리셋하여 다음 호출 시
      //   기본 동작 보장.
      if (config.scrimBottom != null) {
        _scrimBottom = config.scrimBottom!;
      } else if (config.showScrim == false) {
        _scrimBottom = true;
      }

      // AppBar 색상 제어
      if (config.appBarColor != null) {
        _appBarColor = _parseHexColor(config.appBarColor!);
      }

      // AppBar 버튼 제어
      if (config.showBackButton != null) {
        _showBackButton = config.showBackButton!;
      }
      if (config.showMenuButton != null) {
        _showMenuButton = config.showMenuButton!;
      }
      if (config.menuButtonPosition != null) {
        _menuButtonPosition = config.menuButtonPosition!;
      }
      if (config.showRefreshButton != null) {
        _showRefreshButton = config.showRefreshButton!;
      }

      // PullToRefresh 정책 (2026-05-13 — 이슈 D15)
      // Web 측이 `pullToRefreshEnabled` 를 명시한 경우, override 를 갱신하고
      // 즉시 setEnabled 을 발사한다. _syncPullToRefreshEnabled 의 다음 호출
      // (URL 변경 시) 에서도 override 가 우선 적용된다.
      if (config.pullToRefreshEnabled != null) {
        _pullToRefreshOverride = config.pullToRefreshEnabled;
        // 현재 URL 컨텍스트로 즉시 반영 (URL 인자는 사용되지 않으므로 _currentPath 전달).
        _syncPullToRefreshEnabled(_currentPath);
      }
    });
  }

  /// iOS native status bar 동적 제어 method channel.
  /// AppDelegate.swift 의 CustomFlutterViewController.prefersStatusBarHidden 을 직접 set.
  static const MethodChannel _iosStatusBarChannel =
      MethodChannel('com.kr.www.teamplus/status_bar');

  /// 상태바 표시/숨김 업데이트
  ///
  /// **Android**: edge-to-edge 모드 고정. 시스템 status bar / navigation bar 가
  /// 항상 콘텐츠 위에 투명하게 떠있고 토글해도 viewport 변동 0 — 로딩 완료 시점에
  /// 콘텐츠가 nav bar 높이만큼 위로 밀려 올라가는 현상 방지. 색상은
  /// `_applyStatusBarStyle()` 가 `statusBarColor` · `systemNavigationBarColor`
  /// 로 동적 매칭.
  ///
  /// **iOS**: 기존 manual 모드 유지. status bar 가시성은 native method channel
  /// (`_iosStatusBarChannel.setHidden`) 로 직접 제어 — iOS 26 + UIScene 환경에서
  /// SystemChrome 한계 회피용.
  void _updateStatusBar() {
    if (Platform.isAndroid) {
      // [수정 2026-05-19 v9] _showStatusBar=false 인 경우 manual + [bottom] 으로
      //   statusbar 영역을 OS 차원에서 숨긴다. 이전엔 _showStatusBar 와 무관하게
      //   edgeToEdge 만 호출해 InitialDestinationGate 의 hide 가 즉시 풀려
      //   splash → 로그인 전환 시 statusbar 가 빠르게 깜빡였다.
      if (!_showStatusBar) {
        SystemChrome.setEnabledSystemUIMode(
          SystemUiMode.manual,
          overlays: const [SystemUiOverlay.bottom],
        );
        return;
      }
      // 표시 모드: edge-to-edge 유지 — Bottom Safe Area / Home Indicator 영역이
      // 콘텐츠와 함께 같은 위치에 머물러 페인팅 안정.
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
      _applyStatusBarStyle();
      return;
    }

    // iOS: status bar 표시/숨김 manual 토글
    if (_showStatusBar) {
      SystemChrome.setEnabledSystemUIMode(
        SystemUiMode.manual,
        overlays: [SystemUiOverlay.top, SystemUiOverlay.bottom],
      );
      _applyStatusBarStyle();
      _iosStatusBarChannel
          .invokeMethod<bool>('setHidden', false)
          .catchError((_) => false);
    } else {
      // Flutter SystemChrome 은 iOS 26 + UIScene 환경에서 status bar 시스템 아이콘
      // (시계/Wi-Fi/배터리) 을 안 숨겨주는 한계가 있음 → native method channel 로
      // CustomFlutterViewController 의 prefersStatusBarHidden=true 직접 set.
      SystemChrome.setEnabledSystemUIMode(
        SystemUiMode.manual,
        overlays: const [],
      );
      _iosStatusBarChannel
          .invokeMethod<bool>('setHidden', true)
          .catchError((_) => false);
    }
  }

  /// 앱 테마 모드 기반으로 다크모드 여부 판단
  /// appThemeModeProvider를 우선 확인하고, system 모드일 때만 OS 밝기 사용
  bool _resolveIsDarkMode() {
    final appThemeMode = ref.read(appThemeModeProvider);
    if (appThemeMode == ThemeMode.dark) return true;
    if (appThemeMode == ThemeMode.light) return false;
    // ThemeMode.system → OS 밝기 기준
    return WidgetsBinding.instance.platformDispatcher.platformBrightness ==
        Brightness.dark;
  }

  /// StatusBar 스타일 적용 (콘텐츠 배경과 통일)
  void _applyStatusBarStyle() {
    final isDarkMode = _resolveIsDarkMode();

    // 기본 배경색 결정
    final defaultBgColor = isDarkMode
        ? AppColors.contentBackgroundDark
        : AppColors.contentBackground;

    // 커스텀 StatusBar 색상이 설정되어 있으면 사용
    final statusBarBgColor = _statusBarColor ?? defaultBgColor;

    // StatusBar 색상이 밝은지 어두운지 판단 (아이콘 색상 결정용)
    final isStatusBarBright = _isColorBright(statusBarBgColor);

    // NavigationBar(Android) 색상: 커스텀 있으면 우선, 없으면 기본 콘텐츠 배경
    final navBarBgColor = _navigationBarColor ?? defaultBgColor;
    final isNavBarBright = _isColorBright(navBarBgColor);

    SystemChrome.setSystemUIOverlayStyle(
      SystemUiOverlayStyle(
        // StatusBar 배경색: 커스텀 또는 기본
        statusBarColor: statusBarBgColor,
        // StatusBar 아이콘 색상: 배경 밝기에 따라 반전
        statusBarIconBrightness:
            isStatusBarBright ? Brightness.dark : Brightness.light,
        statusBarBrightness:
            isStatusBarBright ? Brightness.light : Brightness.dark,
        // NavigationBar (Android) 색상: 커스텀 또는 기본
        systemNavigationBarColor: navBarBgColor,
        systemNavigationBarIconBrightness:
            isNavBarBright ? Brightness.dark : Brightness.light,
        // [2026-05-26] navigation bar 상단 1px divider 제거.
        //   splash 단계(main.dart / InitialDestinationGate._splashOverlayStyle)가
        //   divider 를 청색(#1E40AF)으로 설정하는데, _hideSplash 가 false 로 고정되어
        //   splash AnnotatedRegion 이 잔존하므로 명시적으로 transparent 를 적용하지
        //   않으면 WebView 화면 하단(Bottom Safe Area 상단)에 청색 줄무늬가 남는다.
        //   app.dart 글로벌 SoT(Colors.transparent)와 정렬.
        systemNavigationBarDividerColor: Colors.transparent,
      ),
    );
  }

  /// 상태바 스타일 설정 (밝은/어두운) - Web에서 호출 시 사용
  void _setStatusBarStyle({required bool light}) {
    SystemChrome.setSystemUIOverlayStyle(
      light
          ? SystemUiOverlayStyle.light // 흰색 아이콘 (어두운 배경용)
          : SystemUiOverlayStyle.dark, // 검정 아이콘 (밝은 배경용)
    );
  }

  /// AppBar 뒤로가기 버튼 클릭 핸들러
  void _onBackButtonPressed() {
    debugPrint('[WebView] AppBar 뒤로가기 버튼 클릭');
    _bridge?.sendAppBarEventToWeb('back');
  }

  /// AppBar 햄버거 메뉴 버튼 클릭 핸들러
  /// Drawer를 열고, Web에도 이벤트 전송
  void _onMenuButtonPressed() {
    debugPrint('[WebView] AppBar 메뉴 버튼 클릭 - Drawer 열기 (위치: $_drawerPosition)');

    // Drawer 위치에 따라 열기
    if (_drawerPosition == 'right') {
      if (_scaffoldKey.currentState?.hasEndDrawer == true) {
        _scaffoldKey.currentState?.openEndDrawer();
      }
    } else {
      if (_scaffoldKey.currentState?.hasDrawer == true) {
        _scaffoldKey.currentState?.openDrawer();
      }
    }

    // Web에도 이벤트 전송 (선택사항)
    _bridge?.sendAppBarEventToWeb('menu');
  }

  /// AppBar 새로고침 버튼 클릭 핸들러
  void _onRefreshButtonPressed() async {
    debugPrint('[WebView] AppBar 새로고침 버튼 클릭');
    _bridge?.sendAppBarEventToWeb('refresh');
    // 기본 동작: WebView 새로고침
    await webViewController?.reload();
  }

  /// AppBar Leading 위젯 빌드 (뒤로가기 또는 왼쪽 햄버거 메뉴)
  Widget? _buildAppBarLeading() {
    // 뒤로가기 버튼 우선
    if (_showBackButton) {
      return IconButton(
        icon: const Icon(Icons.arrow_back_ios_new),
        onPressed: _onBackButtonPressed,
        tooltip: '뒤로가기',
      );
    }

    // 햄버거 메뉴 버튼 (왼쪽 위치일 때만)
    if (_showMenuButton && _menuButtonPosition == 'left') {
      return IconButton(
        icon: const Icon(Icons.menu),
        onPressed: _onMenuButtonPressed,
        tooltip: '메뉴',
      );
    }

    return null;
  }

  /// AppBar Actions 위젯 빌드 (새로고침, 오른쪽 메뉴 버튼 등)
  List<Widget> _buildAppBarActions() {
    final actions = <Widget>[];

    // 새로고침 버튼
    if (_showRefreshButton) {
      actions.add(
        IconButton(
          icon: const Icon(Icons.refresh),
          onPressed: _onRefreshButtonPressed,
          tooltip: '새로고침',
        ),
      );
    }

    // 햄버거 메뉴 버튼 (오른쪽 위치일 때)
    if (_showMenuButton && _menuButtonPosition == 'right') {
      actions.add(
        IconButton(
          icon: const Icon(Icons.menu),
          onPressed: _onMenuButtonPressed,
          tooltip: '메뉴',
        ),
      );
    }

    return actions;
  }

  /// BottomNav 탭 클릭 핸들러
  /// 🔧 loadUrl() 대신 JavaScript를 통한 클라이언트 사이드 네비게이션 사용
  /// - loadUrl()은 전체 페이지 새로고침을 유발하여 SPA 상태가 초기화됨
  /// - evaluateJavascript()로 Next.js router.push()를 호출하여 SPA 네비게이션 유지
  void _onBottomNavTap(int index, String href) {
    debugPrint('[WebView] BottomNav tap: index=$index, href=$href');

    // 현재 경로와 같으면 무시 (불필요한 네비게이션 방지)
    if (_currentPath == href) {
      debugPrint('[WebView] Same path, skipping navigation');
      return;
    }

    setState(() {
      _currentNavIndex = index;
      _currentPath = href;
    });

    // 🚀 클라이언트 사이드 네비게이션 개선
    final fullUrl = '${ApiConstants.webAppUrl}$href';

    webViewController?.evaluateJavascript(source: '''
      (function() {
        const path = '$href';
        const fullUrl = '$fullUrl';
        console.log('[FlutterBridge] Attempting navigation to:', path);

        // 방법 1: FlutterBridge의 teamplusNavigate 함수 사용 (Next.js SPA 유지)
        if (window.teamplusNavigate) {
          window.teamplusNavigate(path);
          return;
        }

        // 방법 2: Next.js router 직접 접근 (폴백)
        if (window.__NEXT_ROUTER_PUSH__) {
          window.__NEXT_ROUTER_PUSH__(path);
          return;
        }

        // 방법 3: history.pushState (절대 경로 사용으로 SecurityError 방지)
        try {
          console.log('[FlutterBridge] Using history.pushState with full URL');
          window.history.pushState({}, '', fullUrl);
          window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
        } catch (e) {
          console.error('[FlutterBridge] pushState failed, using location.href:', e);
          // 방법 4: 최후의 수단 (전체 페이지 새로고침)
          window.location.href = fullUrl;
        }
      })();
    ''');
  }

  /// URL에서 경로 추출 및 현재 네비게이션 인덱스 업데이트
  void _updateNavIndexFromUrl(WebUri? url) {
    if (url == null || _userType == null) return;

    final urlString = url.toString();
    final baseUrl = ApiConstants.webAppUrl;

    // baseUrl 제거하여 경로만 추출
    String path = urlString.replaceFirst(baseUrl, '');
    if (path.isEmpty) path = '/';

    // 쿼리 파라미터 제거
    final queryIndex = path.indexOf('?');
    if (queryIndex != -1) {
      path = path.substring(0, queryIndex);
    }

    debugPrint('[WebView] URL 경로: $path');

    // 페이지 전환 시 UI 기본값으로 복원 (웹에서 useNativeUI로 덮어씌움)
    if (_currentPath != null && _currentPath != path) {
      _resetUIToDefault();
    }

    // 임시 teamplusBottomNav 인스턴스로 navItems 가져오기
    final tempNav = TeamplusBottomNav(
      userType: _userType!,
      currentIndex: 0,
      onTap: (_, __) {},
    );
    final navItems = tempNav.navItems;

    // 경로에 해당하는 인덱스 찾기
    int newIndex = 2; // 기본값: 홈 (중앙)
    for (int i = 0; i < navItems.length; i++) {
      if (path == navItems[i].href || path.startsWith('${navItems[i].href}/')) {
        newIndex = i;
        break;
      }
    }

    if (_currentNavIndex != newIndex || _currentPath != path) {
      if (mounted && !_isDisposed) {
        setState(() {
          _currentNavIndex = newIndex;
          _currentPath = path;
        });
      }
    }
  }

  /// UI를 기본값으로 복원
  void _resetUIToDefault() {
    if (_isDisposed) return; // dispose 상태 체크

    debugPrint('[WebView] UI 기본값으로 복원');
    if (mounted && !_isDisposed) {
      setState(() {
        // [수정 2026-05-19 v12] _showStatusBar 의 default 를 widget 의 initial
        //   값으로 복원. 이전엔 무조건 true 로 복원해 InitialDestinationGate 가
        //   false 로 전달한 상태가 페이지 내부 라우팅 (Next.js Link 클릭, history
        //   pushState) 시 강제로 true 로 변경되어 statusbar 깜빡임이 재발했다.
        _showStatusBar = widget.initialShowStatusBar;
        _showAppBarDynamic = false;
        _showBottomNavDynamic = widget.showBottomNav;
        _dynamicAppBarTitle = null;
        // AppBar 버튼 기본값 복원
        _showBackButton = false;
        _showMenuButton = false;
        _showRefreshButton = true;
        _appBarColor = null;
        _statusBarColor = null;
        // PullToRefresh override 복원 (2026-05-13 — 이슈 D15).
        // 다음 페이지가 자체 정책을 명시할 수 있도록 null 로 초기화.
        // 이후 _syncPullToRefreshEnabled 가 URL 기반 자동 정책으로 폴백한다.
        _pullToRefreshOverride = null;
      });
    }
    _updateStatusBar();
  }

  /// 화면 metrics 변경 감지 (회전·키보드·접힘 등) → Web autolayout 시스템에 push (2026-05-09 신규).
  ///
  /// 이전: Web 측 `subscribeToDeviceMetrics` 가 `window.resize` 이벤트로 자체 폴백
  ///       처리했으나, Flutter MediaQuery 가 보고하는 logical size / safe-area 값이
  ///       window.innerWidth 와 미묘하게 다르고, viewPadding(navigation bar) 변화는
  ///       window 이벤트로 전혀 잡히지 않음.
  /// 현재: Native 가 정확한 값을 push → Web 이 즉시 CSS 변수 재주입 → 모든 페이지의
  ///       autolayout(`var(--screen-width)`, `[data-screen-bp]`)이 1프레임 내 갱신.
  @override
  void didChangeMetrics() {
    super.didChangeMetrics();
    if (_isDisposed) return;
    _bridge?.sendDeviceMetricsToWeb();
  }

  /// OS 테마 변경 감지 → WebView + StatusBar + Scaffold 동시 전파
  @override
  void didChangePlatformBrightness() {
    super.didChangePlatformBrightness();
    if (_isDisposed || webViewController == null) return;

    final brightness =
        WidgetsBinding.instance.platformDispatcher.platformBrightness;
    final mode = brightness == Brightness.dark ? 'dark' : 'light';
    debugPrint('[WebView] OS 테마 변경 감지: $mode');

    // 1) WebView의 전역 함수를 호출하여 테마 동기화
    webViewController!.evaluateJavascript(
      source:
          "if(window.__teamplus_SET_THEME__) window.__teamplus_SET_THEME__('$mode');",
    );

    // 2) StatusBar + Scaffold 배경색 갱신
    if (mounted && !_isDisposed) {
      setState(() {
        _updateStatusBar();
      });
    }
  }

  void _finishBootTimeline(String markerName) {
    _bootFallbackTimer?.cancel();
    _bootFallbackTimer = null;
    BootTimeline.instance.finish(
      path: _lastLoadedPath,
      markerName: markerName,
    );
  }

  void _handleDeepLinkNavigation(String webPath) {
    final controller = webViewController;
    if (controller == null) return;
    final safePath = webPath.replaceAll("'", "\\'");
    controller.evaluateJavascript(
      source: "if(window.teamplusNavigate){window.teamplusNavigate('$safePath')}else if(window.__NEXT_ROUTER_PUSH__){window.__NEXT_ROUTER_PUSH__('$safePath')}",
    );
    debugPrint('[WebView] 딥링크 내부 라우팅: $webPath');
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    debugPrint('[WebView] dispose 시작: viewId=$_viewId');
    _isDisposed = true;
    _bootFallbackTimer?.cancel();
    _bootFallbackTimer = null;
    _errorDebounceTimer?.cancel();
    _errorDebounceTimer = null;
    _loadingFailsafeTimer?.cancel();
    _loadingFailsafeTimer = null;

    // WebView 컨트롤러 정리
    if (webViewController != null) {
      // 페이지 로딩 중단
      webViewController!.stopLoading();
      // JavaScript 핸들러 제거를 위해 빈 페이지 로드
      webViewController!.loadUrl(
        urlRequest: URLRequest(url: WebUri('about:blank')),
      );
      webViewController = null;
    }

    // 딥링크 콜백 해제
    if (DeepLinkHandler.onNavigateInWebView == _handleDeepLinkNavigation) {
      DeepLinkHandler.onNavigateInWebView = null;
    }

    // Bridge 정리
    _bridge?.dispose();
    _bridge = null;

    // PullToRefresh 컨트롤러 정리
    pullToRefreshController = null;

    // 상태바 복원
    // Android: edge-to-edge 유지 (시스템 bar 위치 변동 방지 — 다음 화면 진입 시 밀림 현상 차단)
    // iOS: manual 모드 + native channel 로 status bar 가시성 복원
    if (Platform.isAndroid) {
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    } else {
      SystemChrome.setEnabledSystemUIMode(
        SystemUiMode.manual,
        overlays: [SystemUiOverlay.top, SystemUiOverlay.bottom],
      );
      _iosStatusBarChannel
          .invokeMethod<bool>('setHidden', false)
          .catchError((_) => false);
    }

    debugPrint('[WebView] dispose 완료: viewId=$_viewId');
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // 다크모드 감지
    final isDarkMode = Theme.of(context).brightness == Brightness.dark;
    // 배경색: 콘텐츠 영역(body)과 동일한 색상 (UI 통일)
    final defaultBackgroundColor = isDarkMode
        ? AppColors.contentBackgroundDark
        : AppColors.contentBackground;
    final backgroundColor = _scaffoldBackgroundColor ?? defaultBackgroundColor;

    // 키보드 열림 상태 감지 — input focus 시 iOS/Android 모두 viewInsets.bottom > 0
    // 로그인/회원가입/찾기 화면처럼 BottomNav 가 없는 페이지는 Scaffold 가 resize 되어야
    // 입력창이 키보드 위로 올라와 보이고, BottomNav 가 있는 페이지는 키보드 열림 중에만
    // BottomNav 를 숨겨 키보드와 겹치지 않게 한다.
    final keyboardOpen = MediaQuery.of(context).viewInsets.bottom > 0;
    final isNativeAppBarVisible = (widget.showAppBar || _showAppBarDynamic) &&
        _state != WebViewState.loading;
    final webViewTopSafeInset =
        isNativeAppBarVisible ? 0.0 : MediaQuery.of(context).viewPadding.top;

    // Drawer 위젯 (위치에 따라 drawer/endDrawer 설정)
    final drawerWidget =
        _userType != null ? _buildDrawer(context, isDarkMode) : null;

    final scaffold = Scaffold(
      key: _scaffoldKey, // Drawer 제어를 위한 GlobalKey
      // 배경색: 콘텐츠 영역과 동일 (StatusBar, BottomNav 영역 통일)
      // 주의: 반투명 색으로 바꾸면 InAppWebView 합성 · 자식 렌더링과 충돌하므로 불투명 유지.
      backgroundColor: backgroundColor,
      // 키보드 열림 시 WebView 영역을 축소하여 입력창이 키보드 위로 보이도록 한다.
      //
      // 이전 설계(false)는 BottomNav(`position: fixed; bottom: 0`)가 키보드와 함께 올라오는
      // 현상을 막으려는 목적이었으나, 로그인 등 BottomNav 가 없는 페이지에서 입력창이
      // 키보드에 가려지는 부작용이 있었다. BottomNav 겹침은 아래 `bottomNavigationBar` 분기에서
      // `keyboardOpen` 시 null 을 반환해 해결한다 (네이티브 BottomNav 가 키보드 위로 밀려
      // 올라오지 않고 숨김 처리됨).
      //
      // Android 는 `windowSoftInputMode="adjustResize"` 와 짝을 이뤄야 OS 레벨에서 윈도우를
      // 축소한다. 관련 파일: teamplus-app/android/app/src/main/AndroidManifest.xml
      resizeToAvoidBottomInset: true,
      // WebView 내부의 가로 스와이프와 Scaffold Drawer 제스처가 충돌하지 않도록
      // 드래그로 여는 동작은 막고, AppBar 햄버거 버튼으로만 Drawer 를 연다.
      //
      // 증상:
      // - 화면 우측에서 좌측으로 드래그할 때 endDrawer 가 의도치 않게 열림
      // - Web 콘텐츠의 슬라이더/탭/히스토리 제스처와 네이티브 Drawer 가 충돌
      drawerEnableOpenDragGesture: false,
      endDrawerEnableOpenDragGesture: false,
      // Drawer 메뉴 (위치에 따라 설정)
      drawer: _drawerPosition == 'left' ? drawerWidget : null,
      endDrawer: _drawerPosition == 'right' ? drawerWidget : null,
      // AppBar: widget.showAppBar 또는 동적 _showAppBarDynamic이 true이고, 로딩 중이 아닐 때 표시
      // 로딩 중에는 전체화면 스피너가 표시되므로 AppBar 숨김
      appBar: (widget.showAppBar || _showAppBarDynamic) &&
              _state != WebViewState.loading
          ? AppBar(
              // AppBar 배경색: 커스텀 색상 또는 콘텐츠 영역과 동일
              backgroundColor: _appBarColor ?? backgroundColor,
              elevation: 0,
              // Leading 버튼: 뒤로가기 또는 햄버거 메뉴
              leading: _buildAppBarLeading(),
              // 뒤로가기/메뉴 버튼이 없으면 leading 자동 생성 방지
              automaticallyImplyLeading: false,
              title: Text(
                _dynamicAppBarTitle ?? widget.title,
                style: TextStyle(
                  color: isDarkMode ? Colors.white : Colors.black87,
                ),
              ),
              // AppBar 아이콘 색상
              iconTheme: IconThemeData(
                color: isDarkMode ? Colors.white : Colors.black87,
              ),
              actions: _buildAppBarActions(),
            )
          : null,
      // 네이티브 BottomNav (showBottomNav=true이고, 동적 상태도 true이고, userType이 있을 때 표시)
      // 로딩 중에도 BottomNav 유지하여 화면 전환 시 깜박임 방지.
      //
      // 키보드 열림 중에는 null 반환 — Scaffold 가 body 를 축소할 때 BottomNav 가 키보드
      // 위로 밀려 올라와 입력 영역과 겹치는 현상을 방지한다. 키보드가 닫히면 다시 표시.
      bottomNavigationBar: keyboardOpen
          ? null
          : (widget.showBottomNav && _showBottomNavDynamic && _userType != null
              ? TeamplusBottomNav(
                  userType: _userType!,
                  currentIndex: _currentNavIndex,
                  onTap: _onBottomNavTap,
                )
              : null),
      body: Stack(
        children: [
          // Status bar 영역(상단)을 첫 프레임부터 고정 예약한다.
          //
          // SafeArea는 `_showStatusBar=false` 전환 중 MediaQuery.padding.top 이
          // 0으로 바뀔 수 있어 iOS에서 Web 화면이 먼저 렌더된 뒤 2-3초 후 상단
          // status bar 영역이 나타나는 점프를 만든다. viewPadding.top은 시스템 UI
          // 표시/숨김과 무관한 영구 inset 이므로 WebView 레이아웃 기준으로 사용한다.
          Padding(
            padding: EdgeInsets.only(top: webViewTopSafeInset),
            child: MediaQuery.removePadding(
              context: context,
              removeTop: true,
              child: Stack(
                children: [
                  if (kIsWeb)
                    _buildWebFallback()
                  else
                    // ♿ 접근성: InAppWebView 컨테이너에 Semantics 부여.
                    //   - container: true → SR 이 본문 영역으로 인식
                    //   - label: '본문 영역' → VoiceOver/TalkBack 첫 진입 시 안내
                    //   - 실제 콘텐츠 SR 라벨은 Web (Next.js) 측에서 위임 처리
                    Semantics(
                      container: true,
                      label: '본문 영역',
                      child: InAppWebView(
                        key: ValueKey(_viewId), // 고유한 키로 플랫폼 뷰 충돌 방지
                        initialUrlRequest: URLRequest(
                          url: WebUri(
                            widget.initialUrl ??
                                (_kTbotInitialUrl.isNotEmpty
                                    ? _kTbotInitialUrl
                                    : ApiConstants.webAppUrl),
                          ),
                        ),
                        // 페이지 로드 전에 FlutterBridge 주입
                        initialUserScripts: _initialUserScripts,
                        initialSettings: InAppWebViewSettings(
                          // 기본 설정
                          useShouldOverrideUrlLoading: true,
                          mediaPlaybackRequiresUserGesture: false,
                          allowsInlineMediaPlayback: true,
                          iframeAllow: "camera; microphone",
                          iframeAllowFullscreen: true,

                          // 🔧 커스텀 User-Agent 설정 (Native 환경 감지용)
                          // Web에서 User-Agent에 'teamplusApp'이 포함되어 있으면 Native로 판단
                          // iOS/Android 플랫폼 분기는 WebViewPreloader.platformUserAgent 에서 단일 관리
                          userAgent: WebViewPreloader.platformUserAgent,

                          // 캐싱 설정 — preload 와 캐시 공유를 위해 상시 ON.
                          //   릴리스: 오프라인 지원 / 디버그: preload 효과 유지.
                          //   선택적 초기화는 `--dart-define=CLEAR_WEBVIEW_CACHE=true` 로 제어.
                          cacheEnabled: true,
                          clearCache: const bool.fromEnvironment(
                              'CLEAR_WEBVIEW_CACHE',
                              defaultValue: false),

                          // JavaScript 활성화
                          javaScriptEnabled: true,
                          javaScriptCanOpenWindowsAutomatically: true,
                          // 카카오 Share/Login 등 일부 SDK 가 window.open 으로 sharer/auth
                          // 페이지를 띄우는데, multi-window 가 꺼져 있으면 onCreateWindow 가
                          // 발화하지 않아 호출이 무시된다.
                          supportMultipleWindows: true,

                          // 보안 설정
                          allowUniversalAccessFromFileURLs: false,
                          allowFileAccessFromFileURLs: false,

                          // 모바일 최적화
                          useWideViewPort: true,
                          supportZoom: false,
                          builtInZoomControls: false,
                          displayZoomControls: false,

                          // Pull-to-refresh: iOS 바운스 스크롤 허용 (필수)
                          disallowOverScroll: false,
                          // Android 오버스크롤 모드
                          overScrollMode: OverScrollMode.ALWAYS,

                          // 네이티브 스크롤바 숨김 — 스크롤 동작은 유지
                          // 모든 역할(admin/director/coach/parent/teen/child/academy)의 body 영역에
                          // 스크롤바가 표시되지 않도록 iOS WKWebView / Android WebView 모두 적용
                          verticalScrollBarEnabled: false,
                          horizontalScrollBarEnabled: false,

                          // 접근성
                          minimumFontSize: 16,

                          // iOS 키보드 설정 — Done 버튼 액세서리 바 비활성화.
                          // 활성 상태 시 WKWebView 가 띄우는 _UIToolbarContentView 가
                          // 초기 width=0 으로 생성되며 [LayoutConstraints] Unable to
                          // simultaneously satisfy constraints 경고를 6+ 회 출력함
                          // (iOS 16/17/18 + flutter_inappwebview 6 알려진 노이즈).
                          // 한국어 IME 의 "완료" 버튼은 시스템 키보드 자체에 포함되므로
                          // Done 액세서리 바 제거해도 입력 UX 영향 없음.
                          disableInputAccessoryView: true,

                          // iOS Safari 스타일 좌/우 스와이프 히스토리 제스처 비활성화.
                          //
                          // 이유:
                          // - 하이브리드 앱에서는 로그인(/login) → 메인(/parent 등) 이동 후에도
                          //   WebView 히스토리가 남아 있을 수 있다.
                          // - 이 상태에서 좌측 가장자리 스와이프가 활성화되어 있으면 사용자가
                          //   의도치 않게 로그인 화면으로 되돌아가는 문제가 발생한다.
                          // - 뒤로가기는 앱이 제어하는 버튼/라우터 흐름으로만 허용한다.
                          allowsBackForwardNavigationGestures: false,

                          // 🔑 WebView 기본 흰색 배경 제거 — 키보드 개폐 애니메이션 중
                          // WebView 가 리사이즈되며 잠깐 드러나는 상단 흰 띠 현상 방지.
                          // Scaffold.backgroundColor(AppColors.contentBackground[Dark]) 가 비쳐
                          // HTML body 로드 전에도 자연스러운 배경으로 이어진다.
                          transparentBackground: true,

                          // ⌨️ 키보드 표시 정책 (2026-05-09 SPEC_LOGIN_KEYBOARD)
                          //
                          // 사용자 탭에 의한 시스템 키보드 표시는 OS 기본 동작:
                          //   input 탭 → 포커스 이벤트 → iOS/Android OS 가 software 키보드 자동 표시.
                          //   별도 옵션 불필요 (WKWebView, Android WebView 모두 기본 활성).
                          //
                          // 시뮬레이터/에뮬레이터에서 키보드가 안 나올 때:
                          //   · iOS 시뮬레이터: 메뉴 [I/O] → [Keyboard] → [Toggle Software Keyboard]
                          //     단축키 ⌘K. 또는 [Connect Hardware Keyboard] 해제 (⇧⌘K).
                          //     기본값이 hardware keyboard ON 이라 software 키보드가 숨겨져 있음.
                          //   · Android 에뮬레이터: AVD Manager → Edit → Show Advanced Settings →
                          //     "Enable keyboard input" 체크 해제 (또는 .ini 파일 hw.keyboard=no).
                          //     기본값이 hw.keyboard=yes 면 PC 키보드만 받고 software 키보드 미표시.
                          //   · 실기기(iPhone/Android 폰): 위 설정 무관, 기본 동작 정상.
                          //
                          // [2026-05-09] `keyboardDisplayRequiresUserAction` 옵션 제거 (빌드 에러).
                          //   flutter_inappwebview 5.8.0 CHANGELOG: Apple WKWebView 비공개 API
                          //   차단으로 무동작화 → 패키지 제거. JS .focus() 만으로의 자동 키보드는
                          //   WKWebView 에서 더 이상 동작하지 않음 (사용자 제스처 컨텍스트 필수).
                          //
                          // 키보드 inset 처리 흐름 (현행 유지):
                          //   1. 사용자가 input focus
                          //   2. iOS/Android OS 가 키보드 표시 → `viewInsets.bottom` 변화
                          //   3. Flutter `WidgetsBindingObserver.didChangeMetrics()` 트리거
                          //      (이미 webview_screen.dart:795 에서 override 하여 처리)
                          //   4. `sendDeviceMetricsToWeb()` → Web `--keyboard-inset-bottom` 갱신
                          //   5. Web `useKeyboardAvoidance` 훅이 활성 input 을 viewport 안으로 스크롤

                          // 🔍 디버깅 — Safari Web Inspector / Chrome DevTools 활성화 (디버그 빌드만).
                          //   iOS 16.4+: 시뮬레이터/실기기 모두 데스크탑 Safari → 개발자 메뉴에서
                          //     실시간 input/키보드 이벤트 디버깅 가능.
                          //   Android: chrome://inspect 에서 실시간 디버깅.
                          //   릴리스 빌드에서는 자동 비활성 (보안).
                          isInspectable: kDebugMode,

                          // Android — Hybrid Composition. flutter_inappwebview 6.x 기본값 true 이지만
                          //   명시적으로 지정하여 input focus / IME 동작 안정성을 보장.
                          //   false 면 가상 디스플레이 모드로 동작하며 IME 입력 좌표 어긋남 / 한글
                          //   조합 누락 등 문제 발생 가능.
                          useHybridComposition: true,
                        ),
                        pullToRefreshController: pullToRefreshController,
                        onWebViewCreated: (controller) {
                          BootTimeline.instance.mark('webview_created');
                          webViewController = controller;

                          // JavaScript Bridge 초기화
                          _bridge = WebViewBridge(controller);
                          _bridge!.registerHandlers();

                          // UI 제어 콜백 설정
                          _bridge!.onUIConfigChange = _onUIConfigChange;

                          // 테마 변경 콜백 설정 (Web → Native)
                          _bridge!.onThemeChange = (ThemeMode themeMode) {
                            debugPrint('[WebView] 테마 변경 요청: $themeMode');
                            // 1) Riverpod provider 업데이트 → MaterialApp themeMode 변경
                            ref
                                .read(appThemeModeProvider.notifier)
                                .setMode(themeMode);
                            // 2) StatusBar + Scaffold 배경 즉시 갱신
                            if (mounted && !_isDisposed) {
                              setState(() {
                                _updateStatusBar();
                              });
                            }
                          };

                          // 네비게이션 요청 콜백 설정 (Web → Native)
                          _bridge!.onNavigationRequest = (route, params) {
                            // 상위가 네비게이션을 제어하고 싶은 경우 전달
                            widget.onNavigationAction?.call('navigate', {
                              'route': route,
                              'params': params,
                            });
                          };

                          // 안드로이드 하드웨어 백키 가로채기 등록/해제 콜백
                          // (2026-05-16 백키 통합 처리)
                          //   Web 이 setHardwareBackEnabled(true/false) 호출 시 트리거.
                          //   MainShellScreen 이 _hardwareBackEnabled 플래그 갱신.
                          _bridge!.onHardwareBackEnabledChange = (enabled) {
                            widget.onNavigationAction?.call(
                              'hardwareBackEnabled',
                              {'enabled': enabled},
                            );
                          };

                          // Web 이 백키 이벤트를 정상 수신했음을 알리는 ACK 콜백
                          //   MainShellScreen 의 1.5초 fallback timer 취소용.
                          _bridge!.onBackReceived = () {
                            widget.onNavigationAction?.call(
                              'backReceived',
                              null,
                            );
                          };

                          // QR 스캐너 실행 콜백 (Web → Native 카메라 스캐너)
                          // Web 이 http://<IP>:5001 로 WebView 에서 로드되면 Secure Context 가
                          // 아니어서 브라우저 카메라 API 사용 불가. 이 경로를 통해 네이티브
                          // 카메라로 QR 을 읽어 UUID 문자열을 Web 으로 반환한다.
                          _bridge!.onQrScanRequest = () async {
                            if (!mounted || _isDisposed) return null;
                            try {
                              final result =
                                  await context.push<String>('/qr-scanner');
                              return result;
                            } catch (e) {
                              debugPrint('[WebView] QR 스캐너 실행 실패: $e');
                              return null;
                            }
                          };

                          // 인증 토큰 전송
                          _bridge!.sendAuthTokenToWeb();

                          // UserType + 사용자 정보 초기화 (1회).
                          // 이전 구현은 _syncPullToRefreshEnabled 내부에서 매 onLoadStart 마다
                          // 호출되어 불필요한 readAuthBundle/setState 가 반복되었다 — 깜빡임 원인.
                          _initUserType();
                        },
                        onLoadStart: (controller, url) {
                          if (_isDisposed) return; // dispose 상태 체크
                          BootTimeline.instance.mark('webview_load_start');
                          _bootFallbackTimer?.cancel();
                          _bootFallbackTimer = null;
                          // 직전 에러가 디바운스 대기 중이었다면 무해 에러로 간주하고 취소.
                          _errorDebounceTimer?.cancel();
                          _errorDebounceTimer = null;

                          if (mounted && !_isDisposed) {
                            setState(() {
                              // [2026-05-14] 화면 이동마다 풀스크린 파란 로딩 오버레이가
                              // 깜빡이는 UX 문제 fix. 첫 로드(_state 초기값 = loading)는 그대로
                              // 표시되지만, 이후 hard navigation 에서는 _state 를 강제로
                              // loading 으로 전환하지 않아 이전 페이지가 자연스럽게 유지되다가
                              // 새 페이지로 교체된다. 명시적 로딩 노출이 필요하면 Web 측에서
                              // `useNativeUI({ isLoading: true })` 로 트리거.
                              _errorMessage = null;
                              _errorTechnicalDetails = null;
                              _errorStatusCode = null;
                            });
                          }

                          // 하드 로드 중에도 status bar 영역은 유지한다.
                          // 명시적 fullscreen/loading 브릿지 요청만 status bar 를 숨긴다.
                          _updateStatusBar();

                          // PTR enabled 동기화 (2026-05-09) — 인증/온보딩 화면에서는
                          // 화면을 끌어내려도 새로고침이 되지 않도록 비활성화.
                          _syncPullToRefreshEnabled(url?.toString());
                        },
                        onUpdateVisitedHistory:
                            (controller, url, androidIsReload) {
                          if (_isDisposed) return;
                          // SPA pushState/replaceState 시에도 PTR 상태 재동기화.
                          // (예: /parent → /login 으로 router.replace 했을 때)
                          _syncPullToRefreshEnabled(url?.toString());
                        },
                        onProgressChanged: (controller, progress) {
                          if (_isDisposed) return; // dispose 상태 체크

                          if (progress == 100) {
                            pullToRefreshController?.endRefreshing();
                          }
                          // 진행률 UI는 현재 사용하지 않음 (필요 시 추후 추가)
                        },
                        onLoadStop: (controller, url) async {
                          if (_isDisposed) return; // dispose 상태 체크

                          _lastLoadedPath = url?.path ?? 'unknown';
                          BootTimeline.instance.mark('webview_dom_loaded');
                          _bootFallbackTimer?.cancel();
                          _bootFallbackTimer = Timer(
                            const Duration(milliseconds: 1200),
                            () => _finishBootTimeline('webview_ready_fallback'),
                          );

                          pullToRefreshController?.endRefreshing();

                          // FlutterBridge 주입 확인 (initialUserScripts에서 AT_DOCUMENT_START에 주입됨)
                          debugPrint(
                              '[WebView] 페이지 로드 완료, FlutterBridge 주입 확인');

                          // 현재 URL에서 경로 추출
                          final currentUrl = url?.toString() ?? '';
                          final isAuthPage = currentUrl.contains('/login') ||
                              currentUrl.contains('/register') ||
                              currentUrl.contains('/signup') ||
                              currentUrl.contains('/forgot-password') ||
                              currentUrl.contains('/onboarding');

                          if (mounted && !_isDisposed) {
                            setState(() {
                              // onLoadStop은 HTML/CSS 로드 완료일 뿐 데이터 fetch 완료가 아니다.
                              // status bar 표시/숨김은 현재 브릿지 상태를 유지하고,
                              // BottomNav 기본값만 URL 성격에 맞춰 조정한다.
                              _showBottomNavDynamic = !isAuthPage;
                              // [2026-05-14] 풀스크린 로딩 오버레이 안전망 해제.
                              // Web 측 `stopLoading` 호출이 누락되거나 지연돼도 HTML 로드 완료
                              // 시점에 자동으로 loaded 상태로 전환해 사용자가 무한 파란 화면을
                              // 보지 않도록 한다 (에러 상태에서는 그대로 두어 에러 화면 유지).
                              if (_state == WebViewState.loading) {
                                _state = WebViewState.loaded;
                                _loadingFailsafeTimer?.cancel();
                                _loadingFailsafeTimer = null;
                              }
                            });
                          }

                          // 로딩 완료 후 StatusBar 복원 (UI 설정에 따라)
                          _updateStatusBar();

                          // 현재 앱 테마를 WebView에 동기화 (초기 로드 시)
                          final appThemeMode = ref.read(appThemeModeProvider);
                          if (appThemeMode != ThemeMode.system) {
                            final mode = appThemeMode == ThemeMode.dark
                                ? 'dark'
                                : 'light';
                            controller.evaluateJavascript(
                              source:
                                  "if(window.__teamplus_SET_THEME__) window.__teamplus_SET_THEME__('$mode');",
                            );
                          }

                          // URL에서 현재 네비게이션 인덱스 업데이트
                          _updateNavIndexFromUrl(url);

                          // Cold start 딥링크: WebView 준비 전에 수신된 경로 소비
                          final pendingPath = DeepLinkHandler.consumePendingPath();
                          if (pendingPath != null && !isAuthPage) {
                            debugPrint('[WebView] pending 딥링크 소비: $pendingPath');
                            Future.delayed(const Duration(milliseconds: 300), () {
                              if (!_isDisposed) _handleDeepLinkNavigation(pendingPath);
                            });
                          }

                          // 🔐 인증 상태 확인 후 미로그인 시 로그인 페이지로 이동
                          await _checkAuthAndRedirectIfNeeded(controller, url);
                        },
                        onReceivedError: (controller, request, error) {
                          if (_isDisposed) return; // dispose 상태 체크

                          // 🔒 메인 프레임 에러만 처리 — 이미지/스크립트 등 서브 리소스 실패는 무시
                          //    예: example.com 같은 더미 이미지 ORB 차단, 선택적 리소스 CORS 실패 등이
                          //    앱 전체 에러 화면으로 승격되는 것을 방지한다.
                          //    isForMainFrame 이 null 인 경우(매우 오래된 Android < 21)도 보수적으로 무시.
                          if (request.isForMainFrame != true) {
                            debugPrint(
                                '[WebView] Sub-resource error (ignored): ${request.url} → ${error.description}');
                            return;
                          }

                          // 🛡️ 무해한 메인 프레임 cancel 은 사용자에게 노출하지 않는다 (2026-05-11).
                          //    iOS NSURLErrorCancelled (-999) 는 `controller.loadUrl`
                          //    도중 다른 loadUrl 이 호출되어 직전 요청이 취소된 경우 발생.
                          //    예: 스플래시 첫 진입 → `_checkAuthAndRedirectIfNeeded` 가
                          //    `controller.loadUrl('/login')` 호출하며 이전 페이지를 취소 →
                          //    곧이어 새 onLoadStart 가 트리거되므로 에러가 아니다.
                          if (error.type == WebResourceErrorType.CANCELLED) {
                            debugPrint(
                                '[WebView] Benign main-frame cancel (ignored): ${request.url} → ${error.description}');
                            return;
                          }
                          // 그 외 iOS WebKit FrameLoadInterruptedByPolicyChange (102) 등
                          // 무해한 interrupt 는 enum 미정의이므로 description 으로 보수적으로
                          // 식별하여 즉시 무시. 매핑 실패 시 아래 디바운스 가 잡아준다.
                          final desc = error.description.toLowerCase();
                          if (desc.contains('frame load interrupted') ||
                              desc.contains('webkiterrordomain') &&
                                  desc.contains('102')) {
                            debugPrint(
                                '[WebView] Benign frame interrupt (ignored): ${request.url} → ${error.description}');
                            return;
                          }

                          pullToRefreshController?.endRefreshing();
                          final url = request.url.toString();

                          // 디바운스: 350ms 안에 onLoadStart 가 호출되면 (= 새 로드 시작)
                          // 깜빡임 없이 무시한다. 진짜 영구 에러라면 350ms 후 에러 화면 표시.
                          _errorDebounceTimer?.cancel();
                          _errorDebounceTimer = Timer(_kErrorGraceWindow, () {
                            if (!mounted || _isDisposed) return;
                            // 에러 화면 진입 시 로딩 페일세이프 취소 (loading → error 전환)
                            _loadingFailsafeTimer?.cancel();
                            _loadingFailsafeTimer = null;
                            setState(() {
                              _state = WebViewState.error;
                              _errorMessage = error.description;
                              _errorTechnicalDetails = '''
Error Type: WebResourceError
URL: $url
Description: ${error.description}
Type: ${error.type}
''';
                              _errorStatusCode = null;
                            });
                          });
                        },
                        onReceivedHttpError:
                            (controller, request, errorResponse) {
                          if (_isDisposed) return; // dispose 상태 체크

                          // 🔒 메인 프레임 HTTP 에러만 처리 — 서브 리소스(이미지/CSS/JS/폰트) 실패는 무시
                          //    브라우저는 깨진 이미지 아이콘 정도로 조용히 넘기지만, Flutter WebView는
                          //    모든 리소스 에러를 네이티브로 노출하므로 여기서 필터링해야 UX가 일관됨.
                          if (request.isForMainFrame != true) {
                            debugPrint(
                                '[WebView] Sub-resource HTTP error (ignored): ${request.url} → ${errorResponse.statusCode}');
                            return;
                          }

                          // 🛡️ 무해한 메인 프레임 HTTP 상태는 무시 (2026-05-11):
                          //   - 1xx Informational
                          //   - 204 No Content
                          //   - 3xx Redirects (Next.js layout/middleware redirect 시 발생)
                          //     실제 최종 페이지는 곧 정상 200 으로 도착하며 에러가 아니다.
                          final status = errorResponse.statusCode ?? 0;
                          if (status > 0 && status < 400) {
                            debugPrint(
                                '[WebView] Benign HTTP status (ignored): ${request.url} → $status');
                            return;
                          }

                          pullToRefreshController?.endRefreshing();
                          final url = request.url.toString();

                          // 디바운스: 350ms 안에 새 onLoadStart 가 호출되면 무시.
                          _errorDebounceTimer?.cancel();
                          _errorDebounceTimer = Timer(_kErrorGraceWindow, () {
                            if (!mounted || _isDisposed) return;
                            // 에러 화면 진입 시 로딩 페일세이프 취소
                            _loadingFailsafeTimer?.cancel();
                            _loadingFailsafeTimer = null;
                            setState(() {
                              _state = WebViewState.error;
                              _errorMessage =
                                  'HTTP ${errorResponse.statusCode}: ${errorResponse.reasonPhrase}';
                              _errorTechnicalDetails = '''
Error Type: HTTP Error
URL: $url
Status Code: ${errorResponse.statusCode}
Reason: ${errorResponse.reasonPhrase}
Content Type: ${errorResponse.contentType}
''';
                              _errorStatusCode = errorResponse.statusCode;
                            });
                          });
                        },
                        onCreateWindow: (controller, createWindowAction) async {
                          // 카카오 Share/Login 등이 window.open 으로 sharer.kakao.com 또는
                          // accounts.kakao.com 을 띄우려 시도한다. 새 WebView 를 만들지 않고
                          // 메인 WebView 에서 이어서 로드한다.
                          final url = createWindowAction.request.url;
                          if (url != null) {
                            // 카카오 SDK 가 visibility 오판 또는 지연 timer 로 Play Store
                            // fallback 을 발화할 수 있다. 카카오톡 실제 설치 여부를 직접
                            // 확인해 분기: 설치됨→차단(오판), 미설치→Store 정상 안내.
                            if (_isKakaoStoreFallback(url)) {
                              // kakaotalk:// 빈 스킴은 ResolveActivity 매칭 실패로 false
                              // 반환되는 경우가 있어 실제 카카오톡이 처리하는 deep link 형태로
                              // 체크한다. 둘 중 하나라도 응답하면 설치된 것으로 판단.
                              final installed = await canLaunchUrl(
                                    Uri.parse('kakaolink://send'),
                                  ) ||
                                  await canLaunchUrl(
                                    Uri.parse('kakaotalk://kakaolink'),
                                  );
                              if (installed) {
                                return true;
                              }
                              try {
                                await launchUrl(
                                  url,
                                  mode: LaunchMode.externalApplication,
                                );
                              } catch (e) {
                                debugPrint(
                                  '[WebView] Kakao Store fallback launch failed: $e',
                                );
                              }
                              return true;
                            }
                            // intent:// URL 파싱 후 실제 스킴으로 실행
                            if (url.scheme == 'intent') {
                              await _launchIntentUrl(url.toString());
                              return true;
                            }
                            // 외부 앱 스킴(kakaolink 등)이면 외부 앱으로 위임
                            if (_isExternalAppScheme(url.scheme)) {
                              try {
                                await launchUrl(
                                  url,
                                  mode: LaunchMode.externalApplication,
                                );
                              } catch (e) {
                                debugPrint(
                                  '[WebView] onCreateWindow external launch failed: $e',
                                );
                              }
                              return true;
                            }
                            // http/https 는 메인 WebView 에서 그대로 로드 (popup 흐름 유지)
                            await controller.loadUrl(
                              urlRequest: URLRequest(url: url),
                            );
                            return true;
                          }
                          return false;
                        },
                        shouldOverrideUrlLoading:
                            (controller, navigationAction) async {
                          final uri = navigationAction.request.url!;

                          // 카카오 SDK 의 카카오톡 미설치 fallback (Play Store) 분기.
                          // 카카오톡 설치되어 있으면 SDK 오판이므로 차단, 미설치면 Store 안내.
                          // _isExternalAppScheme(market) 보다 먼저 평가되어야 한다.
                          if (_isKakaoStoreFallback(uri)) {
                            // kakaotalk:// 빈 스킴은 ResolveActivity 매칭 실패로 false
                            // 반환되는 경우가 있어 실제 카카오톡이 처리하는 deep link 형태로
                            // 체크한다. 둘 중 하나라도 응답하면 설치된 것으로 판단.
                            final installed = await canLaunchUrl(
                                  Uri.parse('kakaolink://send'),
                                ) ||
                                await canLaunchUrl(
                                  Uri.parse('kakaotalk://kakaolink'),
                                );
                            if (installed) {
                              return NavigationActionPolicy.CANCEL;
                            }
                            try {
                              await launchUrl(
                                uri,
                                mode: LaunchMode.externalApplication,
                              );
                            } catch (e) {
                              debugPrint(
                                '[WebView] Kakao Store fallback launch failed: $e',
                              );
                            }
                            return NavigationActionPolicy.CANCEL;
                          }

                          // 외부 브라우저로 열어야 하는 URL 처리
                          if (uri.scheme == 'tel' ||
                              uri.scheme == 'mailto' ||
                              uri.scheme == 'sms') {
                            await launchUrl(
                              uri,
                              mode: LaunchMode.externalApplication,
                            );
                            return NavigationActionPolicy.CANCEL;
                          }

                          // TEAMPLUS 딥링크 처리
                          if (uri.scheme == 'teamplus') {
                            _bridge?.sendDeepLinkToWeb(uri.toString());
                            return NavigationActionPolicy.CANCEL;
                          }

                          // intent:// URL 파싱: url_launcher 가 intent URI 를
                          // 직접 처리하지 못하는 경우가 있으므로, #Intent;scheme=X 에서
                          // 실제 스킴을 추출하여 재구성한 뒤 실행한다.
                          if (uri.scheme == 'intent') {
                            await _launchIntentUrl(uri.toString());
                            return NavigationActionPolicy.CANCEL;
                          }

                          // 외부 앱 호출 스킴 (카카오 Share/Login, 결제, 인증 등).
                          // 등록되지 않으면 WebView 가 ERR_UNKNOWN_URL_SCHEME 으로 실패하여
                          // Kakao.Share.sendDefault 같은 SDK 호출이 [object Object] 에러로 끊긴다.
                          if (_isExternalAppScheme(uri.scheme)) {
                            try {
                              await launchUrl(
                                uri,
                                mode: LaunchMode.externalApplication,
                              );
                            } catch (e) {
                              debugPrint(
                                '[WebView] External scheme launch failed: ${uri.scheme} - $e',
                              );
                            }
                            return NavigationActionPolicy.CANCEL;
                          }

                          return NavigationActionPolicy.ALLOW;
                        },
                        onConsoleMessage: (controller, consoleMessage) {
                          // JavaScript 콘솔 로그 출력 (개발 모드)
                          debugPrint(
                            'JS Console [${consoleMessage.messageLevel}]: ${consoleMessage.message}',
                          );
                        },
                      ),
                    ), // ♿ Semantics 닫기

                  // 에러 화면
                  if (_state == WebViewState.error) _buildErrorScreen(),
                ],
              ),
            ),
          ),
          // [2026-05-14 final] 파란 풀스크린 로딩 오버레이 완전 제거.
          //   사용자 요구: "스플래시 직후 / BottomNav 탭 클릭 시 파란 화면이 나오지 않게".
          //   _state = WebViewState.loading 진입은 그대로 두되 (다른 분기에서 의존),
          //   `_buildLoadingScreen()` 풀스크린 표시만 제거하여 WebView 자체가 보이도록 한다.
          //   - cold start: splash → onboarding/login WebView 진입 시 파란 화면 없이
          //     WebView 의 흰 contentBackground 가 곧바로 노출되며, web 페이지가 commit 되면
          //     자연스럽게 콘텐츠로 전환.
          //   - SPA navigation: BottomNav 탭 클릭 시 이전 페이지가 유지된 채 새 페이지로 교체.
          //   - 명시적 로딩 안내가 필요한 경우는 Web 측 `LoadingPuck` 으로 처리 (디자인 일관성).
          // Scrim 오버레이 — Safe Area 바깥 영역(상단 Status Bar · 하단 Home Indicator /
          // System Navigation Bar)만 네이티브 Container 로 dim 처리한다.
          //
          // 중앙 콘텐츠 영역은 건드리지 않는다 — WebView 내부 CSS backdrop(`bg-slate-950/70`)이
          // 동일 톤(#B3020617)으로 dim 처리하고, 그 위에 ConfirmDialog 카드가 선명하게 떠야 한다.
          // 만약 Positioned.fill 로 WebView 전체를 덮으면 dialog 카드까지 어두워진다.
          //
          // IgnorePointer 로 감싸 WebView 내부 터치 이벤트에는 영향 없음.
          if (_showScrim) ...[
            // 상단 status bar / notch 영역 dim — 항상 적용
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              height: MediaQuery.of(context).padding.top,
              child: IgnorePointer(
                child: ColoredBox(color: _scrimColor),
              ),
            ),
            // 하단 home indicator / system nav 영역 dim — _scrimBottom=true 일 때만 적용.
            //   BottomSheet 모드(_scrimBottom=false)에서는 시트 카드가 화면 하단까지
            //   차지하므로 dim 을 그리지 않아 시각 충돌 회피.
            //   SoT: docs/Design/MODAL_DIM_POLICY.md (2026-05-16 BottomSheet 정책)
            if (_scrimBottom)
              Positioned(
                bottom: 0,
                left: 0,
                right: 0,
                height: MediaQuery.of(context).padding.bottom,
                child: IgnorePointer(
                  child: ColoredBox(color: _scrimBottomColor ?? _scrimColor),
                ),
              ),
          ],
        ],
      ),
    );

    // 🛡️ status bar 스타일 race 보강 (2026-05-20):
    //   splash 단계의 brightness.light (흰 아이콘) 가 WebView 전환 후에도
    //   잔존해 흰 배경 + 흰 아이콘으로 "안 보이는" 회귀를 차단. AnnotatedRegion 은
    //   build 마다 위젯 트리 기준으로 SystemUiOverlayStyle 을 강제 적용하므로
    //   SystemChrome.setSystemUIOverlayStyle 한 번 호출보다 견고하다.
    //   배경 luminance 기반 자동 brightness 결정은 _applyStatusBarStyle 과 동일 정책.
    final isAppDarkMode = _resolveIsDarkMode();
    final statusBarBgColor = _statusBarColor ??
        (isAppDarkMode
            ? AppColors.contentBackgroundDark
            : AppColors.contentBackground);
    final isStatusBarBright = _isColorBright(statusBarBgColor);
    final navBarBgColor = _navigationBarColor ??
        (isAppDarkMode
            ? AppColors.contentBackgroundDark
            : AppColors.contentBackground);
    final isNavBarBright = _isColorBright(navBarBgColor);
    final annotatedStyle = SystemUiOverlayStyle(
      statusBarColor: statusBarBgColor,
      statusBarIconBrightness:
          isStatusBarBright ? Brightness.dark : Brightness.light,
      statusBarBrightness:
          isStatusBarBright ? Brightness.light : Brightness.dark,
      systemNavigationBarColor: navBarBgColor,
      systemNavigationBarIconBrightness:
          isNavBarBright ? Brightness.dark : Brightness.light,
      // [2026-05-26] navigation bar 상단 1px divider 제거 (위 _applyStatusBarStyle
      //   과 동일 이유). splash 청색 divider 가 WebView 까지 잔존하는 회귀 차단.
      systemNavigationBarDividerColor: Colors.transparent,
    );

    // 안드로이드 하드웨어 백키 처리:
    //   1) WebView 가 이전 페이지 보유 → webViewController.goBack() (Web 내부 history)
    //   2) Native Navigator stack 상위 → Navigator.pop (이전 native 화면)
    //   3) stack 루트 (메인) → 종료 confirm 다이얼로그
    // iOS / 기타 → PopScope 미설치 (edge swipe 기본 동작 유지).
    if (!Platform.isAndroid) {
      return AnnotatedRegion<SystemUiOverlayStyle>(
        value: annotatedStyle,
        child: scaffold,
      );
    }
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: annotatedStyle,
      child: PopScope(
        canPop: false,
        onPopInvokedWithResult: (didPop, _) async {
          if (didPop) return;
          await _onHardwareBack();
        },
        child: scaffold,
      ),
    );
  }

  /// 백키 다이얼로그 중복 표시 방지.
  bool _exitDialogOpen = false;

  /// "한 번 더 누르면 종료" double-back 마지막 백키 시각.
  /// 로그인·온보딩 등 인증 진입 화면에서만 사용 (2026-05-26 사용자 직접 지시).
  DateTime? _lastBackPressedAt;
  static const Duration _kDoubleBackWindow = Duration(seconds: 2);

  /// 안드로이드 하드웨어 백키 처리 (PopScope onPopInvokedWithResult 에서 호출).
  Future<void> _onHardwareBack() async {
    if (!mounted) return;

    // [2026-05-26 사용자 직접 지시] 로그인 화면 백키 연타 시 이전 화면으로 되돌아가던
    //   회귀 차단. 네이티브 '/login' 라우트 폐기(2026-05-19) 후 로그인 화면은
    //   WebView 의 Next.js '/login/' 페이지이며, splash/preload/로그아웃 직전 페이지가
    //   WebView history 에 남아 canGoBack()==true → goBack() 으로 이전 화면 복귀가
    //   발생했다. 현재 URL 이 인증 진입 경로(_isAuthPathUrl)면 history back / native pop
    //   을 모두 건너뛰고 "한 번 더 누르면 종료" 흐름으로 보낸다.
    WebUri? currentUri;
    try {
      currentUri = await webViewController?.getUrl();
    } catch (_) {
      // getUrl 실패 시 초기 URL 로 폴백
    }
    if (!mounted) return;
    final currentUrl = currentUri?.toString() ?? widget.initialUrl;
    if (_isLoginRootUrl(currentUrl)) {
      debugPrint(
        '[WebViewScreen] hardware back on login screen ($currentUrl) → double-back to exit',
      );
      _handleDoubleBackToExit();
      return;
    }

    // [2026-05-28 사용자 직접 지시] 회원가입 화면(/signup) 백키 → 로그인(/login/)으로 이동.
    //   가입 완료 환영(A13) '둘러보기' 로 webview /signup/ 진입 후 soft/hardware 백키 시
    //   WebView history back / native pop 을 타고 인트로(/onboarding)로 회귀하던 문제 차단.
    //   회원가입에서 뒤로가기는 로그인 화면으로 돌아가는 것이 자연스러우므로 명시적으로 이동.
    if (_isSignupRootUrl(currentUrl)) {
      debugPrint(
        '[WebViewScreen] hardware back on signup screen ($currentUrl) → navigate to /login/',
      );
      _navigateInWebView('/login/');
      return;
    }

    // 1) WebView 가 이전 페이지를 보유 → 그쪽으로 복귀 (서브 페이지 → 메인 복귀 등)
    final canBack = await webViewController?.canGoBack() ?? false;
    debugPrint(
      '[WebViewScreen] hardware back pressed, webView.canGoBack=$canBack, url=$currentUrl',
    );
    if (canBack) {
      await webViewController?.goBack();
      return;
    }

    // 2) Native Navigator stack 상위 페이지 → router pop
    if (!mounted) return;
    final navigator = Navigator.maybeOf(context);
    if (navigator != null && navigator.canPop()) {
      navigator.pop();
      return;
    }

    // 3) Stack 루트 (메인) → 종료 confirm 다이얼로그
    await _showExitDialog();
  }

  /// "뒤로 가기를 한 번 더 누르면 종료됩니다" — 안드로이드 표준 double-back-to-exit.
  ///
  /// 로그인/온보딩 등 인증 진입 화면 전용. 첫 백키는 토스트(SnackBar)만 띄우고,
  /// [_kDoubleBackWindow] 안에 다시 백키를 누르면 `SystemNavigator.pop()` 으로 앱을
  /// 종료한다. 윈도우가 지나면 다음 백키는 다시 첫 클릭으로 간주된다.
  void _handleDoubleBackToExit() {
    final now = DateTime.now();
    final last = _lastBackPressedAt;
    if (last != null && now.difference(last) <= _kDoubleBackWindow) {
      // 윈도우 내 두 번째 백키 → 앱 종료
      ScaffoldMessenger.maybeOf(context)?.clearSnackBars();
      SystemNavigator.pop();
      return;
    }

    _lastBackPressedAt = now;
    if (!mounted) return;
    ScaffoldMessenger.maybeOf(context)
      ?..clearSnackBars()
      ..showSnackBar(
        const SnackBar(
          content: Text('뒤로 가기를 한 번 더 누르면 종료됩니다.'),
          duration: _kDoubleBackWindow,
          behavior: SnackBarBehavior.floating,
        ),
      );
  }

  Future<void> _showExitDialog() async {
    if (_exitDialogOpen) return;
    if (!mounted) return;
    _exitDialogOpen = true;
    try {
      // 종료 컴펌 UI 는 하우머치 스타일 공통 다이얼로그 사용 (native_back_guard SoT).
      final confirmed = await showAppExitConfirmDialog(context);
      if (confirmed == true && Platform.isAndroid) {
        await SystemNavigator.pop();
      }
    } finally {
      _exitDialogOpen = false;
    }
  }

  /// 🔐 인증 상태 확인 후 적절한 페이지로 리다이렉트
  /// - 미로그인: 로그인 페이지로 이동
  /// - 로그인됨: 역할별 대시보드로 이동
  Future<void> _checkAuthAndRedirectIfNeeded(
    InAppWebViewController controller,
    WebUri? url,
  ) async {
    final currentUrl = url?.toString() ?? '';

    // 우리 앱 도메인이 아니면 인증 체크하지 않음. PortOne 본인인증이
    // KG이니시스(kssa.inicis.com)·PortOne·iamport 등 외부 인증사 도메인
    // 으로 forceRedirect 할 때 onLoadStop 이 발동되는데, 외부 도메인은
    // 토큰이 없으니 미인증 처리되어 /login 으로 강제 이동 → 본인인증
    // 흐름 자체가 깨진다. (사용자 폼 손실 회귀)
    if (currentUrl.isNotEmpty &&
        !currentUrl.startsWith(ApiConstants.webAppUrl)) {
      debugPrint('[WebView] 외부 도메인, 인증 체크 스킵: $currentUrl');
      return;
    }

    // 이미 로그인 페이지에 있으면 체크하지 않음 (미로그인 사용자 허용)
    // /identity/callback 은 PortOne 본인인증 redirect 복귀 페이지 — 회원가입
    // 중간에 토큰 없는 상태로 진입하는 게 정상. 여기서 /login 으로 강제
    // 이동하면 사용자가 입력하던 폼이 통째로 날아간다.
    if (currentUrl.contains('/login') ||
        currentUrl.contains('/register') ||
        currentUrl.contains('/signup') ||
        currentUrl.contains('/forgot-password') ||
        currentUrl.contains('/identity')) {
      debugPrint('[WebView] 인증 페이지, 인증 체크 스킵');
      return;
    }

    // 중복 체크 방지 (첫 로드에서만 체크)
    if (_hasCheckedAuth) {
      return;
    }
    _hasCheckedAuth = true;

    try {
      // ⚡ Splash 에서 readAuthBundle 호출됨 → 30s TTL 캐시 hit 기대 (3 read → 0 read)
      final bundle = await _tokenStorage.readAuthBundle();
      final isAuthenticated = bundle.isAuthenticated;
      final userType = bundle.userType;
      debugPrint(
          '[WebView] 인증 상태 확인: isAuthenticated=$isAuthenticated, userType=$userType');

      if (!isAuthenticated) {
        debugPrint('[WebView] 미로그인 상태 - 로그인 페이지로 이동');

        // WebView 내에서 로그인 페이지로 이동
        final loginUrl = '${ApiConstants.webAppUrl}/login';
        await controller.loadUrl(
          urlRequest: URLRequest(url: WebUri(loginUrl)),
        );

        debugPrint('[WebView] 로그인 페이지로 리다이렉트 완료: $loginUrl');
      } else {
        // 로그인된 경우: 현재 URL이 홈('/')이거나 비어있으면 역할별 대시보드로 이동
        final isAtRoot = currentUrl.endsWith('/') ||
            currentUrl == ApiConstants.webAppUrl ||
            currentUrl == '${ApiConstants.webAppUrl}/';

        if (isAtRoot) {
          final dashboardPath = _getDashboardPathByUserType(userType);
          final dashboardUrl = '${ApiConstants.webAppUrl}$dashboardPath';

          debugPrint('[WebView] 로그인 상태, 루트 페이지 - 역할별 대시보드로 이동: $dashboardUrl');

          await controller.loadUrl(
            urlRequest: URLRequest(url: WebUri(dashboardUrl)),
          );
        } else {
          debugPrint('[WebView] 로그인 상태 - 현재 페이지 유지: $currentUrl');
        }
      }
    } catch (e) {
      debugPrint('[WebView] 인증 상태 확인 오류: $e');
      // 오류 발생 시 로그인 페이지로 이동 (안전하게 처리)
      final loginUrl = '${ApiConstants.webAppUrl}/login';
      await controller.loadUrl(
        urlRequest: URLRequest(url: WebUri(loginUrl)),
      );
    }
  }

  /// 웹 플랫폼 폴백 (Chrome에서 실행 시)
  Widget _buildWebFallback() {
    final url = widget.initialUrl ?? ApiConstants.webAppUrl;
    // 웹에서는 로딩 완료로 표시
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && !_isDisposed && _state != WebViewState.loaded) {
        setState(() => _state = WebViewState.loaded);
      }
    });
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.phone_android, size: 64, color: AppColors.primary),
            const SizedBox(height: 24),
            const Text(
              'TEAMPLUS 앱은 모바일 기기에서 실행해주세요.',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            Text(
              '웹 브라우저에서 직접 접속하려면\n아래 URL을 사용하세요.',
              style: TextStyle(fontSize: 14, color: Colors.grey[600]),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            SelectableText(
              url,
              style: const TextStyle(
                fontSize: 14,
                color: AppColors.primary,
                decoration: TextDecoration.underline,
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// 에러 화면
  /// 디버그 모드에서는 에러 복사 기능이 활성화됩니다.
  Widget _buildErrorScreen() {
    return DebugErrorWidget(
      message: _errorMessage ?? '네트워크 연결을 확인해주세요.',
      technicalDetails: _errorTechnicalDetails,
      statusCode: _errorStatusCode,
      source: 'WebViewScreen',
      onRetry: () async {
        await webViewController?.reload();
      },
    );
  }

  // [2026-05-14 final] 파란 풀스크린 로딩 오버레이(`_buildLoadingScreen()`) 제거.
  //   사용자 요구로 스플래시 직후 / BottomNav 탭 클릭 시 파란 화면이 나오지 않도록
  //   `_state == WebViewState.loading` 분기의 풀스크린 표시를 완전히 제거함.
  //   다른 로딩 표현이 필요한 경우 Web 측 LoadingPuck 사용.

  /// Drawer 메뉴 빌드
  /// WebView 내비게이션을 위한 Native Drawer
  Widget _buildDrawer(BuildContext context, bool isDarkMode) {
    final drawerBgColor = isDarkMode ? AppColors.darkBackground : Colors.white;
    final headerBgColor =
        isDarkMode ? AppColors.darkSurface : AppColors.primary;

    // 위치에 따른 border radius
    final borderRadius = _drawerPosition == 'right'
        ? const BorderRadius.only(
            topLeft: Radius.circular(24),
            bottomLeft: Radius.circular(24),
          )
        : const BorderRadius.only(
            topRight: Radius.circular(24),
            bottomRight: Radius.circular(24),
          );

    return Drawer(
      backgroundColor: drawerBgColor,
      shape: RoundedRectangleBorder(borderRadius: borderRadius),
      child: SafeArea(
        child: Column(
          children: [
            // Header
            _buildDrawerHeader(context, headerBgColor, isDarkMode),

            // Menu Items
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(vertical: 8),
                children: _buildDrawerMenuItems(isDarkMode),
              ),
            ),

            // Footer (Logout)
            _buildDrawerFooter(isDarkMode),
          ],
        ),
      ),
    );
  }

  /// Drawer 헤더 빌드
  Widget _buildDrawerHeader(
      BuildContext context, Color bgColor, bool isDarkMode) {
    // 위치에 따른 헤더 border radius
    final headerBorderRadius = _drawerPosition == 'right'
        ? const BorderRadius.only(topLeft: Radius.circular(24))
        : const BorderRadius.only(topRight: Radius.circular(24));

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: headerBorderRadius,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Logo and Close Button
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              // TEAMPLUS Logo
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(
                      Icons.sports_hockey,
                      color: Colors.white,
                      size: 24,
                    ),
                  ),
                  const SizedBox(width: 12),
                  const Text(
                    'TEAMPLUS',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 1,
                    ),
                  ),
                ],
              ),
              // Close Button
              IconButton(
                onPressed: () => Navigator.of(context).pop(),
                icon: const Icon(Icons.close_rounded),
                color: Colors.white.withValues(alpha: 0.8),
                style: IconButton.styleFrom(
                  backgroundColor: Colors.white.withValues(alpha: 0.1),
                ),
              ),
            ],
          ),

          const SizedBox(height: 20),

          // User Avatar
          CircleAvatar(
            radius: 32,
            backgroundColor: Colors.white.withValues(alpha: 0.2),
            child: Text(
              (_userName?.isNotEmpty == true ? _userName![0] : '?')
                  .toUpperCase(),
              style: const TextStyle(
                color: Colors.white,
                fontSize: 24,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),

          const SizedBox(height: 12),

          // User Name
          Text(
            _userName ?? '사용자',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),

          const SizedBox(height: 4),

          // User Email and Role Badge
          Row(
            children: [
              if (_userEmail != null)
                Expanded(
                  child: Text(
                    _userEmail!,
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.8),
                      fontSize: 13,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              const SizedBox(width: 8),
              // Role Badge
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  _getUserTypeLabel(),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  /// 사용자 타입 라벨 반환
  String _getUserTypeLabel() {
    switch (_userType) {
      case UserType.parent:
        return '학부모';
      case UserType.coach:
        return '코치';
      case UserType.child:
        return '어린이';
      case UserType.teen:
        return '청소년';
      case UserType.admin:
        return '관리자';
      case UserType.director:
        return '감독';
      default:
        return '사용자';
    }
  }

  /// Drawer 메뉴 아이템 빌드
  List<Widget> _buildDrawerMenuItems(bool isDarkMode) {
    final items = <Widget>[];

    // 홈 메뉴
    items.add(_buildDrawerMenuItem(
      icon: Icons.home_outlined,
      activeIcon: Icons.home_rounded,
      label: '홈',
      href: _getHomePathByUserType(),
      isDarkMode: isDarkMode,
    ));

    // 역할별 메뉴
    switch (_userType) {
      case UserType.parent:
        items.addAll([
          _buildDrawerMenuItem(
            icon: Icons.sports_hockey,
            label: '수업',
            href: '/classes',
            isDarkMode: isDarkMode,
          ),
          _buildDrawerMenuItem(
            icon: Icons.calendar_today_outlined,
            activeIcon: Icons.calendar_today,
            label: '일정',
            href: '/calendar',
            isDarkMode: isDarkMode,
          ),
          _buildDrawerMenuItem(
            icon: Icons.fact_check_outlined,
            activeIcon: Icons.fact_check_rounded,
            label: '출석 내역',
            href: '/attendance-history',
            isDarkMode: isDarkMode,
          ),
          _buildDrawerMenuItem(
            icon: Icons.receipt_long_outlined,
            activeIcon: Icons.receipt_long_rounded,
            label: '결제 내역',
            href: '/payment-history',
            isDarkMode: isDarkMode,
            showDivider: true,
          ),
          _buildDrawerMenuItem(
            icon: Icons.child_care_outlined,
            activeIcon: Icons.child_care_rounded,
            label: '자녀 관리',
            href: '/children',
            isDarkMode: isDarkMode,
          ),
          _buildDrawerMenuItem(
            icon: Icons.shopping_bag_outlined,
            activeIcon: Icons.shopping_bag_rounded,
            label: '쇼핑몰',
            href: '/shop/home',
            isDarkMode: isDarkMode,
          ),
        ]);
        break;

      case UserType.coach:
        items.addAll([
          _buildDrawerMenuItem(
            icon: Icons.calendar_today_outlined,
            activeIcon: Icons.calendar_today,
            label: '일정',
            href: '/calendar',
            isDarkMode: isDarkMode,
          ),
          _buildDrawerMenuItem(
            icon: Icons.groups_outlined,
            activeIcon: Icons.groups_rounded,
            label: '회원 관리',
            href: '/coach-members',
            isDarkMode: isDarkMode,
          ),
          _buildDrawerMenuItem(
            icon: Icons.fact_check_outlined,
            activeIcon: Icons.fact_check_rounded,
            label: '출석 관리',
            href: '/attendance-manage',
            isDarkMode: isDarkMode,
            showDivider: true,
          ),
          _buildDrawerMenuItem(
            icon: Icons.sports_hockey,
            label: '수업 관리',
            href: '/classes-manage',
            isDarkMode: isDarkMode,
          ),
          _buildDrawerMenuItem(
            icon: Icons.chat_bubble_outline_rounded,
            activeIcon: Icons.chat_bubble_rounded,
            label: '메시지',
            href: '/messages',
            isDarkMode: isDarkMode,
          ),
        ]);
        break;

      case UserType.child:
      case UserType.teen:
        items.addAll([
          _buildDrawerMenuItem(
            icon: Icons.calendar_month_outlined,
            activeIcon: Icons.calendar_month_rounded,
            label: '일정',
            href: '/schedule',
            isDarkMode: isDarkMode,
          ),
          _buildDrawerMenuItem(
            icon: Icons.sports_hockey,
            label: '수업',
            href: '/classes',
            isDarkMode: isDarkMode,
          ),
          _buildDrawerMenuItem(
            icon: Icons.emoji_events_outlined,
            activeIcon: Icons.emoji_events_rounded,
            label: '뱃지',
            href: '/badges',
            isDarkMode: isDarkMode,
            showDivider: true,
          ),
          _buildDrawerMenuItem(
            icon: Icons.insights_outlined,
            activeIcon: Icons.insights_rounded,
            label: '실력 리포트',
            href: '/skill-report',
            isDarkMode: isDarkMode,
          ),
        ]);
        break;

      case UserType.admin:
        items.addAll([
          _buildDrawerMenuItem(
            icon: Icons.groups_outlined,
            activeIcon: Icons.groups_rounded,
            label: '회원 관리',
            href: '/members',
            isDarkMode: isDarkMode,
          ),
          _buildDrawerMenuItem(
            icon: Icons.bar_chart_outlined,
            activeIcon: Icons.bar_chart_rounded,
            label: '통계',
            href: '/settlements',
            isDarkMode: isDarkMode,
          ),
          _buildDrawerMenuItem(
            icon: Icons.payments_outlined,
            activeIcon: Icons.payments_rounded,
            label: '정산 관리',
            href: '/payments-manage',
            isDarkMode: isDarkMode,
            showDivider: true,
          ),
          _buildDrawerMenuItem(
            icon: Icons.campaign_outlined,
            activeIcon: Icons.campaign_rounded,
            label: '공지 관리',
            href: '/notices-manage',
            isDarkMode: isDarkMode,
          ),
        ]);
        break;

      case UserType.director:
        items.addAll([
          _buildDrawerMenuItem(
            icon: Icons.calendar_today_outlined,
            activeIcon: Icons.calendar_today,
            label: '일정',
            href: '/director-schedules',
            isDarkMode: isDarkMode,
          ),
          _buildDrawerMenuItem(
            icon: Icons.groups_outlined,
            activeIcon: Icons.groups_rounded,
            label: '팀원 관리',
            href: '/team',
            isDarkMode: isDarkMode,
          ),
          _buildDrawerMenuItem(
            icon: Icons.analytics_outlined,
            activeIcon: Icons.analytics_rounded,
            label: '통계',
            href: '/statistics',
            isDarkMode: isDarkMode,
            showDivider: true,
          ),
          _buildDrawerMenuItem(
            icon: Icons.newspaper_outlined,
            activeIcon: Icons.newspaper_rounded,
            label: '클럽 소식',
            href: '/club/news',
            isDarkMode: isDarkMode,
          ),
        ]);
        break;

      default:
        break;
    }

    // 공통 메뉴
    items.add(const SizedBox(height: 8));
    items.add(Divider(
      height: 1,
      color: isDarkMode ? AppColors.darkDivider : AppColors.dividers,
      indent: 20,
      endIndent: 20,
    ));
    items.add(const SizedBox(height: 8));

    items.addAll([
      _buildDrawerMenuItem(
        icon: Icons.notifications_outlined,
        activeIcon: Icons.notifications_rounded,
        label: '알림',
        href: '/notifications',
        isDarkMode: isDarkMode,
      ),
      _buildDrawerMenuItem(
        icon: Icons.person_outline_rounded,
        activeIcon: Icons.person_rounded,
        label: '마이페이지',
        href: '/mypage',
        isDarkMode: isDarkMode,
      ),
      _buildDrawerMenuItem(
        icon: Icons.settings_outlined,
        activeIcon: Icons.settings_rounded,
        label: '설정',
        href: '/settings',
        isDarkMode: isDarkMode,
      ),
    ]);

    // Drawer 위치 설정 토글
    items.add(const SizedBox(height: 8));
    items.add(Divider(
      height: 1,
      color: isDarkMode ? AppColors.darkDivider : AppColors.dividers,
      indent: 20,
      endIndent: 20,
    ));
    items.add(const SizedBox(height: 8));
    items.add(_buildDrawerPositionToggle(isDarkMode));

    return items;
  }

  /// Drawer 위치 설정 토글 위젯
  Widget _buildDrawerPositionToggle(bool isDarkMode) {
    final isRightPosition = _drawerPosition == 'right';
    final textColor =
        isDarkMode ? AppColors.darkTextPrimary : AppColors.darkText;
    final secondaryColor =
        isDarkMode ? AppColors.darkTextSecondary : AppColors.lightText;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: () async {
            HapticFeedback.lightImpact();
            final newPosition = isRightPosition ? 'left' : 'right';

            // 설정 저장
            await _tokenStorage.saveDrawerPosition(newPosition);

            // 상태 업데이트
            if (mounted && !_isDisposed) {
              setState(() {
                _drawerPosition = newPosition;
              });
            }

            // Drawer 닫기 및 반대쪽으로 다시 열기
            if (mounted && !_isDisposed) Navigator.of(context).pop();

            // 약간의 딜레이 후 새 위치에서 열기
            await Future.delayed(const Duration(milliseconds: 300));
            if (mounted && !_isDisposed) {
              if (newPosition == 'right') {
                _scaffoldKey.currentState?.openEndDrawer();
              } else {
                _scaffoldKey.currentState?.openDrawer();
              }
            }
          },
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            child: Row(
              children: [
                Icon(
                  isRightPosition
                      ? Icons.chevron_right_rounded
                      : Icons.chevron_left_rounded,
                  color: secondaryColor,
                  size: 24,
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '메뉴 위치',
                        style: TextStyle(
                          color: textColor,
                          fontSize: 15,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        isRightPosition ? '오른쪽에서 열림' : '왼쪽에서 열림',
                        style: TextStyle(
                          color: secondaryColor,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
                // 토글 스위치
                Switch.adaptive(
                  value: isRightPosition,
                  onChanged: (value) async {
                    HapticFeedback.lightImpact();
                    final newPosition = value ? 'right' : 'left';

                    // 설정 저장
                    await _tokenStorage.saveDrawerPosition(newPosition);

                    // 상태 업데이트
                    if (mounted && !_isDisposed) {
                      setState(() {
                        _drawerPosition = newPosition;
                      });
                    }

                    // Drawer 닫기 및 반대쪽으로 다시 열기
                    if (mounted && !_isDisposed) Navigator.of(context).pop();

                    // 약간의 딜레이 후 새 위치에서 열기
                    await Future.delayed(const Duration(milliseconds: 300));
                    if (mounted && !_isDisposed) {
                      if (newPosition == 'right') {
                        _scaffoldKey.currentState?.openEndDrawer();
                      } else {
                        _scaffoldKey.currentState?.openDrawer();
                      }
                    }
                  },
                  activeTrackColor: AppColors.primary,
                  thumbColor: WidgetStateProperty.all(Colors.white),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// 사용자 타입별 홈 경로
  ///
  /// [hotfix 2026-05-14] 무한 reload 루프 수정:
  ///  1. trailing slash 누락 → next.config trailingSlash:true 로 308 redirect 발생 → WebView reload 반복.
  ///     모든 case 에 `/role/` 형태로 trailing slash 명시 (1 round-trip 절약).
  ///  2. default fallback 이 `/parent` 였음 — DIRECTOR/UNKNOWN userType 도 /parent 로 진입 후
  ///     useRequireRole(['parent','admin']) 거부 → redirect → 다시 /parent 강제 진입 → 무한 루프.
  ///     default 를 `/login/` 으로 변경하여 안전한 fallback 보장.
  String _getHomePathByUserType() {
    switch (_userType) {
      case UserType.parent:
        return '/parent/';
      case UserType.coach:
        return '/coach/';
      case UserType.child:
        return '/child/';
      case UserType.teen:
        return '/teen/';
      case UserType.admin:
        return '/admin/';
      case UserType.director:
        return '/director/';
      default:
        return '/login/';
    }
  }

  /// Drawer 메뉴 아이템 위젯 빌드
  Widget _buildDrawerMenuItem({
    required IconData icon,
    IconData? activeIcon,
    required String label,
    required String href,
    required bool isDarkMode,
    bool showDivider = false,
  }) {
    final isActive =
        _currentPath == href || (_currentPath?.startsWith('$href/') ?? false);

    const activeColor = AppColors.primary;
    final textColor = isDarkMode
        ? (isActive ? activeColor : AppColors.darkTextPrimary)
        : (isActive ? activeColor : AppColors.darkText);
    final iconColor = isDarkMode
        ? (isActive ? activeColor : AppColors.darkTextSecondary)
        : (isActive ? activeColor : AppColors.lightText);
    final bgColor = isActive
        ? activeColor.withValues(alpha: isDarkMode ? 0.15 : 0.08)
        : Colors.transparent;

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
          child: Material(
            color: bgColor,
            borderRadius: BorderRadius.circular(12),
            child: InkWell(
              onTap: () {
                HapticFeedback.lightImpact();
                Navigator.of(context).pop(); // Drawer 닫기
                _navigateInWebView(href); // WebView 내 네비게이션
              },
              borderRadius: BorderRadius.circular(12),
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                child: Row(
                  children: [
                    Icon(
                      isActive ? (activeIcon ?? icon) : icon,
                      color: iconColor,
                      size: 24,
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Text(
                        label,
                        style: TextStyle(
                          color: textColor,
                          fontSize: 15,
                          fontWeight:
                              isActive ? FontWeight.w600 : FontWeight.w500,
                        ),
                      ),
                    ),
                    if (isActive)
                      Container(
                        width: 6,
                        height: 6,
                        // ignore: prefer_const_constructors
                        decoration: BoxDecoration(
                          color: activeColor,
                          shape: BoxShape.circle,
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
        if (showDivider)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
            child: Divider(
              height: 1,
              color: isDarkMode ? AppColors.darkDivider : AppColors.dividers,
            ),
          ),
      ],
    );
  }

  /// WebView 내 네비게이션 (JavaScript 사용)
  void _navigateInWebView(String href) {
    debugPrint('[WebView] Drawer 네비게이션: $href');

    // 현재 경로와 같으면 무시
    if (_currentPath == href) {
      debugPrint('[WebView] Same path, skipping navigation');
      return;
    }

    setState(() {
      _currentPath = href;
    });

    // 클라이언트 사이드 네비게이션 (JavaScript)
    webViewController?.evaluateJavascript(source: '''
      (function() {
        console.log('[FlutterBridge] Drawer navigation to: $href');

        // 방법 1: FlutterBridge의 teamplusNavigate 함수 사용 (권장)
        if (window.teamplusNavigate) {
          window.teamplusNavigate('$href');
          return;
        }

        // 방법 2: Next.js router 직접 접근 (폴백)
        if (window.__NEXT_ROUTER_PUSH__) {
          window.__NEXT_ROUTER_PUSH__('$href');
          return;
        }

        // 방법 3: history.pushState + popstate 이벤트 (폴백)
        console.log('[FlutterBridge] Using history.pushState fallback');
        window.history.pushState({}, '', '$href');
        window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
      })();
    ''');
  }

  /// Drawer 하단 영역 (로그아웃)
  Widget _buildDrawerFooter(bool isDarkMode) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        border: Border(
          top: BorderSide(
            color: isDarkMode ? AppColors.darkDivider : AppColors.dividers,
          ),
        ),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            onPressed: () async {
              HapticFeedback.mediumImpact();
              Navigator.of(context).pop(); // Drawer 닫기

              // 로그아웃 처리: 토큰 삭제 및 로그인 페이지로 이동
              await _tokenStorage.clearAll();
              _navigateInWebView('/login');
            },
            icon: Icon(
              Icons.logout_rounded,
              size: 20,
              color: isDarkMode
                  ? AppColors.darkTextSecondary
                  : AppColors.lightText,
            ),
            label: Text(
              '로그아웃',
              style: TextStyle(
                color: isDarkMode
                    ? AppColors.darkTextSecondary
                    : AppColors.lightText,
                fontWeight: FontWeight.w500,
              ),
            ),
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 14),
              side: BorderSide(
                color: isDarkMode ? AppColors.darkDivider : AppColors.dividers,
              ),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// WebView Bridge 가져오기
  WebViewBridge? get bridge => _bridge;

  /// 현재 WebView가 뒤로가기 가능한지 확인
  /// - WebViewController가 아직 생성되지 않았거나 dispose된 경우 false
  Future<bool> canGoBack() async {
    if (_isDisposed) return false;
    return await webViewController?.canGoBack() ?? false;
  }

  /// WebView 뒤로가기
  /// - WebViewController가 아직 생성되지 않았거나 dispose된 경우 no-op
  Future<void> goBack() async {
    if (_isDisposed) return;
    await webViewController?.goBack();
  }

  /// WebView 새로고침
  /// - WebViewController가 아직 생성되지 않았거나 dispose된 경우 no-op
  Future<void> reload() async {
    if (_isDisposed) return;
    await webViewController?.reload();
  }
}
