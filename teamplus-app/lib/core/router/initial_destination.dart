import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/token_storage.dart';
import '../constants/api_constants.dart';
import '../maintenance/maintenance_service.dart';
import '../webview/webview_screen.dart';
import '../../features/maintenance/presentation/screens/system_maintenance_screen.dart';
import '../../shared/widgets/teamplus_bottom_nav.dart'
    show UserType, TeamplusBottomNav;

const Color _bgPrimary = Color(0xFF1E40AF);

/// 합성 스플래시 이미지 단일 SoT — native splash 와 Flutter placeholder 가 동일
/// 파일을 사용해 전환 시 깜빡임 0.
const AssetImage _kSplashImage =
    AssetImage('assets/images/splash_combined.png');

/// iOS 26+ UIScene 환경에서 StatusBar 직접 제어용 native channel.
///
/// 동일 채널이 `webview_screen.dart` 에서도 사용됨 — Flutter SystemChrome 만으로
/// 안 숨겨지는 경우 native 측 prefersStatusBarHidden 을 직접 토글.
const MethodChannel _iosStatusBarChannel =
    MethodChannel('com.kr.www.teamplus/status_bar');

/// Flutter splash 최소 노출 시간.
///
/// Native LaunchScreen 평균 700-800ms + 본 값 120ms — 합산으로 충분한 브랜드
/// 노출을 확보하면서 콜드스타트→메인 진입 2초 목표를 위해 단축한 의도적 floor.
/// (2026-05-30 perf: 200ms → 120ms. WebView platform-view init 과 병렬 진행되어
///  대부분 흡수되며, native LaunchScreen 700ms+ 가 이미 브랜드 노출을 보장한다.)
const Duration _kMinSplashHold = Duration(milliseconds: 120);

// [v15] _kSplashFadeOut / _onSplashFadeEnd 제거됨 — splash 가 트리거 시점에
//   즉시 unmount 되어 fade/slide 어떤 애니메이션도 발생하지 않음.

/// 사용자 타입별 WebView 진입 경로.
///
/// ⚠️ trailing slash 필수 — `teamplus-web/next.config.js` 의 `trailingSlash: true`
/// 로 인해 slash 없는 경로는 HTTP 308 redirect → 흰 화면 round-trip 1회 증가.
String _dashboardPathByUserType(String? userType) {
  if (userType == null) return '/login/';
  switch (userType.toLowerCase()) {
    case 'parent':
      return '/parent/';
    case 'coach':
      return '/coach/';
    case 'admin':
      return '/admin/';
    case 'child':
    case 'teen':
      return '/child/';
    case 'director':
      return '/director/';
    default:
      return '/login/';
  }
}

/// 인증 상태에 따라 WebView 의 진입 URL · userType 을 결정한다.
///
/// SplashScreen 제거(2026-05-19) 이후, `/webview` 라우트가 `extras['url']` 없이
/// 진입했을 때 이 헬퍼가 직접 토큰을 읽어 적절한 path 를 구성한다.
///
/// [수정 v8] Riverpod provider 2회 sequential await → TokenStorage 단일
///   readAuthBundle() 호출로 변경. main.dart `_triggerEarlyPreload` 가 이미
///   warmup 한 30초 메모리 캐시를 hit 해 ~0ms 또는 cold 시 단일 Keychain read.
Future<({String url, UserType? userType})> resolveInitialDestination() async {
  final bundle = await TokenStorage().readAuthBundle();
  final userTypeStr = bundle.isAuthenticated ? bundle.userType : null;
  final targetPath = bundle.isAuthenticated
      ? _dashboardPathByUserType(userTypeStr)
      : '/login/';
  final fullUrl = '${ApiConstants.webAppUrl}$targetPath';
  final userType =
      userTypeStr != null ? TeamplusBottomNav.fromString(userTypeStr) : null;
  return (url: fullUrl, userType: userType);
}

/// `/webview` 라우트의 `extras` 가 비어 있을 때 인증 상태를 결정해
/// `WebViewScreen` 으로 위임하는 게이트.
///
/// Native LaunchScreen 과 동일한 청색 단색 배경을 그리므로 사용자에게는
/// 한 화면으로 보인다. 결정에 걸리는 시간은 TokenStorage 30초 메모리 캐시
/// 덕분에 대부분 ~0ms.
class InitialDestinationGate extends ConsumerStatefulWidget {
  const InitialDestinationGate({super.key});

  @override
  ConsumerState<InitialDestinationGate> createState() =>
      _InitialDestinationGateState();
}

/// Native LaunchScreen 과 1:1 매칭되는 브랜드 표면.
///
/// `flutter_native_splash` 가 `assets/images/splash_combined.png` 를 native 측
/// 단일 이미지로 그리므로, Flutter 측에서도 동일 PNG 를 동일 비율로 표시해
/// LaunchScreen 종료 → Dart 첫 프레임 전환 시 깜빡임을 0으로 만든다.
class _BrandedSplashSurface extends StatelessWidget {
  const _BrandedSplashSurface();

