import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:teamplus_app/core/crypto/encryption_service.dart';
import 'package:teamplus_app/core/storage/secure_storage_service.dart';
import 'package:teamplus_app/features/auth/data/models/encrypted_request_model.dart';

/// 인증 저장소
///
/// 사용자 로그인, 회원가입, 인증 상태 관리
class AuthRepository {
  final dynamic _api; // API 클라이언트 (dio, http 등)

  AuthRepository({required dynamic api}) : _api = api;

  final _secureStorage = SecureStorageService();

  /// 로그인 (E2E 암호화)
  ///
  /// 동작 흐름:
  /// 1. 클라이언트: 이메일/비밀번호 AES-256-GCM 암호화
  /// 2. 전송: 암호화된 페이로드 (encryptedData, iv, authTag)
  /// 3. 서버: 암호화된 데이터 복호화 후 비밀번호 검증
  Future<LoginResponse> login(String email, String password) async {
    try {
      // 1. 암호화 서비스 초기화
      final encryptionService = EncryptionService();

      // 2. 이메일/비밀번호를 JSON으로 직렬화
      final plaintext = jsonEncode({
        'email': email,
        'password': password,
      });

      // 3. AES-256-GCM으로 암호화
      final encryptedPayload =
          await encryptionService.encryptCredentials(plaintext);

      // 4. 암호화된 페이로드를 DTO로 변환
      final request =
          EncryptedLoginRequest.fromEncryptedPayload(encryptedPayload);

      // 5. 암호화된 요청 전송
      final response = await _api.post(
        '/auth/login',
        data: request.toJson(),
      );

      // 6. 응답 처리
      if (response.statusCode == 200) {
        final loginResponse = LoginResponse.fromJson(response.data);

        // 토큰 저장 (로컬 저장소)
        await _saveTokens(
            loginResponse.accessToken, loginResponse.refreshToken);

        return loginResponse;
      } else {
        throw Exception('로그인 실패: ${response.statusCode}');
      }
    } catch (e) {
      debugPrint('[Auth] Login encryption failed: $e');
      throw Exception('로그인 중 오류가 발생했습니다. 다시 시도해주세요.');
    }
  }

  /// 회원가입
  Future<void> signup({
    required String name,
    required String email,
    required String phone,
    required String password,
    required String userType,
    required Map<String, bool> agreements,
  }) async {
    try {
      final response = await _api.post(
        '/auth/signup',
        data: {
          'name': name,
          'email': email,
          'phone': phone,
          'password': password,
          'userType': userType,
          'agreements': agreements,
        },
      );

      if (response.statusCode != 201) {
        throw Exception('회원가입 실패');
      }
    } catch (e) {
      debugPrint('[Auth] Signup failed: $e');
      rethrow;
    }
  }

  /// 로그아웃
  Future<void> logout() async {
    try {
      await _api.post('/auth/logout');
      await _clearTokens();
    } catch (e) {
      debugPrint('[Auth] Logout failed: $e');
      // 로그아웃 실패해도 로컬 토큰은 삭제
      await _clearTokens();
    }
  }

  /// 토큰 갱신
  Future<String> refreshToken() async {
    try {
      final refreshToken = await _getRefreshToken();
      if (refreshToken == null) {
        throw Exception('리프레시 토큰이 없습니다');
      }

      final response = await _api.post(
        '/auth/refresh',
        data: {'refreshToken': refreshToken},
      );

      if (response.statusCode == 200) {
        final newAccessToken = response.data['accessToken'];
        await _saveAccessToken(newAccessToken);
        return newAccessToken;
      } else {
        throw Exception('토큰 갱신 실패');
      }
    } catch (e) {
      debugPrint('[Auth] Token refresh failed: $e');
      rethrow;
    }
  }

