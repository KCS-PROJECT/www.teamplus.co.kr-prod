import 'dart:async';
import 'dart:math';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

/// Retry 설정
class RetryOptions {
  /// 최대 재시도 횟수 (기본: 3)
  final int maxRetries;

  /// 기본 대기 시간 (밀리초, 기본: 1000ms)
  final int baseDelayMs;

  /// 최대 대기 시간 (밀리초, 기본: 10000ms)
  final int maxDelayMs;

  /// 재시도할 HTTP 상태 코드 (기본: 5xx)
  final Set<int> retryableStatusCodes;

  /// Jitter 사용 여부 (랜덤 지연 추가)
  final bool useJitter;

  const RetryOptions({
    this.maxRetries = 3,
    this.baseDelayMs = 1000,
    this.maxDelayMs = 10000,
    this.retryableStatusCodes = const {500, 502, 503, 504},
    this.useJitter = true,
  });

  /// 기본 설정
  static const RetryOptions defaults = RetryOptions();

  /// 공격적인 재시도 설정 (빠른 재시도)
  static const RetryOptions aggressive = RetryOptions(
    maxRetries: 5,
    baseDelayMs: 500,
    maxDelayMs: 5000,
  );

  /// 보수적인 재시도 설정 (느린 재시도)
  static const RetryOptions conservative = RetryOptions(
    maxRetries: 2,
    baseDelayMs: 2000,
    maxDelayMs: 15000,
  );
}

/// Exponential Backoff를 사용한 Retry Interceptor
class RetryInterceptor extends Interceptor {
  final Dio dio;
  final RetryOptions options;
  final Random _random = Random();

  RetryInterceptor({
    required this.dio,
    this.options = const RetryOptions(),
  });

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    // 이미 재시도 중인지 확인
    final retryCount = err.requestOptions.extra['retryCount'] as int? ?? 0;

    // 재시도 가능한지 확인
    if (!_shouldRetry(err, retryCount)) {
      return handler.next(err);
    }

    // 재시도 횟수 증가
    err.requestOptions.extra['retryCount'] = retryCount + 1;

    // Exponential backoff 대기 시간 계산
    final delay = _calculateDelay(retryCount);

    if (kDebugMode) {
      print('🔄 Retry ${retryCount + 1}/${options.maxRetries} '
          'after ${delay}ms for ${err.requestOptions.path}');
    }

    // 대기 후 재시도
    await Future.delayed(Duration(milliseconds: delay));

    try {
      final response = await dio.fetch(err.requestOptions);
      return handler.resolve(response);
    } on DioException catch (e) {
      // 재귀적으로 재시도 처리됨
      return handler.next(e);
    }
  }

  /// 재시도 가능 여부 확인
  bool _shouldRetry(DioException err, int retryCount) {
    // 최대 재시도 횟수 초과
    if (retryCount >= options.maxRetries) {
      return false;
    }

    // 요청이 취소된 경우 재시도하지 않음
    if (err.type == DioExceptionType.cancel) {
      return false;
    }

    // 네트워크 오류는 항상 재시도
    if (_isNetworkError(err)) {
      return true;
    }

    // HTTP 응답 에러 확인
    if (err.response != null) {
      final statusCode = err.response!.statusCode;
      if (statusCode != null &&
          options.retryableStatusCodes.contains(statusCode)) {
        return true;
      }
    }

    return false;
  }

  /// 네트워크 오류 여부 확인
  bool _isNetworkError(DioException err) {
    return err.type == DioExceptionType.connectionTimeout ||
        err.type == DioExceptionType.sendTimeout ||
        err.type == DioExceptionType.receiveTimeout ||
        err.type == DioExceptionType.connectionError ||
        err.type == DioExceptionType.unknown;
  }

  /// Exponential Backoff 대기 시간 계산
  int _calculateDelay(int retryCount) {
    // 2^retryCount * baseDelay
    final exponentialDelay = options.baseDelayMs * pow(2, retryCount).toInt();

    // 최대 대기 시간 적용
    var delay = min(exponentialDelay, options.maxDelayMs);

    // Jitter 추가 (0~25% 랜덤 추가)
    if (options.useJitter) {
      final jitter = (_random.nextDouble() * 0.25 * delay).toInt();
      delay += jitter;
    }

    return delay;
  }
}

/// Retry 상태 추적을 위한 확장
extension RetryRequestOptions on RequestOptions {
  /// 현재 재시도 횟수
  int get retryCount => extra['retryCount'] as int? ?? 0;

  /// 재시도 비활성화
  bool get retryDisabled => extra['retryDisabled'] as bool? ?? false;

  /// 재시도 비활성화 설정
  set retryDisabled(bool value) => extra['retryDisabled'] = value;
}

/// 특정 요청에서 재시도 비활성화
Options disableRetry([Options? options]) {
  return (options ?? Options()).copyWith(
    extra: {...?options?.extra, 'retryDisabled': true},
  );
}
