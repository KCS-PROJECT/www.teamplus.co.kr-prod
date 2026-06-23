// WebView Bridge 모델/타입 (UIConfig, 콜백 typedef) — C-2 분리 2026-06-07
part of 'webview_bridge.dart';

/// UI 설정 데이터 클래스
class UIConfig {
  // ============================================
  // StatusBar 설정
  // ============================================
  final bool? showStatusBar;
  final bool? statusBarLight; // true: 흰색 아이콘, false: 검정 아이콘
  final String? statusBarColor; // HEX 색상 (예: '#FFFFFF') - Android only

  /// 하단 시스템 네비게이션 바 색상 (Android, AARRGGBB 또는 RRGGBB HEX).
  /// 웹 모달이 뜨는 동안 dim 오버레이와 톤을 맞추기 위해 동적 변경 가능.
  /// null을 전달하면 기본 색상으로 복원된다.
  final String? navigationBarColor;

  /// Scaffold 배경색 (iOS safe area 상/하단 영역의 색을 결정).
  /// 웹 모달과 톤을 맞출 때 사용. null이면 기본 콘텐츠 배경으로 복원.
  final String? scaffoldBackgroundColor;

  /// 전체화면 Dim 오버레이 표시 여부.
  /// iOS는 SystemUiOverlayStyle 색상 필드가 무시되고 Scaffold 배경은 InAppWebView
  /// 합성 충돌로 반투명 불가하므로, Stack 위에 IgnorePointer Container를 얹는 방식으로
  /// Status Bar · Safe Area · System Navigation Bar 전 영역을 공통 dim 처리한다.
  final bool? showScrim;

  /// Scrim 오버레이 색상 (AARRGGBB 또는 RRGGBB HEX). null 전달 시 기본 `0xB3020617`.
  final String? scrimColor;

  /// 하단 home indicator / system navigation bar 영역 전용 색상.
  /// null 이면 scrimColor 와 같은 색을 사용한다.
  final String? scrimBottomColor;

  /// 하단 home indicator / system navigation bar 영역 scrim 적용 여부.
  /// null = true 기본 (상하단 모두 dim).
  ///
  /// BottomSheet 류는 false 로 설정 — 시트 카드가 화면 하단까지 차지하므로
  /// 하단 native scrim 이 카드 위에 덮여 시각 버그 발생(2026-05-16 사건).
  /// SoT: docs/Design/MODAL_DIM_POLICY.md
  final bool? scrimBottom;

  // ============================================
  // AppBar 설정
  // ============================================
  final bool? showAppBar;
  final String? appBarTitle;
  final String? appBarColor; // HEX 색상 (예: '#FFFFFF')
  final bool? showBackButton; // 뒤로가기 버튼 (<) 표시
  final bool? showMenuButton; // 햄버거 메뉴 버튼 표시
  final String? menuButtonPosition; // 메뉴 버튼 위치 ('left' | 'right')
  final bool? showRefreshButton; // 새로고침 버튼 표시

  // ============================================
  // BottomNav 설정
  // ============================================
  final bool? showBottomNav;

  // ============================================
  // 로딩 상태
  // ============================================
  final bool? isLoading; // 클라이언트 사이드 네비게이션 시 로딩 상태

  // ============================================
  // PullToRefresh 정책 (2026-05-13 신규 — 이슈 D15)
  // ============================================
  /// Native InAppWebView Pull-to-Refresh 활성화 여부.
  ///
  /// - `null` (미지정) : 기본 정책 = URL 기반 자동 (인증/온보딩 경로 비활성, 그 외 활성)
  /// - `true`          : 강제 활성화 (페이지가 명시적으로 PTR 사용 의도)
  /// - `false`         : 강제 비활성화 (페이지가 자체 새로고침 UX 사용 — 의도치 않은 reload 방지)
  ///
  /// Web 측 `useNativeUI({ pullToRefreshEnabled: false })` 또는
  /// `ui.setPullToRefresh(false)` 로 페이지별 opt-out 가능.
  final bool? pullToRefreshEnabled;

  /// 색상 관련 필드가 JSON에 존재했는지 여부 (null 자체도 "리셋" 신호로 의미 있음).
  /// 일반 bool/String 필드는 null=미지정을 의미하지만, 색상 리셋은 null을 명시적으로 전달해야
  /// "기본값으로 복원"을 트리거할 수 있으므로 구분이 필요하다.
  final bool hasStatusBarColorKey;
  final bool hasNavigationBarColorKey;
  final bool hasScaffoldBackgroundColorKey;

