import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:url_launcher/url_launcher.dart';

import '../logging/app_logger.dart';

/// 본인인증 WebView 화면
///
/// 외부 본인인증 서비스(KG이니시스, 카카오, NICE, PASS) 페이지를
/// WebView로 열어 사용자가 인증을 완료하도록 합니다.
class IdentityWebView extends StatefulWidget {
  /// 인증 URL (백엔드에서 발급)
  final String authUrl;

  /// 요청 ID
  final String requestId;

  /// 인증 제공자 코드 (kg_inicis, kakao, nice, pass)
  final String provider;

  /// 인증 목적 (registration, payment)
  final String purpose;

  /// 콜백 URL 스킴 (딥링크)
  final String callbackScheme;

  /// 인증 완료 콜백
  final Function(IdentityWebViewResult result) onVerificationComplete;

  /// 취소 콜백
  final VoidCallback? onCancel;

  const IdentityWebView({
    super.key,
    required this.authUrl,
    required this.requestId,
    required this.provider,
    required this.purpose,
    this.callbackScheme = 'teamplus',
    required this.onVerificationComplete,
    this.onCancel,
  });

  @override
  State<IdentityWebView> createState() => _IdentityWebViewState();
}

class _IdentityWebViewState extends State<IdentityWebView> {
  late InAppWebViewController _webViewController;
  bool _isLoading = true;
  double _progress = 0;

