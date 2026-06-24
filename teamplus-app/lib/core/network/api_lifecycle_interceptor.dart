import 'dart:async';
import 'dart:io' show Platform;
import 'dart:math';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart' show WidgetsBinding;
import 'package:sentry_flutter/sentry_flutter.dart';

import '../notification/push_notification_service.dart';

/// 표준 에러 코드 — 미로그인 상태에서 인증 필요 API 호출 시 사용.
const String kAuthRequiredCode = 'AUTH_REQUIRED';

/// 로그인 전 호출 허용 경로 (서버 `@Public()` 데코레이터 기반).
/// 이 목록 외 경로는 토큰이 없으면 요청을 차단한다.
const List<Pattern> kPublicApiPatterns = <Pattern>[
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/signup',
  '/auth/find-id',
  '/auth/password',
  '/auth/check-email',
  '/auth/check-phone',
  '/auth/email/',
  '/child-auth/',
  '/identity/initiate-anonymous',
  '/identity/callback/',
  '/identity/result/',
  '/sms/send',
  '/sms/verify',
  '/sms/resend-status',
  '/app/settings',
  '/app/maintenance-notice',
  '/app/banners',
  '/app/versions/latest',
  '/app/premium-events/featured',
  '/main-popups',
  '/academies/public/',
  // [추가 2026-05-28] 회원가입(비로그인) 화면 호출 — 서버 @Public + web PUBLIC_API_PATTERNS 동기화.
  //   감독 가입: 훈련 링크장 선택(GET /venues). 학부모/코치 가입: 팀 선택(GET /teams/public).
  //   누락 시 AuthGuardInterceptor 가 무토큰 요청을 401 차단 → WebView 에서 목록이 빈 상태로 표시되는 회귀.
  //   (web: teamplus-web/src/services/api-lifecycle.ts PUBLIC_API_PATTERNS 와 1:1 동기화 유지 필수)
  '/teams/check-code',
  '/teams/public',
  '/venues',
  '/health',
  '/metrics',
  '/api/docs',
];

bool isPublicApiPath(String path) {
  if (path.isEmpty) return false;
  for (final p in kPublicApiPatterns) {
    if (p is String && path.contains(p)) return true;
  }
  return false;
}

/// 로그인 후 호출되는 모든 API 요청에 대한 전처리/후처리 공통 인터셉터.
///
/// - **Pre-processing (onRequest)**:
///   · `X-Request-ID` 생성 (UUID v4)
///   · `X-Client-Platform` = `ios` | `android` | `flutter`
///   · `X-Client-Version` = 앱 버전 (주입)
///   · `X-Device-Id` = 저장된 device ID (선택)
///   · `requestOptions.extra['_startAt']`에 요청 시작 시각 기록
///
/// - **Post-processing (onResponse / onError)**:
///   · durationMs 계산 후 [ApiLifecycleHooks]의 리스너에게 브로드캐스트
///   · 401 응답 시 `onUnauthorized` 콜백 발사
///   · 느린 요청 (3초 초과) 시 디버그 로그
///
/// [ApiClient]의 인터셉터 체인에서 `_AuthInterceptor` 앞단에 등록하여,
/// 토큰 갱신 재시도가 있어도 동일한 requestId를 유지하도록 한다.
class ApiLifecycleInterceptor extends Interceptor {
  ApiLifecycleInterceptor({
    required this.hooks,
    this.clientVersion = 'flutter-unknown',
    this.deviceIdProvider,
    this.viewIdProvider,
  });

  final ApiLifecycleHooks hooks;
  final String clientVersion;
  final Future<String?> Function()? deviceIdProvider;
  /// v8.7 (2026-05-23) — 현재 화면 viewId 조회 콜백 (ApiClient().viewId getter 위임).
  /// 매 요청마다 호출되어 최신 값이 X-View-Id 헤더로 부착됨.
  final String? Function()? viewIdProvider;

  /// 활동 추적에서 제외할 경로 (서버와 동일)
  static const List<String> excludePaths = <String>[
    '/auth/refresh',
    '/auth/login',
    '/health',
    '/metrics',
  ];

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final requestId = _ensureRequestId(options);
    options.headers['X-Client-Platform'] = _platformLabel();
    options.headers['X-Client-Version'] = clientVersion;

    // v8.7 — X-View-Id (어느 화면/컴포넌트에서 호출됐는지 서버 로그에 기록)
    try {
      final viewId = viewIdProvider?.call();
      if (viewId != null && viewId.isNotEmpty) {
        options.headers['X-View-Id'] = viewId;
      }
    } catch (_) {
      /* viewIdProvider 예외는 요청에 영향 없도록 swallow */
    }

    // [2026-05-13 Phase C-2] Idempotency-Key 자동 부착 (POST/PUT/PATCH).
    //   결제·자녀 등록·출석 체크인 재시도 시 중복 생성 차단. Web/App 양쪽 모두 부착되어
    //   Backend 가 동일 키 수신 시 idempotent 처리할 수 있도록 한다.
    //   호출자가 `options.extra['idempotencyKey']` 로 도메인 키(예: orderNumber) 명시 가능.
    final method = options.method.toUpperCase();
    if (const ['POST', 'PUT', 'PATCH'].contains(method)) {
      if (!options.headers.containsKey('X-Idempotency-Key')) {
        final override = options.extra['idempotencyKey'];
        options.headers['X-Idempotency-Key'] =
            (override is String && override.isNotEmpty) ? override : _uuidV4();
      }
    }

