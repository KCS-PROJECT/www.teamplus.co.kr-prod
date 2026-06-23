/// API 에러 처리를 위한 표준화된 에러 클래스
///
/// Web (Next.js), Flutter, Backend에서 동일한 에러 구조 사용
library;

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

// ============================================
// 표준 에러 코드 정의
// ============================================
abstract class ApiErrorCode {
  // 인증 관련
  static const String authExpired = 'AUTH_EXPIRED';
  static const String authInvalid = 'AUTH_INVALID';
  static const String authRequired = 'AUTH_REQUIRED';

  // 권한 관련
  static const String permissionDenied = 'PERMISSION_DENIED';

  // 리소스 관련
  static const String notFound = 'NOT_FOUND';
  static const String alreadyExists = 'ALREADY_EXISTS';

  // 요청 관련
  static const String validationError = 'VALIDATION_ERROR';
  static const String badRequest = 'BAD_REQUEST';

  // 네트워크 관련
  static const String networkError = 'NETWORK_ERROR';
  static const String timeoutError = 'TIMEOUT_ERROR';
  static const String connectionError = 'CONNECTION_ERROR';

  // 서버 관련
  static const String serverError = 'SERVER_ERROR';
  static const String serviceUnavailable = 'SERVICE_UNAVAILABLE';

  // 기타
  static const String unknownError = 'UNKNOWN_ERROR';
  static const String cancelled = 'CANCELLED';

  // 🔐 SSL/TLS 관련 (Certificate Pinning)
  static const String certificatePinningFailed = 'CERTIFICATE_PINNING_FAILED';
  static const String sslHandshakeFailed = 'SSL_HANDSHAKE_FAILED';
}

// ============================================
// 에러 메시지 매핑 (한국어)
// ============================================
const Map<String, String> _errorMessages = {
  ApiErrorCode.authExpired: '인증이 만료되었습니다. 다시 로그인해주세요.',
  ApiErrorCode.authInvalid: '인증에 실패했습니다.',
  ApiErrorCode.authRequired: '로그인이 필요합니다.',
  ApiErrorCode.permissionDenied: '접근 권한이 없습니다.',
  ApiErrorCode.notFound: '요청한 데이터를 찾을 수 없습니다.',
  ApiErrorCode.alreadyExists: '이미 존재하는 데이터입니다.',
  ApiErrorCode.validationError: '입력값을 확인해주세요.',
  ApiErrorCode.badRequest: '잘못된 요청입니다.',
  ApiErrorCode.networkError: '네트워크 연결을 확인해주세요.',
  ApiErrorCode.timeoutError: '요청 시간이 초과되었습니다.',
  ApiErrorCode.connectionError: '서버에 연결할 수 없습니다.',
  ApiErrorCode.serverError: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
  ApiErrorCode.serviceUnavailable: '서비스를 일시적으로 사용할 수 없습니다.',
  ApiErrorCode.unknownError: '알 수 없는 오류가 발생했습니다.',
  ApiErrorCode.cancelled: '요청이 취소되었습니다.',
  // 🔐 SSL/TLS 관련 메시지
  ApiErrorCode.certificatePinningFailed:
      '보안 인증서 검증에 실패했습니다. 앱을 최신 버전으로 업데이트해주세요.',
  ApiErrorCode.sslHandshakeFailed:
      'SSL 연결에 실패했습니다. 네트워크 연결을 확인하거나 앱을 업데이트해주세요.',
};

// ============================================
// 표준 API 에러 클래스
// ============================================
class ApiError implements Exception {
  /// 에러 코드 (예: 'AUTH_EXPIRED', 'NETWORK_ERROR')
  final String code;

  /// 사용자 친화적 메시지 (한국어)
  final String message;

  /// HTTP 상태 코드 (400, 401, 500 등)
  final int? statusCode;

  /// 추가 정보 (validation errors 등)
  final Map<String, dynamic>? details;

  /// 원본 에러 (디버깅용)
  final dynamic originalError;

  const ApiError({
    required this.code,
    required this.message,
    this.statusCode,
    this.details,
    this.originalError,
  });

  /// 에러 코드로 ApiError 생성
  factory ApiError.fromCode(
    String code, {
    String? message,
    int? statusCode,
    Map<String, dynamic>? details,
    dynamic originalError,
  }) {
    return ApiError(
      code: code,
      message: message ??
          _errorMessages[code] ??
          _errorMessages[ApiErrorCode.unknownError]!,
      statusCode: statusCode,
      details: details,
      originalError: originalError,
    );
  }

  /// HTTP 상태 코드로 ApiError 생성
  factory ApiError.fromStatusCode(
    int statusCode, {
    String? serverMessage,
    Map<String, dynamic>? details,
    dynamic originalError,
  }) {
    final code = _statusCodeToErrorCode(statusCode);
    return ApiError(
      code: code,
      message: serverMessage ??
          _errorMessages[code] ??
          _errorMessages[ApiErrorCode.unknownError]!,
      statusCode: statusCode,
      details: details,
      originalError: originalError,
    );
  }

  /// 네트워크 에러 생성
  factory ApiError.network({String? message, dynamic originalError}) {
    return ApiError(
      code: ApiErrorCode.networkError,
      message: message ?? _errorMessages[ApiErrorCode.networkError]!,
      originalError: originalError,
    );
  }

