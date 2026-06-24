import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:url_launcher/url_launcher.dart';
import '../constants/app_environment.dart';
import '../network/api_client.dart';
import '../webview/js_bridge.dart';

/// KG이니시스 결제 결과
enum PaymentResultStatus {
  success,
  failed,
  cancelled,
  timeout,
}

/// KG이니시스 결제 결과 데이터
class KGInicisPaymentResult {
  final PaymentResultStatus status;
  final String? transactionId;
  final String? orderNumber;
  final int? amount;
  final String? errorCode;
  final String? errorMessage;
  final DateTime completedAt;

  KGInicisPaymentResult({
    required this.status,
    this.transactionId,
    this.orderNumber,
    this.amount,
    this.errorCode,
    this.errorMessage,
    DateTime? completedAt,
  }) : completedAt = completedAt ?? DateTime.now();

  bool get isSuccess => status == PaymentResultStatus.success;

  Map<String, dynamic> toJson() {
    return {
      'status': status.name,
      'transactionId': transactionId,
      'orderNumber': orderNumber,
      'amount': amount,
      'errorCode': errorCode,
      'errorMessage': errorMessage,
      'completedAt': completedAt.toIso8601String(),
    };
  }

  factory KGInicisPaymentResult.fromJson(Map<String, dynamic> json) {
    return KGInicisPaymentResult(
      status: PaymentResultStatus.values.firstWhere(
        (e) => e.name == json['status'],
        orElse: () => PaymentResultStatus.failed,
      ),
      transactionId: json['transactionId'] as String?,
      orderNumber: json['orderNumber'] as String?,
      amount: json['amount'] as int?,
      errorCode: json['errorCode'] as String?,
      errorMessage: json['errorMessage'] as String?,
      completedAt: json['completedAt'] != null
          ? DateTime.parse(json['completedAt'] as String)
          : null,
    );
  }

  factory KGInicisPaymentResult.success({
    required String transactionId,
    required String orderNumber,
    required int amount,
  }) {
    return KGInicisPaymentResult(
      status: PaymentResultStatus.success,
      transactionId: transactionId,
      orderNumber: orderNumber,
      amount: amount,
    );
  }

  factory KGInicisPaymentResult.failed({
    String? errorCode,
    String? errorMessage,
  }) {
    return KGInicisPaymentResult(
      status: PaymentResultStatus.failed,
      errorCode: errorCode,
      errorMessage: errorMessage ?? '결제 처리에 실패했습니다.',
    );
  }

  factory KGInicisPaymentResult.cancelled() {
    return KGInicisPaymentResult(
      status: PaymentResultStatus.cancelled,
      errorMessage: '결제가 취소되었습니다.',
    );
  }

  factory KGInicisPaymentResult.timeout() {
    return KGInicisPaymentResult(
      status: PaymentResultStatus.timeout,
      errorMessage: '결제 시간이 초과되었습니다.',
    );
  }
}

/// KG이니시스 결제 요청 데이터
class KGInicisPaymentRequest {
  final String orderNumber;
  final int amount;
  final String productName;
  final String buyerName;
  final String buyerPhone;
  final String buyerEmail;
  final String? productCode;
  final Map<String, String>? additionalParams;

  KGInicisPaymentRequest({
    required this.orderNumber,
    required this.amount,
    required this.productName,
    required this.buyerName,
    required this.buyerPhone,
    required this.buyerEmail,
    this.productCode,
    this.additionalParams,
  });

  Map<String, dynamic> toJson() {
    return {
      'orderNumber': orderNumber,
      'amount': amount,
      'productName': productName,
      'buyerName': buyerName,
      'buyerPhone': buyerPhone,
      'buyerEmail': buyerEmail,
      if (productCode != null) 'productCode': productCode,
      if (additionalParams != null) ...additionalParams!,
    };
  }
}

/// KG이니시스 결제 서비스
///
/// 모바일 앱에서 KG이니시스 결제를 처리합니다.
/// WebView 기반으로 결제 페이지를 표시하고 결과를 처리합니다.
class KGInicisService {
  static final KGInicisService _instance = KGInicisService._internal();

