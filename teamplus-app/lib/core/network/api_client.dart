import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:pretty_dio_logger/pretty_dio_logger.dart';
import '../auth/jwt_format.dart';
import '../auth/token_storage.dart';
import '../constants/api_constants.dart';
import '../storage/secure_storage_service.dart';
import '../security/ssl_pinning_service.dart';
import 'api_error.dart';
import 'api_lifecycle_interceptor.dart';
import 'auth_guard_interceptor.dart';
import 'circuit_breaker_interceptor.dart';
import 'etag_cache_interceptor.dart';
import 'retry_interceptor.dart';

class ApiClient {
  static final ApiClient _instance = ApiClient._internal();
  late Dio _dio;
  final _storage = SecureStorageService();

  /// 전역 lifecycle 훅 — 외부(riverpod provider 등)에서 subscribe 가능
  final ApiLifecycleHooks lifecycleHooks = ApiLifecycleHooks();

  String _clientVersion = 'flutter-unknown';
  set clientVersion(String version) {
    _clientVersion = version;
  }

  /// v8.7 (2026-05-23) — 현재 화면/컴포넌트 식별자 (프로젝트 루트 기준 경로).
  /// 예: 'teamplus-app/lib/features/auth/presentation/screens/login_screen.dart'
  /// 화면(Widget) initState 에서 `ApiClient().viewId = '...';` 로 등록.
  /// 서버 로그에 X-View-Id 헤더로 echo 되어 어디서 호출됐는지 추적.
  String? _viewId;
  String? get viewId => _viewId;
  set viewId(String? value) {
    _viewId = value != null && value.isNotEmpty ? value : null;
  }

  /// 미로그인 상태에서 인증 필요 API가 호출될 때 앱이 수행할 동작.
  /// 앱 부팅 시 `ApiClient().onAuthRequired = (path) => goRouter.go('/login?redirect=$path');` 형태로 등록.
  void Function(String requestUrl)? onAuthRequired;

  /// ETag 기반 GET 응답 캐시 — 로그아웃 시 외부에서 invalidate() 호출 가능
  late final EtagCacheInterceptor etagCache = EtagCacheInterceptor();

  factory ApiClient() => _instance;

  ApiClient._internal() {
    _dio = Dio(
      BaseOptions(
        baseUrl: ApiConstants.baseUrl,
        connectTimeout: ApiConstants.connectTimeout,
        receiveTimeout: ApiConstants.receiveTimeout,
        sendTimeout: ApiConstants.sendTimeout,
        headers: {
          'Content-Type': ApiConstants.contentTypeJson,
          'Accept': ApiConstants.acceptJson,
          // 🎯 서버 compression(gzip) 대응 — 응답 크기 60-80% 감소
          'Accept-Encoding': 'gzip, deflate',
          // keep-alive 명시 — Dart HttpClient 기본값이지만 일부 프록시 환경 방어
          'Connection': 'keep-alive',
        },
        // 응답 타입: json 고정 (자동 파싱)
        responseType: ResponseType.json,
        // HTTP persistent connection 활성화 (Dio 기본 true, 명시적 표기)
        persistentConnection: true,
      ),
    );

    // 🔒 SSL Certificate Pinning 적용
    _dio.httpClientAdapter = SslPinningService().createAdapter();

    // 🧭 API Lifecycle (전처리/후처리 공통) — AuthInterceptor 앞에 등록하여
    //    토큰 갱신 재시도 시에도 동일한 X-Request-ID를 유지
    _dio.interceptors.add(
      ApiLifecycleInterceptor(
        hooks: lifecycleHooks,
        clientVersion: _clientVersion,
        // v8.7 — 매 요청마다 최신 viewId 조회 (ApiClient().viewId getter 위임)
        viewIdProvider: () => _viewId,
      ),
    );

    // ⚡ CircuitBreaker — 5분 윈도우 5회 5xx → 30초 fast-fail.
    //    백엔드 장애 시 클라이언트가 부하를 가중하는 패턴을 차단.
    //    AuthGuard 보다 앞에 두어 차단된 요청은 토큰 검증 시도조차 하지 않는다.
    _dio.interceptors.add(CircuitBreakerInterceptor());

    // 🔐 AuthGuard — 전처리 단계에서 미로그인 요청 차단 + 로그인 유도 콜백 발사
    _dio.interceptors.add(
      AuthGuardInterceptor(
        storage: _storage,
        onAuthRequired: (path) {
          try {
            onAuthRequired?.call(path);
          } catch (_) {
            /* 앱 콜백 예외는 무시 — 원 요청은 이미 reject 처리됨 */
          }
        },
      ),
    );

    // 🗂 ETag 캐시 — GET 응답을 LRU 메모리 캐시에 저장, 304 시 즉시 복구
    //    반복 조회에서 네트워크 전송 0 + 파싱만 수행 → 대시보드 페이지 재진입 시 수백 ms 절약
    _dio.interceptors.add(etagCache);

    // Add interceptors (토큰 자동 갱신 지원)
    _dio.interceptors.add(_AuthInterceptor(_storage, _dio));

    // Add retry interceptor (Exponential Backoff)
    _dio.interceptors.add(RetryInterceptor(
      dio: _dio,
      options: const RetryOptions(),
    ));

    // Add logger only in debug mode
    if (kDebugMode) {
      _dio.interceptors.add(
        PrettyDioLogger(
          requestHeader: true,
          requestBody: true,
          responseBody: true,
          responseHeader: false,
          error: true,
          compact: true,
          maxWidth: 90,
        ),
      );
    }
  }

