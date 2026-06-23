import 'package:flutter/foundation.dart';
import 'dart:collection';

/// 브릿지 통신 방향
enum BridgeDirection {
  /// Web → Native (JavaScript 핸들러 호출)
  webToNative,

  /// Native → Web (evaluateJavascript 호출)
  nativeToWeb,
}

/// 브릿지 로그 항목
class BridgeLogEntry {
  final DateTime timestamp;
  final BridgeDirection direction;
  final String handlerName;
  final String? action;
  final Map<String, dynamic>? data;
  final String? response;
  final bool isError;
  final String? errorMessage;
  final Duration? duration;

  BridgeLogEntry({
    required this.timestamp,
    required this.direction,
    required this.handlerName,
    this.action,
    this.data,
    this.response,
    this.isError = false,
    this.errorMessage,
    this.duration,
  });

  String get directionSymbol =>
      direction == BridgeDirection.webToNative ? '🌐→📱' : '📱→🌐';

  String get statusSymbol => isError ? '❌' : '✅';

  @override
  String toString() {
    final buffer = StringBuffer()
      ..write('[$directionSymbol] ')
      ..write('${timestamp.toString().substring(11, 23)} ')
      ..write(handlerName);

    if (action != null) {
      buffer.write('.$action');
    }

    if (duration != null) {
      buffer.write(' (${duration!.inMilliseconds}ms)');
    }

    buffer.write(' $statusSymbol');

    if (isError && errorMessage != null) {
      buffer.write(' Error: $errorMessage');
    }

    return buffer.toString();
  }

  Map<String, dynamic> toJson() => {
        'timestamp': timestamp.toIso8601String(),
        'direction': direction.name,
        'handlerName': handlerName,
        'action': action,
        'data': data,
        'response': response,
        'isError': isError,
        'errorMessage': errorMessage,
        'durationMs': duration?.inMilliseconds,
      };
}

/// 브릿지 통신 로거
///
/// 실시간으로 Flutter ↔ Web 브릿지 통신을 로깅합니다.
/// Singleton 패턴으로 앱 전체에서 단일 인스턴스 사용.
class BridgeLogger {
  static final BridgeLogger _instance = BridgeLogger._internal();
  factory BridgeLogger() => _instance;
  BridgeLogger._internal();

  /// 최대 로그 보관 수
  static const int maxLogEntries = 500;

  /// 로그 항목 리스트 (최신이 마지막)
  final Queue<BridgeLogEntry> _logs = Queue<BridgeLogEntry>();

  /// 로그 스트림 리스너
  final List<void Function(BridgeLogEntry)> _listeners = [];

  /// 로그 활성화 여부
  bool enabled = true;

  /// 상세 로그 출력 여부
  bool verbose = true;

  /// 모든 로그 항목 (읽기 전용)
  List<BridgeLogEntry> get logs => _logs.toList();

  /// 최근 N개 로그
  List<BridgeLogEntry> getRecentLogs(int count) {
    final allLogs = _logs.toList();
    if (allLogs.length <= count) return allLogs;
    return allLogs.sublist(allLogs.length - count);
  }

  /// 로그 스트림 구독
  void addListener(void Function(BridgeLogEntry) listener) {
    _listeners.add(listener);
  }

  /// 로그 스트림 구독 해제
  void removeListener(void Function(BridgeLogEntry) listener) {
    _listeners.remove(listener);
  }

  /// Web → Native 요청 로그
  void logWebToNative({
    required String handlerName,
    String? action,
    Map<String, dynamic>? data,
  }) {
    if (!enabled) return;

    final entry = BridgeLogEntry(
      timestamp: DateTime.now(),
      direction: BridgeDirection.webToNative,
      handlerName: handlerName,
      action: action,
      data: data,
    );

    _addLog(entry);

    if (verbose) {
      debugPrint(
          '╔═══════════════════════════════════════════════════════════');
      debugPrint('║ [BRIDGE] 🌐→📱 Web → Native');
      debugPrint('║ Handler: $handlerName${action != null ? '.$action' : ''}');
      if (data != null && data.isNotEmpty) {
        debugPrint('║ Data: ${_truncateData(data)}');
      }
      debugPrint(
          '╚═══════════════════════════════════════════════════════════');
    }
  }

  /// Web → Native 응답 로그
  void logWebToNativeResponse({
    required String handlerName,
    String? action,
    String? response,
    bool isError = false,
    String? errorMessage,
    Duration? duration,
  }) {
    if (!enabled) return;

    final entry = BridgeLogEntry(
      timestamp: DateTime.now(),
      direction: BridgeDirection.webToNative,
      handlerName: handlerName,
      action: action,
      response: response,
      isError: isError,
      errorMessage: errorMessage,
      duration: duration,
    );

    _addLog(entry);

    if (verbose) {
      final status = isError ? '❌ Error' : '✅ Success';
      debugPrint(
          '╔═══════════════════════════════════════════════════════════');
      debugPrint('║ [BRIDGE] 🌐←📱 Native Response');
      debugPrint('║ Handler: $handlerName${action != null ? '.$action' : ''}');
      debugPrint(
          '║ Status: $status${duration != null ? ' (${duration.inMilliseconds}ms)' : ''}');
      if (isError && errorMessage != null) {
        debugPrint('║ Error: $errorMessage');
      }
      if (response != null) {
        debugPrint('║ Response: ${_truncateString(response, 200)}');
      }
      debugPrint(
          '╚═══════════════════════════════════════════════════════════');
    }
  }

