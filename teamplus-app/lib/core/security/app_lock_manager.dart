import 'package:flutter/foundation.dart';
import '../auth/token_storage.dart';

/// 앱 잠금 관리자
///
/// 책임:
/// 1. 로그아웃 후 생체인증 잠금 설정
/// 2. 세션 타임아웃 감지 (30분)
/// 3. 앱 재개 시 잠금 상태 확인
class AppLockManager {
  static final AppLockManager _instance = AppLockManager._internal();

  factory AppLockManager() => _instance;

  AppLockManager._internal();

  final TokenStorage _tokenStorage = TokenStorage();

  /// 세션 타임아웃 시간 (기본 30분, 사용자 설정 시 갱신)
  Duration _sessionTimeout = const Duration(minutes: 30);
  Duration get sessionTimeout => _sessionTimeout;

  /// 마지막 활동 시간
  DateTime? _lastActivityTime;

  /// 생체인증 활성화 여부
  bool _biometricEnabled = false;

  /// 🔐 초기화 (앱 시작 시 호출)
  Future<void> initialize() async {
    try {
      await _loadBiometricState();
      await _loadSessionTimeout();
      recordActivity();
    } catch (e) {
      debugPrint('[AppLockManager] 초기화 오류: $e');
    }
  }

  /// 생체인증 상태 로드
  Future<void> _loadBiometricState() async {
    try {
      _biometricEnabled = await _tokenStorage.getBiometricEnabled() ?? false;
    } catch (e) {
      debugPrint('[AppLockManager] 생체인증 상태 로드 오류: $e');
      _biometricEnabled = false;
    }
  }

  /// 자동 잠금 타임아웃 로드 (저장값 또는 기본 30분)
  Future<void> _loadSessionTimeout() async {
    try {
      final minutes = await _tokenStorage.getSessionTimeoutMinutes();
      _sessionTimeout = Duration(minutes: minutes);
    } catch (e) {
      debugPrint('[AppLockManager] 세션 타임아웃 로드 오류: $e');
      _sessionTimeout = const Duration(minutes: 30);
    }
  }

  /// 자동 잠금 타임아웃 변경 (ProfileSecurityScreen 에서 호출)
  Future<void> setSessionTimeoutMinutes(int minutes) async {
    try {
      await _tokenStorage.setSessionTimeoutMinutes(minutes);
      _sessionTimeout = Duration(minutes: minutes);
      recordActivity();
      debugPrint('[AppLockManager] 자동 잠금 타임아웃: $minutes분');
    } catch (e) {
      debugPrint('[AppLockManager] 타임아웃 변경 오류: $e');
    }
  }

  /// 사용자 활동 기록
  /// 이 메서드는 주요 사용자 활동 시 호출됨:
  /// - 화면 전환
  /// - 터치 이벤트
  /// - 키보드 입력
  void recordActivity() {
    _lastActivityTime = DateTime.now();
    debugPrint('[AppLockManager] 활동 기록: ${_lastActivityTime!}');
  }

  /// 세션이 만료되었는지 확인
  bool isSessionExpired() {
    if (_lastActivityTime == null) return false;

    final elapsed = DateTime.now().difference(_lastActivityTime!);
    final isExpired = elapsed > sessionTimeout;

    if (isExpired) {
      debugPrint(
        '[AppLockManager] 세션 만료됨 (경과시간: ${elapsed.inMinutes}분)',
      );
    }

    return isExpired;
  }

  /// 앱 재개 시 잠금이 필요한지 확인
  ///
  /// Returns:
  /// - true: 생체인증 프롬프트 표시 필요
  /// - false: 프롬프트 불필요 (계속 진행)
  Future<bool> shouldShowBiometricLock() async {
    try {
      // 1. 생체인증 활성화 여부 확인
      if (!_biometricEnabled) {
        debugPrint('[AppLockManager] 생체인증 비활성화됨');
        return false;
      }

      // 2. 세션 타임아웃 확인
      if (isSessionExpired()) {
        debugPrint('[AppLockManager] 세션 타임아웃 - 생체인증 잠금 필요');
        return true;
      }

      // 3. 앱 잠금 상태 확인
      final isLocked = await _tokenStorage.getAppLocked() ?? false;
      if (isLocked) {
        debugPrint('[AppLockManager] 앱이 잠잠 상태 - 생체인증 필요');
        return true;
      }

      return false;
    } catch (e) {
      debugPrint('[AppLockManager] 잠금 상태 확인 오류: $e');
      return false;
    }
  }

  /// 로그아웃 후 앱 잠금 활성화
  ///
  /// 로그아웃 시 호출되어야 함:
  /// 1. 생체인증이 활성화된 경우
  /// 2. 토큰 삭제 이후
  /// 3. UI가 로그인 화면으로 전환되기 전
  Future<void> lockAppAfterLogout() async {
    try {
      // 생체인증이 활성화된 경우에만 잠금
      if (_biometricEnabled) {
        await _tokenStorage.setAppLocked(true);
        _lastActivityTime = DateTime.now();
        debugPrint('[AppLockManager] 로그아웃 후 앱 잠금 활성화');
      } else {
        debugPrint('[AppLockManager] 생체인증 비활성화 - 앱 잠금 미적용');
      }
    } catch (e) {
      debugPrint('[AppLockManager] 앱 잠금 오류: $e');
    }
  }

  /// 생체인증 성공 후 앱 잠금 해제
  ///
  /// BiometricPromptScreen에서 인증 성공 시 호출
  Future<void> unlockAppAfterBiometric() async {
    try {
      await _tokenStorage.setAppLocked(false);
      recordActivity();
      debugPrint('[AppLockManager] 생체인증 성공 - 앱 잠금 해제');
    } catch (e) {
      debugPrint('[AppLockManager] 앱 잠금 해제 오류: $e');
    }
  }

  /// 생체인증 활성화 상태 변경
  ///
  /// BiometricSettingsScreen에서 토글 변경 시 호출
  Future<void> setBiometricEnabled(bool enabled) async {
    try {
      await _tokenStorage.setBiometricEnabled(enabled);
      _biometricEnabled = enabled;
      debugPrint(
        '[AppLockManager] 생체인증 ${enabled ? "활성화" : "비활성화"}됨',
      );
    } catch (e) {
      debugPrint('[AppLockManager] 생체인증 상태 변경 오류: $e');
    }
  }

  /// 현재 잠금 상태 정보 (디버그용)
  Future<Map<String, dynamic>> getDebugInfo() async {
    try {
      final isLocked = await _tokenStorage.getAppLocked() ?? false;
      final isBiometricEnabled =
          await _tokenStorage.getBiometricEnabled() ?? false;
      final isSessionExpired_ = isSessionExpired();

      return {
        'isLocked': isLocked,
        'isBiometricEnabled': isBiometricEnabled,
        'isSessionExpired': isSessionExpired_,
        'lastActivityTime': _lastActivityTime?.toIso8601String(),
        'sessionTimeoutMinutes': sessionTimeout.inMinutes,
        'shouldShowBiometricLock': await shouldShowBiometricLock(),
      };
    } catch (e) {
      return {'error': e.toString()};
    }
  }
}

/// 전역 AppLockManager 인스턴스
final appLockManager = AppLockManager();
