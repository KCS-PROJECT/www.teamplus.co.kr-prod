import 'package:flutter/foundation.dart';
import 'package:flutter_jailbreak_detection/flutter_jailbreak_detection.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

import '../logging/app_logger.dart';

/// 루팅(Android) / 탈옥(iOS) 단말 감지 서비스
///
/// **정책 (보수적 — surface & monitor, NOT hard-block)**:
///   - 루팅/탈옥 단말이라도 앱을 강제 종료하거나 차단하지 **않는다**.
///   - 대신 감지 시 SEVERE 로그 + Sentry 리포트로 **표면화·모니터링**만 수행한다.
///   - 정상 사용자의 오탐(false positive)으로 인한 앱 사용 불가를 피하기 위함.
///
/// **release 전용**:
///   - debug/profile 빌드는 에뮬레이터·루팅 개발 단말 사용이 흔하므로 체크하지 않는다.
///   - `kReleaseMode` 가드로 release 빌드에서만 실제 검사·보고한다.
///
/// **안전성**:
///   - `flutter_jailbreak_detection` 플러그인은 미지원 플랫폼(web/desktop)이나
///     채널 미연결 시 예외를 던질 수 있으므로 전 구간 try/catch 로 감싼다.
///   - 어떤 예외도 앱 부팅/실행 흐름을 절대 차단하지 않는다 (graceful degrade).
///
/// **사용**: main.dart `_deferredInit()` 백그라운드 init 에서 `checkAndReport()` 호출.
class JailbreakDetectionService {
  static final JailbreakDetectionService _instance =
      JailbreakDetectionService._internal();
  factory JailbreakDetectionService() => _instance;
  JailbreakDetectionService._internal();

  /// 단말 무결성 손상 여부 (루팅/탈옥) 조회.
  ///
  /// - 반환 `true`: 루팅/탈옥 단말로 판단됨.
  /// - 반환 `false`: 정상 단말 **또는** 플러그인 미지원/예외 (보수적 — 오탐 차단 방지).
  ///
  /// 차단 로직 없이 단순 조회 용도로도 외부에서 호출 가능.
  Future<bool> isCompromised() async {
    try {
      return await FlutterJailbreakDetection.jailbroken;
    } catch (e) {
      // 미지원 플랫폼 / 채널 미연결 — 보수적으로 정상(false) 처리하여 차단 회피.
      if (kDebugMode) {
        debugPrint('[Security] 탈옥 감지 조회 실패 (정상 처리): $e');
      }
      return false;
    }
  }

  /// release 빌드에서 루팅/탈옥을 검사하고, 감지 시 SEVERE 로그 + Sentry 리포트.
  ///
  /// 절대 앱을 차단/종료하지 않으며, 모든 예외를 흡수한다 (fire-and-forget 안전).
  Future<void> checkAndReport() async {
    // release 외 빌드는 검사하지 않음 — 개발/QA 단말 오탐 방지.
    if (!kReleaseMode) return;

    try {
      final jailbroken = await FlutterJailbreakDetection.jailbroken;

      // developerMode 는 iOS 미지원 등으로 예외 가능 — 부가 정보로만 수집.
      bool developerMode = false;
      try {
        developerMode = await FlutterJailbreakDetection.developerMode;
      } catch (_) {
        /* 부가 신호 — 실패해도 무시 */
      }

      // 정상 단말 — 조용히 종료 (노이즈 방지).
      if (!jailbroken) return;

      final context = <String, dynamic>{
        'jailbroken': jailbroken,
        'developerMode': developerMode,
        'platform': defaultTargetPlatform.name,
        'severity': 'SEVERE',
      };

      // 1) SEVERE 로그 — client 카테고리(단말 측 무결성 이슈)로 명시 분류.
      AppLogger.instance.errorAs(
        ErrorCategory.client,
        '[Security] 루팅/탈옥 단말 감지 (surface & monitor)',
        context: context,
      );

      // 2) Sentry 리포트 — SENTRY_DSN 미설정 시 Sentry 미초기화 → try/catch no-op.
      try {
        Sentry.captureMessage(
          '[Security] Jailbreak/Root detected',
          level: SentryLevel.fatal,
          withScope: (scope) {
            scope.setTag('type', 'JAILBREAK_DETECTED');
            scope.setTag('platform', defaultTargetPlatform.name);
            scope.setContexts('device_integrity', context);
          },
        );
      } catch (_) {
        /* Sentry 미초기화 시 무시 */
      }
    } catch (e) {
      // 플러그인/채널 예외 — 부팅 흐름을 절대 막지 않음.
      AppLogger.instance.warn('[Security] 탈옥 감지 체크 실패 (무시): $e');
    }
  }
}
