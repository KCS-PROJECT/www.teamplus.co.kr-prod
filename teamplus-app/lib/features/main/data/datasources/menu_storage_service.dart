import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart' as p;
import '../models/menu_model.dart';

/// 메뉴 설정을 로컬 파일로 관리하는 서비스
class MenuStorageService {
  static const String _menuDirName = 'shared/menu';

  /// 메뉴 디렉토리 경로 가져오기
  Future<Directory> _getMenuDirectory() async {
    final appDocDir = await getApplicationDocumentsDirectory();
    final menuDir = Directory(p.join(appDocDir.path, _menuDirName));

    if (!await menuDir.exists()) {
      await menuDir.create(recursive: true);
    }
    return menuDir;
  }

  /// 기존의 모든 메뉴 JSON 파일 삭제
  Future<void> _deleteOldMenuFiles() async {
    try {
      final dir = await _getMenuDirectory();
      final List<FileSystemEntity> entities = await dir.list().toList();

      for (var entity in entities) {
        if (entity is File &&
            p.basename(entity.path).startsWith('menu_') &&
            p.extension(entity.path) == '.json') {
          await entity.delete();
        }
      }
    } catch (e) {
      debugPrint('기존 메뉴 파일 삭제 실패: $e');
    }
  }

  /// 새로운 메뉴 파일 저장 (menu_YYYY_MM_DD_HH_mm_ss.json)
  Future<File> saveMenu(AppMenuConfig config) async {
    // 1. 기존 파일 먼저 삭제
    await _deleteOldMenuFiles();

    // 2. 현재 시간으로 파일명 생성
    final String timestamp =
        DateFormat('yyyy_MM_dd_HH_mm_ss').format(DateTime.now());
    final String fileName = 'menu_$timestamp.json';

    final dir = await _getMenuDirectory();
    final file = File(p.join(dir.path, fileName));

    // 3. JSON 저장
    final jsonStr = jsonEncode(config.toJson());
    return await file.writeAsString(jsonStr);
  }

  /// 로컬 파일에서 메뉴 읽어오기
  Future<AppMenuConfig?> loadMenu() async {
    try {
      final dir = await _getMenuDirectory();
      final List<FileSystemEntity> entities = await dir.list().toList();

      // 가장 최근에 생성된 파일 찾기 (보통 하나만 존재함)
      File? menuFile;
      for (var entity in entities) {
        if (entity is File && p.basename(entity.path).startsWith('menu_')) {
          menuFile = entity;
          break;
        }
      }

      if (menuFile != null && await menuFile.exists()) {
        final jsonStr = await menuFile.readAsString();
        final Map<String, dynamic> jsonMap = jsonDecode(jsonStr);
        return AppMenuConfig.fromJson(jsonMap);
      }
    } catch (e) {
      debugPrint('메뉴 파일 로드 실패: $e');
    }
    return null;
  }
}
