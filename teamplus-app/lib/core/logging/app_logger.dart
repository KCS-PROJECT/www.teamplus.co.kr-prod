// AppLogger — TEAMPLUS 통합 로깅 시스템 (v8.6 P4-1, 2026-05-20)
//
// 4 sink 라우팅:
//   1. Console (debugPrint)
//   2. In-memory ring buffer (기존 BridgeLogger 통합)
//   3. File sink (path_provider 기반 디바이스 로컬, 10MB 회전)
//   4. Remote sink (60초 batch → 백엔드 POST /api/v1/logs/activity)
//
// 카테고리 (Backend와 동일):
//   일반(8): access · input · output · activity · auth · payment · database · system
//   오류(6): server · transaction · client · auth · database · external
import 'dart:async';

import 'file_log_sink.dart';
import 'remote_log_sink.dart';

enum LogLevel { trace, debug, info, warn, error, fatal }

enum LogCategory {
  access,
  input,
  output,
  activity,
  auth,
  payment,
  database,
  system,
}

enum ErrorCategory {
  server,
  transaction,
  client,
  auth,
  database,
  external,
}

/// 로그 엔트리 — sink들에 공통 전달되는 데이터
class LogEntry {
  final DateTime timestamp;
  final LogLevel level;
  final String? category; // 'access', 'activity', ... 또는 'errors-server' 등
  final bool isError;
  final String message;
  final Map<String, dynamic>? context;
  final Object? error;
  final StackTrace? stackTrace;

  LogEntry({
    required this.level,
    required this.message,
    this.category,
    this.isError = false,
    this.context,
    this.error,
    this.stackTrace,
    DateTime? timestamp,
  }) : timestamp = timestamp ?? DateTime.now();

  Map<String, dynamic> toJson() => {
        'ts': timestamp.toIso8601String(),
        'level': level.name,
        'category': category,
        'type': isError ? 'error' : 'normal',
        'message': message,
        if (context != null) ...context!,
        if (error != null)
          'error': {
            'name': error.runtimeType.toString(),
            'message': error.toString(),
            'stack': stackTrace?.toString(),
          },
      };
}

/// 4개 sink 라우팅 + 정적 분류 유틸 일체를 제공하는 Singleton.
class AppLogger {
  AppLogger._();
  static final AppLogger instance = AppLogger._();

  bool _initialized = false;
  final List<LogEntry> _memoryBuffer = []; // ring buffer (max 500)
  static const int _maxMemoryEntries = 500;

  FileLogSink? _fileSink;
  RemoteLogSink? _remoteSink;

  /// 부팅 직후 1회 호출 (main.dart) — 디바이스 디렉토리 초기화 + sink 인스턴스 생성
  Future<void> initialize({
    String? backendBaseUrl,
    String? sessionId,
    String? userId,
    String platform = 'app',
  }) async {
    if (_initialized) return;
    _fileSink = FileLogSink();
    await _fileSink!.initialize();
    _remoteSink = RemoteLogSink(
      backendBaseUrl: backendBaseUrl,
      sessionId: sessionId,
      userId: userId,
      platform: platform,
    );
    _initialized = true;

    system('AppLogger 초기화 완료', context: {
      'platform': platform,
      'fileRoot': _fileSink?.logRoot,
    });
  }

  /// userId/sessionId 갱신 (로그인 후) — RemoteSink에 반영
  void updateIdentity({String? userId, String? sessionId}) {
    _remoteSink?.updateIdentity(userId: userId, sessionId: sessionId);
  }

  // === 카테고리별 메서드 ===

  void access(String message, {Map<String, dynamic>? context, LogLevel level = LogLevel.info}) =>
      _route(LogEntry(level: level, message: message, category: 'access', context: context));

  void input(String message, {Map<String, dynamic>? context, LogLevel level = LogLevel.info}) =>
      _route(LogEntry(level: level, message: message, category: 'input', context: context));

  void output(String message, {Map<String, dynamic>? context, LogLevel level = LogLevel.info}) =>
      _route(LogEntry(level: level, message: message, category: 'output', context: context));

  void activity(String message, {Map<String, dynamic>? context, LogLevel level = LogLevel.info}) =>
      _route(LogEntry(level: level, message: message, category: 'activity', context: context));

