import '../entities/auth_response.dart';

abstract class AuthRepository {
  Future<AuthResponse> login({
    required String email,
    required String password,
  });

  Future<AuthResponse> register({
    required String email,
    required String phone,
    required String password,
    required String name,
    required String userType,
  });

  Future<bool> isAuthenticated();

  Future<void> logout();

  /// 모든 기기에서 로그아웃 (서버 tokenVersion 증가 → 타 기기 토큰 무효화)
  Future<void> logoutAll();

  Future<String?> getAccessToken();

  Future<String?> getUserType();

  /// 토큰 갱신 (Refresh Token 사용)
  Future<AuthResponse> refreshToken();

  /// 토큰 만료 여부 확인
  Future<bool> isTokenExpired();

  /// 토큰 곧 만료 여부 확인 (5분 이내)
  Future<bool> isTokenNearExpiry();
}