  Dio get dio => _dio;

  // GET request
  Future<Response> get(
    String path, {
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
  }) async {
    try {
      return await _dio.get(
        path,
        queryParameters: queryParameters,
        options: options,
        cancelToken: cancelToken,
      );
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  // POST request
  Future<Response> post(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
    ProgressCallback? onSendProgress,
    ProgressCallback? onReceiveProgress,
  }) async {
    try {
      return await _dio.post(
        path,
        data: data,
        queryParameters: queryParameters,
        options: options,
        cancelToken: cancelToken,
        onSendProgress: onSendProgress,
        onReceiveProgress: onReceiveProgress,
      );
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  // PUT request
  Future<Response> put(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
  }) async {
    try {
      return await _dio.put(
        path,
        data: data,
        queryParameters: queryParameters,
        options: options,
        cancelToken: cancelToken,
      );
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  // PATCH request
  Future<Response> patch(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
  }) async {
    try {
      return await _dio.patch(
        path,
        data: data,
        queryParameters: queryParameters,
        options: options,
        cancelToken: cancelToken,
      );
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  // DELETE request
  Future<Response> delete(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
  }) async {
    try {
      return await _dio.delete(
        path,
        data: data,
        queryParameters: queryParameters,
        options: options,
        cancelToken: cancelToken,
      );
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  /// DioException을 표준 ApiError로 변환
  ApiError _handleError(DioException error) {
    switch (error.type) {
      case DioExceptionType.connectionTimeout:
        return ApiError.connection(originalError: error);
      case DioExceptionType.sendTimeout:
        return ApiError.timeout(
          message: ApiConstants.sendTimeoutMessage,
          originalError: error,
        );
      case DioExceptionType.receiveTimeout:
        return ApiError.timeout(
          message: ApiConstants.receiveTimeoutMessage,
          originalError: error,
        );
      case DioExceptionType.badResponse:
        return _handleBadResponse(error);
      case DioExceptionType.cancel:
        return ApiError.cancelled();
      case DioExceptionType.connectionError:
        return ApiError.connection(originalError: error);
      default:
        return ApiError.network(originalError: error);
    }
  }

  /// HTTP 응답 에러 처리
  ApiError _handleBadResponse(DioException error) {
    final statusCode = error.response?.statusCode;
    final responseData = error.response?.data;

    // 서버에서 보낸 에러 메시지 추출
    String? serverMessage;
    Map<String, dynamic>? details;

    if (responseData is Map<String, dynamic>) {
      serverMessage = responseData['message'] as String?;
      details = responseData['details'] as Map<String, dynamic>?;

      // 서버에서 에러 코드를 보낸 경우 그대로 사용.
      // NestJS AllExceptionsFilter 는 `errorCode` 필드를 사용하므로 함께 매핑
      // (예: 409 SESSION_EXISTS — 단일 세션 정책 확인 모달 트리거).
      final serverCode = (responseData['code'] as String?) ??
          (responseData['errorCode'] as String?);
      if (serverCode != null) {
        return ApiError(
          code: serverCode,
          message: serverMessage ??
              ApiError.fromStatusCode(statusCode ?? 500).message,
          statusCode: statusCode,
          details: details,
          originalError: error,
        );
      }
    }

    return ApiError.fromStatusCode(
      statusCode ?? 500,
      serverMessage: serverMessage,
      details: details,
      originalError: error,
    );
  }
}

// Auth Interceptor with Token Refresh
class _AuthInterceptor extends Interceptor {
  final SecureStorageService storage;
  final Dio _dio;
  bool _isRefreshing = false;

  // 토큰 갱신 중 대기 중인 요청들을 저장하는 큐
  final List<({RequestOptions options, ErrorInterceptorHandler handler})>
      _pendingRequests = [];

  _AuthInterceptor(this.storage, this._dio);

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    // Skip token for public endpoints
    if (_isPublicEndpoint(options.path)) {
      return handler.next(options);
    }

    // Add access token to headers
    final accessToken = await storage.getAccessToken();
    if (accessToken != null) {
      options.headers['Authorization'] = 'Bearer $accessToken';
    }

    return handler.next(options);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    // 401 에러 + 토큰 갱신 API가 아닌 경우에만 처리
    if (err.response?.statusCode == 401 &&
        !_isPublicEndpoint(err.requestOptions.path)) {
      // 이미 토큰 갱신 중이면 큐에 추가하고 대기
      if (_isRefreshing) {
        _pendingRequests.add((options: err.requestOptions, handler: handler));
        return;
      }

      _isRefreshing = true;

      try {
        // 토큰 갱신 시도
        final newToken = await _refreshToken();

        if (newToken != null) {
          // 원래 요청 재시도
          final response = await _retryRequest(err.requestOptions, newToken);

          // 대기 중인 요청들도 재시도
          _retryPendingRequests(newToken);

          return handler.resolve(response);
        } else {
          // 갱신 실패 → 로그아웃 처리
          await _handleLogout();
          _rejectPendingRequests(err);
          return handler.reject(err);
        }
      } catch (e) {
        // 갱신 중 에러 → 로그아웃 처리
        await _handleLogout();
        _rejectPendingRequests(err);
        return handler.reject(err);
      } finally {
        _isRefreshing = false;
      }
    }

    return handler.next(err);
  }

  /// 토큰 갱신 API 호출
  Future<String?> _refreshToken() async {
    try {
      final refreshToken = await storage.getRefreshToken();
      // [2026-05-14] JWT 형식 사전 검증 — 백엔드 RefreshTokenDto @IsJWT 가
      //   garbage 토큰을 받아 400 BadRequest 사이클을 일으키지 않도록 차단.
      //   null / 빈문자열 / 비-JWT 모두 호출 자체를 건너뛰어 네트워크 비용 절약.
      if (!isJwtFormatPattern(refreshToken)) {
        // stale invalid 토큰 자동 정리 — 다음 401 사이클이 재시도하지 않도록.
        // null/빈 토큰은 이미 없는 상태라 무해. invalid format 만 명시적 정리.
        if (refreshToken != null && refreshToken.isNotEmpty) {
          await storage.delete('refresh_token');
          if (kDebugMode) {
            debugPrint('🧹 invalid refresh token 감지 → SecureStorage 에서 정리됨');
          }
        }
        return null;
      }

      // 토큰 갱신 API 호출 (인터셉터 우회를 위해 새 Dio 인스턴스 사용)
      final refreshDio = Dio(BaseOptions(
        baseUrl: _dio.options.baseUrl,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      ));

      final response = await refreshDio.post(
        '/auth/refresh',
        data: {'refreshToken': refreshToken},
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        final data = response.data;
        final newAccessToken = data['accessToken'] as String?;
        final newRefreshToken = data['refreshToken'] as String?;

        if (newAccessToken != null && newRefreshToken != null) {
          // 새 토큰 저장 (3회 write 병렬 실행 — 상호 의존 없음)
          await Future.wait([
            storage.saveAccessToken(newAccessToken),
            storage.saveRefreshToken(newRefreshToken),
            storage.saveTokenExpiryFromJwt(newAccessToken),
          ]);

          // ⚡ TokenStorage 캐시 무효화 — 갱신된 토큰이
          // readAuthBundle() 캐시를 오염시키지 않도록 강제 무효화
          TokenStorage().invalidateAuthBundleCache();

          return newAccessToken;
        }
      }
      return null;
    } catch (e) {
      if (kDebugMode) {
        debugPrint('Token refresh failed: $e');
      }
      return null;
    }
  }

  /// 원래 요청 재시도
  Future<Response> _retryRequest(
      RequestOptions options, String newToken) async {
    options.headers['Authorization'] = 'Bearer $newToken';
    return await _dio.fetch(options);
  }

  /// 대기 중인 요청들 재시도
  void _retryPendingRequests(String newToken) {
    for (final pending in _pendingRequests) {
      pending.options.headers['Authorization'] = 'Bearer $newToken';
      _dio.fetch(pending.options).then(
            (response) => pending.handler.resolve(response),
            onError: (e) => pending.handler.reject(e as DioException),
          );
    }
    _pendingRequests.clear();
  }

  /// 대기 중인 요청들 거부
  void _rejectPendingRequests(DioException err) {
    for (final pending in _pendingRequests) {
      pending.handler.reject(err);
    }
    _pendingRequests.clear();
  }

  /// 로그아웃 처리 (토큰 삭제)
  Future<void> _handleLogout() async {
    await storage.clearAll();
  }

  bool _isPublicEndpoint(String path) {
    final publicPaths = ['/auth/login', '/auth/register', '/auth/refresh'];
    return publicPaths.any((p) => path.contains(p));
  }
}
