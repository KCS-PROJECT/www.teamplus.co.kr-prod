import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import '../auth/token_storage.dart';

/// 본인인증 제공자 타입
enum IdentityProvider {
  kgInicis,
  kakao,
  nice,
  pass,
}

extension IdentityProviderExtension on IdentityProvider {
  String get code {
    switch (this) {
      case IdentityProvider.kgInicis:
        return 'kg_inicis';
      case IdentityProvider.kakao:
        return 'kakao';
      case IdentityProvider.nice:
        return 'nice';
      case IdentityProvider.pass:
        return 'pass';
    }
  }

  String get displayName {
    switch (this) {
      case IdentityProvider.kgInicis:
        return 'KG이니시스';
      case IdentityProvider.kakao:
        return '카카오';
      case IdentityProvider.nice:
        return 'NICE평가정보';
      case IdentityProvider.pass:
        return 'PASS';
    }
  }

  static IdentityProvider fromCode(String code) {
    switch (code) {
      case 'kg_inicis':
        return IdentityProvider.kgInicis;
      case 'kakao':
        return IdentityProvider.kakao;
      case 'nice':
        return IdentityProvider.nice;
      case 'pass':
        return IdentityProvider.pass;
      default:
        return IdentityProvider.kgInicis;
    }
  }
}

/// 본인인증 목적
enum IdentityPurpose {
  registration,
  payment,
}

extension IdentityPurposeExtension on IdentityPurpose {
  String get code {
    switch (this) {
      case IdentityPurpose.registration:
        return 'registration';
      case IdentityPurpose.payment:
        return 'payment';
    }
  }
}

/// 본인인증 요청 결과
class IdentityInitiateResult {
  final bool success;
  final String? requestId;
  final String? authUrl;
  final String? errorCode;
  final String? errorMessage;

  IdentityInitiateResult({
    required this.success,
    this.requestId,
    this.authUrl,
    this.errorCode,
    this.errorMessage,
  });

  factory IdentityInitiateResult.fromJson(Map<String, dynamic> json) {
    return IdentityInitiateResult(
      success: json['success'] as bool,
      requestId: json['requestId'] as String?,
      authUrl: json['authUrl'] as String?,
      errorCode: json['errorCode'] as String?,
      errorMessage: json['errorMessage'] as String?,
    );
  }
}

/// 본인인증 결과
class IdentityVerificationResult {
  final bool success;
  final String requestId;
  final String? verifiedName;
  final String? verifiedPhone;
  final DateTime? verifiedAt;
  final String? errorCode;
  final String? errorMessage;

  IdentityVerificationResult({
    required this.success,
    required this.requestId,
    this.verifiedName,
    this.verifiedPhone,
    this.verifiedAt,
    this.errorCode,
    this.errorMessage,
  });

  factory IdentityVerificationResult.fromJson(Map<String, dynamic> json) {
    return IdentityVerificationResult(
      success: json['success'] as bool,
      requestId: json['requestId'] as String,
      verifiedName: json['verifiedName'] as String?,
      verifiedPhone: json['verifiedPhone'] as String?,
      verifiedAt: json['verifiedAt'] != null
          ? DateTime.parse(json['verifiedAt'] as String)
          : null,
      errorCode: json['errorCode'] as String?,
      errorMessage: json['errorMessage'] as String?,
    );
  }
}

/// 본인인증 상태
class IdentityStatus {
  final bool isVerified;
  final DateTime? verifiedAt;
  final String? verifiedName;

  IdentityStatus({
    required this.isVerified,
    this.verifiedAt,
    this.verifiedName,
  });

  factory IdentityStatus.fromJson(Map<String, dynamic> json) {
    return IdentityStatus(
      isVerified: json['isVerified'] as bool,
      verifiedAt: json['verifiedAt'] != null
          ? DateTime.parse(json['verifiedAt'] as String)
          : null,
      verifiedName: json['verifiedName'] as String?,
    );
  }
}

/// 본인인증 서비스
class IdentityService {
  final String baseUrl;
  final TokenStorage _tokenStorage = TokenStorage();

  IdentityService({required this.baseUrl});

  /// Authorization 헤더 생성
  Future<Map<String, String>> _getHeaders() async {
    final tokenInfo = await _tokenStorage.getTokenInfo();
    final accessToken = tokenInfo['accessToken'];

    return {
      'Content-Type': 'application/json',
      if (accessToken != null) 'Authorization': 'Bearer $accessToken',
    };
  }

  /// 본인인증 요청 시작
  Future<IdentityInitiateResult> initiateVerification({
    required IdentityProvider provider,
    required IdentityPurpose purpose,
    String? returnUrl,
  }) async {
    try {
      final headers = await _getHeaders();

      final response = await http.post(
        Uri.parse('$baseUrl/api/v1/identity/initiate'),
        headers: headers,
        body: jsonEncode({
          'provider': provider.code,
          'purpose': purpose.code,
          if (returnUrl != null) 'returnUrl': returnUrl,
        }),
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        return IdentityInitiateResult.fromJson(data);
      } else {
        final error = jsonDecode(response.body) as Map<String, dynamic>;
        return IdentityInitiateResult(
          success: false,
          errorCode: error['errorCode'] as String? ?? 'UNKNOWN_ERROR',
          errorMessage: error['message'] as String? ?? '본인인증 요청에 실패했습니다.',
        );
      }
    } catch (e) {
      debugPrint('본인인증 요청 실패: $e');
      return IdentityInitiateResult(
        success: false,
        errorCode: 'NETWORK_ERROR',
        errorMessage: '네트워크 오류가 발생했습니다.',
      );
    }
  }

  /// 본인인증 결과 조회
  Future<IdentityVerificationResult> getVerificationResult(
      String requestId) async {
    try {
      final headers = await _getHeaders();

      final response = await http.get(
        Uri.parse('$baseUrl/api/v1/identity/result/$requestId'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        return IdentityVerificationResult.fromJson(data);
      } else {
        final error = jsonDecode(response.body) as Map<String, dynamic>;
        return IdentityVerificationResult(
          success: false,
          requestId: requestId,
          errorCode: error['errorCode'] as String? ?? 'UNKNOWN_ERROR',
          errorMessage: error['message'] as String? ?? '인증 결과를 가져올 수 없습니다.',
        );
      }
    } catch (e) {
      debugPrint('인증 결과 조회 실패: $e');
      return IdentityVerificationResult(
        success: false,
        requestId: requestId,
        errorCode: 'NETWORK_ERROR',
        errorMessage: '네트워크 오류가 발생했습니다.',
      );
    }
  }

  /// 본인인증 상태 확인 (폴링)
  Future<String> checkVerificationStatus(String requestId) async {
    try {
      final headers = await _getHeaders();

      final response = await http.get(
        Uri.parse('$baseUrl/api/v1/identity/status/$requestId'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        return data['status'] as String? ?? 'unknown';
      }
      return 'error';
    } catch (e) {
      debugPrint('상태 확인 실패: $e');
      return 'error';
    }
  }

  /// 사용자 본인인증 상태 조회
  Future<IdentityStatus> getUserVerificationStatus() async {
    try {
      final headers = await _getHeaders();

      final response = await http.get(
        Uri.parse('$baseUrl/api/v1/identity/user/status'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        return IdentityStatus.fromJson(data);
      } else {
        return IdentityStatus(isVerified: false);
      }
    } catch (e) {
      debugPrint('사용자 인증 상태 조회 실패: $e');
      return IdentityStatus(isVerified: false);
    }
  }
}
