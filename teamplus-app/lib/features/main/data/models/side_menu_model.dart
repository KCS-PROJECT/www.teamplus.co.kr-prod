import 'package:flutter/material.dart';

/// 서버에서 받아올 사이드 메뉴 아이템 모델
class SideMenuItem {
  final String id;
  final String title;
  final String iconName;
  final String routePath;
  final bool isWeb; // 웹뷰 내부 이동인지, 네이티브 라우트 이동인지 구분

  SideMenuItem({
    required this.id,
    required this.title,
    required this.iconName,
    required this.routePath,
    this.isWeb = true,
  });

  factory SideMenuItem.fromJson(Map<String, dynamic> json) {
    return SideMenuItem(
      id: json['id'] as String,
      title: json['title'] as String,
      iconName: json['iconName'] as String,
      routePath: json['routePath'] as String,
      isWeb: json['isWeb'] as bool? ?? true,
    );
  }

  /// 문자열 아이콘 이름을 실제 IconData로 변환
  IconData get iconData {
    switch (iconName) {
      case 'settings':
        return Icons.settings;
      case 'person':
        return Icons.person;
      case 'notifications':
        return Icons.notifications;
      case 'help':
        return Icons.help_outline;
      case 'info':
        return Icons.info_outline;
      case 'history':
        return Icons.history;
      case 'payment':
        return Icons.payment;
      case 'group':
        return Icons.groups;
      case 'event':
        return Icons.event;
      case 'logout':
        return Icons.logout;
      default:
        return Icons.circle;
    }
  }
}
