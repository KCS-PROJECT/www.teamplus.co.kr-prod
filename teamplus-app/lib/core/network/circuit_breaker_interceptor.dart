import 'dart:collection';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

/// CircuitBreakerInterceptor
///
/// 백엔드 장애 시 클라이언트가 5xx 응답을 반복 호출하여 추가 부하를 주는 것을
/// 차단한다. 슬라이딩 윈도우 동안 임계치를 초과한 5xx 발생 시 `open` 상태로
/// 전환되어 일정 시간 동안 즉시 `DioException.connectionError` (code:
/// `CIRCUIT_OPEN`) 로 fast-fail 한다.
///
/// 상태 머신:
///   closed   — 정상 통과. 5xx 발생 시 window 에 timestamp 추가.
///   open     — 모든 요청 즉시 reject. `openUntil` 시점이 지나면 half-open.
///   halfOpen — 단 1회 요청만 통과 (probe). 성공 시 closed, 실패 시 다시 open.
///
/// [windowDuration] 기본 5분. 이 안에 [failureThreshold] (5회) 5xx 가 누적되면
/// open 상태로 전환. open 지속 시간 [openDuration] 기본 30초.
///
/// 인터셉터 체인:
///   ApiLifecycle → CircuitBreaker → AuthGuard → EtagCache → Auth → Retry
///
/// 회로 차단된 도메인 단위는 host 기준이 아니라 전역. 필요 시 서비스별 분리는
/// 별도 인스턴스로 등록.
class CircuitBreakerInterceptor extends Interceptor {
  CircuitBreakerInterceptor({
    this.failureThreshold = 5,
    this.windowDuration = const Duration(minutes: 5),
    this.openDuration = const Duration(seconds: 30),
  });

  final int failureThreshold;
  final Duration windowDuration;
  final Duration openDuration;

  final Queue<DateTime> _failures = Queue();
  DateTime? _openUntil;
  bool _halfOpenProbeInFlight = false;

  bool get _isOpen {
    final until = _openUntil;
    return until != null && DateTime.now().isBefore(until);
  }

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    if (_isOpen) {
      if (_halfOpenProbeInFlight) {
        if (kDebugMode) {
          debugPrint(
            '[CircuitBreaker] OPEN — fast-fail ${options.method} ${options.path}',
          );
        }
        return handler.reject(
          DioException(
            requestOptions: options,
            type: DioExceptionType.connectionError,
            error: 'CIRCUIT_OPEN',
            message: '백엔드 일시 장애로 잠시 후 다시 시도해 주세요.',
          ),
          true,
        );
      }
      // probe 허용
      _halfOpenProbeInFlight = true;
    }
    handler.next(options);
  }

  @override
  void onResponse(
      Response<dynamic> response, ResponseInterceptorHandler handler) {
    _onSuccess();
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    final status = err.response?.statusCode;
    if (status != null && status >= 500 && status < 600) {
      _onFailure();
    } else if (err.type == DioExceptionType.connectionError ||
        err.type == DioExceptionType.receiveTimeout ||
        err.type == DioExceptionType.sendTimeout ||
        err.type == DioExceptionType.connectionTimeout) {
      _onFailure();
    }
    _halfOpenProbeInFlight = false;
    handler.next(err);
  }

  void _onSuccess() {
    // half-open probe 성공 → closed 복귀
    if (_openUntil != null) {
      if (kDebugMode) {
        debugPrint('[CircuitBreaker] CLOSED — probe success');
      }
      _openUntil = null;
      _failures.clear();
    }
    _halfOpenProbeInFlight = false;
  }

  void _onFailure() {
    final now = DateTime.now();
    _failures.addLast(now);
    final cutoff = now.subtract(windowDuration);
    while (_failures.isNotEmpty && _failures.first.isBefore(cutoff)) {
      _failures.removeFirst();
    }
    if (_failures.length >= failureThreshold && _openUntil == null) {
      _openUntil = now.add(openDuration);
      if (kDebugMode) {
        debugPrint(
          '[CircuitBreaker] OPEN — ${_failures.length} failures in ${windowDuration.inMinutes}m, '
          'open for ${openDuration.inSeconds}s',
        );
      }
    }
  }

  /// 테스트 / 강제 reset 용.
  @visibleForTesting
  void reset() {
    _openUntil = null;
    _failures.clear();
    _halfOpenProbeInFlight = false;
  }

  /// 디버그 / 모니터링 — 현재 상태를 외부로 노출.
  bool get isCircuitOpen => _isOpen;
  int get recentFailureCount => _failures.length;
}
