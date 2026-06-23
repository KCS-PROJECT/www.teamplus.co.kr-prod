import 'dart:async';
import 'dart:convert';
import 'dart:io' show Platform;
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show SystemNavigator;
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:go_router/go_router.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../main.dart' show navigatorKey, removeNativeSplashOnce;
import '../logging/app_logger.dart';
import '../constants/app_environment.dart';
import '../auth/token_storage.dart';
import '../network/api_client.dart';
import '../network/api_error.dart';
import '../security/biometric_service.dart';
import '../payment/kg_inicis_service.dart';
import '../notification/push_notification_service.dart';
import '../logging/bridge_logger.dart';
import '../../features/qr/qr_scanner_service.dart';
import 'js_bridge.dart';
import 'tbot_channel.dart';
import 'upload_handler.dart';
part 'webview_bridge_models.dart';
part 'webview_bridge_handlers.dart';

/// WebView JavaScript Bridge
/// Native (Flutter) ↔ Web (JavaScript) 양방향 통신
class WebViewBridge {
  /// 현재 활성 WebViewBridge 인스턴스.
  ///
  /// 2026-05-20 — Phase 5.1 (파일업로드 풀스택 개선):
  ///   업로드 핸들러처럼 WebViewController 컨텍스트 없이 외부에서 push 이벤트를
  ///   전파해야 하는 모듈을 위한 글로벌 접근점. WebViewScreen 이 단일 WebView 셸을
  ///   소유한다는 전제 하에 마지막 생성된 인스턴스를 보관한다.
  ///   dispose 시 자동으로 null 처리.
  static WebViewBridge? _instance;
  static WebViewBridge? get instance => _instance;

  final InAppWebViewController webViewController;
  final TokenStorage _tokenStorage = TokenStorage();
  final QrScannerService _qrScanner = QrScannerService();
  final BridgeCallbackManager _callbackManager = BridgeCallbackManager();
  final ApiClient _apiClient = ApiClient();
  final BiometricService _biometricService = BiometricService();
  final KGInicisService _paymentService = KGInicisService();
  final PushNotificationService _notificationService =
      PushNotificationService();
  final UploadHandler _uploadHandler = UploadHandler();

  /// 진행 중인 API 요청 관리 (requestId -> CancelToken)
  final Map<String, CancelToken> _pendingRequests = {};

  /// [2026-05-13 Phase C-5] 비동기 API 응답 직렬 처리 큐.
  /// 동시에 여러 async API 가 완료되어 sendMessageToWeb 가 병렬 호출되면
  /// evaluateJavascript 결과 도착 순서가 뒤바뀌어 클라이언트가 잘못된 매핑을
  /// 받을 수 있다. 본 큐는 enqueue 순서대로 1회씩 await 하여 순서를 보장한다.
  final List<Future<void> Function()> _apiResponseQueue = [];
  bool _apiResponseQueueDraining = false;

  /// API 응답 큐에 enqueue 후 worker 가 직렬로 evaluateJavascript 호출.
  Future<void> _enqueueApiResponse(BridgeMessage message) async {
    final completer = Completer<void>();
    _apiResponseQueue.add(() async {
      try {
        await sendMessageToWeb(message);
      } finally {
        if (!completer.isCompleted) completer.complete();
      }
    });
    if (!_apiResponseQueueDraining) {
      _apiResponseQueueDraining = true;
      // 비동기 worker — 다음 frame 부터 1개씩 처리.
      Future<void>(() async {
        while (_apiResponseQueue.isNotEmpty) {
          final job = _apiResponseQueue.removeAt(0);
          await job();
        }
        _apiResponseQueueDraining = false;
      });
    }
    return completer.future;
  }

  /// [2026-05-14] `deviceMetricsChanged` push dedup signature.
  /// `didChangeMetrics()` 는 부팅 단계에서 뷰포트 측정·safe-area 계산·플랫폼 뷰 마운트
  /// 등으로 한 프레임에 수십 회 호출될 수 있다. 같은 metrics 데이터로 Web 에 push 하면
  /// CSS 변수 재주입이 반복되고 브릿지 로그가 폭주하므로, 마지막 전송 signature 와
  /// 동일하면 송신을 skip 한다. 회전/키보드/접힘 등 실제 변화만 통과.
  String? _lastDeviceMetricsSignature;

  /// `_security.nonce` 중복 차단 캐시. 5분 내 동일 nonce 재사용을 리플레이로 간주.
  /// 2026-04-22 (SPEC_NATIVE_BRIDGE_REFACTOR · P0-NB-002):
  /// Web 이 `_security.timestamp` · `_security.nonce` 를 부착해 전송하지만 Dart 가
  /// 읽지 않던 허위 안전감 문제를 실제 enforcement 로 전환.
  /// 메모리 크기 제한: 1,000 엔트리 (5분 만료 자동 청소).
  final Map<String, DateTime> _seenNonces = {};
  static const int _nonceCacheMaxSize = 1000;
  static const Duration _nonceMaxAge = Duration(minutes: 5);

