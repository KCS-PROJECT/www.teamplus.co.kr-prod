// RemoteLogSink — 백엔드로 batch 전송 (v8.6 P4-3, 2026-05-20)
//
// - 메모리 큐 (max 200) + 60초 주기 OR 100건 도달 시 flush
// - Dio로 POST /api/v1/logs/activity 호출
// - 실패 시 큐 유지 → 다음 주기 재시도 (오버플로 시 가장 오래된 것부터 drop)
// - app pause/lifecycle 종료 시 flushNow() 호출 권장
import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import 'app_logger.dart';

class RemoteLogSink {
  static const int _maxQueue = 200;
  static const int _flushSize = 100;
  static const Duration _flushInterval = Duration(seconds: 60);

  final String? backendBaseUrl;
  String? _sessionId;
  String? _userId;
  final String platform;

  final List<LogEntry> _queue = [];
  Timer? _timer;
  bool _flushing = false;
  late final Dio _dio;

  RemoteLogSink({
    this.backendBaseUrl,
    String? sessionId,
    String? userId,
    this.platform = 'app',
  })  : _sessionId = sessionId,
        _userId = userId {
    _dio = Dio(BaseOptions(
      baseUrl: backendBaseUrl ?? '',
      connectTimeout: const Duration(seconds: 5),
      sendTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 10),
      headers: {
        'content-type': 'application/json',
        'x-client-platform': platform,
      },
    ));
  }

  void updateIdentity({String? userId, String? sessionId}) {
    if (userId != null) _userId = userId;
    if (sessionId != null) _sessionId = sessionId;
  }

  void enqueue(LogEntry entry) {
    if (backendBaseUrl == null || backendBaseUrl!.isEmpty) return;

    // 큐 오버플로 — 오래된 것부터 drop
    if (_queue.length >= _maxQueue) {
      _queue.removeAt(0);
    }
    _queue.add(entry);

    if (_queue.length >= _flushSize) {
      unawaited(flushNow());
    } else {
      _timer ??= Timer(_flushInterval, () => unawaited(flushNow()));
    }
  }

  Future<void> flushNow() async {
    if (_flushing || _queue.isEmpty) return;
    _flushing = true;
    _timer?.cancel();
    _timer = null;

    final batch = _queue.sublist(0, _queue.length > _flushSize ? _flushSize : _queue.length);
    _queue.removeRange(0, batch.length);

    try {
      final events = batch.map((e) {
        final json = e.toJson();
        if (_userId != null && !json.containsKey('userId')) json['userId'] = _userId;
        if (_sessionId != null && !json.containsKey('sessionId')) json['sessionId'] = _sessionId;
        return json;
      }).toList();

      await _dio.post(
        '/logs/activity',
        data: {
          'events': events,
          'source': 'app',
          'platform': platform,
        },
      );
    } catch (e) {
      // 실패 — 큐에 다시 넣기 (오버플로 시 새 entry가 drop됨)
      _queue.insertAll(0, batch);
      if (_queue.length > _maxQueue) {
        _queue.removeRange(0, _queue.length - _maxQueue);
      }
      debugPrint('[RemoteLogSink] flush 실패: $e — 큐 유지 ${_queue.length}건');
    } finally {
      _flushing = false;
      // 큐에 남은 게 있으면 다음 주기 timer 재설정
      if (_queue.isNotEmpty && _timer == null) {
        _timer = Timer(_flushInterval, () => unawaited(flushNow()));
      }
    }
  }

  void dispose() {
    _timer?.cancel();
    _timer = null;
  }
}
