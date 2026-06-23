import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/providers/shared_providers.dart';
import '../../../../core/menu/menu_models.dart' show AppServerMenuItem;
import '../../../auth/presentation/providers/auth_provider.dart';
import '../../data/models/menu_model.dart';
import '../../data/datasources/menu_storage_service.dart';

/// 메뉴 저장소 서비스 프로바이더
final menuStorageServiceProvider = Provider((ref) => MenuStorageService());

/// 앱 전체 메뉴 구성을 관리하는 프로바이더
/// 1. 먼저 로컬 파일에서 읽어옴
/// 2. 서버에서 새로운 구성을 가져와 로컬 파일 업데이트
final appMenuConfigProvider = FutureProvider<AppMenuConfig>((ref) async {
  final apiClient = ref.watch(apiClientProvider);
  final storage = ref.watch(menuStorageServiceProvider);
  final userType = await ref.watch(currentUserTypeProvider.future);

  // [1] 먼저 로컬 캐시(파일)에서 읽어오기 시도
  final cachedMenu = await storage.loadMenu();

  try {
    // [2] 서버에서 최신 메뉴 구성 가져오기
    final response = await apiClient.get('/menu/config');

    if (response.data != null && response.data['success'] == true) {
      final newConfig = AppMenuConfig.fromJson(response.data['data']);

      // [3] 서버 데이터를 로컬 파일로 저장 (기존 파일 삭제 후 새 파일 생성)
      await storage.saveMenu(newConfig);

      return newConfig;
    }
  } catch (e) {
    // 서버 호출 실패 시 캐시된 메뉴가 있으면 그것을 사용
    if (cachedMenu != null) return cachedMenu;
  }

  // 서버도 실패하고 캐시도 없으면 Fallback 기본값 사용
  final fallback = _getFallbackConfig(userType);
  await storage.saveMenu(fallback); // 기본값이라도 저장해둠
  return fallback;
});

/// 서버 AppMenu API 연동 Provider
/// GET /api/v1/menus/my → 로그인 사용자 역할 기반 메뉴 반환
///
/// - Riverpod FutureProvider 는 기본적으로 non-autoDispose 이며,
///   추가로 `ref.keepAlive()` 를 명시 호출하여 세션 종료/로그아웃 전까지 캐시 유지.
/// - 백엔드 응답 스펙: `GET /menus/my` 는 `AppMenuTreeNode[]` 를 직접 반환한다
///   (wrapping 없음 — Web api-client 가 클라이언트 측에서 `{success, data}` 로 래핑).
/// - 실패 시 빈 리스트 반환 (AppDrawer 정적 fallback 으로 처리).
final appServerMenuProvider =
    FutureProvider<List<AppServerMenuItem>>((ref) async {
  // 세션 유지: 화면 재진입 시 재조회 방지
  ref.keepAlive();

  final apiClient = ref.watch(apiClientProvider);

  try {
    final response = await apiClient.get('/menus/my');
    final data = response.data;

    if (data is! List) {
      debugPrint('[Menu] 예상치 못한 응답 포맷: ${data.runtimeType}');
      return [];
    }

    final items = data
        .map((item) => AppServerMenuItem.fromJson(item as Map<String, dynamic>))
        .where((item) => item.isActive)
        .toList();

    debugPrint('[Menu] 서버 메뉴 ${items.length}개 로드 완료');
    return items;
  } catch (e) {
    debugPrint('[Menu] 서버 메뉴 로드 실패: $e');
    return [];
  }
});

/// 서버 장애 시 사용할 기본 메뉴 구성
AppMenuConfig _getFallbackConfig(String? userType) {
  final isAdmin = userType?.toLowerCase() == 'admin';

  // [1] 하단 탭 기본값
  List<MenuItem> tabs = [
    MenuItem(
        id: 'tab_home',
        title: '홈',
        iconName: 'home',
        routePath: isAdmin ? '/admin' : '/parent',
        isWeb: true),
    MenuItem(
        id: 'tab_notif',
        title: '알림',
        iconName: 'notifications',
        routePath: '/notifications',
        isWeb: true),
    MenuItem(
        id: 'tab_my',
        title: '마이',
        iconName: 'person',
        routePath: '/mypage',
        isWeb: true),
  ];

  if (isAdmin) {
    tabs.insert(
        0,
        MenuItem(
            id: 'tab_member',
            title: '회원관리',
            iconName: 'group',
            routePath: '/members',
            isWeb: true));
    tabs.insert(
        1,
        MenuItem(
            id: 'tab_stats',
            title: '통계',
            iconName: 'chart',
            routePath: '/settlements',
            isWeb: true));
  } else {
    tabs.insert(
        0,
        MenuItem(
            id: 'tab_class',
            title: '수업',
            iconName: 'class',
            routePath: '/classes',
            isWeb: true));
    tabs.insert(
        1,
        MenuItem(
            id: 'tab_cal',
            title: '일정',
            iconName: 'calendar',
            routePath: '/calendar',
            isWeb: true));
  }

  return AppMenuConfig(
    bottomTabs: tabs,
    drawerMenus: [
      MenuItem(
          id: 'side_profile',
          title: '내 정보',
          iconName: 'person',
          routePath: '/mypage',
          isWeb: true),
      MenuItem(
          id: 'side_pay',
          title: '결제 내역',
          iconName: 'payment',
          routePath: '/payments/history',
          isWeb: true),
      MenuItem(
          id: 'side_support',
          title: '고객센터',
          iconName: 'help',
          routePath: '/support',
          isWeb: true),
      // 2026-04-30 (P2-GAP-APP-002): 네이티브 라우트 미등록 상태였음. teamplus-web `/settings` 페이지가
      // 이미 완성되어 있으므로 WebView fallback (isWeb: true) 으로 정책 결정. 추후 네이티브 화면이
      // 필요해지면 GoRoute 신규 등록 후 isWeb: false 로 전환.
      MenuItem(
          id: 'side_settings',
          title: '앱 설정',
          iconName: 'settings',
          routePath: '/settings',
          isWeb: true),
    ],
  );
}