  /// `_security.timestamp` · `_security.nonce` 를 검증한다.
  /// - timestamp: 현재 시각 ± 5분 이내 (시계 skew + 요청 지연 허용)
  /// - nonce: 메모리 캐시에 없는 최초 값 (리플레이 방지)
  ///
  /// 반환: null = 검증 통과 · String = 실패 사유 (영문 코드)
  String? _verifySecurity(Map<String, dynamic>? security) {
    if (security == null) {
      // 보안 메타데이터 미부착 요청 — 개발 환경 호환을 위해 허용. 운영 배포 시
      // SECURITY_ENFORCED 플래그로 이 경로를 차단하도록 확장 가능.
      return null;
    }

    final timestamp = security['timestamp'];
    final nonce = security['nonce'] as String?;

    // timestamp 검증 (epoch ms 또는 ISO 8601 모두 허용)
    if (timestamp != null) {
      DateTime? requestTime;
      if (timestamp is int) {
        requestTime = DateTime.fromMillisecondsSinceEpoch(timestamp);
      } else if (timestamp is String) {
        requestTime = DateTime.tryParse(timestamp);
      }
      if (requestTime == null) {
        return 'INVALID_TIMESTAMP';
      }
      final diff = DateTime.now().difference(requestTime).abs();
      if (diff > _nonceMaxAge) {
        return 'TIMESTAMP_EXPIRED';
      }
    }

    // nonce 중복 차단
    if (nonce != null && nonce.isNotEmpty) {
      // 만료된 nonce 청소 (1,000 초과 또는 주기적)
      if (_seenNonces.length > _nonceCacheMaxSize) {
        final now = DateTime.now();
        _seenNonces
            .removeWhere((_, seen) => now.difference(seen) > _nonceMaxAge);
      }
      if (_seenNonces.containsKey(nonce)) {
        return 'REPLAY_DETECTED';
      }
      _seenNonces[nonce] = DateTime.now();
    }

    return null;
  }

  /// [2026-06-15 SECURITY] origin 검증 대상 핸들러 — 토큰/결제/API/본인인증/네이티브
  /// 제어 등 민감 기능. log/ui/theme 는 origin 무관 chrome·로깅이라 제외(fail-open).
  static const Set<String> _originGatedHandlers = {
    'auth',
    'payment',
    'api',
    'identityVerification',
    'notification',
    'biometric',
    'qrScan',
    'upload',
    'navigation',
    'cancelRequest',
  };

  /// 신뢰 호스트 집합 — 현재 환경의 웹앱 호스트(prod teamplusweb.icetimes.co.kr /
  /// dev·local IP / tbot)에서 자동 도출. 결제(KG이니시스)·본인인증(PortOne/NICE)은
  /// 각자 별도 WebView 라 main 브릿지 신뢰 목록에 포함하지 않는다.
  Set<String> _trustedHosts() {
    final hosts = <String>{};
    void add(String url) {
      try {
        final h = Uri.parse(url).host;
        if (h.isNotEmpty) hosts.add(h.toLowerCase());
      } catch (_) {}
    }
    add(appEnv.webAppUrl);
    return hosts;
  }

  /// 호출 origin 검증. 반환: null = 통과 · String = 차단 사유.
  /// getUrl 실패 / 빈 호스트(about:blank·최초 로드 전)는 fail-open — 컨트롤러
  /// 일시 오류로 앱이 멈추지 않도록 가용성 우선(MEDIUM 심각도 트레이드오프).
  Future<String?> _verifyOrigin() async {
    WebUri? url;
    try {
      url = await webViewController.getUrl();
    } catch (_) {
      return null;
    }
    final host = url?.host.toLowerCase();
    if (host == null || host.isEmpty) return null;
    return _trustedHosts().contains(host) ? null : 'ORIGIN_NOT_ALLOWED:$host';
  }

  /// UI 변경 콜백 (WebViewScreen에서 설정)
  UIConfigCallback? onUIConfigChange;

  /// 테마 변경 콜백 (Web → Native 테마 동기화)
  /// - Web에서 테마 변경 시 Flutter의 ThemeMode를 업데이트합니다.
  void Function(ThemeMode themeMode)? onThemeChange;

  /// 네비게이션 요청 콜백 (WebViewScreen 등 상위에서 설정)
  /// - Web에서 `FlutterBridge.navigation.navigate(route, params)` 호출 시 트리거됩니다.
  NavigationRequestCallback? onNavigationRequest;

  /// QR 스캐너 화면 실행 콜백 (WebViewScreen 등 상위에서 설정)
  /// - Web에서 `FlutterBridge.qr.scan()` 호출 시 네이티브 카메라 QR 스캐너 화면을 열고
  ///   스캔된 UUID 문자열을 반환한다. 사용자 취소/실패 시 null.
  /// - 구현: `context.push<String>('/qr-scanner')` await → pop 결과 반환
  Future<String?> Function()? onQrScanRequest;

  /// Android 하드웨어 백키 가로채기 요청 콜백 (WebViewScreen → MainShellScreen 으로 전파).
  /// - Web 이 `navigation.setHardwareBackEnabled(true/false)` 호출 시 트리거된다.
  /// - MainShellScreen 은 이 값을 기반으로 PopScope 백키 발생 시 Web 위임 여부 결정.
  /// (2026-05-16 백키 통합 처리)
  void Function(bool enabled)? onHardwareBackEnabledChange;

  /// Web 이 하드웨어 백키 이벤트를 정상 수신했음을 알리는 ACK 콜백.
  /// - MainShellScreen 의 1.5초 timeout fallback timer 즉시 취소용.
  /// (2026-05-16 백키 통합 처리)
  void Function()? onBackReceived;

