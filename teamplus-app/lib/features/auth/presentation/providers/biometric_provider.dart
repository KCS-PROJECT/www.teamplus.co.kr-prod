import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/security/biometric_service.dart';
import '../../../../core/auth/token_storage.dart';

// 🔐 생체인증 서비스 Provider
final biometricServiceProvider = Provider<BiometricService>((ref) {
  return BiometricService();
});

// 🔐 생체인증 가용성 확인 Provider
final biometricAvailabilityProvider =
    FutureProvider<BiometricAvailability>((ref) async {
  final biometricService = ref.watch(biometricServiceProvider);
  return await biometricService.checkAvailability();
});

// 🔐 사용 가능한 생체인증 목록 Provider
final availableBiometricsProvider = FutureProvider<List<String>>((ref) async {
  final biometricService = ref.watch(biometricServiceProvider);
  final biometrics = await biometricService.getAvailableBiometrics();
  return biometrics.map((b) => b.toString().split('.').last).toList();
});

// 🔐 생체인증 상태 정보 Provider (디버그용)
final biometricStatusProvider =
    FutureProvider<Map<String, dynamic>>((ref) async {
  final biometricService = ref.watch(biometricServiceProvider);
  return await biometricService.getStatus();
});

// 🔐 생체인증 활성화 상태 Notifier
//
// Riverpod 3.x Notifier 패턴 (이전 StateNotifier 에서 마이그레이션)
// - 의존성은 build() 내부에서 초기화
// - 초기 state 는 build() 반환값 (이전 super(false) 대체)
class BiometricEnabledNotifier extends Notifier<bool> {
  late final TokenStorage _tokenStorage;

  @override
  bool build() {
    _tokenStorage = TokenStorage();
    _loadBiometricState();
    return false;
  }

  Future<void> _loadBiometricState() async {
    try {
      final isBiometricEnabled =
          await _tokenStorage.getBiometricEnabled() ?? false;
      state = isBiometricEnabled;
    } catch (e) {
      state = false;
    }
  }

  /// 생체인증 활성화
  Future<void> enableBiometric() async {
    try {
      await _tokenStorage.setBiometricEnabled(true);
      state = true;
    } catch (e) {
      rethrow;
    }
  }

  /// 생체인증 비활성화
  Future<void> disableBiometric() async {
    try {
      await _tokenStorage.setBiometricEnabled(false);
      state = false;
    } catch (e) {
      rethrow;
    }
  }
}

// 🔐 생체인증 활성화 상태 Provider
final biometricEnabledProvider =
    NotifierProvider<BiometricEnabledNotifier, bool>(
        BiometricEnabledNotifier.new);

// 🔐 생체인증 실행 Provider
final biometricAuthenticateProvider =
    FutureProvider.family<BiometricResult, String>(
  (ref, reason) async {
    final biometricService = ref.watch(biometricServiceProvider);
    return await biometricService.authenticate(reason: reason);
  },
);

// 🔐 앱 잠금 상태 Notifier
//
// Riverpod 3.x Notifier 패턴 — 세션 타임아웃 + 사용자 활동 기록 포함
class AppLockNotifier extends Notifier<bool> {
  late final TokenStorage _tokenStorage;
  DateTime? _lastActivityTime;

  // 세션 타임아웃 (기본 30분, 사용자 설정 시 갱신)
  Duration _sessionTimeout = const Duration(minutes: 30);

  @override
  bool build() {
    _tokenStorage = TokenStorage();
    _loadLockState();
    _loadSessionTimeout();
    return false;
  }

  Future<void> _loadLockState() async {
    try {
      final isLocked = await _tokenStorage.getAppLocked() ?? false;
      state = isLocked;
    } catch (e) {
      state = false;
    }
  }

  Future<void> _loadSessionTimeout() async {
    try {
      final minutes = await _tokenStorage.getSessionTimeoutMinutes();
      _sessionTimeout = Duration(minutes: minutes);
    } catch (_) {
      _sessionTimeout = const Duration(minutes: 30);
    }
  }

  /// 앱 잠금 설정
  Future<void> lockApp() async {
    try {
      await _tokenStorage.setAppLocked(true);
      state = true;
    } catch (e) {
      rethrow;
    }
  }

  /// 앱 잠금 해제
  Future<void> unlockApp() async {
    try {
      await _tokenStorage.setAppLocked(false);
      state = false;
      _lastActivityTime = DateTime.now();
    } catch (e) {
      rethrow;
    }
  }

  /// 사용자 활동 기록 (자동 잠금용)
  void recordActivity() {
    _lastActivityTime = DateTime.now();
  }

  /// 세션 타임아웃 체크
  bool isSessionExpired() {
    if (_lastActivityTime == null) return false;
    final elapsed = DateTime.now().difference(_lastActivityTime!);
    return elapsed > _sessionTimeout;
  }
}

// 🔐 앱 잠금 상태 Provider
final appLockProvider =
    NotifierProvider<AppLockNotifier, bool>(AppLockNotifier.new);