    // [2026-05-13 Phase C-3] Accept-Language 자동 부착 — 다국어 백엔드 응답 분기 가능.
    if (!options.headers.containsKey('Accept-Language')) {
      try {
        final locale =
            WidgetsBinding.instance.platformDispatcher.locale.languageCode;
        if (locale.isNotEmpty) {
          options.headers['Accept-Language'] = locale;
        }
      } catch (_) {
        /* binding 없을 때 무시 */
      }
    }

    // [2026-05-13 Phase C-3] User-Agent 명시 — backend 로깅/감지 일관성.
    if (!options.headers.containsKey('User-Agent') &&
        !options.headers.containsKey('user-agent')) {
      options.headers['User-Agent'] =
          'teamplusApp/$clientVersion (${_platformLabel()})';
    }

    // [2026-05-13 Phase C-6] X-FCM-Token 헤더 — push 구독 상태 추적/분석용.
    //   캐시된 토큰이 없으면(초기화 전 / 권한 거부) skip. 동기 getter 사용.
    if (!options.headers.containsKey('X-FCM-Token')) {
      try {
        final fcm = PushNotificationService().fcmToken;
        if (fcm != null && fcm.isNotEmpty) {
          options.headers['X-FCM-Token'] = fcm;
        }
      } catch (_) {
        /* 미초기화 / 미지원 환경 무시 */
      }
    }

    if (deviceIdProvider != null) {
      try {
        final deviceId = await deviceIdProvider!();
        if (deviceId != null && deviceId.isNotEmpty) {
          options.headers['X-Device-Id'] = deviceId;
        }
      } catch (_) {
        /* device id 조회 실패는 무시 */
      }
    }

    final startAt = DateTime.now().millisecondsSinceEpoch;
    options.extra['_lifecycleStartAt'] = startAt;
    options.extra['_lifecycleRequestId'] = requestId;

    final ctx = LifecycleContext(
      requestId: requestId,
      method: options.method,
      path: options.path,
      startAt: startAt,
      platform: _platformLabel(),
      clientVersion: clientVersion,
    );
    hooks._fireBefore(ctx);
    handler.next(options);
  }

  @override
  void onResponse(
    Response<dynamic> response,
    ResponseInterceptorHandler handler,
  ) {
    final ctx = _buildResponseContext(response.requestOptions, response);
    hooks._fireAfter(ctx);

    // 🎯 1초 SLA 모니터링 (Flutter App)
    // - 1000-3000ms: warn
    // - >3000ms: critical (사용자 불만 유발 구간)
    if (ctx.durationMs > 3000) {
      if (kDebugMode) {
        debugPrint(
          '[API SLA_CRITICAL] ${ctx.method} ${ctx.path} took ${ctx.durationMs}ms (>3s)',
        );
      }
    } else if (ctx.durationMs > 1000) {
      if (kDebugMode) {
        debugPrint(
          '[API SLA_BREACH] ${ctx.method} ${ctx.path} took ${ctx.durationMs}ms (>1s target)',
        );
      }
    }
    // [2026-05-14] Sentry SLA 보고 — SENTRY_DSN 미설정 시 no-op (init 안 됨).
    //   try/catch 로 wrap 하여 Sentry 가 아예 초기화되지 않은 경우 안전.
    if (ctx.durationMs > 1000) {
      try {
        Sentry.captureMessage(
          '[API SLA_VIOLATION] ${ctx.method} ${ctx.path} took ${ctx.durationMs}ms',
          level:
              ctx.durationMs > 3000 ? SentryLevel.error : SentryLevel.warning,
          withScope: (scope) {
            scope.setTag('type', 'SLA_VIOLATION');
            scope.setTag('method', ctx.method);
            scope.setContexts('api', {
              'requestId': ctx.requestId,
              'durationMs': ctx.durationMs,
              'path': ctx.path,
              'platform': ctx.platform,
            });
          },
        );
      } catch (_) {
        /* Sentry 미초기화 시 무시 */
      }
    }
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    final ctx = _buildResponseContext(err.requestOptions, err.response);
    final errorCtx = LifecycleErrorContext(
      requestId: ctx.requestId,
      method: ctx.method,
      path: ctx.path,
      startAt: ctx.startAt,
      platform: ctx.platform,
      clientVersion: ctx.clientVersion,
      status: ctx.status,
      durationMs: ctx.durationMs,
      serverTime: ctx.serverTime,
      error: err,
      message: _extractMessage(err),
      code: _extractCode(err),
    );
    hooks._fireError(errorCtx);
    handler.next(err);
  }

  // === helpers ===

  String _ensureRequestId(RequestOptions options) {
    final existing = options.headers['X-Request-ID'];
    if (existing is String && existing.isNotEmpty) return existing;
    final generated = _uuidV4();
    options.headers['X-Request-ID'] = generated;
    return generated;
  }

  String _platformLabel() {
    if (kIsWeb) return 'flutter';
    try {
      if (Platform.isIOS) return 'ios';
      if (Platform.isAndroid) return 'android';
    } catch (_) {
      // Platform 사용 불가 환경 (테스트 등)
    }
    return 'flutter';
  }

  LifecycleContext _buildResponseContext(
    RequestOptions options,
    Response<dynamic>? response,
  ) {
    final requestId =
        (options.extra['_lifecycleRequestId'] as String?) ?? _uuidV4();
    final startAt = (options.extra['_lifecycleStartAt'] as int?) ??
        DateTime.now().millisecondsSinceEpoch;
    final durationMs = DateTime.now().millisecondsSinceEpoch - startAt;

    final serverTimeHeader = response?.headers.value('x-server-time');
    return LifecycleContext(
      requestId: requestId,
      method: options.method,
      path: options.path,
      startAt: startAt,
      platform: _platformLabel(),
      clientVersion: clientVersion,
      status: response?.statusCode,
      durationMs: durationMs,
      serverTime: serverTimeHeader,
    );
  }

  String? _extractMessage(DioException err) {
    final data = err.response?.data;
    if (data is Map && data['message'] is String) {
      return data['message'] as String;
    }
    return err.message;
  }

  String? _extractCode(DioException err) {
    final data = err.response?.data;
    if (data is Map) {
      final c = data['code'] ?? data['errorCode'];
      if (c is String) return c;
    }
    return null;
  }

  static String _uuidV4() {
    final r = Random.secure();
    final bytes = List<int>.generate(16, (_) => r.nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
    String hex(int n) => n.toRadixString(16).padLeft(2, '0');
    final s = bytes.map(hex).join();
    return '${s.substring(0, 8)}-${s.substring(8, 12)}-${s.substring(12, 16)}-${s.substring(16, 20)}-${s.substring(20)}';
  }
}

