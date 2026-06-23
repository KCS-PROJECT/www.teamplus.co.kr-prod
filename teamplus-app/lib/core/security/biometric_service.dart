import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:local_auth/local_auth.dart';

/// 생체인증 가용성 상태
enum BiometricAvailability {
  /// 생체인증 사용 가능
  available,

  /// 생체인증 설정되지 않음 (기기는 지원하지만 설정 필요)
  notAvailable,

  /// 생체인증 미지원 (기기에서 지원하지 않음)
  unavailable,
}

/// 생체인증 결과
enum BiometricResult {
  /// 인증 성공
  success,

  /// 인증 실패 (지문/얼굴 일치 안 함)
  failed,

  /// 계정 잠금 (실패 횟수 초과)
  locked,

  /// 사용자 취소
  userCancelled,

  /// 기기에서 지원하지 않음
  deviceNotSupported,

  /// 알수 없는 오류
  unknown,
}

/// 생체인증 서비스
///
/// iOS: Face ID, Touch ID
/// Android: BiometricPrompt (지문, 얼굴 등)
///
/// 사용 흐름:
/// 1. checkAvailability() - 가용성 확인
/// 2. authenticate() - 인증 수행
/// 3. 결과 처리
class BiometricService {
  static final LocalAuthentication _localAuth = LocalAuthentication();

  /// 생체인증 가용성 확인
  ///
  /// @return BiometricAvailability 상태
  /// - available: 사용 가능
  /// - notAvailable: 설정되지 않음
  /// - unavailable: 기기 미지원
  Future<BiometricAvailability> checkAvailability() async {
    try {
      // 1. 기기 지원 여부 확인
      final isDeviceSupported = await _localAuth.canCheckBiometrics;
      if (!isDeviceSupported) {
        debugPrint('[Biometric] Device does not support biometrics');
        return BiometricAvailability.unavailable;
      }

      // 2. 사용 가능한 생체인증 목록 확인
      final availableBiometrics = await _localAuth.getAvailableBiometrics();
      debugPrint('[Biometric] Available biometrics: $availableBiometrics');

      if (availableBiometrics.isEmpty) {
        debugPrint('[Biometric] No biometrics enrolled');
        return BiometricAvailability.notAvailable;
      }

      return BiometricAvailability.available;
    } catch (e) {
      debugPrint('[Biometric] Error checking availability: $e');
      return BiometricAvailability.unavailable;
    }
  }

  /// 생체인증 수행
  ///
  /// @param reason 사용자에게 표시할 인증 이유
  /// @return BiometricResult 인증 결과
  ///
  /// @example
  /// final result = await biometricService.authenticate(
  ///   reason: '로그인하려면 생체인증이 필요합니다',
  /// );
  /// if (result == BiometricResult.success) {
  ///   // 인증 성공
  /// }
  Future<BiometricResult> authenticate({
    required String reason,
  }) async {
    try {
      // 1. 가용성 재확인
      final availability = await checkAvailability();
      if (availability != BiometricAvailability.available) {
        return BiometricResult.deviceNotSupported;
      }

      // 2. 생체인증 수행 (local_auth 3.x API)
      // - persistAcrossBackgrounding: 2.x stickyAuth 대체
      // - sensitiveTransaction: PIN/패턴 입력 fallback 옵션 표시
      // - useErrorDialogs 는 3.x 에서 제거 (항상 false 동작)
      final isAuthenticated = await _localAuth.authenticate(
        localizedReason: reason,
        persistAcrossBackgrounding: true,
        sensitiveTransaction: true,
      );

      debugPrint('[Biometric] Authentication result: $isAuthenticated');
      return isAuthenticated ? BiometricResult.success : BiometricResult.failed;
    } on PlatformException catch (e) {
      // 플랫폼 예외 처리
      debugPrint('[Biometric] PlatformException: ${e.code} - ${e.message}');
      return _handlePlatformException(e);
    } catch (e) {
      debugPrint('[Biometric] Unexpected error: $e');
      return BiometricResult.unknown;
    }
  }

  /// 플랫폼 예외 처리
  ///
  /// 특정 오류 코드를 BiometricResult로 매핑
  BiometricResult _handlePlatformException(PlatformException e) {
    final code = e.code.toLowerCase();

    // Android 오류 코드
    if (code.contains('lockout')) {
      return BiometricResult.locked; // 계정 잠금
    }
    if (code.contains('user_cancel') || code.contains('userintentcancel')) {
      return BiometricResult.userCancelled; // 사용자 취소
    }
    if (code.contains('notavailable') || code.contains('nodevice')) {
      return BiometricResult.deviceNotSupported; // 기기 미지원
    }

    // iOS 오류 코드
    if (code == 'NotAvailable') {
      return BiometricResult.deviceNotSupported;
    }
    if (code == 'UserCancel') {
      return BiometricResult.userCancelled;
    }
    if (code == 'UserFallback') {
      return BiometricResult.userCancelled;
    }
    if (code == 'SystemIsLocked') {
      return BiometricResult.locked;
    }

    // 기타
    return BiometricResult.failed;
  }

  /// 사용 가능한 생체인증 목록 조회
  ///
  /// @return `List<BiometricType>`
  /// - BiometricType.face: 얼굴인식
  /// - BiometricType.fingerprint: 지문
  /// - BiometricType.iris: 홍채 (드문 경우)
  Future<List<BiometricType>> getAvailableBiometrics() async {
    try {
      final isDeviceSupported = await _localAuth.canCheckBiometrics;
      if (!isDeviceSupported) {
        return [];
      }

      return await _localAuth.getAvailableBiometrics();
    } catch (e) {
      debugPrint('[Biometric] Error getting available biometrics: $e');
      return [];
    }
  }

  /// 생체인증을 사용할 수 있는지 확인 (간단한 버전)
  ///
  /// @return true if biometrics are available and enrolled
  Future<bool> canUseBiometrics() async {
    final availability = await checkAvailability();
    return availability == BiometricAvailability.available;
  }

  /// 생체인증 상태 정보 조회 (디버그용)
  ///
  /// @return {available, enrolledBiometrics}
  Future<Map<String, dynamic>> getStatus() async {
    try {
      final availability = await checkAvailability();
      final biometrics = await getAvailableBiometrics();

      return {
        'available': availability == BiometricAvailability.available,
        'availabilityStatus': availability.toString(),
        'enrolledBiometrics':
            biometrics.map((b) => b.toString().split('.').last).toList(),
      };
    } catch (e) {
      debugPrint('[Biometric] Error getting status: $e');
      return {
        'available': false,
        'error': e.toString(),
      };
    }
  }
}

/// 전역 BiometricService 인스턴스
final biometricService = BiometricService();
