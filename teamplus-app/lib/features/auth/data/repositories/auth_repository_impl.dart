import '../../domain/entities/auth_response.dart';
import '../../domain/repositories/auth_repository.dart';
import '../datasources/auth_remote_datasource.dart';
import '../../../../core/storage/secure_storage_service.dart';

class AuthRepositoryImpl implements AuthRepository {
  final AuthRemoteDatasource _remoteDatasource;
  final SecureStorageService _storage;

  AuthRepositoryImpl(this._remoteDatasource, this._storage);

  @override
  Future<AuthResponse> login({
    required String email,
    required String password,
  }) async {
    final response = await _remoteDatasource.login(
      email: email,
      password: password,
    );

    // Save tokens
    await _storage.saveAccessToken(response.accessToken);
    await _storage.saveRefreshToken(response.refreshToken);
    await _storage.saveUserId(response.user.id);
    await _storage.saveUserType(response.user.userType);
    // 토큰 만료 시간 저장 (JWT에서 추출)
    await _storage.saveTokenExpiryFromJwt(response.accessToken);

    return AuthResponse(
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      userId: response.user.id,
      userType: response.user.userType,
      email: response.user.email,
    );
  }

  @override
  Future<bool> isAuthenticated() async {
    return await _storage.isAuthenticated();
  }

  @override
  Future<void> logout() async {
    await _storage.clearAll();
  }

  @override
  Future<void> logoutAll() async {
    try {
      await _remoteDatasource.logoutAll();
    } finally {
      // 서버 호출 성공 여부와 무관하게 로컬 토큰은 삭제
      await _storage.clearAll();
    }
  }

  @override
  Future<String?> getAccessToken() async {
    return await _storage.getAccessToken();
  }

  @override
  Future<String?> getUserType() async {
    return await _storage.getUserType();
  }

  @override
  Future<AuthResponse> register({
    required String email,
    required String phone,
    required String password,
    required String name,
    required String userType,
  }) async {
    final response = await _remoteDatasource.register(
      email: email,
      phone: phone,
      password: password,
      name: name,
      userType: userType,
    );

    // Save tokens after successful registration
    await _storage.saveAccessToken(response.accessToken);
    await _storage.saveRefreshToken(response.refreshToken);
    await _storage.saveUserId(response.user.id);
    await _storage.saveUserType(response.user.userType);
    // 토큰 만료 시간 저장 (JWT에서 추출)
    await _storage.saveTokenExpiryFromJwt(response.accessToken);

    return AuthResponse(
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      userId: response.user.id,
      userType: response.user.userType,
      email: response.user.email,
    );
  }

  @override
  Future<AuthResponse> refreshToken() async {
    final refreshToken = await _storage.getRefreshToken();
    if (refreshToken == null) {
      throw Exception('리프레시 토큰이 없습니다.');
    }

    final response = await _remoteDatasource.refresh(refreshToken);

    // 새 토큰 저장
    await _storage.saveAccessToken(response.accessToken);
    await _storage.saveRefreshToken(response.refreshToken);
    // 토큰 만료 시간 저장 (JWT에서 추출)
    await _storage.saveTokenExpiryFromJwt(response.accessToken);

    return AuthResponse(
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      userId: response.user.id,
      userType: response.user.userType,
      email: response.user.email,
    );
  }

  @override
  Future<bool> isTokenExpired() async {
    return await _storage.isTokenExpired();
  }

  @override
  Future<bool> isTokenNearExpiry() async {
    return await _storage.isTokenNearExpiry();
  }
}
