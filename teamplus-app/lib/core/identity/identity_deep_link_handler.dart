import 'dart:async';
import 'package:flutter/material.dart';
import 'package:app_links/app_links.dart';

/// 본인인증 딥링크 핸들러
///
/// 본인인증 완료 후 콜백 URL을 처리합니다.
/// URL 스킴: teamplus://identity-callback?requestId=xxx&success=true
class IdentityDeepLinkHandler {
  static IdentityDeepLinkHandler? _instance;
  final AppLinks _appLinks = AppLinks();
  StreamSubscription<Uri>? _linkSubscription;

  /// 콜백 리스너 목록
  final Map<String, Function(IdentityCallbackData)> _listeners = {};

  /// 전역 콜백 리스너
  Function(IdentityCallbackData)? _globalListener;

  IdentityDeepLinkHandler._();

  factory IdentityDeepLinkHandler() {
    _instance ??= IdentityDeepLinkHandler._();
    return _instance!;
  }

  /// 딥링크 핸들러 초기화
  Future<void> initialize() async {
    // 앱이 종료된 상태에서 딥링크로 실행된 경우
    final initialUri = await _appLinks.getInitialLink();
    if (initialUri != null) {
      _handleUri(initialUri);
    }

    // 앱이 실행 중일 때 딥링크 수신
    _linkSubscription = _appLinks.uriLinkStream.listen(
      _handleUri,
      onError: (err) {
        debugPrint('딥링크 수신 오류: $err');
      },
    );
  }

  /// URI 처리
  void _handleUri(Uri uri) {
    debugPrint('딥링크 수신: $uri');

    // 본인인증 콜백 확인
    if (uri.host == 'identity-callback') {
      _handleIdentityCallback(uri);
    }
  }

  /// 본인인증 콜백 처리
  void _handleIdentityCallback(Uri uri) {
    final queryParams = uri.queryParameters;

    final callbackData = IdentityCallbackData(
      requestId: queryParams['requestId'] ?? '',
      success: queryParams['success'] == 'true',
      provider: queryParams['provider'],
      errorCode: queryParams['errorCode'],
      errorMessage: queryParams['errorMessage'],
    );

    debugPrint(
        '본인인증 콜백: requestId=${callbackData.requestId}, success=${callbackData.success}');

    // 전역 리스너 호출
    _globalListener?.call(callbackData);

    // 특정 requestId에 대한 리스너 호출
    final listener = _listeners[callbackData.requestId];
    if (listener != null) {
      listener(callbackData);
      _listeners.remove(callbackData.requestId);
    }
  }

  /// 특정 requestId에 대한 콜백 리스너 등록
  void addListener(String requestId, Function(IdentityCallbackData) listener) {
    _listeners[requestId] = listener;
  }

  /// 특정 requestId에 대한 콜백 리스너 제거
  void removeListener(String requestId) {
    _listeners.remove(requestId);
  }

  /// 전역 콜백 리스너 설정
  void setGlobalListener(Function(IdentityCallbackData)? listener) {
    _globalListener = listener;
  }

  /// 본인인증 콜백을 Promise처럼 대기
  Future<IdentityCallbackData> waitForCallback({
    required String requestId,
    Duration timeout = const Duration(minutes: 10),
  }) async {
    final completer = Completer<IdentityCallbackData>();

    // 리스너 등록
    addListener(requestId, (data) {
      if (!completer.isCompleted) {
        completer.complete(data);
      }
    });

    // 타임아웃 설정
    return completer.future.timeout(
      timeout,
      onTimeout: () {
        removeListener(requestId);
        return IdentityCallbackData(
          requestId: requestId,
          success: false,
          errorCode: 'TIMEOUT',
          errorMessage: '본인인증 시간이 초과되었습니다.',
        );
      },
    );
  }

  /// 리소스 정리
  void dispose() {
    _linkSubscription?.cancel();
    _listeners.clear();
    _globalListener = null;
  }
}

/// 본인인증 콜백 데이터
class IdentityCallbackData {
  final String requestId;
  final bool success;
  final String? provider;
  final String? errorCode;
  final String? errorMessage;

  IdentityCallbackData({
    required this.requestId,
    required this.success,
    this.provider,
    this.errorCode,
    this.errorMessage,
  });

  Map<String, dynamic> toJson() {
    return {
      'requestId': requestId,
      'success': success,
      'provider': provider,
      'errorCode': errorCode,
      'errorMessage': errorMessage,
    };
  }

  @override
  String toString() {
    return 'IdentityCallbackData(requestId: $requestId, success: $success, errorCode: $errorCode)';
  }
}

/// 본인인증 딥링크 URL 생성 유틸리티
class IdentityDeepLinkBuilder {
  static const String scheme = 'teamplus';
  static const String host = 'identity-callback';

  /// 콜백 URL 생성
  static String buildCallbackUrl({
    required String requestId,
    required bool success,
    String? provider,
    String? errorCode,
    String? errorMessage,
  }) {
    final params = <String, String>{
      'requestId': requestId,
      'success': success.toString(),
    };

    if (provider != null) params['provider'] = provider;
    if (errorCode != null) params['errorCode'] = errorCode;
    if (errorMessage != null) {
      params['errorMessage'] = Uri.encodeComponent(errorMessage);
    }

    final queryString =
        params.entries.map((e) => '${e.key}=${e.value}').join('&');

    return '$scheme://$host?$queryString';
  }

  /// 성공 콜백 URL 생성
  static String buildSuccessUrl({
    required String requestId,
    String? provider,
  }) {
    return buildCallbackUrl(
      requestId: requestId,
      success: true,
      provider: provider,
    );
  }

  /// 실패 콜백 URL 생성
  static String buildErrorUrl({
    required String requestId,
    required String errorCode,
    String? errorMessage,
    String? provider,
  }) {
    return buildCallbackUrl(
      requestId: requestId,
      success: false,
      provider: provider,
      errorCode: errorCode,
      errorMessage: errorMessage,
    );
  }
}