  WebViewBridge(this.webViewController) {
    // 글로벌 instance 등록 — 업로드 핸들러 등 컨트롤러 컨텍스트 없는 곳에서 사용.
    _instance = this;
  }

  /// JavaScript 핸들러 등록
  void registerHandlers() {
    // 인증 토큰 요청
    webViewController.addJavaScriptHandler(
      handlerName: 'auth',
      callback: (args) async {
        return await _handleWithLogging('auth', args, _handleAuthRequest);
      },
    );

    // QR 스캔 요청
    webViewController.addJavaScriptHandler(
      handlerName: 'qrScan',
      callback: (args) async {
        return await _handleWithLogging('qrScan', args, _handleQrScanRequest);
      },
    );

    // 결제 요청
    webViewController.addJavaScriptHandler(
      handlerName: 'payment',
      callback: (args) async {
        return await _handleWithLogging('payment', args, _handlePaymentRequest);
      },
    );

    // 생체인증 요청
    webViewController.addJavaScriptHandler(
      handlerName: 'biometric',
      callback: (args) async {
        return await _handleWithLogging(
            'biometric', args, _handleBiometricRequest);
      },
    );

    // 알림 처리
    webViewController.addJavaScriptHandler(
      handlerName: 'notification',
      callback: (args) async {
        return await _handleWithLogging(
            'notification', args, _handleNotificationRequest);
      },
    );

    // 네비게이션 (딥링크)
    webViewController.addJavaScriptHandler(
      handlerName: 'navigation',
      callback: (args) async {
        return await _handleWithLogging(
            'navigation', args, _handleNavigationRequest);
      },
    );

    // 본인인증 요청
    webViewController.addJavaScriptHandler(
      handlerName: 'identityVerification',
      callback: (args) async {
        return await _handleWithLogging(
            'identityVerification', args, _handleIdentityVerificationRequest);
      },
    );

    // API 요청 (Web → Native → Backend)
    webViewController.addJavaScriptHandler(
      handlerName: 'api',
      callback: (args) async {
        return await _handleWithLogging('api', args, _handleApiRequest);
      },
    );

    // 요청 취소 핸들러
    webViewController.addJavaScriptHandler(
      handlerName: 'cancelRequest',
      callback: (args) async {
        return await _handleWithLogging(
            'cancelRequest', args, _handleCancelRequest);
      },
    );

    // UI 제어 핸들러 (상태바, AppBar, BottomNav)
    webViewController.addJavaScriptHandler(
      handlerName: 'ui',
      callback: (args) async {
        return await _handleWithLogging('ui', args, _handleUIRequest);
      },
    );

    // 테마 동기화 핸들러 (Web → Native)
    webViewController.addJavaScriptHandler(
      handlerName: 'theme',
      callback: (args) async {
        return await _handleWithLogging('theme', args, _handleThemeRequest);
      },
    );

    // 📤 업로드 핸들러 (카메라·갤러리·로컬 CRUD·백엔드 업로드)
    webViewController.addJavaScriptHandler(
      handlerName: 'upload',
      callback: (args) async {
        return await _handleWithLogging(
          'upload',
          args,
          _uploadHandler.handle,
        );
      },
    );

    // 📝 v8.6 (2026-05-20) — WebView 콘솔 로그 → AppLogger 통합
    //    Web 측에서 window.flutter_inappwebview.callHandler('log', {level, message, category, ctx})
    //    호출 시 AppLogger를 통해 디바이스 파일 + 백엔드 forward로 흘러감.
    webViewController.addJavaScriptHandler(
      handlerName: 'log',
      callback: (args) async {
        try {
          final raw = args.isNotEmpty ? args.first : null;
          if (raw is! Map) {
            return {'success': false, 'error': 'INVALID_PAYLOAD'};
          }
          final level = (raw['level'] ?? 'info').toString().toLowerCase();
          final message = (raw['message'] ?? '').toString();
          final category = raw['category']?.toString();
          final isError = raw['isError'] == true || level == 'error' || level == 'fatal';
          final ctx = <String, dynamic>{
            'source': 'webview',
            if (raw['url'] != null) 'url': raw['url'],
            if (raw['userId'] != null) 'userId': raw['userId'],
            if (raw['requestId'] != null) 'requestId': raw['requestId'],
            if (raw['status'] != null) 'status': raw['status'],
            if (raw['meta'] != null) 'meta': raw['meta'],
          };

          if (isError) {
            AppLogger.instance.error(
              message,
              context: ctx,
            );
          } else {
            // 카테고리 명시 시 해당 메서드, 아니면 activity로
            switch (category) {
              case 'access':
                AppLogger.instance.access(message, context: ctx);
                break;
              case 'auth':
                AppLogger.instance.authLog(message, context: ctx);
                break;
              case 'payment':
                AppLogger.instance.payment(message, context: ctx);
                break;
              case 'system':
                AppLogger.instance.system(message, context: ctx);
                break;
              default:
                AppLogger.instance.activity(message, context: ctx);
            }
          }
          return {'success': true};
        } catch (e) {
          return {'success': false, 'error': e.toString()};
        }
      },
    );

    // 🤖 PlayUp T Bot native channel — TBOT_ENABLED=true dart-define 일 때만 활성
    //    tbot/TEST_DRIVEN.md §5.0.6 / §6.3.4 참조. 프로덕션 영향 없음 (기본 no-op).
    TbotChannel.registerIfEnabled(webViewController);
  }

