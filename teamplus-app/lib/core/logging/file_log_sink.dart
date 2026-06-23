// FileLogSink — 디바이스 로컬 파일 로깅 (v8.6 P4-2, 2026-05-20)
//
// 경로 (KST 기준):
//   ${ApplicationDocumentsDirectory}/log/YYYY/MM/DD/{category}.log
//   ${ApplicationDocumentsDirectory}/log/YYYY/MM/DD/errors/{category}.log
//   ${ApplicationDocumentsDirectory}/log/YYYY/MM/DD/errors/_all.jsonl
//
// 회전 정책:
//   - 10MB 도달 시 .log → .log.1, .log.1 → .log.2 ... 최대 5 백업
//   - 자정(KST) 회전 시 새 일자 디렉토리 자동 생성
//   - 매 100회 write마다 회전 체크 (Backend/Web과 동일)
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

import 'app_logger.dart';

class FileLogSink {
  static const int _maxBytes = 10 * 1024 * 1024; // 10MB
  static const int _maxBackups = 5;
  static const int _rotateCheckInterval = 100;

  String? logRoot;
  int _writeCounter = 0;

  Future<void> initialize() async {
    try {
      final dir = await getApplicationDocumentsDirectory();
      logRoot = '${dir.path}/log';
      await _ensureAllCategoryFiles();
    } catch (e) {
      debugPrint('[FileLogSink] 초기화 실패: $e');
    }
  }

  Future<void> write(LogEntry entry) async {
    if (logRoot == null) return;

    final cat = entry.category ?? 'system';
    final filePath = _logFilePath(cat, entry.isError);

    try {
      final file = await _ensureFile(filePath);
      final jsonLine = '${jsonEncode(entry.toJson())}\n';
      await file.writeAsString(jsonLine, mode: FileMode.append, flush: false);

      // 오류면 _all.jsonl 통합 인덱스에도 동시 기록
      if (entry.isError) {
        final allPath = '${_dateDir()}/errors/_all.jsonl';
        final allFile = await _ensureFile(allPath);
        await allFile.writeAsString(jsonLine, mode: FileMode.append, flush: false);
      }

      // 매 100회 write 마다 회전 체크
      _writeCounter += 1;
      if (_writeCounter >= _rotateCheckInterval) {
        _writeCounter = 0;
        unawaited(_rotateIfExceededAll());
      }
    } catch (e) {
      debugPrint('[FileLogSink] write 실패 ($filePath): $e');
    }
  }

  // === 경로 ===

  String _dateDir() {
    final now = DateTime.now().toUtc().add(const Duration(hours: 9));
    final y = now.year.toString().padLeft(4, '0');
    final m = now.month.toString().padLeft(2, '0');
    final d = now.day.toString().padLeft(2, '0');
    return '$logRoot/$y/$m/$d';
  }

  String _logFilePath(String category, bool isError) {
    if (isError) {
      return '${_dateDir()}/errors/$category.log';
    }
    return '${_dateDir()}/$category.log';
  }

  // === 자동 생성 + 권한 ===

  Future<File> _ensureFile(String filePath) async {
    final file = File(filePath);
    if (!await file.exists()) {
      await file.parent.create(recursive: true);
      await file.create();
    }
    return file;
  }

  Future<void> _ensureAllCategoryFiles() async {
    if (logRoot == null) return;
    const normalCats = [
      'access',
      'input',
      'output',
      'activity',
      'auth',
      'payment',
      'database',
      'system',
    ];
    const errorCats = [
      'server',
      'transaction',
      'client',
      'auth',
      'database',
      'external',
    ];

    for (final cat in normalCats) {
      await _ensureFile(_logFilePath(cat, false));
    }
    for (final cat in errorCats) {
      await _ensureFile(_logFilePath(cat, true));
    }
    await _ensureFile('${_dateDir()}/errors/_all.jsonl');
  }

  // === 10MB 회전 ===

  Future<bool> _rotateIfExceeded(String filePath) async {
    try {
      final file = File(filePath);
      if (!await file.exists()) return false;
      final size = await file.length();
      if (size < _maxBytes) return false;

      // 가장 오래된 백업 삭제
      final oldest = File('$filePath.$_maxBackups');
      if (await oldest.exists()) {
        try {
          await oldest.delete();
        } catch (_) {/* 무시 */}
      }

      // .N → .(N+1) (역순)
      for (var i = _maxBackups - 1; i >= 1; i--) {
        final from = File('$filePath.$i');
        if (await from.exists()) {
          try {
            await from.rename('$filePath.${i + 1}');
          } catch (_) {/* 무시 */}
        }
      }

      // current → .1
      try {
        await file.rename('$filePath.1');
      } catch (_) {
        return false;
      }

      // 새 0바이트 파일 생성
      await _ensureFile(filePath);
      return true;
    } catch (e) {
      debugPrint('[FileLogSink] rotateIfExceeded 실패 ($filePath): $e');
      return false;
    }
  }

  Future<int> _rotateIfExceededAll() async {
    if (logRoot == null) return 0;
    const normalCats = [
      'access',
      'input',
      'output',
      'activity',
      'auth',
      'payment',
      'database',
      'system',
    ];
    const errorCats = [
      'server',
      'transaction',
      'client',
      'auth',
      'database',
      'external',
    ];

    var rotated = 0;
    for (final cat in normalCats) {
      if (await _rotateIfExceeded(_logFilePath(cat, false))) rotated++;
    }
    for (final cat in errorCats) {
      if (await _rotateIfExceeded(_logFilePath(cat, true))) rotated++;
    }
    if (await _rotateIfExceeded('${_dateDir()}/errors/_all.jsonl')) rotated++;

    if (rotated > 0) {
      debugPrint('[FileLogSink] 회전 완료 $rotated개 파일 (10MB 초과)');
    }
    return rotated;
  }
}
