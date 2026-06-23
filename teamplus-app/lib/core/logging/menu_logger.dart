import 'package:flutter/foundation.dart';

/// 공통 메뉴 클릭 로거
///
/// 사이드 메뉴, 탭 등에서 메뉴를 클릭할 때
/// 메뉴명, 섹션명, 파일 경로를 Flutter 로그로 남깁니다.
class MenuLogger {
  const MenuLogger._();

  static void logMenuTap({
    required String menuLabel,
    String? sectionTitle,
    String?
        screenName, // 전체 경로 (예: teamplus_app/lib/.../coach_admin_screen.dart)
    String? routePath, // GoRoute 경로 (예: /attendance-history)
    required String filePath, // 현재 onTap 이 정의된 파일의 전체 경로
  }) {
    final timestamp = DateTime.now().toIso8601String();

    // 파일명만 추출
    final fileName =
        filePath.split('/').isNotEmpty ? filePath.split('/').last : filePath;

    String? screenFileName;
    if (screenName != null && screenName.isNotEmpty) {
      final parts = screenName.split('/');
      screenFileName = parts.isNotEmpty ? parts.last : screenName;
    }

    final buffer = StringBuffer('[MENU_TAP] ')
      ..write('time=$timestamp ')
      ..write('menu="$menuLabel" ')
      ..write('file_name="$fileName" ')
      ..write('file_path="$filePath" ');

    if (screenFileName != null) {
      buffer
        ..write('screen_file="$screenFileName" ')
        ..write('screen_path="$screenName" ');
    }

    if (routePath != null && routePath.isNotEmpty) {
      buffer.write('route="$routePath" ');
    }

    if (sectionTitle != null && sectionTitle.isNotEmpty) {
      buffer.write('section="$sectionTitle" ');
    }

    debugPrint(buffer.toString());
  }
}