  /// 로깅을 포함한 핸들러 래퍼
  Future<Map<String, dynamic>> _handleWithLogging(
    String handlerName,
    List<dynamic> args,
    Future<Map<String, dynamic>> Function(List<dynamic>) handler,
  ) async {
    final stopwatch = Stopwatch()..start();

    // 요청 로깅
    String? action;
    Map<String, dynamic>? requestData;

    if (args.isNotEmpty) {
      if (args[0] is String) {
        action = args[0] as String;
        if (args.length > 1 && args[1] is Map) {
          requestData = Map<String, dynamic>.from(args[1] as Map);
        }
      } else if (args[0] is Map) {
        requestData = Map<String, dynamic>.from(args[0] as Map);
        action = requestData['action'] as String?;
      }
    }

    bridgeLogger.logWebToNative(
      handlerName: handlerName,
      action: action,
      data: requestData,
    );

    // [2026-06-15 SECURITY] 호출 origin 검증 — 신뢰 호스트(현재 환경 웹앱) 외의
    // 컨텐츠/iframe/리다이렉트가 민감 핸들러(auth/payment/api 등)를 호출해 토큰
    // 탈취·사용자 사칭하는 것을 차단. 결제/본인인증은 별도 WebView 라 영향 없음.
    if (_originGatedHandlers.contains(handlerName)) {
      final originErr = await _verifyOrigin();
      if (originErr != null) {
        bridgeLogger.logWebToNativeResponse(
          handlerName: handlerName,
          action: action,
          response: '{"success":false,"error":"ORIGIN_NOT_ALLOWED"}',
          isError: true,
          errorMessage: originErr,
          duration: stopwatch.elapsed,
        );
        AppLogger.instance.error(
          'Bridge call from untrusted origin blocked',
          context: {'handler': handlerName, 'reason': originErr},
        );
        return {'success': false, 'error': 'ORIGIN_NOT_ALLOWED'};
      }
    }

    try {
      final result = await handler(args);
      stopwatch.stop();

      // 응답 로깅
      final isError = result['success'] == false;
      bridgeLogger.logWebToNativeResponse(
        handlerName: handlerName,
        action: action,
        response: result.toString(),
        isError: isError,
        errorMessage: isError ? result['error']?.toString() : null,
        duration: stopwatch.elapsed,
      );

      return result;
    } catch (e) {
      stopwatch.stop();

      // 에러 로깅
      bridgeLogger.logWebToNativeResponse(
        handlerName: handlerName,
        action: action,
        isError: true,
        errorMessage: e.toString(),
        duration: stopwatch.elapsed,
      );

      rethrow;
    }
  }

  /// 요청 취소 처리
  Future<Map<String, dynamic>> _handleCancelRequest(List<dynamic> args) =>
      _handleCancelRequestImpl(args);

  /// 특정 요청 취소
  bool cancelRequest(String requestId) {
    final cancelToken = _pendingRequests[requestId];
    if (cancelToken != null && !cancelToken.isCancelled) {
      cancelToken.cancel('요청이 취소되었습니다.');
      _pendingRequests.remove(requestId);
      return true;
    }
    return false;
  }

  /// 모든 대기 중인 요청 취소
  void cancelAllRequests() {
    for (final entry in _pendingRequests.entries) {
      if (!entry.value.isCancelled) {
        entry.value.cancel('모든 요청이 취소되었습니다.');
      }
    }
    _pendingRequests.clear();
  }

  /// 인증 요청 처리
  Future<Map<String, dynamic>> _handleAuthRequest(List<dynamic> args) =>
      _handleAuthRequestImpl(args);

  /// 로그인 화면으로 이동.
  ///
  /// [2026-05-19] 네이티브 LoginScreen 폐기 → WebView /login/ 단일 SoT.
  ///   `/webview` 로 보내면 `InitialDestinationGate` 가 token 부재를 감지하여
  ///   자동으로 Next.js `/login/` URL 을 WebView 에 로드한다. returnPath 는
  ///   WebView(Next.js) 측에서 자체 처리하므로 네이티브 query 부착은 생략.
  void _navigateToLoginScreen(String? returnPath) {
    final ctx = navigatorKey.currentContext;
    if (ctx == null) return;
    try {
      ctx.go('/webview');
    } catch (_) {
      // GoRouter 가 아직 준비되지 않은 경우 Navigator fallback
      Navigator.of(ctx).pushNamedAndRemoveUntil('/webview', (_) => false);
    }
  }

  /// 인증 가드 스낵바 표시
  void _showAuthGuardSnackBar(String message) {
    final ctx = navigatorKey.currentContext;
    if (ctx == null) return;
    final messenger = ScaffoldMessenger.maybeOf(ctx);
    if (messenger == null) return;
    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(SnackBar(content: Text(message)));
  }

  /// QR 스캔 요청 처리
  Future<Map<String, dynamic>> _handleQrScanRequest(List<dynamic> args) =>
      _handleQrScanRequestImpl(args);

  /// 결제 요청 처리
  Future<Map<String, dynamic>> _handlePaymentRequest(List<dynamic> args) =>
      _handlePaymentRequestImpl(args);

