import 'package:json_annotation/json_annotation.dart';

part 'menu_models.g.dart';

/// 서버 AppMenu API 응답 아이템 (GET /api/v1/menus/my)
@JsonSerializable(explicitToJson: true)
class AppServerMenuItem {
  final String id;
  final String userType;
  final String label;
  final String icon;
  final String href;
  final String? parentId;
  final int order;
  @JsonKey(defaultValue: true)
  final bool isActive;
  @JsonKey(defaultValue: [])
  final List<AppServerMenuItem> children;

  const AppServerMenuItem({
    required this.id,
    required this.userType,
    required this.label,
    required this.icon,
    required this.href,
    this.parentId,
    required this.order,
    this.isActive = true,
    this.children = const [],
  });

  factory AppServerMenuItem.fromJson(Map<String, dynamic> json) =>
      _$AppServerMenuItemFromJson(json);

  Map<String, dynamic> toJson() => _$AppServerMenuItemToJson(this);

  bool get hasChildren => children.isNotEmpty;
}

/// 메뉴 배지 설정
@JsonSerializable()
class MenuBadge {
  /// 배지 타입: 'count' (숫자 표시) 또는 'dot' (점 표시)
  final String type;

  /// 배지 값을 제공하는 프로바이더 ID
  final String provider;

  const MenuBadge({
    required this.type,
    required this.provider,
  });

  factory MenuBadge.fromJson(Map<String, dynamic> json) =>
      _$MenuBadgeFromJson(json);

  Map<String, dynamic> toJson() => _$MenuBadgeToJson(this);

  /// 카운트 타입인지 확인
  bool get isCount => type == 'count';

  /// 점 타입인지 확인
  bool get isDot => type == 'dot';
}

/// 개별 메뉴 아이템
@JsonSerializable()
class MenuItem {
  /// 메뉴 고유 ID
  final String id;

  /// 표시 라벨 (한글)
  final String label;

  /// 아이콘 이름 (Material Icons)
  final String icon;

  /// 라우트 경로
  final String route;

  /// 정렬 순서
  final int order;

  /// 접근 가능한 역할 목록 (parent, coach, admin, child)
  final List<String> roles;

  /// 배지 설정 (선택)
  final MenuBadge? badge;

  /// 하위 메뉴 목록
  @JsonKey(defaultValue: [])
  final List<MenuItem> children;

  const MenuItem({
    required this.id,
    required this.label,
    required this.icon,
    required this.route,
    required this.order,
    required this.roles,
    this.badge,
    this.children = const [],
  });

  factory MenuItem.fromJson(Map<String, dynamic> json) =>
      _$MenuItemFromJson(json);

  Map<String, dynamic> toJson() => _$MenuItemToJson(this);

  /// 특정 역할이 이 메뉴에 접근 가능한지 확인
  bool isAccessibleBy(String userRole) {
    return roles.contains(userRole);
  }

  /// 하위 메뉴 중 특정 역할이 접근 가능한 항목만 필터링
  List<MenuItem> getAccessibleChildren(String userRole) {
    return children.where((child) => child.isAccessibleBy(userRole)).toList();
  }

  /// 배지가 있는지 확인
  bool get hasBadge => badge != null;

  /// 하위 메뉴가 있는지 확인
  bool get hasChildren => children.isNotEmpty;
}

/// 전체 메뉴 설정
@JsonSerializable()
class MenuConfig {
  /// 설정 버전
  final String version;

  /// 마지막 업데이트 시간
  final DateTime updatedAt;

  /// 전체 메뉴 목록
  final List<MenuItem> menus;

  /// 하단 네비게이션에 표시할 메뉴 ID 목록
  final List<String> bottomNav;

  /// 드로어에 표시할 메뉴 ID 목록
  final List<String> drawer;

  const MenuConfig({
    required this.version,
    required this.updatedAt,
    required this.menus,
    required this.bottomNav,
    required this.drawer,
  });

  factory MenuConfig.fromJson(Map<String, dynamic> json) =>
      _$MenuConfigFromJson(json);

  Map<String, dynamic> toJson() => _$MenuConfigToJson(this);

  /// 특정 역할이 접근 가능한 메뉴만 필터링
  List<MenuItem> getMenusForRole(String userRole) {
    return menus.where((menu) => menu.isAccessibleBy(userRole)).toList()
      ..sort((a, b) => a.order.compareTo(b.order));
  }

  /// 특정 역할의 하단 네비게이션 메뉴 반환
  List<MenuItem> getBottomNavForRole(String userRole) {
    final accessibleMenus = getMenusForRole(userRole);
    return bottomNav
        .map((id) => accessibleMenus.where((menu) => menu.id == id).firstOrNull)
        .where((menu) => menu != null)
        .cast<MenuItem>()
        .toList();
  }

  /// 특정 역할의 드로어 메뉴 반환
  List<MenuItem> getDrawerForRole(String userRole) {
    final accessibleMenus = getMenusForRole(userRole);
    return drawer
        .map((id) => accessibleMenus.where((menu) => menu.id == id).firstOrNull)
        .where((menu) => menu != null)
        .cast<MenuItem>()
        .toList();
  }

  /// ID로 메뉴 아이템 찾기
  MenuItem? findMenuById(String id) {
    for (final menu in menus) {
      if (menu.id == id) return menu;
      for (final child in menu.children) {
        if (child.id == id) return child;
      }
    }
    return null;
  }
}
