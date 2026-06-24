import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../storage/secure_storage_service.dart';
import 'api_lifecycle_interceptor.dart';

/// AuthGuardInterceptor
///
/// 로그인 후 호출되는 모든 API 요청에 대한 **전처리 단계의 로그인 검증**.
/// - Public 화이트리스트([isPublicApiPath]) 대상은 통과
/// - 저장된 accessToken이 없으면 요청을 즉시 차단하고 [DioExceptionType.badResponse]
///   (401) + `code: AUTH_REQUIRED` 에러로 reject
/// - 등록된 [onAuthRequired] 콜백을 호출하여 앱에서 로그인 화면 이동/토스트를 유도
///
/// [ApiLifecycleInterceptor] **다음**에 등록되어 X-Request-ID는 이미 채워진 상태로 받는다.
class AuthGuardInterceptor extends Interceptor {
  AuthGuardInterceptor({
    required this.storage,
    this.onAuthRequired,
  });

  final SecureStorageService storage;

  /// 로그인 유도 콜백 — 앱 부팅 시 등록.
  /// `requestUrl`을 받아 로그인 화면으로 이동하거나 토스트를 띄운다.
  final void Function(String requestUrl)? onAuthRequired;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    if (isPublicApiPath(options.path)) {
      return handler.next(options);
    }

    final token = await storage.getAccessToken();
    if (token != null && token.isNotEmpty) {
      return handler.next(options);
    }

    // 토큰 없음 + Public 아님 → 요청 차단 + 로그인 유도 콜백 발사
    if (kDebugMode) {
      debugPrint(
        '[AuthGuard] Blocked unauthenticated request to ${options.method} ${options.path}',
      );
    }
    try {
      onAuthRequired?.call(options.path);
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[AuthGuard] onAuthRequired handler failed: $e');
      }
    }

    final err = DioException(
      requestOptions: options,
      type: DioExceptionType.badResponse,
      response: Response<Map<String, dynamic>>(
        requestOptions: options,
        statusCode: 401,
        data: <String, dynamic>{
          'code': kAuthRequiredCode,
          'errorCode': kAuthRequiredCode,
          'message': '로그인이 필요합니다.',
          // [2026-05-19] 네이티브 /login 폐기 → /webview (InitialDestinationGate
          //   가 token 부재 시 자동으로 Next.js /login/ URL 로드).
          'redirectTo': '/webview',
        },
      ),
      error: 'AUTH_REQUIRED',
      message: '로그인이 필요합니다.',
    );
    handler.reject(err, true);
  }
}
