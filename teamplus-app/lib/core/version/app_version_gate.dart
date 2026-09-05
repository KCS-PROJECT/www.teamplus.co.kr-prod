import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../network/app_version_service.dart';
import '../storage/app_preferences_service.dart';

/// 버전 게이트가 앱 콜드스타트 시 내리는 결정.
///
/// SoT: docs/superpowers/specs/2026-07-24-app-version-update-gate-design.md
enum VersionGateAction {
  /// 아무 동작 없음 — 정상 진입.
  ///
  /// 최신 버전 · 서버 데이터 없음 · 네트워크 오류 · 스토어 URL 없음 · 24h 억제 중
  /// 어느 경우든 여기에 해당한다(전부 fail-open).
  none,

  /// 권장 업데이트 — 정상 진입 후 닫을 수 있는 다이얼로그(네 → 스토어 / 아니요 → 사용).
  promptOptional,

  /// 강제 업데이트 — 진입 차단 다이얼로그(네 → 스토어 / 앱 종료).
  promptForce,
}

/// 버전 게이트 판정 결과.
@immutable
class VersionGateDecision {
  final VersionGateAction action;

  /// [action] 이 prompt 계열일 때의 원본 비교 결과(다이얼로그 모드 결정용).
  final VersionCompareResult? compareResult;

  /// 다이얼로그 표시에 쓸 버전 정보(현재 버전은 디바이스 실측값으로 덮어씀).
  final AppVersionInfo? versionInfo;

  const VersionGateDecision.none()
      : action = VersionGateAction.none,
        compareResult = null,
        versionInfo = null;

  const VersionGateDecision.prompt({
    required this.action,
    required this.compareResult,
    required this.versionInfo,
  });

  bool get shouldPrompt => action != VersionGateAction.none;
}

/// 순수 판정 함수 — 네트워크·플랫폼·저장소 의존성을 인자로 받아 결정만 내린다.
///
/// 부작용이 없어 단위 테스트가 용이하다(실제 배선은 [AppVersionGate.evaluate]).
///
/// 규칙:
///  - 강제(현재 < minVersion 또는 서버 forceUpdate) → 유효 스토어 URL 이 있을 때만
///    차단. URL 이 없으면 사용자를 스토어로 보낼 수 없으므로 fail-open(none).
///  - 권장(현재 < latest, 강제 아님) → 유효 스토어 URL + 24h 미억제일 때만 노출.
///  - 그 외(최신) → none.
VersionGateDecision decideVersionGate({
  required String currentVersion,
  required AppVersionInfo info,
  required bool isIOS,
  required bool isSuppressed,
}) {
  final compareResult = AppVersionService.compareVersions(
    currentVersion: currentVersion,
    info: info,
  );

  final storeUrl = isIOS ? info.iosStoreUrl : info.androidStoreUrl;
  final hasValidStoreUrl = storeUrl != null && storeUrl.trim().isNotEmpty;

  // 다이얼로그 "현재: x" 표기는 서버가 준 currentVersion 이 아니라 디바이스 실측값.
  final displayInfo = info.copyWith(currentVersion: currentVersion);

  switch (compareResult) {
    case VersionCompareResult.forceUpdate:
      if (!hasValidStoreUrl) return const VersionGateDecision.none();
      return VersionGateDecision.prompt(
        action: VersionGateAction.promptForce,
        compareResult: compareResult,
        versionInfo: displayInfo,
      );
    case VersionCompareResult.optionalUpdate:
      if (!hasValidStoreUrl || isSuppressed) {
        return const VersionGateDecision.none();
      }
      return VersionGateDecision.prompt(
        action: VersionGateAction.promptOptional,
        compareResult: compareResult,
        versionInfo: displayInfo,
      );
    case VersionCompareResult.upToDate:
      return const VersionGateDecision.none();
  }
}

