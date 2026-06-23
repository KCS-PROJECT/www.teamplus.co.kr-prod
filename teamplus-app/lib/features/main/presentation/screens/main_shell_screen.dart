import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import '../../../../core/theme/colors.dart';
import '../../../../core/webview/webview_bridge.dart';
import '../../../../core/webview/webview_screen.dart';
import '../../../../core/constants/app_environment.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../../data/models/menu_model.dart';
import '../providers/menu_provider.dart';

class MainShellScreen extends ConsumerStatefulWidget {
  const MainShellScreen({super.key});

  @override
  ConsumerState<MainShellScreen> createState() => _MainShellScreenState();
}

class _MainShellScreenState extends ConsumerState<MainShellScreen> {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  int _currentIndex = 0;
  late List<GlobalKey<WebViewScreenState>> _webViewKeys;

  // ─── 안드로이드 하드웨어 백키 통합 처리 (2026-05-16) ───────────────────
  /// Web 이 하드웨어 백키 가로채기를 등록했는지 추적.
  /// `useAppBack` 훅의 `setHardwareBackEnabled(true)` 호출 시 true 로 갱신된다.
  /// false 면 native 가 단독으로 fallback 처리 (moveTaskToBack — 백그라운드 전송).
  bool _hardwareBackEnabled = false;

  /// Web 위임 중복 방지용 completer. 백키 연타 시 첫 요청만 처리한다.
  Completer<void>? _pendingBackCompleter;

  /// Web 응답 timeout 안전망 timer.
  /// Web 이 1.5초 내 ACK(`backReceived`) 미발송 시 native fallback 발동.
  Timer? _pendingBackTimer;

  static const Duration _backTimeout = Duration(milliseconds: 1500);

  @override
  void initState() {
    super.initState();
    // 최대 5개 탭을 위한 키 미리 생성
    _webViewKeys = List.generate(5, (_) => GlobalKey<WebViewScreenState>());
  }

  @override
  void dispose() {
    _pendingBackTimer?.cancel();
    _pendingBackTimer = null;
    _pendingBackCompleter = null;
    super.dispose();
  }

  /// 웹뷰로부터 헤더 업데이트 요청 수신.
  ///
  /// 레거시 `overrideBack` 키 호환 — Web 측 변경 전 빌드에서도 안전하게 동작.
  /// Web 이 새 인터페이스(`setHardwareBackEnabled`)로 전환되면 `overrideBack` 키는
  /// 점진 deprecate 후 다음 릴리스에서 제거.
  void _onHeaderUpdate(Map<String, dynamic> data) {
    setState(() {
      if (data.containsKey('overrideBack')) {
        _hardwareBackEnabled = (data['overrideBack'] as bool?) ?? false;
      }
      if (data.containsKey('activeTab')) {
        _currentIndex = data['activeTab'];
      }
    });
  }

  /// 네비게이션 액션 수신 (WebViewBridge → WebViewScreen → 본 핸들러)
  void _onNavigationAction(String action, dynamic data) {
    if (action == 'back') {
      _handleBack();
    } else if (action == 'hardwareBackEnabled') {
      // Web 이 setHardwareBackEnabled(true/false) 호출 → 플래그 갱신
      final enabled =
          (data is Map) ? ((data['enabled'] as bool?) ?? false) : false;
      if (mounted) {
        setState(() => _hardwareBackEnabled = enabled);
      }
    } else if (action == 'backReceived') {
      // Web 이 백키 이벤트 정상 수신 ACK → fallback timer 취소
      _pendingBackTimer?.cancel();
      _pendingBackTimer = null;
      final completer = _pendingBackCompleter;
      if (completer != null && !completer.isCompleted) {
        completer.complete();
      }
    } else if (action == 'send') {
      final subAction = data['subAction'];
      if (subAction == 'switchTab') {
        final index = data['data'] as int?;
        if (index != null) setState(() => _currentIndex = index);
      }
    }
  }