  /// 생체인증 요청 처리
  Future<Map<String, dynamic>> _handleBiometricRequest(List<dynamic> args) =>
      _handleBiometricRequestImpl(args);

  /// 생체인증 가능 여부 확인
  Future<Map<String, dynamic>> _handleBiometricAvailabilityCheck() => _handleBiometricAvailabilityCheckImpl();

  /// 생체인증 실행
  Future<Map<String, dynamic>> _handleBiometricAuthenticate(String reason) =>
      _handleBiometricAuthenticateImpl(reason);

  /// 사용 가능한 생체인증 목록 조회
  Future<Map<String, dynamic>> _handleGetAvailableBiometrics() => _handleGetAvailableBiometricsImpl();

  /// 생체인증 상태 정보 조회 (디버그용)
  Future<Map<String, dynamic>> _handleBiometricStatus() => _handleBiometricStatusImpl();

  /// 알림 요청 처리
  Future<Map<String, dynamic>> _handleNotificationRequest(List<dynamic> args) =>
      _handleNotificationRequestImpl(args);

  /// 네비게이션 요청 처리 (딥링크 + 하드웨어 백키 제어 + 앱 종료)
  ///
  /// 2026-05-16: action 디스패치 분기 추가 (백키 통합 처리)
  ///   - `setHardwareBackEnabled` : Web 이 하드웨어 백 가로채기 등록/해제
  ///   - `backReceived` : Web 이 백키 이벤트 정상 수신 ACK (fallback timer cancel용)
  ///   - `exitApp` : 앱 완전 종료 (Android only, iOS 정책상 silent no-op)
  ///   - `navigate` (default) : 기존 라우팅 요청 (역호환)
  Future<Map<String, dynamic>> _handleNavigationRequest(List<dynamic> args) =>
      _handleNavigationRequestImpl(args);

  /// Native → Web: 메시지 전송
  Future<void> sendMessageToWeb(BridgeMessage message) async {
    // 전송 전 로깅
    bridgeLogger.logNativeToWeb(
      messageType: message.type.name,
      action: message.data['action'] as String?,
      data: message.data,
    );

    try {
      final messageJson = message.toJsonString();
      // JSON 문자열을 JavaScript 리터럴로 안전 인코딩.
      // jsonEncode가 따옴표/백슬래시/개행(\n,\r)/제어문자/
      // U+2028/U+2029까지 모두 이스케이프하여 `Unterminated string`
      // · `Expected '}'` 파싱 오류를 근본 차단한다.
      final jsLiteral = jsonEncode(messageJson);

      await webViewController.evaluateJavascript(
        source: """
          if (window.flutterBridge && window.flutterBridge.onMessage) {
            window.flutterBridge.onMessage($jsLiteral);
          }
        """,
      );

      // 전송 성공 로깅
      bridgeLogger.logNativeToWebConfirm(
        messageType: message.type.name,
        action: message.data['action'] as String?,
      );
    } catch (e) {
      // 전송 실패 로깅
      bridgeLogger.logNativeToWebConfirm(
        messageType: message.type.name,
        action: message.data['action'] as String?,
        isError: true,
        errorMessage: e.toString(),
      );
      debugPrint('Web으로 메시지 전송 실패: $e');
    }
  }

  /// 인증 토큰을 Web으로 전송
  ///
  /// ⚡ Cold Start 최적화: readAuthBundle() 캐시(30s TTL) 경로 재사용.
  /// Splash → WebView 전환 시 이미 캐시된 bundle 을 즉시 읽어 추가 I/O 없음.
  /// bundle 에 포함되지 않는 refreshToken 만 별도 조회하며, 레코드 `.wait` 로
  /// 완전 병렬화. 직렬 I/O 없음.
  Future<void> sendAuthTokenToWeb() async {
    try {
      // bundle + refreshToken 완전 병렬 획득 (userId는 bundle에 이미 포함)
      final (bundle, refreshToken) = await (
        _tokenStorage.readAuthBundle(),
        _tokenStorage.getRefreshToken(),
      ).wait;

      final message = BridgeMessage(
        type: BridgeMessageType.auth,
        data: {
          'action': 'tokenUpdate',
          'tokenInfo': {
            'accessToken': bundle.accessToken,
            'refreshToken': refreshToken,
            'userId': bundle.userId,
            'userType': bundle.userType,
            'userName': bundle.userName,
            'userEmail': bundle.userEmail,
          },
        },
      );

      await sendMessageToWeb(message);
    } catch (e) {
      debugPrint('토큰 전송 실패: $e');
    }
  }

  /// QR 스캔 결과를 Web으로 전송
  Future<void> sendQrResultToWeb(QrScanResult result) async {
    try {
      final message = BridgeMessage(
        type: BridgeMessageType.qrScan,
        data: {
          'action': 'scanResult',
          'result': result.toJson(),
        },
      );

      await sendMessageToWeb(message);
    } catch (e) {
      debugPrint('QR 결과 전송 실패: $e');
    }
  }

  /// 결제 결과를 Web으로 전송
  Future<void> sendPaymentResultToWeb({
    required bool success,
    String? transactionId,
    String? orderNumber,
    String? errorMessage,
  }) async {
    try {
      final message = BridgeMessage(
        type: BridgeMessageType.payment,
        data: {
          'action': 'paymentResult',
          'success': success,
          'transactionId': transactionId,
          'orderNumber': orderNumber,
          'errorMessage': errorMessage,
        },
      );

      await sendMessageToWeb(message);
    } catch (e) {
      debugPrint('결제 결과 전송 실패: $e');
    }
  }

