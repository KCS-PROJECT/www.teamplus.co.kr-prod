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
/// GET /api/v1/app/versions/latest?platform=ios|android 응답 구조:
/// {
///   "currentVersion": "1.0.0",
///   "minimumVersion": "1.0.0",
///   "latestVersion": "1.1.0",
///   "forceUpdate": false,
///   "updateMessage": "새로운 기능이 추가되었습니다.",
///   "iosStoreUrl": "https://apps.apple.com/...",
///   "androidStoreUrl": "https://play.google.com/..."
/// }
///
/// `platform` 파라미터로 자기 플랫폼을 밝히면 서버가 **해당 플랫폼 행**의
/// 값으로 판정 기준(latest/minimum/force)을 내려준다 — iOS 행이 Android
/// 판정을 덮어쓰던 서버 병합 문제의 클라이언트측 대응.
class AppVersionService {
  static const String _versionEndpoint = '/app/versions/latest';

  final Dio _dio;
  final TargetPlatform? _platformOverride;

  AppVersionService({Dio? dio, TargetPlatform? platformOverride})
      : _platformOverride = platformOverride,
        _dio = dio ??
            Dio(BaseOptions(
              baseUrl: ApiConstants.baseUrl,
              connectTimeout: const Duration(seconds: 10),
              receiveTimeout: const Duration(seconds: 10),
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
              },
            ));

  /// 서버에 전달할 플랫폼 식별자 ('ios' | 'android').
  ///
  /// 모바일 전용 앱이므로 iOS 외 타깃은 android 로 귀결시킨다.
  /// 테스트에서는 [platformOverride] 로 고정 가능.
  String get _platformName =>
      (_platformOverride ?? defaultTargetPlatform) == TargetPlatform.iOS
          ? 'ios'
          : 'android';

  /// 최신 버전 정보 가져오기 (자기 플랫폼 기준 판정값)
  Future<AppVersionInfo?> fetchLatestVersionInfo() async {
    try {
      final response = await _dio.get(
        _versionEndpoint,
        queryParameters: {'platform': _platformName},
      );
      if (response.statusCode == 200 && response.data != null) {
        final raw = response.data;
        if (raw is! Map<String, dynamic>) return null;
        // 서버 전역 ResponseEnvelopeInterceptor 가 { success, requestId, data }
        // 로 래핑한다 — 실제 버전 정보는 data 내부. 최상위에서 읽으면 전부
        // 기본값(0.0.0)이 되어 게이트가 조용히 무력화된다(2026-07-30 실증).
        // 비래핑 응답도 방어적으로 허용 (shared_providers 동일 관례).
        final body = raw['data'] is Map<String, dynamic>
            ? raw['data'] as Map<String, dynamic>
            : raw;
        return AppVersionInfo.fromJson(body);
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

  /// 버전 비교 (순수 함수 — Dio/환경 의존 없음, 정적).
  ///
  /// [currentVersion]: 현재 앱 버전 (예: "1.0.0")
  /// [info]: 서버에서 받은 버전 정보
  static VersionCompareResult compareVersions({
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
  static List<int> _parseVersion(String version) {
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
  static bool _isLowerThan(List<int> a, List<int> b) {
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