  void authLog(String message, {Map<String, dynamic>? context, LogLevel level = LogLevel.info}) =>
      _route(LogEntry(level: level, message: message, category: 'auth', context: context));

  void payment(String message, {Map<String, dynamic>? context, LogLevel level = LogLevel.info}) =>
      _route(LogEntry(level: level, message: message, category: 'payment', context: context));

  void database(String message, {Map<String, dynamic>? context, LogLevel level = LogLevel.info}) =>
      _route(LogEntry(level: level, message: message, category: 'database', context: context));

  void system(String message, {Map<String, dynamic>? context, LogLevel level = LogLevel.info}) =>
      _route(LogEntry(level: level, message: message, category: 'system', context: context));

  // === 일반 메서드 (카테고리 자동 system) ===

  void debug(String message, {Map<String, dynamic>? context}) =>
      _route(LogEntry(level: LogLevel.debug, message: message, category: 'system', context: context));

  void info(String message, {Map<String, dynamic>? context}) =>
      _route(LogEntry(level: LogLevel.info, message: message, category: 'system', context: context));

  void warn(String message, {Map<String, dynamic>? context}) =>
      _route(LogEntry(level: LogLevel.warn, message: message, category: 'system', context: context));

  /// 에러 — 자동 분류 (HTTP status, 외부 어댑터, 예외 이름)
  void error(
    String message, {
    Object? error,
    StackTrace? stackTrace,
    Map<String, dynamic>? context,
    ErrorCategory? category,
  }) {
    final cat = category ?? _classifyError(error: error, context: context);
    _route(LogEntry(
      level: LogLevel.error,
      message: message,
      category: cat.name,
      isError: true,
      context: context,
      error: error,
      stackTrace: stackTrace,
    ));
  }

  /// 오류 카테고리 명시 (자동 분류 우회)
  void errorAs(
    ErrorCategory category,
    String message, {
    Object? error,
    StackTrace? stackTrace,
    Map<String, dynamic>? context,
  }) {
    _route(LogEntry(
      level: LogLevel.error,
      message: message,
      category: category.name,
      isError: true,
      context: context,
      error: error,
      stackTrace: stackTrace,
    ));
  }

  /// 코어 라우팅 — 4 sink로 fan-out
  void _route(LogEntry entry) {
    // 1) Console
    // ignore: avoid_print
    print('[${entry.level.name.toUpperCase()}] ${entry.category ?? 'system'} | ${entry.message}');

    // 2) In-memory ring buffer
    _memoryBuffer.add(entry);
    if (_memoryBuffer.length > _maxMemoryEntries) {
      _memoryBuffer.removeAt(0);
    }

    // 3) File sink (fire-and-forget)
    _fileSink?.write(entry).catchError((_) {/* swallow */});

    // 4) Remote sink (batch — 60초 또는 100건)
    _remoteSink?.enqueue(entry);
  }

  /// 메모리 버퍼 접근 — 디버그 화면 등에서 사용
  List<LogEntry> get memoryBuffer => List.unmodifiable(_memoryBuffer);

  /// 강제 flush (앱 background 진입 시 호출 권장)
  Future<void> flush() async {
    await _remoteSink?.flushNow();
  }

  /// 자동 오류 분류 — Backend의 classifyError와 동일 로직
  ErrorCategory _classifyError({Object? error, Map<String, dynamic>? context}) {
    final ctx = context ?? {};
    if (ctx['externalSource'] != null) return ErrorCategory.external;
    if (ctx['transactionScope'] != null) return ErrorCategory.transaction;

    final prismaCode = ctx['prismaCode'];
    if (prismaCode is String && RegExp(r'^P\d{4}$').hasMatch(prismaCode)) {
      return ErrorCategory.database;
    }

    final exName = (error?.runtimeType.toString() ?? '').toLowerCase();
    if (exName.contains('unauthorized') ||
        exName.contains('auth') ||
        exName.contains('jwt') ||
        exName.contains('token')) {
      return ErrorCategory.auth;
    }

    final status = ctx['status'];
    if (status is int) {
      if (status >= 500) return ErrorCategory.server;
      if (status >= 400) return ErrorCategory.client;
    }

    return ErrorCategory.server;
  }
}