  /// 생체인증 결과를 Web으로 전송
  Future<void> sendBiometricResultToWeb({
    required bool authenticated,
    String? message,
    String? errorMessage,
  }) async {
    try {
      final messageObj = BridgeMessage(
        type: BridgeMessageType.biometric,
        data: {
          'action': 'authenticationResult',
          'authenticated': authenticated,
          'message': message,
          'errorMessage': errorMessage,
        },
      );

      await sendMessageToWeb(messageObj);
    } catch (e) {
      debugPrint('[Biometric Bridge] 생체인증 결과 전송 실패: $e');
    }
  }

  /// 푸시 알림을 Web으로 전송
  Future<void> sendNotificationToWeb(Map<String, dynamic> notification) async {
    try {
      final message = BridgeMessage(
        type: BridgeMessageType.notification,
        data: {
          'action': 'notificationReceived',
          'notification': notification,
        },
      );

      await sendMessageToWeb(message);
    } catch (e) {
      debugPrint('알림 전송 실패: $e');
    }
  }

  /// 딥링크를 Web으로 전송
  Future<void> sendDeepLinkToWeb(String deepLink) async {
    try {
      final message = BridgeMessage(
        type: BridgeMessageType.navigation,
        data: {
          'action': 'deepLink',
          'url': deepLink,
        },
      );

      await sendMessageToWeb(message);
    } catch (e) {
      debugPrint('딥링크 전송 실패: $e');
    }
  }

  /// 파일 업로드 이벤트를 Web 으로 push (2026-05-20 Phase 5.1).
  ///
  /// Native 측에서 파일 업로드가 성공하거나 삭제/수정될 때 Web 의
  /// `window.teamplusNotify({ type:'file:created' | 'file:updated' | 'file:deleted', ... })`
  /// 를 호출하여 `useFileUploadSync` 훅이 부모 컴포넌트의 데이터를 refetch 하도록 한다.
  ///
  /// - [type]: `file:created` · `file:updated` · `file:deleted`
  /// - [refType] · [refId]: useFileUploadSync 가 구독 중인 키 (예: notice / abc123)
  /// - [file]: `FileResponseDto` 형태 (RemoteUploadedFile.toJson() 결과)
  /// - [uploaderId]: 업로드 주체 사용자 ID (자기 이벤트 필터링용)
  ///
  /// `window.teamplusNotify` 가 정의되지 않은 페이지(예: WebView 초기 로딩 직후) 에서는
  /// no-op 으로 안전 동작. SLA 영향 없음.
  Future<void> sendUploadEventToWeb({
    required String type,
    required String refType,
    required String refId,
    required Map<String, dynamic> file,
    required String uploaderId,
  }) async {
    final payload = {
      'type': type,
      'refType': refType,
      'refId': refId,
      'files': [file],
      'uploaderId': uploaderId,
      'ts': DateTime.now().millisecondsSinceEpoch,
    };

    // 요청 로깅
    bridgeLogger.logNativeToWeb(
      messageType: 'upload',
      action: type,
      data: payload,
    );

    try {
      // jsonEncode 로 따옴표/제어문자/유니코드 라인 종결자 안전 이스케이프.
      final payloadLiteral = jsonEncode(payload);
      await webViewController.evaluateJavascript(
        source: '''
          if (typeof window !== 'undefined' && typeof window.teamplusNotify === 'function') {
            try { window.teamplusNotify($payloadLiteral); }
            catch (e) { console.error('[Bridge] teamplusNotify 처리 실패:', e); }
          }
        ''',
      );

      bridgeLogger.logNativeToWebConfirm(
        messageType: 'upload',
        action: type,
      );
    } catch (e) {
      bridgeLogger.logNativeToWebConfirm(
        messageType: 'upload',
        action: type,
        isError: true,
        errorMessage: e.toString(),
      );
      debugPrint('[Bridge] 파일 업로드 이벤트 전송 실패: $e');
    }
  }

  /// Android 하드웨어 백키 이벤트를 Web으로 push (2026-05-16 백키 통합 처리).
  ///
  /// Web 의 `navigation.onHardwareBack` 리스너가 본 메시지를 수신하여
  /// SPA 라우팅(router.back / 종료 confirm / 역할 홈 replace) 결정을 수행한다.
  /// Web 은 수신 즉시 `action: 'backReceived'` ACK 를 발송해 fallback timer 를 취소한다.
  ///
  /// 동일 push 패턴: `sendDeepLinkToWeb`, `sendDeviceMetricsToWeb`.
  Future<void> sendHardwareBackToWeb() async {
    try {
      final message = BridgeMessage(
        type: BridgeMessageType.navigation,
        data: {'action': 'hardwareBackPressed'},
      );
      await sendMessageToWeb(message);
    } catch (e) {
      debugPrint('하드웨어 백키 전송 실패: $e');
    }
  }

  /// 본인인증 요청 처리
  Future<Map<String, dynamic>> _handleIdentityVerificationRequest(List<dynamic> args) =>
      _handleIdentityVerificationRequestImpl(args);

