import 'dart:convert';
import '../network/api_error.dart';

/// JavaScript Bridge 메시지 타입
enum BridgeMessageType {
  auth,
  qrScan,
  payment,
  biometric,
  notification,
  navigation,
  identityVerification,
  api,
  ui, // UI 제어 (상태바, AppBar, BottomNav)
  upload, // 파일 업로드 (카메라·갤러리·로컬 CRUD·백엔드 업로드)
}

/// JavaScript Bridge 메시지
class BridgeMessage {
  final BridgeMessageType type;
  final Map<String, dynamic> data;
  final String? callbackId;

  BridgeMessage({
    required this.type,
    required this.data,
    this.callbackId,
  });

  /// JSON으로 직렬화
  Map<String, dynamic> toJson() {
    return {
      'type': type.name,
      'data': data,
      'callbackId': callbackId,
    };
  }

  /// JSON에서 역직렬화
  factory BridgeMessage.fromJson(Map<String, dynamic> json) {
    return BridgeMessage(
      type: BridgeMessageType.values.firstWhere(
        (e) => e.name == json['type'],
        orElse: () => BridgeMessageType.navigation,
      ),
      data: json['data'] as Map<String, dynamic>,
      callbackId: json['callbackId'] as String?,
    );
  }

  /// JSON 문자열로 변환
  String toJsonString() {
    return jsonEncode(toJson());
  }

  /// JSON 문자열에서 생성
  factory BridgeMessage.fromJsonString(String jsonString) {
    final json = jsonDecode(jsonString) as Map<String, dynamic>;
    return BridgeMessage.fromJson(json);
  }
}

/// JavaScript Bridge 응답
class BridgeResponse {
  final bool success;
  final Map<String, dynamic>? data;
  final String? error;
  final Map<String, dynamic>? apiError; // 표준화된 API 에러 구조
  final String? callbackId;

  BridgeResponse({
    required this.success,
    this.data,
    this.error,
    this.apiError,
    this.callbackId,
  });

  /// JSON으로 직렬화
  Map<String, dynamic> toJson() {
    return {
      'success': success,
      'data': data,
      // 표준화된 에러 구조 우선 사용
      'error': apiError ??
          (error != null ? {'code': 'UNKNOWN_ERROR', 'message': error} : null),
      'callbackId': callbackId,
    };
  }

  /// JSON 문자열로 변환
  String toJsonString() {
    return jsonEncode(toJson());
  }

  /// 성공 응답 생성
  factory BridgeResponse.success({
    Map<String, dynamic>? data,
    String? callbackId,
  }) {
    return BridgeResponse(
      success: true,
      data: data,
      callbackId: callbackId,
    );
  }

  /// 에러 응답 생성 (문자열)
  factory BridgeResponse.error({
    required String error,
    String? callbackId,
  }) {
    return BridgeResponse(
      success: false,
      error: error,
      callbackId: callbackId,
    );
  }

  /// 표준화된 ApiError로 에러 응답 생성
  factory BridgeResponse.errorWithApiError({
    required ApiError apiError,
    String? callbackId,
  }) {
    return BridgeResponse(
      success: false,
      apiError: apiError.toJson(),
      callbackId: callbackId,
    );
  }
}

/// JavaScript Bridge 콜백 관리자
class BridgeCallbackManager {
  final Map<String, Function(BridgeResponse)> _callbacks = {};
  int _nextCallbackId = 0;

  /// 콜백 등록 및 ID 반환
  String register(Function(BridgeResponse) callback) {
    final callbackId = 'cb_${_nextCallbackId++}';
    _callbacks[callbackId] = callback;
    return callbackId;
  }

  /// 콜백 실행
  void execute(String callbackId, BridgeResponse response) {
    final callback = _callbacks[callbackId];
    if (callback != null) {
      callback(response);
      _callbacks.remove(callbackId);
    }
  }

  /// 콜백 제거
  void remove(String callbackId) {
    _callbacks.remove(callbackId);
  }

  /// 모든 콜백 제거
  void clear() {
    _callbacks.clear();
  }
}