  /// Native → Web 메시지 로그
  void logNativeToWeb({
    required String messageType,
    String? action,
    Map<String, dynamic>? data,
  }) {
    if (!enabled) return;

    final entry = BridgeLogEntry(
      timestamp: DateTime.now(),
      direction: BridgeDirection.nativeToWeb,
      handlerName: messageType,
      action: action,
      data: data,
    );

    _addLog(entry);

    if (verbose) {
      debugPrint(
          '╔═══════════════════════════════════════════════════════════');
      debugPrint('║ [BRIDGE] 📱→🌐 Native → Web');
      debugPrint('║ Type: $messageType${action != null ? '.$action' : ''}');
      if (data != null && data.isNotEmpty) {
        debugPrint('║ Data: ${_truncateData(data)}');
      }
      debugPrint(
          '╚═══════════════════════════════════════════════════════════');
    }
  }

  /// Native → Web 응답 확인 로그
  void logNativeToWebConfirm({
    required String messageType,
    String? action,
    bool isError = false,
    String? errorMessage,
  }) {
    if (!enabled) return;

    final entry = BridgeLogEntry(
      timestamp: DateTime.now(),
      direction: BridgeDirection.nativeToWeb,
      handlerName: messageType,
      action: action,
      isError: isError,
      errorMessage: errorMessage,
    );

    _addLog(entry);

    if (verbose) {
      final status = isError ? '❌ Failed' : '✅ Sent';
      debugPrint(
          '╔═══════════════════════════════════════════════════════════');
      debugPrint('║ [BRIDGE] 📱→🌐 Message Sent');
      debugPrint('║ Type: $messageType${action != null ? '.$action' : ''}');
      debugPrint('║ Status: $status');
      if (isError && errorMessage != null) {
        debugPrint('║ Error: $errorMessage');
      }
      debugPrint(
          '╚═══════════════════════════════════════════════════════════');
    }
  }

  /// 로그 추가 (내부)
  void _addLog(BridgeLogEntry entry) {
    _logs.add(entry);

    // 최대 수 초과 시 오래된 로그 제거
    while (_logs.length > maxLogEntries) {
      _logs.removeFirst();
    }

    // 리스너들에게 알림
    for (final listener in _listeners) {
      listener(entry);
    }
  }

  /// 데이터 축약 (민감 정보 마스킹)
  String _truncateData(Map<String, dynamic> data) {
    final masked = <String, dynamic>{};
    for (final entry in data.entries) {
      if (_isSensitiveKey(entry.key)) {
        masked[entry.key] = '***MASKED***';
      } else if (entry.value is String &&
          (entry.value as String).length > 100) {
        masked[entry.key] = '${(entry.value as String).substring(0, 100)}...';
      } else {
        masked[entry.key] = entry.value;
      }
    }
    return masked.toString();
  }

  /// 문자열 축약
  String _truncateString(String str, int maxLength) {
    if (str.length <= maxLength) return str;
    return '${str.substring(0, maxLength)}...';
  }

  /// 민감한 키 확인
  bool _isSensitiveKey(String key) {
    final sensitiveKeys = [
      'password',
      'token',
      'accessToken',
      'refreshToken',
      'secret',
      'credential',
      'auth',
      'bearer',
      'key',
    ];
    final lowerKey = key.toLowerCase();
    return sensitiveKeys.any((k) => lowerKey.contains(k));
  }

  /// 모든 로그 삭제
  void clear() {
    _logs.clear();
  }

  /// 통계 정보
  Map<String, dynamic> getStats() {
    final allLogs = _logs.toList();
    final webToNative =
        allLogs.where((e) => e.direction == BridgeDirection.webToNative).length;
    final nativeToWeb =
        allLogs.where((e) => e.direction == BridgeDirection.nativeToWeb).length;
    final errors = allLogs.where((e) => e.isError).length;

    // 핸들러별 통계
    final handlerCounts = <String, int>{};
    for (final log in allLogs) {
      handlerCounts[log.handlerName] =
          (handlerCounts[log.handlerName] ?? 0) + 1;
    }

    return {
      'total': allLogs.length,
      'webToNative': webToNative,
      'nativeToWeb': nativeToWeb,
      'errors': errors,
      'handlerCounts': handlerCounts,
    };
  }

  /// 로그를 실시간 형태로 출력 (tail -f 스타일)
  void printRecentLogs({int count = 20}) {
    final recent = getRecentLogs(count);
    debugPrint('');
    debugPrint(
        '═══════════════════════════════════════════════════════════════');
    debugPrint('  📡 Bridge Communication Log (Recent $count entries)');
    debugPrint(
        '═══════════════════════════════════════════════════════════════');

    if (recent.isEmpty) {
      debugPrint('  (No logs yet)');
    } else {
      for (final entry in recent) {
        debugPrint('  $entry');
      }
    }

    debugPrint(
        '═══════════════════════════════════════════════════════════════');
    debugPrint('');
  }

  /// 통계 출력
  void printStats() {
    final stats = getStats();
    debugPrint('');
    debugPrint(
        '═══════════════════════════════════════════════════════════════');
    debugPrint('  📊 Bridge Communication Stats');
    debugPrint(
        '═══════════════════════════════════════════════════════════════');
    debugPrint('  Total: ${stats['total']}');
    debugPrint('  Web → Native: ${stats['webToNative']}');
    debugPrint('  Native → Web: ${stats['nativeToWeb']}');
    debugPrint('  Errors: ${stats['errors']}');
    debugPrint(
        '  ─────────────────────────────────────────────────────────────');
    debugPrint('  Handler Counts:');
    final handlerCounts = stats['handlerCounts'] as Map<String, int>;
    for (final entry in handlerCounts.entries) {
      debugPrint('    ${entry.key}: ${entry.value}');
    }
    debugPrint(
        '═══════════════════════════════════════════════════════════════');
    debugPrint('');
  }
}

/// 전역 브릿지 로거 인스턴스
final bridgeLogger = BridgeLogger();