  /// 본인인증 결과를 Web으로 전송
  Future<void> sendIdentityVerificationResultToWeb({
    required bool success,
    required String requestId,
    String? provider,
    String? verifiedName,
    String? errorCode,
    String? errorMessage,
  }) async {
    try {
      final message = BridgeMessage(
        type: BridgeMessageType.identityVerification,
        data: {
          'action': 'verificationResult',
          'success': success,
          'requestId': requestId,
          'provider': provider,
          'verifiedName': verifiedName,
          'errorCode': errorCode,
          'errorMessage': errorMessage,
        },
      );

      await sendMessageToWeb(message);
    } catch (e) {
      debugPrint('본인인증 결과 전송 실패: $e');
    }
  }

  /// API 요청 처리 (동기/비동기 옵션 지원)
  Future<Map<String, dynamic>> _handleApiRequest(List<dynamic> args) =>
      _handleApiRequestImpl(args);

  /// 비동기 API 요청 처리 (결과를 Web으로 전송)
  void _processAsyncApiRequest(
    String requestId,
    String method,
    String endpoint,
    dynamic data,
    Map<String, dynamic>? queryParams,
  ) async {
    // CancelToken 생성 및 등록
    final cancelToken = CancelToken();
    _pendingRequests[requestId] = cancelToken;

    try {
      final response = await _executeApiRequest(
        method,
        endpoint,
        data,
        queryParams,
        cancelToken: cancelToken,
      );

      // 요청 완료 후 등록 해제
      _pendingRequests.remove(requestId);

      // 결과를 Web으로 전송 — 큐로 직렬화 (Phase C-5)
      final message = BridgeMessage(
        type: BridgeMessageType.api,
        data: {
          'action': 'apiResponse',
          'requestId': requestId,
          'success': true,
          'data': response,
        },
      );
      await _enqueueApiResponse(message);
    } on DioException catch (e) {
      // 요청 등록 해제
      _pendingRequests.remove(requestId);

      // 요청이 취소된 경우
      if (CancelToken.isCancel(e)) {
        final cancelError = ApiError.cancelled();
        final message = BridgeMessage(
          type: BridgeMessageType.api,
          data: {
            'action': 'apiResponse',
            'requestId': requestId,
            'success': false,
            'error': cancelError.toJson(),
          },
        );
        await _enqueueApiResponse(message);
        return;
      }

      // 기타 Dio 에러를 ApiError로 변환
      final apiError = ApiError.network(
        message: e.message ?? '네트워크 오류',
        originalError: e,
      );
      final message = BridgeMessage(
        type: BridgeMessageType.api,
        data: {
          'action': 'apiResponse',
          'requestId': requestId,
          'success': false,
          'error': apiError.toJson(),
        },
      );
      await _enqueueApiResponse(message);
    } on ApiError catch (e) {
      // 요청 등록 해제
      _pendingRequests.remove(requestId);

      // 표준화된 ApiError를 Web으로 전송
      final message = BridgeMessage(
        type: BridgeMessageType.api,
        data: {
          'action': 'apiResponse',
          'requestId': requestId,
          'success': false,
          'error': e.toJson(), // 표준 에러 구조 전송
        },
      );
      await _enqueueApiResponse(message);
    } catch (e) {
      // 요청 등록 해제
      _pendingRequests.remove(requestId);

      // 기타 에러를 ApiError로 변환 후 전송
      final apiError = ApiError.unknown(
        message: e.toString(),
        originalError: e,
      );
      final message = BridgeMessage(
        type: BridgeMessageType.api,
        data: {
          'action': 'apiResponse',
          'requestId': requestId,
          'success': false,
          'error': apiError.toJson(), // 표준 에러 구조 전송
        },
      );
      await _enqueueApiResponse(message);
    }
  }

  /// 실제 API 요청 실행
  Future<dynamic> _executeApiRequest(
    String method,
    String endpoint,
    dynamic data,
    Map<String, dynamic>? queryParams, {
    CancelToken? cancelToken,
  }) async {
    switch (method) {
      case 'GET':
        final response = await _apiClient.get(
          endpoint,
          queryParameters: queryParams,
          cancelToken: cancelToken,
        );
        return response.data;
      case 'POST':
        final response = await _apiClient.post(
          endpoint,
          data: data,
          queryParameters: queryParams,
          cancelToken: cancelToken,
        );
        return response.data;
      case 'PUT':
        final response = await _apiClient.put(
          endpoint,
          data: data,
          queryParameters: queryParams,
          cancelToken: cancelToken,
        );
        return response.data;
      case 'PATCH':
        final response = await _apiClient.patch(
          endpoint,
          data: data,
          queryParameters: queryParams,
          cancelToken: cancelToken,
        );
        return response.data;
      case 'DELETE':
        final response = await _apiClient.delete(
          endpoint,
          data: data,
          queryParameters: queryParams,
          cancelToken: cancelToken,
        );
        return response.data;
      default:
        throw Exception('지원하지 않는 HTTP 메서드: $method');
    }
  }

  /// UI 제어 요청 처리
  /// Web에서 화면별로 상태바, AppBar, BottomNav를 제어할 수 있습니다.
  Future<Map<String, dynamic>> _handleUIRequest(List<dynamic> args) =>
      _handleUIRequestImpl(args);

