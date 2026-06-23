import '../../../../core/network/api_client.dart';
import '../models/login_request_model.dart';
import '../models/login_response_model.dart';

class AuthRemoteDatasource {
  final ApiClient _apiClient;

  AuthRemoteDatasource(this._apiClient);

  Future<LoginResponse> login({
    required String email,
    required String password,
  }) async {
    try {
      final response = await _apiClient.post(
        '/auth/login',
        data: LoginRequestModel(
          email: email,
          password: password,
        ).toJson(),
      );

      if (response.data is Map) {
        return LoginResponse.fromJson(response.data as Map<String, dynamic>);
      }

      throw Exception('Invalid response format');
    } catch (e) {
      rethrow;
    }
  }

  Future<LoginResponse> register({
    required String email,
    required String phone,
    required String password,
    required String name,
    required String userType,
  }) async {
    try {
      final response = await _apiClient.post(
        '/auth/register',
        data: {
          'email': email,
          'phone': phone,
          'password': password,
          'name': name,
          'userType': userType,
        },
      );

      if (response.data is Map) {
        return LoginResponse.fromJson(response.data as Map<String, dynamic>);
      }

      throw Exception('Invalid response format');
    } catch (e) {
      rethrow;
    }
  }

  Future<LoginResponse> refresh(String refreshToken) async {
    try {
      final response = await _apiClient.post(
        '/auth/refresh',
        data: {'refreshToken': refreshToken},
      );

      if (response.data is Map) {
        return LoginResponse.fromJson(response.data as Map<String, dynamic>);
      }

      throw Exception('Invalid response format');
    } catch (e) {
      rethrow;
    }
  }

  /// POST /auth/logout-all — 모든 기기 로그아웃 (서버 tokenVersion 증가)
  Future<void> logoutAll() async {
    await _apiClient.post('/auth/logout-all');
  }
}