/// 앱 버전 업데이트 게이트.
///
/// 콜드스타트 시 서버 최신/최소 버전을 조회해 강제/권장/무동작을 판정하고,
/// "아니요(나중에)" 선택에 대한 24시간 억제를 로컬에 기록한다.
///
/// **영향 최소화(설계 §6)**: 어떤 예외/타임아웃이든 [VersionGateDecision.none] 으로
/// 귀결(fail-open)되어 정상 앱 진입을 절대 막지 않는다. 시스템 점검 게이트와 동일 정책.
class AppVersionGate {
  // 주입된 의존성만 보관하고 실제 인스턴스는 [evaluate] 내부(try/catch)에서 지연
  //   생성한다. AppVersionService 생성자는 Dio baseUrl 로 appEnv 를 읽으므로,
  //   여기서 eager 생성하면 appEnv 미초기화 상황(부팅 초기·테스트)에서 게이트 생성
  //   자체가 throw 한다. 지연 생성으로 그 오류까지 fail-open 범위에 포함시킨다.
  final AppVersionService? _injectedService;
  final AppPreferencesService? _injectedPrefs;

  AppVersionGate({
    AppVersionService? service,
    AppPreferencesService? prefs,
  })  : _injectedService = service,
        _injectedPrefs = prefs;

  AppVersionService get _service => _injectedService ?? AppVersionService();
  AppPreferencesService get _prefs => _injectedPrefs ?? AppPreferencesService();

  /// 서버 조회 상한(콜드스타트 UX 보호). 초과 시 fail-open.
  static const Duration _fetchTimeout = Duration(seconds: 5);

  /// "나중에" 억제 창.
  static const Duration _suppressWindow = Duration(hours: 24);

  bool get _isIOS => Platform.isIOS;

  /// 플랫폼·최신버전별 억제 키(예: "ios:1.2.0"). 새 버전이 나오면 키가 달라져
  /// 억제가 자연 해제된다.
  String _storeKey(String latestVersion) =>
      '${_isIOS ? 'ios' : 'android'}:$latestVersion';

  /// 콜드스타트 버전 판정. 실패는 모두 삼켜서 [VersionGateDecision.none] 반환.
  Future<VersionGateDecision> evaluate() async {
    try {
      final packageInfo = await PackageInfo.fromPlatform();
      final info = await _service
          .fetchLatestVersionInfo()
          .timeout(_fetchTimeout, onTimeout: () => null);
      if (info == null) return const VersionGateDecision.none();

      final suppressed = await _isOptionalSuppressed(info.latestVersion);
      return decideVersionGate(
        currentVersion: packageInfo.version,
        info: info,
        isIOS: _isIOS,
        isSuppressed: suppressed,
      );
    } catch (e) {
      debugPrint('[AppVersionGate] evaluate 실패 → fail-open(정상 진입): $e');
      return const VersionGateDecision.none();
    }
  }

  Future<bool> _isOptionalSuppressed(String latestVersion) async {
    try {
      final millis =
          await _prefs.getOptionalUpdateDismissedAt(_storeKey(latestVersion));
      if (millis == null) return false;
      final dismissedAt = DateTime.fromMillisecondsSinceEpoch(millis);
      return DateTime.now().difference(dismissedAt) < _suppressWindow;
    } catch (_) {
      // 억제 상태를 못 읽으면 안전측(노출).
      return false;
    }
  }

  /// 권장 업데이트 다이얼로그를 닫았을 때(나중에/바깥탭) 24h 억제 기록.
  Future<void> recordOptionalDismissed(String latestVersion) async {
    try {
      await _prefs.setOptionalUpdateDismissedAt(
        _storeKey(latestVersion),
        DateTime.now().millisecondsSinceEpoch,
      );
    } catch (e) {
      debugPrint('[AppVersionGate] 억제 저장 실패(무시): $e');
    }
  }
}

/// 앱 버전 게이트 Provider.
final appVersionGateProvider = Provider<AppVersionGate>(
  (ref) => AppVersionGate(),
);
