import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../constants/api_constants.dart';

/// 앱 버전 정보 모델
class AppVersionInfo {
  final String currentVersion;
  final String minimumVersion;
  final String latestVersion;
  final bool forceUpdate;
  final String? updateMessage;
  final String? iosStoreUrl;
  final String? androidStoreUrl;

  const AppVersionInfo({
    required this.currentVersion,
    required this.minimumVersion,
    required this.latestVersion,
    required this.forceUpdate,
    this.updateMessage,
    this.iosStoreUrl,
    this.androidStoreUrl,
  });

  factory AppVersionInfo.fromJson(Map<String, dynamic> json) {
    return AppVersionInfo(
      currentVersion: json['currentVersion'] as String? ?? '0.0.0',
      minimumVersion: json['minimumVersion'] as String? ?? '0.0.0',
      latestVersion: json['latestVersion'] as String? ?? '0.0.0',
      forceUpdate: json['forceUpdate'] as bool? ?? false,
      updateMessage: json['updateMessage'] as String?,
      iosStoreUrl: json['iosStoreUrl'] as String?,
      androidStoreUrl: json['androidStoreUrl'] as String?,
    );
  }
}

/// 버전 비교 결과
enum VersionCompareResult {
  /// 현재 버전 >= 최신 버전 (업데이트 불필요)
  upToDate,

  /// 현재 버전 < 최신 버전, >= 최소 버전 (선택적 업데이트)
  optionalUpdate,

  /// 현재 버전 < 최소 버전 (강제 업데이트)
  forceUpdate,
}

/// 앱 버전 체크 서비스
///
/// GET /api/v1/app/versions/latest 응답 구조:
/// {
///   "currentVersion": "1.0.0",
///   "minimumVersion": "1.0.0",
///   "latestVersion": "1.1.0",
///   "forceUpdate": false,
///   "updateMessage": "새로운 기능이 추가되었습니다.",
///   "iosStoreUrl": "https://apps.apple.com/...",
///   "androidStoreUrl": "https://play.google.com/..."
/// }
class AppVersionService {
  static const String _versionEndpoint = '/app/versions/latest';

  final Dio _dio;

  AppVersionService({Dio? dio})
      : _dio = dio ??
            Dio(BaseOptions(
              baseUrl: ApiConstants.baseUrl,
              connectTimeout: const Duration(seconds: 10),
              receiveTimeout: const Duration(seconds: 10),
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
              },
            ));

  /// 최신 버전 정보 가져오기
  Future<AppVersionInfo?> fetchLatestVersionInfo() async {
    try {
      final response = await _dio.get(_versionEndpoint);
      if (response.statusCode == 200 && response.data != null) {
        return AppVersionInfo.fromJson(response.data as Map<String, dynamic>);
      }
      return null;
    } on DioException catch (e) {
      debugPrint(
          '[AppVersionService] 버전 정보 조회 실패 (DioException): ${e.message}');
      return null;
    } catch (e) {
      debugPrint('[AppVersionService] 버전 정보 조회 실패: $e');
      return null;
    }
  }

  /// 버전 비교
  ///
  /// [currentVersion]: 현재 앱 버전 (예: "1.0.0")
  /// [info]: 서버에서 받은 버전 정보
  VersionCompareResult compareVersions({
    required String currentVersion,
    required AppVersionInfo info,
  }) {
    final current = _parseVersion(currentVersion);
    final minimum = _parseVersion(info.minimumVersion);
    final latest = _parseVersion(info.latestVersion);

    // 현재 버전 < 최소 버전 → 강제 업데이트
    if (_isLowerThan(current, minimum) || info.forceUpdate) {
      return VersionCompareResult.forceUpdate;
    }

    // 현재 버전 < 최신 버전 → 선택적 업데이트
    if (_isLowerThan(current, latest)) {
      return VersionCompareResult.optionalUpdate;
    }

    return VersionCompareResult.upToDate;
  }

  /// 버전 문자열을 정수 배열로 파싱
  /// "1.2.3" → [1, 2, 3]
  List<int> _parseVersion(String version) {
    try {
      // "1.0.0+1" 같은 형식에서 '+' 이후 빌드 번호 제거
      final cleanVersion = version.split('+').first.trim();
      return cleanVersion
          .split('.')
          .map((s) => int.tryParse(s.trim()) ?? 0)
          .toList();
    } catch (_) {
      return [0, 0, 0];
    }
  }

  /// a < b 여부 확인 (버전 비교)
  bool _isLowerThan(List<int> a, List<int> b) {
    final len = [a.length, b.length].reduce((x, y) => x > y ? x : y);
    for (var i = 0; i < len; i++) {
      final aVal = i < a.length ? a[i] : 0;
      final bVal = i < b.length ? b[i] : 0;
      if (aVal < bVal) return true;
      if (aVal > bVal) return false;
    }
    return false; // 동일 버전
  }
}
