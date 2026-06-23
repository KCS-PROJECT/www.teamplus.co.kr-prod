import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/auth/token_storage.dart';
import '../../../../core/providers/shared_providers.dart';
import '../../../../core/security/app_lock_manager.dart';
import '../../data/datasources/auth_remote_datasource.dart';
import '../../data/repositories/auth_repository_impl.dart';
import '../../domain/repositories/auth_repository.dart';
import '../../domain/entities/auth_response.dart';

// Remote Datasource Provider
final authRemoteDatasourceProvider = Provider<AuthRemoteDatasource>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return AuthRemoteDatasource(apiClient);
});

// Repository Provider
final authRepositoryProvider = Provider<AuthRepository>((ref) {
  final datasource = ref.watch(authRemoteDatasourceProvider);
  final storage = ref.watch(secureStorageProvider);
  return AuthRepositoryImpl(datasource, storage);
});

// Auth State Provider (로그인 상태 관리)
//
// ⚡ TokenStorage 30초 메모리 캐시 우선 사용 — Splash 가 이미 readAuthBundle() 로
//    Keychain 7-read 를 수행했으므로, GoRouter redirect 가 본 provider 를 watch 할 때
//    동일 데이터를 메모리에서 즉시 반환(~0ms). 기존 repository.isAuthenticated() 의
//    SecureStorage 직접 읽기(30~80ms)를 제거.
final authStateProvider = FutureProvider<bool>((ref) async {
  // 캐시 무효화는 invalidateAuthBundleCache() 또는 saveTokens/clear 호출 시 자동 처리.
  final bundle = await TokenStorage().readAuthBundle();
  return bundle.isAuthenticated;
});

// Login Mutation Provider
final loginProvider =
    FutureProvider.family<AuthResponse, ({String email, String password})>(
  (ref, params) async {
    final repository = ref.watch(authRepositoryProvider);
    final response = await repository.login(
      email: params.email,
      password: params.password,
    );

    // Invalidate auth state to refresh
    ref.invalidate(authStateProvider);

    return response;
  },
);

// Logout Mutation Provider
final logoutProvider = FutureProvider<void>((ref) async {
  final repository = ref.watch(authRepositoryProvider);

  // 로그아웃 수행
  await repository.logout();

  // 🔐 로그아웃 후 생체인증 잠금 활성화
  await appLockManager.lockAppAfterLogout();

  // 인증 상태 갱신
  ref.invalidate(authStateProvider);
});

// Logout All Devices Mutation Provider
final logoutAllProvider = FutureProvider<void>((ref) async {
  final repository = ref.watch(authRepositoryProvider);

  // 모든 기기 로그아웃 (서버 tokenVersion 증가 + 로컬 토큰 삭제)
  await repository.logoutAll();

  // 인증 상태 갱신 → GoRouter 가 /login 으로 리다이렉트
  ref.invalidate(authStateProvider);
});

// Register Mutation Provider
final registerProvider = FutureProvider.family<
    AuthResponse,
    ({
      String email,
      String phone,
      String password,
      String name,
      String userType,
    })>(
  (ref, params) async {
    final repository = ref.watch(authRepositoryProvider);
    final response = await repository.register(
      email: params.email,
      phone: params.phone,
      password: params.password,
      name: params.name,
      userType: params.userType,
    );

    // Invalidate auth state to refresh
    ref.invalidate(authStateProvider);

    return response;
  },
);

// Get Current User Type Provider
final currentUserTypeProvider = FutureProvider<String?>((ref) async {
  final repository = ref.watch(authRepositoryProvider);
  return repository.getUserType();
});

// Token Refresh Provider
/// 토큰 갱신 프로바이더 (401 에러 시 사용)
final refreshTokenProvider = FutureProvider<AuthResponse>((ref) async {
  final repository = ref.watch(authRepositoryProvider);
  final response = await repository.refreshToken();

  // 인증 상태 갱신
  ref.invalidate(authStateProvider);

  return response;
});

// Token Expiry Check Provider
/// 토큰 만료 여부 확인 프로바이더
final isTokenExpiredProvider = FutureProvider<bool>((ref) async {
  final repository = ref.watch(authRepositoryProvider);
  return repository.isTokenExpired();
});

// Token Near Expiry Check Provider
/// 토큰 곧 만료 여부 확인 프로바이더 (5분 이내)
final isTokenNearExpiryProvider = FutureProvider<bool>((ref) async {
  final repository = ref.watch(authRepositoryProvider);
  return repository.isTokenNearExpiry();
});