/// Lifecycle 요청/응답 컨텍스트 (응답 시 status/duration/serverTime 채워짐)
class LifecycleContext {
  LifecycleContext({
    required this.requestId,
    required this.method,
    required this.path,
    required this.startAt,
    required this.platform,
    required this.clientVersion,
    this.status,
    this.durationMs = 0,
    this.serverTime,
  });

  final String requestId;
  final String method;
  final String path;
  final int startAt;
  final String platform;
  final String clientVersion;
  final int? status;
  final int durationMs;
  final String? serverTime;
}

class LifecycleErrorContext extends LifecycleContext {
  LifecycleErrorContext({
    required super.requestId,
    required super.method,
    required super.path,
    required super.startAt,
    required super.platform,
    required super.clientVersion,
    super.status,
    super.durationMs,
    super.serverTime,
    required this.error,
    this.message,
    this.code,
  });

  final Object error;
  final String? message;
  final String? code;
}

typedef LifecycleBeforeCallback = void Function(LifecycleContext ctx);
typedef LifecycleAfterCallback = void Function(LifecycleContext ctx);
typedef LifecycleErrorCallback = void Function(LifecycleErrorContext ctx);

/// 앱 전역에서 lifecycle 훅을 등록/해제하기 위한 레지스트리.
/// [ApiClient]가 자체 인스턴스를 보유하고, 외부(riverpod provider 등)에서 subscribe.
class ApiLifecycleHooks {
  final List<LifecycleBeforeCallback> _before = <LifecycleBeforeCallback>[];
  final List<LifecycleAfterCallback> _after = <LifecycleAfterCallback>[];
  final List<LifecycleErrorCallback> _error = <LifecycleErrorCallback>[];

  VoidCallback subscribeBefore(LifecycleBeforeCallback cb) {
    _before.add(cb);
    return () => _before.remove(cb);
  }

  VoidCallback subscribeAfter(LifecycleAfterCallback cb) {
    _after.add(cb);
    return () => _after.remove(cb);
  }

  VoidCallback subscribeError(LifecycleErrorCallback cb) {
    _error.add(cb);
    return () => _error.remove(cb);
  }

  void _fireBefore(LifecycleContext ctx) {
    for (final cb in List<LifecycleBeforeCallback>.from(_before)) {
      try {
        cb(ctx);
      } catch (e) {
        if (kDebugMode) debugPrint('[API Lifecycle] before hook failed: $e');
      }
    }
  }

  void _fireAfter(LifecycleContext ctx) {
    for (final cb in List<LifecycleAfterCallback>.from(_after)) {
      try {
        cb(ctx);
      } catch (e) {
        if (kDebugMode) debugPrint('[API Lifecycle] after hook failed: $e');
      }
    }
  }

  void _fireError(LifecycleErrorContext ctx) {
    for (final cb in List<LifecycleErrorCallback>.from(_error)) {
      try {
        cb(ctx);
      } catch (e) {
        if (kDebugMode) debugPrint('[API Lifecycle] error hook failed: $e');
      }
    }
  }
}