  /// 현재 사용자 프로필 조회
  Future<Map<String, dynamic>> getProfile() async {
    try {
      final response = await _api.get('/auth/profile');
      if (response.statusCode == 200) {
        return response.data;
      } else {
        throw Exception('프로필 조회 실패');
      }
    } catch (e) {
      debugPrint('[Auth] Get profile failed: $e');
      rethrow;
    }
  }

  /// 아이디 찾기
  Future<Map<String, dynamic>> findId(
      {required String name, required String phone}) async {
    try {
      final response = await _api.post(
        '/auth/find-id',
        data: {'name': name, 'phone': phone},
      );

      if (response.statusCode == 200) {
        return response.data;
      } else {
        throw Exception('아이디 찾기 실패');
      }
    } catch (e) {
      debugPrint('[Auth] Find ID failed: $e');
      rethrow;
    }
  }

  /// 비밀번호 재설정 코드 발송
  Future<void> sendResetCode({required String email}) async {
    try {
      final response = await _api.post(
        '/auth/password/send-code',
        data: {'email': email},
      );

      if (response.statusCode != 200) {
        throw Exception('코드 발송 실패');
      }
    } catch (e) {
      debugPrint('[Auth] Send reset code failed: $e');
      rethrow;
    }
  }

  /// 비밀번호 재설정
  Future<void> resetPassword({
    required String email,
    required String code,
    required String newPassword,
  }) async {
    try {
      final response = await _api.post(
        '/auth/password/reset',
        data: {
          'email': email,
          'code': code,
          'newPassword': newPassword,
        },
      );

      if (response.statusCode != 200) {
        throw Exception('비밀번호 재설정 실패');
      }
    } catch (e) {
      debugPrint('[Auth] Reset password failed: $e');
      rethrow;
    }
  }

  /// 이메일 중복 확인
  Future<bool> checkEmailExists(String email) async {
    try {
      final response = await _api.get(
        '/auth/check-email',
        queryParameters: {'email': email},
      );

      if (response.statusCode == 200) {
        return response.data['exists'] ?? false;
      } else {
        throw Exception('이메일 확인 실패');
      }
    } catch (e) {
      debugPrint('[Auth] Check email failed: $e');
      rethrow;
    }
  }

  /// 휴대폰 번호 중복 확인
  Future<bool> checkPhoneExists(String phone) async {
    try {
      final response = await _api.get(
        '/auth/check-phone',
        queryParameters: {'phone': phone},
      );

      if (response.statusCode == 200) {
        return response.data['exists'] ?? false;
      } else {
        throw Exception('휴대폰 확인 실패');
      }
    } catch (e) {
      debugPrint('[Auth] Check phone failed: $e');
      rethrow;
    }
  }

  // ============================================
  // Private Methods (토큰 저장소)
  // ============================================

  Future<void> _saveTokens(String accessToken, String refreshToken) async {
    await _secureStorage.saveAccessToken(accessToken);
    await _secureStorage.saveRefreshToken(refreshToken);
    await _secureStorage.saveTokenExpiryFromJwt(accessToken);
    debugPrint('[Auth] Tokens saved securely');
  }

  Future<void> _saveAccessToken(String accessToken) async {
    await _secureStorage.saveAccessToken(accessToken);
    await _secureStorage.saveTokenExpiryFromJwt(accessToken);
    debugPrint('[Auth] Access token updated');
  }

  Future<String?> _getRefreshToken() async {
    return await _secureStorage.getRefreshToken();
  }

  Future<void> _clearTokens() async {
    await _secureStorage.clearAll();
    debugPrint('[Auth] Tokens cleared');
  }
}

/// 로그인 응답 모델
class LoginResponse {
  final String accessToken;
  final String refreshToken;
  final Map<String, dynamic> user;

  LoginResponse({
    required this.accessToken,
    required this.refreshToken,
    required this.user,
  });

  factory LoginResponse.fromJson(Map<String, dynamic> json) {
    return LoginResponse(
      accessToken: json['data']['accessToken'],
      refreshToken: json['data']['refreshToken'],
      user: json['data']['user'],
    );
  }
}
