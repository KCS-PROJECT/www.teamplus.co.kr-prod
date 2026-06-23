import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'app_version_service.dart';

/// 현재 앱 버전 정보 Provider
final packageInfoProvider = FutureProvider<PackageInfo>((ref) async {
  return PackageInfo.fromPlatform();
});

/// 서버 최신 버전 정보 Provider
final serverVersionInfoProvider = FutureProvider<AppVersionInfo?>((ref) async {
  final service = AppVersionService();
  return service.fetchLatestVersionInfo();
});

/// 버전 비교 결과 Provider
///
/// 현재 앱 버전과 서버 버전을 비교하여 업데이트 필요 여부를 반환합니다.
/// null → 버전 정보 조회 실패 (네트워크 오류 등, 업데이트 불필요 취급)
final versionCompareResultProvider =
    FutureProvider<_VersionCheckResult?>((ref) async {
  final packageInfo = await ref.watch(packageInfoProvider.future);
  final serverInfo = await ref.watch(serverVersionInfoProvider.future);

  if (serverInfo == null) {
    // 서버 정보 조회 실패 → 업데이트 체크 스킵 (사용자 경험 우선)
    return null;
  }

  final service = AppVersionService();
  final result = service.compareVersions(
    currentVersion: packageInfo.version,
    info: serverInfo,
  );

  return _VersionCheckResult(
    compareResult: result,
    versionInfo: serverInfo.copyWith(currentVersion: packageInfo.version),
  );
});

/// 버전 체크 결과 모델
class _VersionCheckResult {
  final VersionCompareResult compareResult;
  final AppVersionInfo versionInfo;

  const _VersionCheckResult({
    required this.compareResult,
    required this.versionInfo,
  });
}

/// 공개용 버전 체크 결과 타입 (외부 접근용)
typedef VersionCheckResult = _VersionCheckResult;

/// AppVersionInfo 확장 (copyWith)
extension AppVersionInfoX on AppVersionInfo {
  AppVersionInfo copyWith({
    String? currentVersion,
    String? minimumVersion,
    String? latestVersion,
    bool? forceUpdate,
    String? updateMessage,
    String? iosStoreUrl,
    String? androidStoreUrl,
  }) {
    return AppVersionInfo(
      currentVersion: currentVersion ?? this.currentVersion,
      minimumVersion: minimumVersion ?? this.minimumVersion,
      latestVersion: latestVersion ?? this.latestVersion,
      forceUpdate: forceUpdate ?? this.forceUpdate,
      updateMessage: updateMessage ?? this.updateMessage,
      iosStoreUrl: iosStoreUrl ?? this.iosStoreUrl,
      androidStoreUrl: androidStoreUrl ?? this.androidStoreUrl,
    );
  }
}