  /// 타임아웃 에러 생성
  factory ApiError.timeout({String? message, dynamic originalError}) {
    return ApiError(
      code: ApiErrorCode.timeoutError,
      message: message ?? _errorMessages[ApiErrorCode.timeoutError]!,
      originalError: originalError,
    );
  }

  /// 연결 에러 생성
  factory ApiError.connection({String? message, dynamic originalError}) {
    return ApiError(
      code: ApiErrorCode.connectionError,
      message: message ?? _errorMessages[ApiErrorCode.connectionError]!,
      originalError: originalError,
    );
  }

  /// 취소 에러 생성
  factory ApiError.cancelled({String? message, dynamic originalError}) {
    return ApiError(
      code: ApiErrorCode.cancelled,
      message: message ?? _errorMessages[ApiErrorCode.cancelled]!,
      originalError: originalError,
    );
  }

  /// 알 수 없는 에러 생성
  factory ApiError.unknown({String? message, dynamic originalError}) {
    return ApiError(
      code: ApiErrorCode.unknownError,
      message: message ?? _errorMessages[ApiErrorCode.unknownError]!,
      originalError: originalError,
    );
  }

  /// 인증 만료 여부
  bool get isAuthExpired => code == ApiErrorCode.authExpired;

  /// 인증 관련 에러 여부
  bool get isAuthError =>
      code == ApiErrorCode.authExpired ||
      code == ApiErrorCode.authInvalid ||
      code == ApiErrorCode.authRequired;

  /// 네트워크 관련 에러 여부
  bool get isNetworkError =>
      code == ApiErrorCode.networkError ||
      code == ApiErrorCode.timeoutError ||
      code == ApiErrorCode.connectionError;

  /// 서버 에러 여부 (5xx)
  bool get isServerError =>
      code == ApiErrorCode.serverError ||
      code == ApiErrorCode.serviceUnavailable;

  /// JSON으로 변환 (Web Bridge 통신용)
  Map<String, dynamic> toJson() {
    return {
      'code': code,
      'message': message,
      if (statusCode != null) 'statusCode': statusCode,
      if (details != null) 'details': details,
    };
  }

  /// JSON에서 ApiError 생성
  factory ApiError.fromJson(Map<String, dynamic> json) {
    return ApiError(
      code: json['code'] as String? ?? ApiErrorCode.unknownError,
      message: json['message'] as String? ??
          _errorMessages[ApiErrorCode.unknownError]!,
      statusCode: json['statusCode'] as int?,
      details: json['details'] as Map<String, dynamic>?,
    );
  }

  @override
  String toString() {
    final buffer = StringBuffer('ApiError(');
    buffer.write('code: $code, message: $message');
    if (statusCode != null) buffer.write(', statusCode: $statusCode');
    if (details != null) buffer.write(', details: $details');
    buffer.write(')');
    return buffer.toString();
  }

  /// 디버그용 상세 정보
  String toDebugString() {
    return '''
ApiError:
  code: $code
  message: $message
  statusCode: $statusCode
  details: $details
  originalError: $originalError
''';
  }

  /// 디버그 모드에서 클립보드에 복사 가능한 포맷
  String toCopyableString() {
    final buffer = StringBuffer();
    buffer.writeln('═══════════════════════════════════════');
    buffer.writeln('TEAMPLUS API ERROR REPORT');
    buffer.writeln('═══════════════════════════════════════');
    buffer.writeln();
    buffer.writeln('📅 Timestamp: ${DateTime.now().toIso8601String()}');
    buffer.writeln('🔢 Error Code: $code');
    if (statusCode != null) {
      buffer.writeln('🌐 HTTP Status: $statusCode');
    }
    buffer.writeln();
    buffer.writeln('─── User Message ───');
    buffer.writeln(message);
    buffer.writeln();
    if (details != null) {
      buffer.writeln('─── Details ───');
      buffer.writeln(details);
      buffer.writeln();
    }
    if (originalError != null) {
      buffer.writeln('─── Original Error ───');
      buffer.writeln(originalError.toString());
      buffer.writeln();
    }
    buffer.writeln('═══════════════════════════════════════');
    buffer.writeln('App Mode: ${kDebugMode ? 'DEBUG' : 'RELEASE'}');
    buffer.writeln('═══════════════════════════════════════');
    return buffer.toString();
  }

  /// 디버그 모드에서 에러를 클립보드에 복사
  /// kDebugMode가 true일 때만 동작합니다.
  Future<bool> copyToClipboard() async {
    if (!kDebugMode) return false;

    try {
      await Clipboard.setData(ClipboardData(text: toCopyableString()));
      return true;
    } catch (e) {
      debugPrint('에러 복사 실패: $e');
      return false;
    }
  }
}

// ============================================
// 내부 유틸리티
// ============================================

/// HTTP 상태 코드를 에러 코드로 변환
String _statusCodeToErrorCode(int statusCode) {
  switch (statusCode) {
    case 400:
      return ApiErrorCode.badRequest;
    case 401:
      return ApiErrorCode.authExpired;
    case 403:
      return ApiErrorCode.permissionDenied;
    case 404:
      return ApiErrorCode.notFound;
    case 409:
      return ApiErrorCode.alreadyExists;
    case 422:
      return ApiErrorCode.validationError;
    case 500:
    case 502:
    case 503:
      return ApiErrorCode.serverError;
    case 504:
      return ApiErrorCode.timeoutError;
    default:
      return ApiErrorCode.unknownError;
  }
}

// ============================================