  /// 콜백 URL 패턴
  String get _callbackUrlPattern =>
      '${widget.callbackScheme}://identity-callback';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_getProviderTitle()),
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: _handleCancel,
        ),
        actions: [
          if (_isLoading)
            const Padding(
              padding: EdgeInsets.all(16.0),
              child: SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              ),
            ),
        ],
      ),
      body: Column(
        children: [
          // 로딩 프로그레스 바
          if (_progress < 1.0)
            LinearProgressIndicator(
              value: _progress,
              backgroundColor: Colors.grey[200],
              valueColor: const AlwaysStoppedAnimation<Color>(Colors.blue),
            ),
          // WebView
          Expanded(
            child: InAppWebView(
              initialUrlRequest: URLRequest(
                url: WebUri(widget.authUrl),
              ),
              initialSettings: InAppWebViewSettings(
                useShouldOverrideUrlLoading: true,
                javaScriptEnabled: true,
                domStorageEnabled: true,
                allowFileAccess: true,
                allowContentAccess: true,
                // [보안 2026-06-07] file:// 교차 출처 접근 차단(메인 WebView와 동일 정책).
                //   본인인증 페이지에 주입된 스크립트가 로컬 파일을 읽는 벡터 제거.
                allowUniversalAccessFromFileURLs: false,
                allowFileAccessFromFileURLs: false,
                supportMultipleWindows: true,
                // iOS
                allowsInlineMediaPlayback: true,
                // iOS 키보드 액세서리 뷰 숨기기
                disableInputAccessoryView: true,
                // Android
                useHybridComposition: true,
                // [보안 2026-06-07] 본인인증 흐름 active mixed content(스크립트/iframe) 차단.
                // ALWAYS_ALLOW → COMPATIBILITY_MODE: HTTPS 페이지에서 위험한 active HTTP
                // 리소스 주입(MITM)을 막고 passive 리소스만 허용(PG/PASS 호환 유지).
                mixedContentMode: MixedContentMode.MIXED_CONTENT_COMPATIBILITY_MODE,
              ),
              onWebViewCreated: (controller) {
                _webViewController = controller;
              },
              onLoadStart: (controller, url) {
                setState(() {
                  _isLoading = true;
                });

                // 콜백 URL 체크
                if (url != null) {
                  _checkCallbackUrl(url.toString());
                }
              },
              onLoadStop: (controller, url) {
                setState(() {
                  _isLoading = false;
                });
              },
              onProgressChanged: (controller, progress) {
                setState(() {
                  _progress = progress / 100;
                });
              },
              shouldOverrideUrlLoading: (controller, navigationAction) async {
                final url = navigationAction.request.url?.toString() ?? '';

                // 콜백 URL 감지
                if (_checkCallbackUrl(url)) {
                  return NavigationActionPolicy.CANCEL;
                }

                // 외부 앱 실행 (PASS 인증 등)
                if (_shouldOpenExternalApp(url)) {
                  await _openExternalApp(url);
                  return NavigationActionPolicy.CANCEL;
                }

                return NavigationActionPolicy.ALLOW;
              },
              onReceivedError: (controller, request, error) {
                // 구조화 로깅 — 본인인증 페이지 로드 실패.
                //   ⚠️ PII 방지: 전체 URL(인증 요청 파라미터 포함 가능)은 로깅하지 않고
                //   provider 와 에러 설명만 기록. 사용자에겐 기존 스낵바(재시도) 유지.
                AppLogger.instance.warn(
                  '본인인증 WebView 로드 에러',
                  context: {
                    'op': 'identity.webview.onReceivedError',
                    'provider': widget.provider,
                    'description': error.description,
                  },
                );
                if (kDebugMode) {
                  debugPrint('WebView 에러: ${error.description}');
                }
                _handleError(error.description);
              },
              onConsoleMessage: (controller, consoleMessage) {
                debugPrint('WebView Console: ${consoleMessage.message}');
              },
            ),
          ),
        ],
      ),
    );
  }

  /// 제공자별 타이틀
  String _getProviderTitle() {
    switch (widget.provider) {
      case 'kg_inicis':
        return 'KG이니시스 본인인증';
      case 'kakao':
        return '카카오 인증';
      case 'nice':
        return 'NICE 본인인증';
      case 'pass':
        return 'PASS 인증';
      default:
        return '본인인증';
    }
  }

  /// 콜백 URL 체크 및 처리
  bool _checkCallbackUrl(String url) {
    // 콜백 URL 패턴 확인
    if (url.startsWith(_callbackUrlPattern)) {
      final uri = Uri.parse(url);
      final queryParams = uri.queryParameters;

      final success = queryParams['success'] == 'true';
      final requestId = queryParams['requestId'] ?? widget.requestId;
      final errorCode = queryParams['errorCode'];
      final errorMessage = queryParams['errorMessage'];

      widget.onVerificationComplete(IdentityWebViewResult(
        success: success,
        requestId: requestId,
        errorCode: errorCode,
        errorMessage: errorMessage,
      ));

      return true;
    }

    // 백엔드 콜백 URL 패턴 확인 (서버 리다이렉트 후)
    if (url.contains('/identity/complete') ||
        url.contains('/identity/callback-result')) {
      _handleServerCallback(url);
      return true;
    }

    return false;
  }

  /// 서버 콜백 처리
  void _handleServerCallback(String url) {
    final uri = Uri.parse(url);
    final queryParams = uri.queryParameters;

    final success = queryParams['success'] == 'true';
    final requestId = queryParams['requestId'] ?? widget.requestId;
    final errorCode = queryParams['errorCode'];
    final errorMessage = queryParams['errorMessage'];

    widget.onVerificationComplete(IdentityWebViewResult(
      success: success,
      requestId: requestId,
      errorCode: errorCode,
      errorMessage: errorMessage,
    ));
  }

  /// 외부 앱 실행 필요 여부
  bool _shouldOpenExternalApp(String url) {
    // 앱 스킴 (카카오, PASS 등)
    final externalSchemes = [
      'kakaotalk://',
      'ktpassauth://',
      'skpassauth://',
      'lgpassauth://',
      'intent://',
      'market://',
      'itms-apps://',
    ];

    return externalSchemes
        .any((scheme) => url.startsWith(scheme) || url.contains('://'));
  }

  /// 외부 앱 실행
  Future<void> _openExternalApp(String url) async {
    try {
      // Android intent:// URL → 앱 스토어 폴백 포함 처리
      if (url.startsWith('intent://')) {
        // intent:// 에서 fallback URL 추출 (S.browser_fallback_url 파라미터)
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

      // 일반 외부 앱 URL (카카오, PASS 등 딥링크)
      final uri = Uri.parse(url);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      } else {
        // 실행 가능한 핸들러 없음 — 구조화 로깅. ⚠️ PII 방지: 인증 토큰/요청ID 가 포함될 수
        //   있는 전체 딥링크 URL 은 로깅하지 않고 스킴(scheme)만 기록.
        final scheme = url.contains('://') ? url.split('://').first : '(unknown)';
        AppLogger.instance.warn(
          '본인인증 외부 앱 실행 불가 (canLaunchUrl=false)',
          context: {
            'op': 'identity.openExternalApp',
            'scheme': scheme,
            'provider': widget.provider,
          },
        );
        if (kDebugMode) {
          debugPrint('[IdentityWebView] 외부 앱 실행 불가 (scheme: $scheme)');
        }
      }
    } catch (e) {
      // 외부 앱 실행 실패 — 구조화 로깅. ⚠️ PII 방지: 전체 URL 미로깅, 스킴만 기록.
      //   복구 가능한 UX 실패(딥링크 핸들러 부재 등)이므로 Sentry 미보고.
      final scheme = url.contains('://') ? url.split('://').first : '(unknown)';
      AppLogger.instance.warn(
        '본인인증 외부 앱 실행 실패',
        context: {
          'op': 'identity.openExternalApp',
          'scheme': scheme,
          'provider': widget.provider,
          'errorType': e.runtimeType.toString(),
        },
      );
      if (kDebugMode) {
        debugPrint('[IdentityWebView] 외부 앱 실행 실패: $e');
      }
    }
  }

  /// 에러 처리
  void _handleError(String errorMessage) {
    // 네트워크 오류 등의 경우 사용자에게 알림
    if (!mounted) return;

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('오류가 발생했습니다: $errorMessage'),
        action: SnackBarAction(
          label: '다시 시도',
          onPressed: () {
            _webViewController.loadUrl(
              urlRequest: URLRequest(url: WebUri(widget.authUrl)),
            );
          },
        ),
      ),
    );
  }

  /// 취소 처리
  void _handleCancel() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('본인인증 취소'),
        content: const Text('본인인증을 취소하시겠습니까?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('계속하기'),
          ),
          TextButton(
            onPressed: () {
              Navigator.of(context).pop();
              widget.onCancel?.call();
              Navigator.of(this.context).pop();
            },
            child: const Text('취소'),
          ),
        ],
      ),
    );
  }
}

/// 본인인증 WebView 결과
class IdentityWebViewResult {
  final bool success;
  final String requestId;
  final String? errorCode;
  final String? errorMessage;

  IdentityWebViewResult({
    required this.success,
    required this.requestId,
    this.errorCode,
    this.errorMessage,
  });
}

/// 본인인증 WebView를 모달로 열기
Future<IdentityWebViewResult?> showIdentityWebView({
  required BuildContext context,
  required String authUrl,
  required String requestId,
  required String provider,
  String purpose = 'registration',
  String callbackScheme = 'teamplus',
}) async {
  return Navigator.of(context).push<IdentityWebViewResult>(
    MaterialPageRoute(
      fullscreenDialog: true,
      builder: (context) => IdentityWebView(
        authUrl: authUrl,
        requestId: requestId,
        provider: provider,
        purpose: purpose,
        callbackScheme: callbackScheme,
        onVerificationComplete: (result) {
          Navigator.of(context).pop(result);
        },
        onCancel: () {
          Navigator.of(context).pop(null);
        },
      ),
    ),
  );
}
