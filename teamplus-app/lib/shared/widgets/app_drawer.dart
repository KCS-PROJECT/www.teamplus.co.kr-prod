import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/colors.dart';
import '../../core/auth/user_role.dart';
import '../../core/constants/app_environment.dart';
import '../../core/menu/menu_models.dart';
import '../../core/menu/menu_icon_mapper.dart';
import '../../features/auth/presentation/providers/auth_provider.dart';
import '../../features/main/presentation/providers/menu_provider.dart';

/// TEAMPLUS 공용 Drawer 위젯
///
/// 역할별 접이식 카테고리:
/// - Admin/Coach: 일반관리, 업무관리, 쇼핑관리, 앱관리
/// - Director: 일반관리, 업무관리, 대회/원정, 소통
/// - Parent: 자녀관리, 수업/일정, 결제/크레딧, 성장/평가
/// - Teen: 나의 활동, 성과/보상
/// - Child: 나의 활동, 나의 보물
class AppDrawer extends ConsumerStatefulWidget {
  final String? currentRoute;

  const AppDrawer({
    super.key,
    this.currentRoute,
  });

  @override
  ConsumerState<AppDrawer> createState() => _AppDrawerState();
}

class _AppDrawerState extends ConsumerState<AppDrawer> {
  // 모든 섹션이 기본적으로 닫혀 있음
  final Set<String> _expandedSections = {};

