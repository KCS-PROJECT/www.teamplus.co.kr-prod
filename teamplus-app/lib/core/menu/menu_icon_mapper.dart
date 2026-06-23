import 'package:flutter/material.dart';

/// 문자열 아이콘 이름을 Material Icons로 매핑하는 클래스
///
/// 서버에서 전달받은 아이콘 이름(문자열)을 Flutter의 IconData로 변환합니다.
/// 새로운 아이콘이 필요하면 [_iconMap]에 추가하세요.
class MenuIconMapper {
  /// 아이콘 이름 → IconData 매핑 테이블
  static const Map<String, IconData> _iconMap = {
    // 기본 네비게이션
    'home': Icons.home,
    'home_outlined': Icons.home_outlined,
    'menu': Icons.menu,
    'dashboard': Icons.dashboard,
    'dashboard_outlined': Icons.dashboard_outlined,

    // 사용자 관련
    'person': Icons.person,
    'person_outlined': Icons.person_outlined,
    'people': Icons.people,
    'people_outlined': Icons.people_outlined,
    'child_care': Icons.child_care,
    'family_restroom': Icons.family_restroom,
    'group': Icons.group,
    'group_outlined': Icons.group_outlined,

    // 교육/수업
    'school': Icons.school,
    'school_outlined': Icons.school_outlined,
    'class': Icons.class_,
    'book': Icons.book,
    'menu_book': Icons.menu_book,
    'assignment': Icons.assignment,

    // 일정/캘린더
    'calendar_today': Icons.calendar_today,
    'calendar_month': Icons.calendar_month,
    'event': Icons.event,
    'event_outlined': Icons.event_outlined,
    'schedule': Icons.schedule,
    'access_time': Icons.access_time,

    // 목록/데이터
    'list': Icons.list,
    'list_alt': Icons.list_alt,
    'view_list': Icons.view_list,
    'format_list_bulleted': Icons.format_list_bulleted,
    'table_chart': Icons.table_chart,

    // 결제/금융
    'payment': Icons.payment,
    'credit_card': Icons.credit_card,
    'account_balance_wallet': Icons.account_balance_wallet,
    'receipt': Icons.receipt,
    'receipt_long': Icons.receipt_long,
    'attach_money': Icons.attach_money,

    // QR/스캐너
    'qr_code': Icons.qr_code,
    'qr_code_scanner': Icons.qr_code_scanner,
    'qr_code_2': Icons.qr_code_2,
    'camera': Icons.camera,
    'camera_alt': Icons.camera_alt,

    // 알림/메시지
    'notifications': Icons.notifications,
    'notifications_outlined': Icons.notifications_outlined,
    'notifications_active': Icons.notifications_active,
    'message': Icons.message,
    'chat': Icons.chat,
    'chat_bubble': Icons.chat_bubble,
    'mail': Icons.mail,
    'mail_outlined': Icons.mail_outlined,

    // 설정
    'settings': Icons.settings,
    'settings_outlined': Icons.settings_outlined,
    'tune': Icons.tune,
    'build': Icons.build,

    // 상태/액션
    'check_circle': Icons.check_circle,
    'check_circle_outlined': Icons.check_circle_outlined,
    'done': Icons.done,
    'done_all': Icons.done_all,
    'pending': Icons.pending,
    'pending_actions': Icons.pending_actions,
    'hourglass_empty': Icons.hourglass_empty,

    // 분석/통계
    'analytics': Icons.analytics,
    'bar_chart': Icons.bar_chart,
    'pie_chart': Icons.pie_chart,
    'trending_up': Icons.trending_up,
    'insights': Icons.insights,

    // 쇼핑/상품
    'shopping_cart': Icons.shopping_cart,
    'shopping_bag': Icons.shopping_bag,
    'store': Icons.store,
    'storefront': Icons.storefront,
    'local_offer': Icons.local_offer,

    // 기타
    'info': Icons.info,
    'info_outlined': Icons.info_outlined,
    'help': Icons.help,
    'help_outlined': Icons.help_outlined,
    'support': Icons.support,
    'contact_support': Icons.contact_support,
    'announcement': Icons.announcement,
    'campaign': Icons.campaign,
    'star': Icons.star,
    'star_outlined': Icons.star_outlined,
    'favorite': Icons.favorite,
    'favorite_outlined': Icons.favorite_outlined,
    'location_on': Icons.location_on,
    'map': Icons.map,
    'sports_hockey': Icons.sports_hockey,
    'sports': Icons.sports,
    'fitness_center': Icons.fitness_center,
    'pool': Icons.pool,
    'ac_unit': Icons.ac_unit, // 아이스링크 관련

    // 문서/파일
    'description': Icons.description,
    'article': Icons.article,
    'folder': Icons.folder,
    'file_copy': Icons.file_copy,
    'cloud_upload': Icons.cloud_upload,
    'cloud_download': Icons.cloud_download,

    // 시간 관련
    'history': Icons.history,
    'update': Icons.update,
    'restore': Icons.restore,
    'timer': Icons.timer,

    // 추가 버튼 관련
    'add': Icons.add,
    'add_circle': Icons.add_circle,
    'add_circle_outlined': Icons.add_circle_outlined,
    'edit': Icons.edit,
    'edit_outlined': Icons.edit_outlined,
    'delete': Icons.delete,
    'delete_outlined': Icons.delete_outlined,

    // 로그인/보안
    'login': Icons.login,
    'logout': Icons.logout,
    'lock': Icons.lock,
    'lock_open': Icons.lock_open,
    'security': Icons.security,
    'verified_user': Icons.verified_user,
  };

  /// 문자열 아이콘 이름을 IconData로 변환
  ///
  /// [name] 아이콘 이름 (예: 'home', 'person', 'school')
  /// 매핑되지 않은 이름은 [Icons.help_outline] 반환
  static IconData getIcon(String name) {
    return _iconMap[name] ?? Icons.help_outline;
  }

  /// 아이콘이 매핑 테이블에 존재하는지 확인
  static bool hasIcon(String name) {
    return _iconMap.containsKey(name);
  }

  /// 사용 가능한 모든 아이콘 이름 목록 반환
  static List<String> get availableIcons => _iconMap.keys.toList();

  /// 아이콘 이름으로 검색 (부분 일치)
  static List<String> searchIcons(String query) {
    final lowerQuery = query.toLowerCase();
    return _iconMap.keys
        .where((name) => name.toLowerCase().contains(lowerQuery))
        .toList();
  }
}