  factory KGInicisService() => _instance;

  KGInicisService._internal();

  // 환경별 MID (Merchant ID)
  static const String _merchantIdTest = 'INIpayTest';
  static const String _merchantIdProd = 'teamplus001'; // 실제 발급받은 MID로 교체

  // 프로덕션 환경 자동 감지
  static bool get _isTestMode => !kReleaseMode;

  String get _merchantId => _isTestMode ? _merchantIdTest : _merchantIdProd;

  /// 결제 시작
  ///
  /// WebView를 통해 KG이니시스 결제 페이지를 표시하고,
  /// 결제 완료/취소/실패 시 결과를 반환합니다.
  Future<KGInicisPaymentResult> initiatePayment({
    required BuildContext context,
    required KGInicisPaymentRequest request,
    Duration timeout = const Duration(minutes: 10),
  }) async {
    try {
      // 결제 WebView 화면으로 이동
      final result = await Navigator.of(context).push<KGInicisPaymentResult>(
        MaterialPageRoute(
          builder: (context) => _KGInicisPaymentWebView(
            request: request,
            merchantId: _merchantId,
            isTestMode: _isTestMode,
            timeout: timeout,
          ),
          fullscreenDialog: true,
        ),
      );

      return result ?? KGInicisPaymentResult.cancelled();
    } catch (e) {
      debugPrint('[KGInicis] 결제 시작 오류: $e');
      return KGInicisPaymentResult.failed(
        errorMessage: '결제를 시작할 수 없습니다: $e',
      );
    }
  }

  /// 결제 결과 검증 (서버 측 검증)
  ///
  /// 클라이언트에서 받은 결제 결과를 서버에서 검증합니다.
  Future<bool> verifyPayment({
    required String transactionId,
    required String orderNumber,
    required int amount,
  }) async {
    try {
      // [보안 2026-06-24] 결제 검증 요청을 앱 공용 네트워킹 레이어(ApiClient)로 라우팅.
      // raw Dio() 는 SSL Pinning·인터셉터를 우회하여 MITM 위험이 있으므로,
      // ApiClient(SslPinningService.createAdapter() 어댑터 + 인증/재시도 인터셉터)를 사용한다.
      // Authorization Bearer 토큰은 _AuthInterceptor 가 SecureStorage 에서 자동 첨부한다.
      final response = await ApiClient().post(
        '${appEnv.apiBaseUrl}/payments/verify',
        data: {
          'transactionId': transactionId,
          'orderNumber': orderNumber,
          'amount': amount,
        },
        options: Options(
          sendTimeout: const Duration(seconds: 15),
          receiveTimeout: const Duration(seconds: 15),
        ),
      );

      if (response.statusCode == 200) {
        final verified = response.data['data']?['verified'] as bool? ?? false;
        debugPrint('[KGInicis] 결제 검증 결과: $verified');
        return verified;
      }
      return false;
    } catch (e) {
      debugPrint('[KGInicis] 결제 검증 오류: $e');
      return false;
    }
  }

  /// 결제 취소 요청 (서버 측 처리)
  Future<bool> cancelPayment({
    required String transactionId,
    required String reason,
  }) async {
    try {
      // [보안 2026-06-24] 결제 취소 요청도 ApiClient 경유 — SSL Pinning + 인터셉터 적용.
      // Authorization Bearer 토큰은 _AuthInterceptor 가 SecureStorage 에서 자동 첨부한다.
      final response = await ApiClient().post(
        '${appEnv.apiBaseUrl}/payments/cancel',
        data: {
          'transactionId': transactionId,
          'reason': reason,
        },
        options: Options(
          sendTimeout: const Duration(seconds: 15),
          receiveTimeout: const Duration(seconds: 15),
        ),
      );

      if (response.statusCode == 200) {
        debugPrint('[KGInicis] 결제 취소 성공: $transactionId');
        return true;
      }
      return false;
    } catch (e) {
      debugPrint('[KGInicis] 결제 취소 오류: $e');
      return false;
    }
  }

