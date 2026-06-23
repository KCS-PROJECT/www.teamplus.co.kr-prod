import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SecureStorageService {
  static final SecureStorageService _instance =
      SecureStorageService._internal();

  factory SecureStorageService() => _instance;

  SecureStorageService._internal();

  final _storage = const FlutterSecureStorage(
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.first_unlock,
    ),
  );

  // Storage keys
  static const String _accessTokenKey = 'access_token';
  static const String _refreshTokenKey = 'refresh_token';
  static const String _userIdKey = 'user_id';
  static const String _userTypeKey = 'user_type';
  static const String _onboardingCompletedKey = 'onboarding_completed';
  static const String _splashViewedKey = 'splash_viewed';
  static const String _tokenExpiryKey = 'token_expiry';

  // Token expiry buffer (5 minutes in milliseconds)
  static const int _expiryBufferMs = 5 * 60 * 1000;

  // Access Token
  Future<void> saveAccessToken(String token) async {
    await _storage.write(key: _accessTokenKey, value: token);
  }

  Future<String?> getAccessToken() async {
    return await _storage.read(key: _accessTokenKey);
  }

  // Refresh Token
  Future<void> saveRefreshToken(String token) async {
    await _storage.write(key: _refreshTokenKey, value: token);
  }

  Future<String?> getRefreshToken() async {
    return await _storage.read(key: _refreshTokenKey);
  }

  // User Info
  Future<void> saveUserId(String userId) async {
    await _storage.write(key: _userIdKey, value: userId);
  }

  Future<String?> getUserId() async {
    return await _storage.read(key: _userIdKey);
  }

  Future<void> saveUserType(String userType) async {
    await _storage.write(key: _userTypeKey, value: userType);
  }

  Future<String?> getUserType() async {
    return await _storage.read(key: _userTypeKey);
  }

  // Check if user is authenticated
  Future<bool> isAuthenticated() async {
    final token = await getAccessToken();
    return token != null && token.isNotEmpty;
  }

  // Token Expiry Management
  /// 토큰 만료 시간 저장 (Unix timestamp in milliseconds)
  Future<void> saveTokenExpiry(int expiryTimestamp) async {
    await _storage.write(
      key: _tokenExpiryKey,
      value: expiryTimestamp.toString(),
    );
  }

  /// 토큰 만료 시간 조회
  Future<int?> getTokenExpiry() async {
    final value = await _storage.read(key: _tokenExpiryKey);
    if (value == null) return null;
    return int.tryParse(value);
  }

  /// 토큰 만료 여부 확인
  Future<bool> isTokenExpired() async {
    final expiry = await getTokenExpiry();
    if (expiry == null) return true; // No expiry info = consider expired
    return DateTime.now().millisecondsSinceEpoch >= expiry;
  }

  /// 토큰이 곧 만료되는지 확인 (5분 이내)
  Future<bool> isTokenNearExpiry() async {
    final expiry = await getTokenExpiry();
    if (expiry == null) return true;
    final now = DateTime.now().millisecondsSinceEpoch;
    return (expiry - now) <= _expiryBufferMs;
  }

  /// JWT 토큰에서 만료 시간 추출하여 저장
  Future<void> saveTokenExpiryFromJwt(String token) async {
    try {
      // JWT는 header.payload.signature 형식
      final parts = token.split('.');
      if (parts.length != 3) return;

      // Base64 디코딩 (URL-safe base64)
      String payload = parts[1];
      // Base64 패딩 추가
      switch (payload.length % 4) {
        case 2:
          payload += '==';
          break;
        case 3:
          payload += '=';
          break;
      }
      payload = payload.replaceAll('-', '+').replaceAll('_', '/');

      final decoded = String.fromCharCodes(
        Uri.parse('data:text/plain;base64,$payload').data!.contentAsBytes(),
      );

      // JSON 파싱하여 exp 추출
      final expMatch = RegExp(r'"exp"\s*:\s*(\d+)').firstMatch(decoded);
      if (expMatch != null) {
        final exp = int.parse(expMatch.group(1)!);
        // JWT exp는 초 단위이므로 밀리초로 변환
        await saveTokenExpiry(exp * 1000);
      }
    } catch (e) {
      // JWT 파싱 실패 시 기본 15분 만료 설정
      final defaultExpiry =
          DateTime.now().millisecondsSinceEpoch + (15 * 60 * 1000);
      await saveTokenExpiry(defaultExpiry);
    }
  }

  // Clear all stored data (logout)
  Future<void> clearAll() async {
    await _storage.deleteAll();
  }

  // Clear specific key
  Future<void> delete(String key) async {
    await _storage.delete(key: key);
  }

  // Onboarding
  Future<void> setOnboardingCompleted(bool completed) async {
    await _storage.write(
      key: _onboardingCompletedKey,
      value: completed.toString(),
    );
  }

  Future<bool> isOnboardingCompleted() async {
    final value = await _storage.read(key: _onboardingCompletedKey);
    return value == 'true';
  }

  // Splash Screen
  Future<void> setSplashViewed(bool viewed) async {
    await _storage.write(
      key: _splashViewedKey,
      value: viewed.toString(),
    );
  }

  Future<bool> isSplashViewed() async {
    final value = await _storage.read(key: _splashViewedKey);
    return value == 'true';
  }
}