  /// GoRouter에 등록된 네이티브 라우트 목록
  /// [2026-05-19] '/login' 제거 — 네이티브 로그인 화면 폐기, WebView /login/ 단일 SoT.
  static const _nativeRoutes = <String>{
    '/',
    '/onboarding',
    '/register',
    '/biometric-lock',
    '/dashboard',
    '/coach-dashboard',
    '/qr-scanner',
    '/qr-checkin',
    '/classes',
    '/club-join',
    '/club-feed',
    '/club-events',
    '/notifications',
    '/profile',
    '/profile/edit',
    '/profile/password',
    '/profile/notifications',
    '/profile/security',
    '/attendance-history',
    '/payment-history',
    '/home',
    '/children',
    '/lesson-card',
    '/coach-admin',
    '/calendar',
    '/shop-admin',
    '/tournaments',
    '/rinks',
    '/match-recruitment',
    '/identity-verify',
    '/webview',
    '/my-qr',
  };

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authStateProvider);
    final user = authState.value;
    final userTypeAsync = ref.watch(currentUserTypeProvider);
    final role = userRoleFromType(userTypeAsync.value);
    final serverMenuAsync = ref.watch(appServerMenuProvider);

    return SafeArea(
      child: Column(
        children: [
          _buildUserHeader(user, role),
          Expanded(
            child: ListView(
              padding: EdgeInsets.zero,
              children: serverMenuAsync.when(
                data: (serverMenus) {
                  if (serverMenus.isEmpty) {
                    // 서버 메뉴 없을 때 정적 fallback
                    return _buildStaticMenuChildren(role);
                  }
                  return _buildServerMenuChildren(serverMenus);
                },
                loading: () => _buildStaticMenuChildren(role),
                error: (_, __) => _buildStaticMenuChildren(role),
              ),
            ),
          ),
          _buildLogoutButton(),
          _buildVersionInfo(),
        ],
      ),
    );
  }

  /// 서버 메뉴 동적 렌더링
  List<Widget> _buildServerMenuChildren(List<AppServerMenuItem> items) {
    final topLevel = items.where((m) => m.parentId == null).toList()
      ..sort((a, b) => a.order.compareTo(b.order));

    final List<Widget> widgets = [];

    for (final item in topLevel) {
      if (item.hasChildren) {
        final activeChildren = item.children.where((c) => c.isActive).toList()
          ..sort((a, b) => a.order.compareTo(b.order));

        widgets.add(
          _buildExpansionSection(
            key: item.id,
            title: item.label,
            icon: MenuIconMapper.getIcon(item.icon),
            children: activeChildren.map((child) {
              return _DrawerMenuItem(
                icon: MenuIconMapper.getIcon(child.icon),
                label: child.label,
                route: child.href,
              );
            }).toList(),
          ),
        );
      } else {
        widgets.add(
          _buildMenuItem(
            icon: MenuIconMapper.getIcon(item.icon),
            label: item.label,
            isSelected: widget.currentRoute == item.href,
            onTap: () {
              Navigator.pop(context);
              _navigateTo(item.href);
            },
          ),
        );
        widgets.add(const Divider(height: 1));
      }
    }

    return widgets;
  }

  /// 정적 fallback 메뉴 (서버 미연동 시)
  List<Widget> _buildStaticMenuChildren(UserRole role) {
    return [
      if (_shouldShowMainMenu(role)) ...[
        _buildMainMenu(role),
        const Divider(height: 1),
      ],
      ..._buildSectionsForRole(role),
    ];
  }

  /// 역할에 따른 배지 텍스트 반환
  String _getRoleBadgeText(UserRole role) {
    switch (role) {
      case UserRole.admin:
        return '관리자';
      case UserRole.director:
        return '감독';
      case UserRole.academyDirector:
        return '학원장';
      case UserRole.coach:
        return '코치';
      case UserRole.parent:
        return '학부모';
      case UserRole.teen:
        return '학생';
      case UserRole.child:
        return '아동';
      case UserRole.unknown:
        return '회원';
    }
  }

  /// 역할에 따른 배지 색상 반환
  Color _getRoleBadgeColor(UserRole role) {
    switch (role) {
      case UserRole.admin:
        return AppColors.primary;
      case UserRole.director:
      case UserRole.academyDirector:
        return const Color(0xFF7C3AED); // purple-600
      case UserRole.coach:
        return const Color(0xFF0891B2); // cyan-600
      case UserRole.parent:
        return const Color(0xFF16A34A); // green-600
      case UserRole.teen:
        return const Color(0xFFEA580C); // orange-600
      case UserRole.child:
        return const Color(0xFFE11D48); // rose-600
      case UserRole.unknown:
        return AppColors.lightText;
    }
  }

  /// 메인 메뉴(홈, 통계) 표시 여부
  bool _shouldShowMainMenu(UserRole role) {
    return isRoleAllowed(role, {
      UserRole.admin,
      UserRole.coach,
      UserRole.director,
      UserRole.academyDirector,
    });
  }

  /// 역할별 섹션 목록 생성
  List<Widget> _buildSectionsForRole(UserRole role) {
    switch (role) {
      case UserRole.admin:
        return _buildAdminSections();
      case UserRole.coach:
        return _buildCoachSections();
      case UserRole.director:
      case UserRole.academyDirector:
        return _buildDirectorSections();
      case UserRole.parent:
        return _buildParentSections();
      case UserRole.teen:
        return _buildTeenSections();
      case UserRole.child:
        return _buildChildSections();
      case UserRole.unknown:
        return _buildDefaultSections();
    }
  }

  // ============================================================
  // 역할별 섹션 빌더
  // ============================================================

  List<Widget> _buildAdminSections() {
    return [
      _buildExpansionSection(
        key: 'general',
        title: '일반관리',
        icon: Icons.settings_outlined,
        children: _getAdminGeneralItems(),
      ),
      _buildExpansionSection(
        key: 'work',
        title: '업무관리',
        icon: Icons.work_outline,
        children: _getAdminWorkItems(),
      ),
      _buildExpansionSection(
        key: 'shop',
        title: '쇼핑관리',
        icon: Icons.storefront_outlined,
        children: _getShopMenuItems(),
      ),
      _buildExpansionSection(
        key: 'app',
        title: '앱관리',
        icon: Icons.phone_android_outlined,
        children: _getAppMenuItems(),
      ),
    ];
  }

  List<Widget> _buildCoachSections() {
    return [
      _buildExpansionSection(
        key: 'general',
        title: '일반관리',
        icon: Icons.settings_outlined,
        children: _getCoachGeneralItems(),
      ),
      _buildExpansionSection(
        key: 'work',
        title: '업무관리',
        icon: Icons.work_outline,
        children: _getCoachWorkItems(),
      ),
    ];
  }

  List<Widget> _buildDirectorSections() {
    return [
      _buildExpansionSection(
        key: 'general',
        title: '일반관리',
        icon: Icons.settings_outlined,
        children: _getDirectorGeneralItems(),
      ),
      _buildExpansionSection(
        key: 'work',
        title: '업무관리',
        icon: Icons.work_outline,
        children: _getDirectorWorkItems(),
      ),
      _buildExpansionSection(
        key: 'tournament',
        title: '대회/원정',
        icon: Icons.emoji_events_outlined,
        children: _getDirectorTournamentItems(),
      ),
      _buildExpansionSection(
        key: 'communication',
        title: '소통',
        icon: Icons.forum_outlined,
        children: _getDirectorCommunicationItems(),
      ),
    ];
  }

  List<Widget> _buildParentSections() {
    return [
      _buildExpansionSection(
        key: 'children',
        title: '자녀관리',
        icon: Icons.child_care_outlined,
        children: _getParentChildrenItems(),
      ),
      _buildExpansionSection(
        key: 'class-schedule',
        title: '수업/일정',
        icon: Icons.calendar_month_outlined,
        children: _getParentClassScheduleItems(),
      ),
      _buildExpansionSection(
        key: 'payment-credit',
        title: '결제/크레딧',
        icon: Icons.payment_outlined,
        children: _getParentPaymentItems(),
      ),
      _buildExpansionSection(
        key: 'growth',
        title: '성장/평가',
        icon: Icons.trending_up_outlined,
        children: _getParentGrowthItems(),
      ),
    ];
  }

  List<Widget> _buildTeenSections() {
    return [
      _buildExpansionSection(
        key: 'my-activity',
        title: '나의 활동',
        icon: Icons.sports_hockey_outlined,
        children: _getTeenActivityItems(),
      ),
      _buildExpansionSection(
        key: 'achievement',
        title: '성과/보상',
        icon: Icons.emoji_events_outlined,
        children: _getTeenAchievementItems(),
      ),
    ];
  }

  List<Widget> _buildChildSections() {
    return [
      _buildExpansionSection(
        key: 'my-activity',
        title: '나의 활동',
        icon: Icons.sports_hockey_outlined,
        children: _getChildActivityItems(),
      ),
      _buildExpansionSection(
        key: 'my-treasure',
        title: '나의 보물',
        icon: Icons.star_outlined,
        children: _getChildTreasureItems(),
      ),
    ];
  }

  List<Widget> _buildDefaultSections() {
    return [
      _buildExpansionSection(
        key: 'general',
        title: '일반',
        icon: Icons.menu,
        children: [
          const _DrawerMenuItem(
            icon: Icons.dashboard_outlined,
            label: '대시보드',
            route: '/dashboard',
          ),
        ],
      ),
    ];
  }

  // ============================================================
  // Admin 메뉴 아이템
  // ============================================================

  List<_DrawerMenuItem> _getAdminGeneralItems() {
    return const [
      _DrawerMenuItem(
        icon: Icons.dashboard_outlined,
        label: '대시보드',
        route: '/dashboard',
      ),
      _DrawerMenuItem(
        icon: Icons.people_outline,
        label: '전체 회원',
        route: '/members',
      ),
      _DrawerMenuItem(
        icon: Icons.person_add_outlined,
        label: '승인 관리',
        route: '/approval',
        badge: '3',
      ),
      _DrawerMenuItem(
        icon: Icons.person_add_alt_1_outlined,
        label: '회원 등록',
        route: '/member-register',
      ),
      _DrawerMenuItem(
        icon: Icons.sports_hockey_outlined,
        label: '코치 관리',
        route: '/coach-management',
      ),
    ];
  }

  List<_DrawerMenuItem> _getAdminWorkItems() {
    return const [
      _DrawerMenuItem(
        icon: Icons.school_outlined,
        label: '수업 관리',
        route: '/class-management',
      ),
      _DrawerMenuItem(
        icon: Icons.calendar_month_outlined,
        label: '일정 관리',
        route: '/schedule-management',
      ),
      _DrawerMenuItem(
        icon: Icons.fact_check_outlined,
        label: '출석 관리',
        route: '/attendance-history',
      ),
      _DrawerMenuItem(
        icon: Icons.payment_outlined,
        label: '결제 관리',
        route: '/payment-history',
      ),
      _DrawerMenuItem(
        icon: Icons.inventory_2_outlined,
        label: '재고 관리',
        route: '/inventory',
      ),
    ];
  }

  // ============================================================
  // Coach 메뉴 아이템
  // ============================================================

  List<_DrawerMenuItem> _getCoachGeneralItems() {
    return const [
      _DrawerMenuItem(
        icon: Icons.dashboard_outlined,
        label: '대시보드',
        route: '/coach-dashboard',
      ),
      _DrawerMenuItem(
        icon: Icons.people_outline,
        label: '전체 회원',
        route: '/members',
      ),
      _DrawerMenuItem(
        icon: Icons.person_add_outlined,
        label: '승인 관리',
        route: '/approval',
        badge: '3',
      ),
      _DrawerMenuItem(
        icon: Icons.person_add_alt_1_outlined,
        label: '회원 등록',
        route: '/member-register',
      ),
      _DrawerMenuItem(
        icon: Icons.qr_code_outlined,
        label: '내 QR',
        route: '/my-qr',
      ),
    ];
  }

  List<_DrawerMenuItem> _getCoachWorkItems() {
    return const [
      _DrawerMenuItem(
        icon: Icons.school_outlined,
        label: '수업 관리',
        route: '/class-management',
      ),
      _DrawerMenuItem(
        icon: Icons.calendar_month_outlined,
        label: '일정 관리',
        route: '/schedule-management',
      ),
      _DrawerMenuItem(
        icon: Icons.fact_check_outlined,
        label: '출석 관리',
        route: '/attendance-history',
      ),
    ];
  }

  // ============================================================
  // Director 메뉴 아이템
  // ============================================================

  List<_DrawerMenuItem> _getDirectorGeneralItems() {
    return const [
      _DrawerMenuItem(
        icon: Icons.dashboard_outlined,
        label: '대시보드',
        route: '/dashboard',
      ),
      _DrawerMenuItem(
        icon: Icons.sports_hockey_outlined,
        label: '코치 관리',
        route: '/coach-management',
      ),
      _DrawerMenuItem(
        icon: Icons.people_outline,
        label: '팀원 관리',
        route: '/members',
      ),
      _DrawerMenuItem(
        icon: Icons.person_add_outlined,
        label: '승인 관리',
        route: '/approval',
      ),
    ];
  }

  List<_DrawerMenuItem> _getDirectorWorkItems() {
    return const [
      _DrawerMenuItem(
        icon: Icons.school_outlined,
        label: '수업 관리',
        route: '/class-management',
      ),
      _DrawerMenuItem(
        icon: Icons.calendar_month_outlined,
        label: '일정 관리',
        route: '/schedule-management',
      ),
      _DrawerMenuItem(
        icon: Icons.fact_check_outlined,
        label: '출석 관리',
        route: '/attendance-history',
      ),
      _DrawerMenuItem(
        icon: Icons.payment_outlined,
        label: '결제 관리',
        route: '/payment-history',
      ),
    ];
  }

  List<_DrawerMenuItem> _getDirectorTournamentItems() {
    return const [
      _DrawerMenuItem(
        icon: Icons.emoji_events_outlined,
        label: '대회 관리',
        route: '/tournaments',
      ),
      _DrawerMenuItem(
        icon: Icons.flight_outlined,
        label: '해외 원정',
        route: '/overseas-trips',
      ),
    ];
  }

  List<_DrawerMenuItem> _getDirectorCommunicationItems() {
    return const [
      _DrawerMenuItem(
        icon: Icons.announcement_outlined,
        label: '공지 관리',
        route: '/notice-management',
      ),
      _DrawerMenuItem(
        icon: Icons.record_voice_over_outlined,
        label: '상담 로그',
        route: '/consultations',
      ),
      _DrawerMenuItem(
        icon: Icons.chat_outlined,
        label: '팀 채팅',
        route: '/team-chat',
      ),
    ];
  }

  // ============================================================
  // Parent 메뉴 아이템
  // ============================================================

  List<_DrawerMenuItem> _getParentChildrenItems() {
    return const [
      _DrawerMenuItem(
        icon: Icons.child_care_outlined,
        label: '자녀 관리',
        route: '/children',
      ),
      _DrawerMenuItem(
        icon: Icons.person_add_alt_outlined,
        label: '자녀 추가',
        route: '/children/add',
      ),
      _DrawerMenuItem(
        icon: Icons.qr_code_outlined,
        label: '내 QR',
        route: '/my-qr',
      ),
    ];
  }

  List<_DrawerMenuItem> _getParentClassScheduleItems() {
    return const [
      _DrawerMenuItem(
        icon: Icons.calendar_month_outlined,
        label: '수업 캘린더',
        route: '/parent-calendar',
      ),
      _DrawerMenuItem(
        icon: Icons.how_to_vote_outlined,
        label: 'RSVP',
        route: '/rsvp',
      ),
      _DrawerMenuItem(
        icon: Icons.format_list_numbered_outlined,
        label: '대기 목록',
        route: '/waitlist',
      ),
    ];
  }

  List<_DrawerMenuItem> _getParentPaymentItems() {
    return const [
      _DrawerMenuItem(
        icon: Icons.credit_card_outlined,
        label: '크레딧 관리',
        route: '/credits',
      ),
      _DrawerMenuItem(
        icon: Icons.rate_review_outlined,
        label: '수업 리뷰',
        route: '/review',
      ),
    ];
  }

  List<_DrawerMenuItem> _getParentGrowthItems() {
    return const [
      _DrawerMenuItem(
        icon: Icons.assessment_outlined,
        label: '성장 리포트',
        route: '/report',
      ),
      _DrawerMenuItem(
        icon: Icons.sports_score_outlined,
        label: '기술 평가',
        route: '/skill-report',
      ),
      _DrawerMenuItem(
        icon: Icons.show_chart_outlined,
        label: '진도 현황',
        route: '/progress',
      ),
    ];
  }

  // ============================================================
  // Teen 메뉴 아이템
  // ============================================================

  List<_DrawerMenuItem> _getTeenActivityItems() {
    return const [
      _DrawerMenuItem(
        icon: Icons.home_outlined,
        label: '홈',
        route: '/home',
      ),
      _DrawerMenuItem(
        icon: Icons.fact_check_outlined,
        label: '출석 이력',
        route: '/attendance-history',
      ),
      _DrawerMenuItem(
        icon: Icons.qr_code_scanner_outlined,
        label: 'QR 체크인',
        route: '/qr-checkin',
      ),
      _DrawerMenuItem(
        icon: Icons.qr_code_outlined,
        label: '내 QR',
        route: '/my-qr',
      ),
      _DrawerMenuItem(
        icon: Icons.calendar_month_outlined,
        label: '수업 캘린더',
        route: '/calendar',
      ),
    ];
  }

  List<_DrawerMenuItem> _getTeenAchievementItems() {
    return const [
      _DrawerMenuItem(
        icon: Icons.military_tech_outlined,
        label: '뱃지',
        route: '/badges',
      ),
      _DrawerMenuItem(
        icon: Icons.leaderboard_outlined,
        label: '랭킹',
        route: '/ranking',
      ),
    ];
  }

  // ============================================================
  // Child 메뉴 아이템
  // ============================================================

  List<_DrawerMenuItem> _getChildActivityItems() {
    return const [
      _DrawerMenuItem(
        icon: Icons.home_outlined,
        label: '홈',
        route: '/home',
      ),
      _DrawerMenuItem(
        icon: Icons.today_outlined,
        label: '오늘의 활동',
        route: '/dashboard',
      ),
      _DrawerMenuItem(
        icon: Icons.fact_check_outlined,
        label: '출석',
        route: '/attendance-history',
      ),
      _DrawerMenuItem(
        icon: Icons.qr_code_scanner_outlined,
        label: 'QR 체크인',
        route: '/qr-checkin',
      ),
      _DrawerMenuItem(
        icon: Icons.qr_code_outlined,
        label: '내 QR',
        route: '/my-qr',
      ),
    ];
  }

  List<_DrawerMenuItem> _getChildTreasureItems() {
    return const [
      _DrawerMenuItem(
        icon: Icons.military_tech_outlined,
        label: '뱃지',
        route: '/badges',
      ),
      _DrawerMenuItem(
        icon: Icons.auto_awesome_outlined,
        label: '스티커',
        route: '/stickers',
      ),
    ];
  }

  // ============================================================
  // Admin 전용 섹션 (쇼핑, 앱)
  // ============================================================

  List<_DrawerMenuItem> _getShopMenuItems() {
    return const [
      _DrawerMenuItem(
        icon: Icons.shopping_bag_outlined,
        label: '상품 관리',
        route: '/shop-admin',
      ),
      _DrawerMenuItem(
        icon: Icons.receipt_long_outlined,
        label: '주문 관리',
        route: '/order-management',
      ),
      _DrawerMenuItem(
        icon: Icons.local_shipping_outlined,
        label: '배송 관리',
        route: '/delivery-management',
      ),
      _DrawerMenuItem(
        icon: Icons.campaign_outlined,
        label: '마케팅/프로모션',
        route: '/marketing',
      ),
    ];
  }

  List<_DrawerMenuItem> _getAppMenuItems() {
    return const [
      _DrawerMenuItem(
        icon: Icons.announcement_outlined,
        label: '공지사항 관리',
        route: '/notice-management',
      ),
      _DrawerMenuItem(
        icon: Icons.support_agent_outlined,
        label: '고객지원',
        route: '/customer-support',
      ),
      _DrawerMenuItem(
        icon: Icons.settings_applications_outlined,
        label: '앱 설정',
        route: '/app-settings',
      ),
      _DrawerMenuItem(
        icon: Icons.analytics_outlined,
        label: '앱 분석',
        route: '/app-analytics',
      ),
    ];
  }

  // ============================================================
  // UI 빌더 메서드
  // ============================================================

  Widget _buildUserHeader(dynamic user, UserRole role) {
    final email = user?.email ?? 'guest@teamplus.com';
    final displayName = user?.displayName ?? '사용자님';
    final badgeText = _getRoleBadgeText(role);
    final badgeColor = _getRoleBadgeColor(role);

    return Container(
      padding: const EdgeInsets.all(20),
      child: Row(
        children: [
          // 프로필 아바타
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: AppColors.background,
              shape: BoxShape.circle,
              border: Border.all(color: AppColors.borderColor, width: 2),
            ),
            child: Icon(
              _getRoleIcon(role),
              size: 32,
              color: AppColors.lightText,
            ),
          ),
          const SizedBox(width: 16),

          // 사용자 정보
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  displayName,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: AppColors.darkText,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  email,
                  style: const TextStyle(
                    fontSize: 13,
                    color: AppColors.lightText,
                  ),
                ),
                const SizedBox(height: 8),
                // 역할 배지 (동적)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: badgeColor,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    badgeText,
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                ),
              ],
            ),
          ),

          // 닫기 버튼
          IconButton(
            tooltip: '메뉴 닫기',
            onPressed: () => Navigator.of(context).pop(),
            icon: const Icon(Icons.close, color: AppColors.darkText),
          ),
        ],
      ),
    );
  }

  /// 역할에 맞는 아이콘 반환
  IconData _getRoleIcon(UserRole role) {
    switch (role) {
      case UserRole.admin:
        return Icons.admin_panel_settings_outlined;
      case UserRole.director:
      case UserRole.academyDirector:
        return Icons.supervised_user_circle_outlined;
      case UserRole.coach:
        return Icons.sports_outlined;
      case UserRole.parent:
        return Icons.family_restroom_outlined;
      case UserRole.teen:
        return Icons.person_outline;
      case UserRole.child:
        return Icons.child_care_outlined;
      case UserRole.unknown:
        return Icons.person_outline;
    }
  }

  Widget _buildMainMenu(UserRole role) {
    return Column(
      children: [
        _buildMenuItem(
          icon: Icons.home_outlined,
          label: '홈',
          isSelected: widget.currentRoute == '/webview',
          onTap: () {
            Navigator.pop(context);
            context.go('/webview');
          },
        ),
        _buildMenuItem(
          icon: Icons.bar_chart_outlined,
          label: '통계',
          isSelected: widget.currentRoute == '/statistics',
          onTap: () {
            Navigator.pop(context);
            _navigateTo('/statistics');
          },
        ),
      ],
    );
  }

  Widget _buildExpansionSection({
    required String key,
    required String title,
    required IconData icon,
    required List<_DrawerMenuItem> children,
  }) {
    if (children.isEmpty) return const SizedBox.shrink();

    final isExpanded = _expandedSections.contains(key);

    return Column(
      children: [
        // 섹션 헤더 (클릭하면 펼침/접힘)
        InkWell(
          onTap: () {
            setState(() {
              if (isExpanded) {
                _expandedSections.remove(key);
              } else {
                _expandedSections.add(key);
              }
            });
          },
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
            child: Row(
              children: [
                Icon(icon, size: 22, color: AppColors.darkText),
                const SizedBox(width: 14),
                Expanded(
                  child: Text(
                    title,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: AppColors.darkText,
                    ),
                  ),
                ),
                AnimatedRotation(
                  turns: isExpanded ? 0.5 : 0,
                  duration: const Duration(milliseconds: 200),
                  child: const Icon(
                    Icons.keyboard_arrow_down,
                    size: 24,
                    color: AppColors.lightText,
                  ),
                ),
              ],
            ),
          ),
        ),

        // 하위 메뉴 (펼쳐진 상태에서만 표시)
        AnimatedCrossFade(
          firstChild: const SizedBox.shrink(),
          secondChild: Container(
            color: AppColors.background,
            child: Column(
              children:
                  children.map((item) => _buildSubMenuItem(item)).toList(),
            ),
          ),
          crossFadeState:
              isExpanded ? CrossFadeState.showSecond : CrossFadeState.showFirst,
          duration: const Duration(milliseconds: 200),
        ),

        const Divider(height: 1),
      ],
    );
  }

  Widget _buildMenuItem({
    required IconData icon,
    required String label,
    bool isSelected = false,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.primary.withValues(alpha: 0.08) : null,
          border: isSelected
              ? const Border(
                  right: BorderSide(color: AppColors.primary, width: 3),
                )
              : null,
        ),
        child: Row(
          children: [
            Icon(
              icon,
              size: 22,
              color: isSelected ? AppColors.primary : AppColors.darkText,
            ),
            const SizedBox(width: 14),
            Text(
              label,
              style: TextStyle(
                fontSize: 15,
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                color: isSelected ? AppColors.primary : AppColors.darkText,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSubMenuItem(_DrawerMenuItem item) {
    final isSelected = widget.currentRoute == item.route;

    return InkWell(
      onTap: () {
        Navigator.pop(context);
        if (item.route.isNotEmpty) {
          _navigateTo(item.route);
        }
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        margin: const EdgeInsets.only(left: 36),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.primary.withValues(alpha: 0.08) : null,
        ),
        child: Row(
          children: [
            Icon(
              item.icon,
              size: 20,
              color: isSelected ? AppColors.primary : AppColors.lightText,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                item.label,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                  color: isSelected ? AppColors.primary : AppColors.darkText,
                ),
              ),
            ),
            if (item.badge != null)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: AppColors.error,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  item.badge!,
                  style: const TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  /// 네이티브 라우트가 존재하면 GoRouter로, 없으면 WebView로 이동
  void _navigateTo(String route) {
    if (_nativeRoutes.contains(route)) {
      context.push(route);
    } else {
      // 네이티브 라우트에 없는 경로는 WebView로 이동
      final webUrl = '${AppEnvironment.instance.config.webAppUrl}$route';
      context.push('/webview', extra: {
        'url': webUrl,
        'title': 'TEAMPLUS',
        'showAppBar': true,
        'showBottomNav': false,
      });
    }
  }

  Widget _buildLogoutButton() {
    return InkWell(
      onTap: () async {
        Navigator.pop(context);
        await ref.read(logoutProvider.future);
        if (mounted) {
          // [2026-05-19] 네이티브 /login 폐기 → WebView /login/ 단일 SoT.
          context.go('/webview');
        }
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: AppColors.background,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.borderColor),
        ),
        child: const Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.logout, size: 20, color: AppColors.lightText),
            SizedBox(width: 8),
            Text(
              '로그아웃',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppColors.lightText,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildVersionInfo() {
    return GestureDetector(
      onTap: () => _showEnvironmentInfo(),
      child: Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: Column(
          children: [
            Text(
              'TEAMPLUS v2.4.0',
              style: TextStyle(
                fontSize: 12,
                color: AppColors.lightText.withValues(alpha: 0.7),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              '(탭하여 환경 정보 확인)',
              style: TextStyle(
                fontSize: 10,
                color: AppColors.lightText.withValues(alpha: 0.5),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// 환경 정보 알럿 표시
  void _showEnvironmentInfo() {
    final isIOS = defaultTargetPlatform == TargetPlatform.iOS;
    final isAndroid = defaultTargetPlatform == TargetPlatform.android;
    final platformName = isIOS ? 'iOS' : (isAndroid ? 'Android' : 'Unknown');

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.info_outline, color: AppColors.primary),
            SizedBox(width: 8),
            Text('환경 정보'),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildInfoRow('실행 환경', 'Native App (Flutter)'),
            _buildInfoRow('플랫폼', platformName),
            _buildInfoRow('iOS', isIOS ? 'Yes' : 'No'),
            _buildInfoRow('Android', isAndroid ? 'Yes' : 'No'),
            _buildInfoRow('WebView 내부', 'No (Native Flutter)'),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('확인'),
          ),
        ],
      ),
    );
  }

  Widget _buildInfoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: AppColors.lightText)),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

/// Drawer 메뉴 아이템 데이터 클래스
class _DrawerMenuItem {
  final IconData icon;
  final String label;
  final String route;
  final String? badge;

  const _DrawerMenuItem({
    required this.icon,
    required this.label,
    this.route = '',
    this.badge,
  });
}