  /// Bridge 응답 생성 (WebView Bridge에서 사용)
  Map<String, dynamic> createBridgeResponse({
    required KGInicisPaymentResult result,
  }) {
    return BridgeResponse.success(
      data: {
        'success': result.isSuccess,
        'transactionId': result.transactionId,
        'orderNumber': result.orderNumber,
        'amount': result.amount,
        'status': result.status.name,
        'errorCode': result.errorCode,
        'errorMessage': result.errorMessage,
      },
    ).toJson();
  }
}

/// KG이니시스 결제 WebView 화면
class _KGInicisPaymentWebView extends StatefulWidget {
  final KGInicisPaymentRequest request;
  final String merchantId;
  final bool isTestMode;
  final Duration timeout;

  const _KGInicisPaymentWebView({
    required this.request,
    required this.merchantId,
    required this.isTestMode,
    required this.timeout,
  });

  @override
  State<_KGInicisPaymentWebView> createState() =>
      _KGInicisPaymentWebViewState();
}

class _KGInicisPaymentWebViewState extends State<_KGInicisPaymentWebView> {
  InAppWebViewController? _webViewController;
  bool _isLoading = true;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    // 타임아웃 설정
    Future.delayed(widget.timeout, () {
      if (mounted && _webViewController != null) {
        Navigator.of(context).pop(KGInicisPaymentResult.timeout());
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('결제'),
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () {
            Navigator.of(context).pop(KGInicisPaymentResult.cancelled());
          },
        ),
      ),
      body: Stack(
        children: [
          InAppWebView(
            initialUrlRequest: URLRequest(
              url: WebUri(_buildPaymentUrl()),
            ),
            initialSettings: InAppWebViewSettings(
              javaScriptEnabled: true,
              useShouldOverrideUrlLoading: true,
              mediaPlaybackRequiresUserGesture: false,
              allowsInlineMediaPlayback: true,
              // [보안 2026-06-07] 결제 흐름 active mixed content 차단(MITM 스크립트 주입 방지).
              // PG 페이지 passive 리소스는 허용(COMPATIBILITY) → 결제 회귀 위험 최소화.
              mixedContentMode: MixedContentMode.MIXED_CONTENT_COMPATIBILITY_MODE,
              // iOS 키보드 액세서리 뷰 숨기기
              disableInputAccessoryView: true,
            ),
            onWebViewCreated: (controller) {
              _webViewController = controller;
              _registerPaymentHandlers(controller);
            },
            onLoadStart: (controller, url) {
              setState(() {
                _isLoading = true;
                _errorMessage = null;
              });
            },
            onLoadStop: (controller, url) {
              setState(() => _isLoading = false);
            },
            onReceivedError: (controller, request, error) {
              setState(() {
                _isLoading = false;
                _errorMessage = error.description;
              });
            },
            shouldOverrideUrlLoading: (controller, navigationAction) async {
              final url = navigationAction.request.url?.toString() ?? '';

              // 결제 완료/실패/취소 URL 처리
              if (url.contains('payment/success')) {
                _handlePaymentSuccess(url);
                return NavigationActionPolicy.CANCEL;
              } else if (url.contains('payment/fail')) {
                _handlePaymentFailed(url);
                return NavigationActionPolicy.CANCEL;
              } else if (url.contains('payment/cancel')) {
                _handlePaymentCancelled();
                return NavigationActionPolicy.CANCEL;
              }

              // 외부 앱 스키마 처리 (카카오페이, 토스 등)
              if (_isExternalAppScheme(url)) {
                await _openExternalApp(url);
                return NavigationActionPolicy.CANCEL;
              }

              return NavigationActionPolicy.ALLOW;
            },
          ),
          if (_isLoading)
            const Center(
              child: CircularProgressIndicator(),
            ),
          if (_errorMessage != null)
            Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.error_outline, size: 64, color: Colors.red),
                  const SizedBox(height: 16),
                  Text(_errorMessage!),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: () {
                      _webViewController?.reload();
                    },
                    child: const Text('다시 시도'),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  String _buildPaymentUrl() {
    // 백엔드에서 결제 페이지 URL 생성 (appEnv 기반 동적 URL)
    final params = widget.request.toJson();
    params['mid'] = widget.merchantId;
    params['isTest'] = widget.isTestMode;

    return '${appEnv.apiBaseUrl}/payments/inicis/request?${_encodeParams(params)}';
  }

  String _encodeParams(Map<String, dynamic> params) {
    return params.entries
        .map((e) =>
            '${Uri.encodeComponent(e.key)}=${Uri.encodeComponent(e.value.toString())}')
        .join('&');
  }

  void _registerPaymentHandlers(InAppWebViewController controller) {
    // JavaScript에서 결제 결과를 전달받기 위한 핸들러
    controller.addJavaScriptHandler(
      handlerName: 'paymentResult',
      callback: (args) {
        if (args.isEmpty) return;

        final result = args[0] as Map<String, dynamic>;
        final status = result['status'] as String?;

        switch (status) {
          case 'success':
            Navigator.of(context).pop(KGInicisPaymentResult.success(
              transactionId: result['tid'] as String,
              orderNumber: result['oid'] as String,
              amount: result['amt'] as int,
            ));
            break;
          case 'failed':
            Navigator.of(context).pop(KGInicisPaymentResult.failed(
              errorCode: result['errorCode'] as String?,
              errorMessage: result['errorMessage'] as String?,
            ));
            break;
          case 'cancelled':
            Navigator.of(context).pop(KGInicisPaymentResult.cancelled());
            break;
        }
      },
    );
  }

  void _handlePaymentSuccess(String url) {
    final uri = Uri.parse(url);
    Navigator.of(context).pop(KGInicisPaymentResult.success(
      transactionId: uri.queryParameters['tid'] ?? '',
      orderNumber: uri.queryParameters['oid'] ?? '',
      amount: int.tryParse(uri.queryParameters['amt'] ?? '0') ?? 0,
    ));
  }

  void _handlePaymentFailed(String url) {
    final uri = Uri.parse(url);
    Navigator.of(context).pop(KGInicisPaymentResult.failed(
      errorCode: uri.queryParameters['errorCode'],
      errorMessage: uri.queryParameters['errorMessage'],
    ));
  }

  void _handlePaymentCancelled() {
    Navigator.of(context).pop(KGInicisPaymentResult.cancelled());
  }

  bool _isExternalAppScheme(String url) {
    final externalSchemes = [
      'intent://',
      'kakaotalk://',
      'kakaolink://',
      'supertoss://',
      'ispmobile://',
      'shinhan-sr-ansimclick://',
      'kbbank://',
      'kb-acp://',
      'hana1qpay://',
      'nhappcardansimclick://',
      'lottesmartpay://',
      'lotteappcard://',
      'paypin://',
      'lpayapp://',
      'naversearchapp://',
      'samsungpay://',
    ];

    return externalSchemes.any((scheme) => url.startsWith(scheme));
  }

  /// 외부 앱 실행 (url_launcher)
  Future<void> _openExternalApp(String url) async {
    try {
      // Android intent:// URL 처리
      if (url.startsWith('intent://')) {
        final fallbackMatch =
            RegExp(r'S\.browser_fallback_url=([^;#]+)').firstMatch(url);
        final targetUrl = fallbackMatch != null
            ? Uri.decodeFull(fallbackMatch.group(1)!)
            : url.replaceFirst('intent://', 'https://');

        final uri = Uri.parse(targetUrl);
        if (await canLaunchUrl(uri)) {
          await launchUrl(uri, mode: LaunchMode.externalApplication);
        }
        return;
      }

      // 일반 딥링크 (카카오페이, 토스 등)
      final uri = Uri.parse(url);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      } else {
        debugPrint('[KGInicis] 외부 앱 실행 불가: $url');
      }
    } catch (e) {
      debugPrint('[KGInicis] 외부 앱 실행 실패: $e');
    }
  }
}