  /// 통합 뒤로가기 처리.
  ///
  /// 우선순위:
  ///   1) iOS → PopScope edge swipe 외에는 호출되지 않으므로 즉시 return
  ///   2) Web 이 가로채기 등록(`_hardwareBackEnabled=true`) → Web 에 위임 + 1.5초 timeout
  ///   3) 그 외(브릿지 미준비 / Web 미준비 등) → native fallback (moveTaskToBack)
  Future<void> _handleBack() async {
    // iOS 는 하드웨어 백키 없음. edge swipe 도달 시 기본 동작 유지.
    if (Platform.isIOS) return;

    final currentState = _webViewKeys[_currentIndex].currentState;
    if (currentState == null) {
      await _fallbackBack();
      return;
    }

    final bridge = currentState.bridge;
    if (bridge == null || !_hardwareBackEnabled) {
      await _fallbackBack();
      return;
    }

    await _delegateBackToWeb(bridge);
  }

  /// Web 에 백키 이벤트 위임 + timeout 안전망.
  ///
  /// 흐름:
  ///   1) Flutter → Web: `sendHardwareBackToWeb()` ({type:'navigation', action:'hardwareBackPressed'})
  ///   2) Web `useAppBack` 훅이 수신 → router.back / 종료 confirm / 역할 홈 router.replace
  ///   3) Web → Flutter: `callHandler('navigation', {action:'backReceived'})` ACK
  ///   4) `_onNavigationAction('backReceived')` → timer cancel, completer complete
  ///   5) ACK 미도착 시 1.5초 후 native fallback (`_fallbackBack`)
  Future<void> _delegateBackToWeb(WebViewBridge bridge) async {
    // 중복 위임 방지 (백키 연타)
    final inFlight = _pendingBackCompleter;
    if (inFlight != null && !inFlight.isCompleted) {
      return;
    }

    final completer = Completer<void>();
    _pendingBackCompleter = completer;

    _pendingBackTimer = Timer(_backTimeout, () {
      if (!completer.isCompleted) {
        completer.complete();
        debugPrint('[BackKey] Web 응답 timeout → native fallback');
        _fallbackBack();
      }
    });

    try {
      await bridge.sendHardwareBackToWeb();
    } catch (e) {
      _pendingBackTimer?.cancel();
      _pendingBackTimer = null;
      if (!completer.isCompleted) completer.complete();
      debugPrint('[BackKey] sendHardwareBackToWeb 실패: $e → native fallback');
      await _fallbackBack();
    }
  }

  /// 다이얼로그 중복 표시 방지 (백키 연타 가드).
  bool _isFallbackDialogOpen = false;