  /// UI 설정 변경을 Web으로 전송
  Future<void> sendUIConfigToWeb(UIConfig config) async {
    try {
      final message = BridgeMessage(
        type: BridgeMessageType.ui,
        data: {
          'action': 'configChanged',
          'config': config.toJson(),
        },
      );

      await sendMessageToWeb(message);
    } catch (e) {
      debugPrint('[UI Bridge] UI 설정 전송 실패: $e');
    }
  }

  /// AppBar 버튼 이벤트를 Web으로 전송
  /// [eventType]: 'back' | 'menu' | 'refresh'
  Future<void> sendAppBarEventToWeb(String eventType) async {
    try {
      debugPrint('[UI Bridge] AppBar 이벤트 전송: $eventType');

      final message = BridgeMessage(
        type: BridgeMessageType.ui,
        data: {
          'action': 'appBarEvent',
          'eventType': eventType,
        },
      );

      await sendMessageToWeb(message);
    } catch (e) {
      debugPrint('[UI Bridge] AppBar 이벤트 전송 실패: $e');
    }
  }

  /// 디바이스 metrics(해상도/safe-area/orientation) 변경을 Web 으로 push (2026-05-09 신규).
  ///
  /// `WidgetsBindingObserver.didChangeMetrics` 콜백에서 회전·키보드·접힘 등으로
  /// 화면 metrics 가 변경됐을 때 Web autolayout 시스템에 즉시 반영하기 위한 push API.
  ///
  /// Web 측은 `native-bridge.ts` 의 `subscribeToDeviceMetrics` 가 내부적으로 본 이벤트를
  /// listen 하여 `applyDeviceInsetsToCss` 를 재실행, CSS 변수
  /// (`--screen-width`, `--safe-area-inset-*`, `--device-orientation` 등)를 갱신합니다.
  ///
  /// Web 계약: `{ action: 'deviceMetricsChanged', info: DeviceInfo }`
  ///   (DeviceInfo 형식은 _handleUIRequest 의 getDeviceInfo 응답과 동일)
  Future<void> sendDeviceMetricsToWeb() async {
    try {
      final view = WidgetsBinding.instance.platformDispatcher.views.first;
      final dpr = view.devicePixelRatio;
      final physicalSize = view.physicalSize;
      final viewPadding = view.viewPadding;
      final viewInsets = view.viewInsets;

      final logicalWidth = physicalSize.width / dpr;
      final logicalHeight = physicalSize.height / dpr;
      final orientation =
          logicalWidth > logicalHeight ? 'landscape' : 'portrait';

      final safeTop = viewPadding.top / dpr;
      final safeBottom = viewPadding.bottom / dpr;
      final safeLeft = viewPadding.left / dpr;
      final safeRight = viewPadding.right / dpr;
      final insetTop = viewInsets.top / dpr;
      final insetBottom = viewInsets.bottom / dpr;
      final insetLeft = viewInsets.left / dpr;
      final insetRight = viewInsets.right / dpr;

      // [2026-05-14] dedup — 같은 metrics 데이터로 부트 단계 폭주(20+회) 방지.
      // signature 가 직전 push 와 동일하면 skip. 회전/키보드/접힘 등 실제 변화만 통과.
      final signature =
          '${logicalWidth.toStringAsFixed(1)}x${logicalHeight.toStringAsFixed(1)}'
          '|sa:${safeTop.toStringAsFixed(1)},${safeBottom.toStringAsFixed(1)},'
          '${safeLeft.toStringAsFixed(1)},${safeRight.toStringAsFixed(1)}'
          '|ki:${insetBottom.toStringAsFixed(1)}'
          '|dpr:${dpr.toStringAsFixed(2)}'
          '|o:$orientation';
      if (signature == _lastDeviceMetricsSignature) {
        return;
      }
      _lastDeviceMetricsSignature = signature;

      final info = {
        'screen': {'width': logicalWidth, 'height': logicalHeight},
        'physicalSize': {
          'width': physicalSize.width,
          'height': physicalSize.height,
        },
        'safeArea': {
          'top': safeTop,
          'bottom': safeBottom,
          'left': safeLeft,
          'right': safeRight,
        },
        'viewInsets': {
          'top': insetTop,
          'bottom': insetBottom,
          'left': insetLeft,
          'right': insetRight,
        },
        'devicePixelRatio': dpr,
        'platform': Platform.isIOS ? 'ios' : 'android',
        'orientation': orientation,
      };

      final message = BridgeMessage(
        type: BridgeMessageType.ui,
        data: {
          'action': 'deviceMetricsChanged',
          'info': info,
        },
      );
      await sendMessageToWeb(message);
    } catch (e) {
      debugPrint('[UI Bridge] deviceMetrics 전송 실패: $e');
    }
  }

  // ============================================
  // 테마 핸들러
  // ============================================

  /// Web에서 테마 변경 요청 처리
  Future<Map<String, dynamic>> _handleThemeRequest(List<dynamic> args) =>
      _handleThemeRequestImpl(args);

  /// Bridge 리소스 정리
  void dispose() {
    cancelAllRequests();
    _callbackManager.clear();
    onUIConfigChange = null;
    onThemeChange = null;
    onNavigationRequest = null;
    onHardwareBackEnabledChange = null;
    onBackReceived = null;
    // 글로벌 instance 가 본 객체를 가리키고 있을 때만 해제 (재진입 안전).
    if (identical(_instance, this)) {
      _instance = null;
    }
  }
}