  const UIConfig({
    // StatusBar
    this.showStatusBar,
    this.statusBarLight,
    this.statusBarColor,
    this.navigationBarColor,
    this.scaffoldBackgroundColor,
    this.showScrim,
    this.scrimColor,
    this.scrimBottomColor,
    this.scrimBottom,
    // AppBar
    this.showAppBar,
    this.appBarTitle,
    this.appBarColor,
    this.showBackButton,
    this.showMenuButton,
    this.menuButtonPosition,
    this.showRefreshButton,
    // BottomNav
    this.showBottomNav,
    // Loading
    this.isLoading,
    // PullToRefresh
    this.pullToRefreshEnabled,
    // 명시적 키 존재 플래그
    this.hasStatusBarColorKey = false,
    this.hasNavigationBarColorKey = false,
    this.hasScaffoldBackgroundColorKey = false,
  });

  factory UIConfig.fromJson(Map<String, dynamic> json) {
    return UIConfig(
      // StatusBar
      showStatusBar: json['showStatusBar'] as bool?,
      statusBarLight: json['statusBarLight'] as bool?,
      statusBarColor: json['statusBarColor'] as String?,
      navigationBarColor: json['navigationBarColor'] as String?,
      scaffoldBackgroundColor: json['scaffoldBackgroundColor'] as String?,
      showScrim: json['showScrim'] as bool?,
      scrimColor: json['scrimColor'] as String?,
      scrimBottomColor: json['scrimBottomColor'] as String?,
      scrimBottom: json['scrimBottom'] as bool?,
      // AppBar
      showAppBar: json['showAppBar'] as bool?,
      appBarTitle: json['appBarTitle'] as String?,
      appBarColor: json['appBarColor'] as String?,
      showBackButton: json['showBackButton'] as bool?,
      showMenuButton: json['showMenuButton'] as bool?,
      menuButtonPosition: json['menuButtonPosition'] as String?,
      showRefreshButton: json['showRefreshButton'] as bool?,
      // BottomNav
      showBottomNav: json['showBottomNav'] as bool?,
      // Loading
      isLoading: json['isLoading'] as bool?,
      // PullToRefresh (2026-05-13)
      pullToRefreshEnabled: json['pullToRefreshEnabled'] as bool?,
      // 키 존재 플래그 (null 값 리셋 구분용)
      hasStatusBarColorKey: json.containsKey('statusBarColor'),
      hasNavigationBarColorKey: json.containsKey('navigationBarColor'),
      hasScaffoldBackgroundColorKey:
          json.containsKey('scaffoldBackgroundColor'),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      // StatusBar
      'showStatusBar': showStatusBar,
      'statusBarLight': statusBarLight,
      'statusBarColor': statusBarColor,
      'navigationBarColor': navigationBarColor,
      'scaffoldBackgroundColor': scaffoldBackgroundColor,
      'showScrim': showScrim,
      'scrimColor': scrimColor,
      'scrimBottomColor': scrimBottomColor,
      'scrimBottom': scrimBottom,
      // AppBar
      'showAppBar': showAppBar,
      'appBarTitle': appBarTitle,
      'appBarColor': appBarColor,
      'showBackButton': showBackButton,
      'showMenuButton': showMenuButton,
      'menuButtonPosition': menuButtonPosition,
      'showRefreshButton': showRefreshButton,
      // BottomNav
      'showBottomNav': showBottomNav,
      // Loading
      'isLoading': isLoading,
      // PullToRefresh
      'pullToRefreshEnabled': pullToRefreshEnabled,
    };
  }

  @override
  String toString() {
    return 'UIConfig(showStatusBar: $showStatusBar, statusBarLight: $statusBarLight, statusBarColor: $statusBarColor, navigationBarColor: $navigationBarColor, scaffoldBackgroundColor: $scaffoldBackgroundColor, showAppBar: $showAppBar, appBarTitle: $appBarTitle, appBarColor: $appBarColor, showBackButton: $showBackButton, showMenuButton: $showMenuButton, menuButtonPosition: $menuButtonPosition, showRefreshButton: $showRefreshButton, showBottomNav: $showBottomNav, isLoading: $isLoading, pullToRefreshEnabled: $pullToRefreshEnabled)';
  }
}

/// UI 변경 콜백 타입
typedef UIConfigCallback = void Function(UIConfig config);

/// 네비게이션 요청 콜백 타입 (Web → Native)
typedef NavigationRequestCallback = void Function(
  String route,
  Map<String, dynamic>? params,
);