  /// Web 미응답 또는 브릿지 미준비 시 안전 fallback.
  ///
  /// 2026-05-16 보정 — `SystemChannels.platform.invokeMethod('SystemNavigator.pop', false)`
  /// 가 일부 디바이스/Activity 설정에서 moveTaskToBack 대신 Activity finish 로 동작하여
  /// 의도치 않게 앱이 종료되는 문제가 보고됨. 따라서 native 종료 동작 대신
  /// `NativeBackGuard` 와 동일한 종료 확인 AlertDialog 를 표시한다.
  Future<void> _fallbackBack() async {
    if (!mounted) return;
    if (Navigator.of(context).canPop()) {
      Navigator.of(context).pop();
      return;
    }

    if (_isFallbackDialogOpen) return;
    _isFallbackDialogOpen = true;
    try {
      final confirmed = await showDialog<bool>(
        context: context,
        barrierDismissible: true,
        builder: (dialogContext) {
          return AlertDialog(
            title: const Text('앱을 종료하시겠습니까?'),
            content: const Text('TEAMPLUS 앱을 완전히 종료합니다.'),
            actionsAlignment: MainAxisAlignment.spaceBetween,
            actions: [
              TextButton(
                onPressed: () => Navigator.of(dialogContext).pop(false),
                child: const Text('취소'),
              ),
              TextButton(
                style: TextButton.styleFrom(
                  foregroundColor: const Color(0xFFDC2626), // red-600
                ),
                onPressed: () => Navigator.of(dialogContext).pop(true),
                child: const Text('종료하기'),
              ),
            ],
          );
        },
      );
      if (confirmed == true && Platform.isAndroid) {
        await SystemNavigator.pop();
      }
    } finally {
      _isFallbackDialogOpen = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    // 서버에서 받아온 전체 메뉴 구성 감시
    final menuConfigAsync = ref.watch(appMenuConfigProvider);
    return menuConfigAsync.when(
      data: (config) {
        final bottomTabs = config.bottomTabs;

        // 인덱스 범위 체크
        if (_currentIndex >= bottomTabs.length) {
          _currentIndex = (bottomTabs.length / 2).floor();
        }

        return PopScope(
          canPop: false,
          onPopInvokedWithResult: (didPop, result) async {
            if (didPop) return;
            await _handleBack();
          },
          child: Scaffold(
            key: _scaffoldKey,
            // AppBar/BottomNav: 웹(WebView)에서 제공 → 네이티브 영역 제거
            endDrawerEnableOpenDragGesture: false,
            endDrawer: _buildDrawer(config.drawerMenus),
            body: IndexedStack(
              index: _currentIndex,
              children: List.generate(bottomTabs.length, (index) {
                return WebViewScreen(
                  key: _webViewKeys[index],
                  initialUrl: bottomTabs[index].routePath,
                  showAppBar: false,
                  showBottomNav: false,
                  onHeaderUpdate: _onHeaderUpdate,
                  onNavigationAction: _onNavigationAction,
                );
              }),
            ),
          ),
        );
      },
      loading: () =>
          const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (err, _) => Scaffold(body: Center(child: Text('메뉴 로드 실패: $err'))),
    );
  }

  Widget _buildDrawer(List<MenuItem> drawerMenus) {
    // 🔐 실제 사용자 정보 가져오기 (AuthProvider 활용)
    final userType = ref.watch(currentUserTypeProvider).value ?? 'parent';

    return Drawer(
      backgroundColor: Colors.white,
      child: Column(
        children: [
          // 드로어 헤더: 사용자 프로필 및 설정 버튼
          Container(
            padding:
                const EdgeInsets.only(top: 50, bottom: 20, left: 20, right: 16),
            decoration: const BoxDecoration(
              color: AppColors.primary,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const CircleAvatar(
                      radius: 30,
                      backgroundColor: Colors.white,
                      child: Icon(Icons.person,
                          color: AppColors.primary, size: 35),
                    ),
                    // ⚙️ 설정 버튼 (드로어 상단 배치)
                    IconButton(
                      icon: const Icon(Icons.settings, color: Colors.white),
                      onPressed: () {
                        Navigator.pop(context); // 드로어 닫기
                        context.push('/settings'); // 설정 화면 이동
                      },
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                const Text(
                  '안녕하세요!',
                  style: TextStyle(color: Colors.white70, fontSize: 14),
                ),
                Text(
                  '${userType.toUpperCase()} 회원님',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ),

          // 동적 메뉴 리스트
          Expanded(
            child: ListView(
              padding: const EdgeInsets.symmetric(vertical: 8),
              children: [
                ...drawerMenus.map((menu) => ListTile(
                      leading: Icon(menu.iconData,
                          color: AppColors.darkText, size: 24),
                      title: Text(
                        menu.title,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w500,
                          color: AppColors.darkText,
                        ),
                      ),
                      trailing: const Icon(Icons.chevron_right,
                          color: Colors.grey, size: 20),
                      onTap: () {
                        Navigator.pop(context); // 드로어 닫기
                        if (menu.isWeb) {
                          // 웹 페이지 이동: 타이틀은 Web 페이지가 로드 후 직접 설정
                          _onHeaderUpdate({'title': null});
                          _webViewKeys[_currentIndex]
                              .currentState
                              ?.webViewController
                              ?.loadUrl(
                                  urlRequest: URLRequest(
                                      url: WebUri(
                                          '${appEnv.webAppUrl}${menu.routePath}')));
                        } else {
                          // 네이티브 화면 이동
                          context.push(menu.routePath);
                        }
                      },
                    )),
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 16),
                  child: Divider(),
                ),
                // 로그아웃 버튼
                ListTile(
                  leading: const Icon(Icons.logout, color: Colors.redAccent),
                  title: const Text(
                    '로그아웃',
                    style: TextStyle(
                        color: Colors.redAccent, fontWeight: FontWeight.w600),
                  ),
                  onTap: () {
                    Navigator.pop(context);
                    ref.read(logoutProvider);
                    // [2026-05-19] 네이티브 /login 폐기 → WebView /login/ 단일 SoT.
                    context.go('/webview');
                  },
                ),
              ],
            ),
          ),

          // 푸터: 앱 버전 정보
          Container(
            padding: const EdgeInsets.all(20),
            child: const Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  'TEAMPLUS App v1.0.0',
                  style: TextStyle(color: Colors.grey, fontSize: 12),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