  @override
  Widget build(BuildContext context) {
    // Native LaunchScreen 의 ImageView 가 화면 전체에 stretch + contentMode=
    // scaleAspectFit 으로 동작하므로, Flutter 측도 SizedBox.expand + BoxFit.contain
    // 로 정확히 매칭. 합성 PNG (2520×2364) 가 화면 폭 기준 비율 유지하며 fit.
    //
    // gaplessPlayback: 이미 디코드된 동일 AssetImage 를 다음 frame 에 그대로
    // 재사용해 transparent flash 방지.
    return ColoredBox(
      color: _bgPrimary,
      child: SizedBox.expand(
        child: Image(
          image: _kSplashImage,
          fit: BoxFit.contain,
          filterQuality: FilterQuality.high,
          gaplessPlayback: true,
        ),
      ),
    );
  }
}

class _InitialDestinationGateState
    extends ConsumerState<InitialDestinationGate> {
  // [v8 분리] WebView 마운트는 인증 분기 끝나는 즉시(가능한 한 빠르게)
  //   진행하고, splash hold + precache 는 별도 트랙으로 fade-out 트리거.
  //   결과: WebView platform view init 이 splash 노출과 병렬 진행되어
  //   cold start 시간에서 splash hold 200ms 가 흡수됨.
  Future<({String url, UserType? userType})>? _destination;

  /// 🛠 시스템 점검 검사 — 점검 중이면 build 가 M4 화면을 고정한다.
  /// 시작 시점(여기)과 포그라운드 복귀(app.dart) 가 동일 서비스를 재사용.
  Future<MaintenanceStatus>? _maintenance;

  bool _splashReady = false;
  bool _hideSplash = false;

  /// Splash 가 mount 된 동안 적용할 SystemUI 스타일.
  ///
  /// statusbar 자체를 숨겨 깜빡임 시각적 제거. WebViewScreen 도
  /// `initialShowStatusBar: false` 로 시작되어 로그인 페이지 진입까지 유지.
  /// 페이지가 useNativeUI({ showStatusBar: true }) 호출 시 자동 복원.
  static const SystemUiOverlayStyle _splashOverlayStyle = SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
    statusBarBrightness: Brightness.dark,
    systemNavigationBarColor: _bgPrimary,
    systemNavigationBarIconBrightness: Brightness.light,
    // [2026-05-26] divider 투명화. _hideSplash 가 false 로 고정되어 이 AnnotatedRegion
    //   이 앱 생애 내내 잔존하므로, divider 를 청색으로 두면 WebView 전환 후에도
    //   navigation bar 상단에 1px 청색 줄무늬가 남는다. navbar 배경이 청색이라
    //   transparent 로 바꿔도 splash 시각은 동일.
    systemNavigationBarDividerColor: Colors.transparent,
  );

  @override
  void initState() {
    super.initState();
    _hideStatusBar();
    // main.dart 의 fire-and-forget SystemChrome 호출이 늦게 적용되어
    // statusbar 가 한 frame 표시되는 race 차단 — 첫 frame 직후 한 번 더 push.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && !_hideSplash) _hideStatusBar();
    });
  }

  /// 3중 hide 호출 — Android/iOS/iOS26+ UIScene 환경 모두 대응.
  void _hideStatusBar() {
    SystemChrome.setEnabledSystemUIMode(
      SystemUiMode.manual,
      overlays: const [SystemUiOverlay.bottom],
    );
    SystemChrome.setSystemUIOverlayStyle(_splashOverlayStyle);
    _iosStatusBarChannel
        .invokeMethod<bool>('setHidden', true)
        .catchError((_) => false);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_maintenance != null) return;

    // 트랙 0: 시스템 점검 검사 — 점검 상태가 확정될 때까지 build 가 splash 로
    //   대기하므로, 점검 중이면 로그인/홈 어떤 화면도 마운트되지 않는다.
    final maintenanceFuture = ref.read(maintenanceServiceProvider).check();
    _maintenance = maintenanceFuture;

    // 점검이 아닐 때만 인증 분기 + splash 트랙을 진행한다.
    //   (점검 중에는 토큰 read·WebView 마운트가 불필요하므로 생략 → 자원 절약)
    maintenanceFuture.then((status) {
      if (!mounted || status.isUnderMaintenance) return;

      setState(() {
        // 트랙 A: 인증 분기 — 단일 readAuthBundle, 끝나는 즉시 WebView 마운트
        _destination = resolveInitialDestination();
      });

      // 트랙 B: splash 최소 노출 + 이미지 디코드 — fade-out 트리거
      //   precacheImage 는 BuildContext 필요 → 콜백 시점의 context 사용
      Future.wait<void>([
        Future<void>.delayed(_kMinSplashHold),
        precacheImage(_kSplashImage, context),
      ]).then((_) {
        if (mounted) setState(() => _splashReady = true);
      });
    });
  }

  // [v15] _onSplashFadeEnd 제거 — 사용 안 함. splash 가 shouldFadeOut=true
  //   시점에 즉시 unmount 되므로 onEnd 콜백 불필요.

  @override
  Widget build(BuildContext context) {
    // 🛠 시스템 점검 게이트 — 점검 상태가 확정되기 전에는 브랜드 splash 로 대기해
    //   다음 화면/웹뷰 마운트를 보류하고, 점검 중이면 M4 화면을 고정한다.
    //   (네트워크 실패 시 MaintenanceService 가 fail-open → 점검 아님으로 정상 진입)
    return FutureBuilder<MaintenanceStatus>(
      future: _maintenance,
      builder: (context, maintSnap) {
        if (!maintSnap.hasData) {
          // 점검 상태 미확정 → 브랜드 splash 로 대기 (라우팅/웹뷰 마운트 보류).
          return const AnnotatedRegion<SystemUiOverlayStyle>(
            value: _splashOverlayStyle,
            child: _BrandedSplashSurface(),
          );
        }
        if (maintSnap.data!.isUnderMaintenance) {
          // 점검 중 → M4 화면 고정. onConfirm 미전달 → "확인했어요" 버튼 숨김 +
          //   PopScope(canPop:false) 로 뒤로가기/딥링크/푸시 어떤 경로로도
          //   빠져나갈 수 없다 (그대로 머무름).
          //   관리자가 등록한 공지 제목·내용·기간을 그대로 표시(동적).
          final m = maintSnap.data!;
          return SystemMaintenanceScreen(
            title: m.title,
            content: m.content,
            startAt: m.startAt,
            expiresAt: m.expiresAt,
            serverNow: m.serverNow,
            reason: m.reason,
            noticeDate: m.noticeDate,
            csPhone: m.csPhone,
            csHours: m.csHours,
          );
        }
        // 점검 아님 → 기존 정상 진입 트리.
        return _buildNormalTree();
      },
    );
  }

  /// 점검이 아닐 때의 기존 정상 진입 트리 (인증 분기 → WebView + splash overlay).
  Widget _buildNormalTree() {
    // splash 가 살아있는 동안은 AnnotatedRegion 으로 statusbar 청색 강제.
    // _hideSplash=true 시점부터 AnnotatedRegion 을 제거해 WebView 자체
    // statusbar 색상이 작동 — 단일 전환만 발생, ping-pong 없음.
    final tree = FutureBuilder<({String url, UserType? userType})>(
      future: _destination,
      builder: (context, snapshot) {
        final destReady = snapshot.hasData;
        // 두 조건 모두 충족 시에만 splash fade-out 시작:
        //   ① 인증 분기 결정 완료 (WebView 가 마운트되어 platform view init 진행 중)
        //   ② splash 최소 노출 200ms + 이미지 precache 완료
        // 한 쪽이라도 미완이면 splash 가 위에서 WebView 의 흰 frame 을 가려준다.
        final shouldFadeOut = destReady && _splashReady;
        return Stack(
          fit: StackFit.expand,
          children: [
            // 베이스: 인증 분기 결정 즉시 WebViewScreen 마운트 — platform view
            //   init 이 splash hold 와 병렬 진행되어 합산 시간에서 흡수됨.
            ColoredBox(
              color: _bgPrimary,
              child: destReady
                  ? WebViewScreen(
                      initialUrl: snapshot.data!.url,
                      title: 'TEAMPLUS',
                      userType: snapshot.data!.userType,
                      // splash → 로그인 진입 동안 statusbar 숨김 유지 → 깜빡임 0.
                      // 로그인 페이지가 useNativeUI({ showStatusBar: true })
                      // 호출하면 자동 복원.
                      initialShowStatusBar: false,
                      // [수정 2026-05-19 v14] initialScaffoldBackgroundColor=_bgPrimary
                      //   제거 — Scaffold 청색이 statusbar 영역까지 채워 splash 종료 후
                      //   "파란 띠"로 잔존하는 회귀 차단. 이제 Scaffold default(흰색)
                      //   유지하고 splash 가 위에서 SizedBox.expand 로 청색을 덮음.
                      //   AnimatedOpacity fade-out 진행 시 splash 청색이 점점 투명해지며
                      //   아래 흰색 Scaffold(=페이지 배경과 동일) 가 자연 노출.
                    )
                  : const SizedBox.expand(),
            ),
            // [수정 v15] Splash 오버레이: shouldFadeOut=true 가 되면 widget
            //   자체를 즉시 unmount (AnimatedOpacity 제거 — fade/slide 어떤
            //   애니메이션도 없음). _hideSplash 동기 결정.
            if (!shouldFadeOut && !_hideSplash)
              const IgnorePointer(
                ignoring: true,
                child: _BrandedSplashSurface(),
              ),
          ],
        );
      },
    );

    // splash 가 mount 된 동안에는 AnnotatedRegion 으로 statusbar 청색 유지.
    //   매 frame paint 시 statusbar 스타일을 청색으로 push → WebViewScreen 의
    //   imperative _updateStatusBar 호출이 다음 frame 에 즉시 override 됨.
    //   _hideSplash=true 시점부터 AnnotatedRegion 이 제거되어 WebView 의 statusbar
    //   색상이 그대로 적용 — 단 한 번의 자연 전환.
    return _hideSplash
        ? tree
        : AnnotatedRegion<SystemUiOverlayStyle>(
            value: _splashOverlayStyle,
            child: tree,
          );
  }
}
