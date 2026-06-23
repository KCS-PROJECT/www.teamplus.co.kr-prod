import 'package:flutter/material.dart';

/// 서버에서 내려주는 통합 메뉴 아이템 모델
class MenuItem {
  final String id;
  final String title;
  final String iconName;
  final String routePath;
  final bool isWeb;

  MenuItem({
    required this.id,
    required this.title,
    required this.iconName,
    required this.routePath,
    required this.isWeb,
  });

  factory MenuItem.fromJson(Map<String, dynamic> json) {
    return MenuItem(
      id: json['id'] as String,
      title: json['title'] as String,
      iconName: json['iconName'] as String,
      routePath: json['routePath'] as String,
      isWeb: json['isWeb'] as bool? ?? true,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'title': title,
      'iconName': iconName,
      'routePath': routePath,
      'isWeb': isWeb,
    };
  }

  IconData get iconData {
    switch (iconName) {
      case 'home':
        return Icons.home;
      case 'calendar':
        return Icons.calendar_today;
      case 'class':
        return Icons.sports_hockey;
      case 'group':
        return Icons.groups;
      case 'person':
        return Icons.person;
      case 'chat':
        return Icons.chat_bubble;
      case 'notifications':
        return Icons.notifications;
      case 'settings':
        return Icons.settings;
      case 'badge':
        return Icons.emoji_events;
      case 'chart':
        return Icons.bar_chart;
      case 'payment':
        return Icons.payment;
      case 'help':
        return Icons.help_outline;
      case 'logout':
        return Icons.logout;
      case 'star':
        return Icons.star_border;
      case 'lock':
        return Icons.lock_outline;
      case 'message':
        return Icons.mail_outline;
      case 'map':
        return Icons.map_outlined;
      default:
        return Icons.circle;
    }
  }
}

/// 전체 메뉴 구성 (하단 탭 + 사이드 메뉴)
class AppMenuConfig {
  final List<MenuItem> bottomTabs;
  final List<MenuItem> drawerMenus;

  AppMenuConfig({
    required this.bottomTabs,
    required this.drawerMenus,
  });

  factory AppMenuConfig.fromJson(Map<String, dynamic> json) {
    return AppMenuConfig(
      bottomTabs: (json['bottomTabs'] as List)
          .map((item) => MenuItem.fromJson(item))
          .toList(),
      drawerMenus: (json['drawerMenus'] as List)
          .map((item) => MenuItem.fromJson(item))
          .toList(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'bottomTabs': bottomTabs.map((item) => item.toJson()).toList(),
      'drawerMenus': drawerMenus.map((item) => item.toJson()).toList(),
    };
  }
}
