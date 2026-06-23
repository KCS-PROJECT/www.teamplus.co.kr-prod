import 'package:flutter/foundation.dart';
import 'package:hive_flutter/hive_flutter.dart';

/// 오프라인 캐시 서비스
/// Hive를 사용하여 핵심 데이터를 로컬에 캐싱
///
/// 캐싱 대상:
/// 1. 사용자 프로필 (userProfile)
/// 2. 수업 일정 (classSchedules)
/// 3. 출석 기록 (attendanceHistory)
/// 4. 알림 목록 (notifications)
///
/// 보안 참고:
/// - 민감 데이터(토큰, 비밀번호)는 flutter_secure_storage 사용
/// - 이 서비스는 비민감 데이터만 캐싱
class OfflineCacheService {
  // === Box 이름 상수 ===
  static const String _profileBox = 'profile_cache';
  static const String _schedulesBox = 'schedules_cache';
  static const String _attendanceBox = 'attendance_cache';
  static const String _notificationsBox = 'notifications_cache';
  static const String _metadataBox = 'cache_metadata';

  /// 모든 Box 이름 목록 (일괄 처리용)
  static const List<String> _allBoxNames = [
    _profileBox,
    _schedulesBox,
    _attendanceBox,
    _notificationsBox,
    _metadataBox,
  ];

  // === 메타데이터 키 접두사 ===
  static const String _timestampPrefix = '_ts_';

  /// Hive 초기화 및 Box 열기
  /// main.dart의 runApp 이전에 호출해야 함
  static Future<void> initialize() async {
    await Hive.initFlutter();

    // 모든 캐시 Box 열기
    for (final boxName in _allBoxNames) {
      await Hive.openBox(boxName);
    }

    if (kDebugMode) {
      debugPrint('[OfflineCache] 초기화 완료 - ${_allBoxNames.length}개 Box 열림');
    }
  }

  // =========================================================================
  // 범용 캐시 API
  // =========================================================================

  /// 데이터 캐싱 (JSON Map 형태로 저장)
  ///
  /// [boxName] - 저장할 Box 이름 (_profileBox, _schedulesBox 등)
  /// [key] - 캐시 키
  /// [data] - 저장할 데이터 (Map, List, String, int, double, bool 지원)
  Future<void> cacheData(String boxName, String key, dynamic data) async {
    try {
      final box = Hive.box(boxName);
      await box.put(key, data);

      // 메타데이터 Box에 타임스탬프 기록
      final metaBox = Hive.box(_metadataBox);
      await metaBox.put(
        '$_timestampPrefix${boxName}_$key',
        DateTime.now().millisecondsSinceEpoch,
      );

      if (kDebugMode) {
        debugPrint('[OfflineCache] 캐시 저장: $boxName/$key');
      }
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[OfflineCache] 캐시 저장 실패: $boxName/$key - $e');
      }
    }
  }

  /// 캐시 데이터 조회
  ///
  /// 데이터가 없으면 null 반환
  dynamic getCachedData(String boxName, String key) {
    try {
      final box = Hive.box(boxName);
      final data = box.get(key);

      if (kDebugMode) {
        debugPrint(
          '[OfflineCache] 캐시 조회: $boxName/$key - ${data != null ? "HIT" : "MISS"}',
        );
      }

      return data;
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[OfflineCache] 캐시 조회 실패: $boxName/$key - $e');
      }
      return null;
    }
  }

  /// 캐시 유효성 확인 (TTL 기반)
  ///
  /// [ttl] - 캐시 유효 기간 (기본 24시간)
  /// 반환: true = 유효, false = 만료 또는 없음
  bool isCacheValid(
    String boxName,
    String key, {
    Duration ttl = const Duration(hours: 24),
  }) {
    try {
      final metaBox = Hive.box(_metadataBox);
      final timestamp = metaBox.get('$_timestampPrefix${boxName}_$key');

      if (timestamp == null) return false;

      final cachedAt = DateTime.fromMillisecondsSinceEpoch(timestamp as int);
      final isValid = DateTime.now().difference(cachedAt) < ttl;

      if (kDebugMode) {
        final age = DateTime.now().difference(cachedAt);
        debugPrint(
          '[OfflineCache] TTL 확인: $boxName/$key - '
          '${isValid ? "유효" : "만료"} (age: ${age.inMinutes}분, ttl: ${ttl.inMinutes}분)',
        );
      }

      return isValid;
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[OfflineCache] TTL 확인 실패: $boxName/$key - $e');
      }
      return false;
    }
  }

  /// 특정 Box의 모든 캐시 클리어
  Future<void> clearCache(String boxName) async {
    try {
      final box = Hive.box(boxName);
      await box.clear();

      // 해당 Box의 메타데이터도 정리
      final metaBox = Hive.box(_metadataBox);
      final keysToRemove = metaBox.keys
          .where((k) => k.toString().contains('${boxName}_'))
          .toList();
      for (final key in keysToRemove) {
        await metaBox.delete(key);
      }

      if (kDebugMode) {
        debugPrint('[OfflineCache] 캐시 클리어: $boxName');
      }
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[OfflineCache] 캐시 클리어 실패: $boxName - $e');
      }
    }
  }

  /// 전체 캐시 클리어 (로그아웃 시 호출)
  Future<void> clearAllCaches() async {
    try {
      for (final boxName in _allBoxNames) {
        final box = Hive.box(boxName);
        await box.clear();
      }

      if (kDebugMode) {
        debugPrint('[OfflineCache] 전체 캐시 클리어 완료');
      }
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[OfflineCache] 전체 캐시 클리어 실패: $e');
      }
    }
  }

  /// 캐시 전체 통계 (디버깅용)
  Map<String, int> getCacheStats() {
    final stats = <String, int>{};
    for (final boxName in _allBoxNames) {
      try {
        final box = Hive.box(boxName);
        stats[boxName] = box.length;
      } catch (_) {
        stats[boxName] = -1;
      }
    }
    return stats;
  }

  // =========================================================================
  // 프로필 캐시 헬퍼
  // =========================================================================

  /// 사용자 프로필 캐싱
  Future<void> cacheProfile(Map<String, dynamic> profile) async {
    await cacheData(_profileBox, 'current_user', profile);
  }

  /// 캐시된 사용자 프로필 조회
  Map<String, dynamic>? getCachedProfile() {
    final data = getCachedData(_profileBox, 'current_user');
    if (data == null) return null;
    return Map<String, dynamic>.from(data as Map);
  }

  /// 프로필 캐시 유효 여부 (TTL: 1시간)
  bool isProfileCacheValid() {
    return isCacheValid(
      _profileBox,
      'current_user',
      ttl: const Duration(hours: 1),
    );
  }

  // =========================================================================
  // 수업 일정 캐시 헬퍼
  // =========================================================================

  /// 수업 일정 캐싱 (월별)
  ///
  /// [month] - "2026-04" 형식
  /// [schedules] - 수업 일정 목록
  Future<void> cacheSchedules(
    String month,
    List<Map<String, dynamic>> schedules,
  ) async {
    // List<Map>을 Hive가 직렬화할 수 있도록 변환
    final serializable =
        schedules.map((s) => Map<String, dynamic>.from(s)).toList();
    await cacheData(_schedulesBox, 'month_$month', serializable);
  }

  /// 캐시된 수업 일정 조회 (월별)
  List<Map<String, dynamic>>? getCachedSchedules(String month) {
    final data = getCachedData(_schedulesBox, 'month_$month');
    if (data == null) return null;
    return (data as List)
        .map((item) => Map<String, dynamic>.from(item as Map))
        .toList();
  }

  /// 수업 일정 캐시 유효 여부 (TTL: 6시간)
  bool isSchedulesCacheValid(String month) {
    return isCacheValid(
      _schedulesBox,
      'month_$month',
      ttl: const Duration(hours: 6),
    );
  }

  // =========================================================================
  // 출석 기록 캐시 헬퍼
  // =========================================================================

  /// 출석 기록 캐싱
  ///
  /// [userId] - 사용자 ID
  /// [records] - 출석 기록 목록
  Future<void> cacheAttendance(
    String userId,
    List<Map<String, dynamic>> records,
  ) async {
    final serializable =
        records.map((r) => Map<String, dynamic>.from(r)).toList();
    await cacheData(_attendanceBox, 'user_$userId', serializable);
  }

  /// 캐시된 출석 기록 조회
  List<Map<String, dynamic>>? getCachedAttendance(String userId) {
    final data = getCachedData(_attendanceBox, 'user_$userId');
    if (data == null) return null;
    return (data as List)
        .map((item) => Map<String, dynamic>.from(item as Map))
        .toList();
  }

  /// 출석 기록 캐시 유효 여부 (TTL: 12시간)
  bool isAttendanceCacheValid(String userId) {
    return isCacheValid(
      _attendanceBox,
      'user_$userId',
      ttl: const Duration(hours: 12),
    );
  }

  // =========================================================================
  // 알림 캐시 헬퍼
  // =========================================================================

  /// 알림 목록 캐싱
  Future<void> cacheNotifications(
    List<Map<String, dynamic>> notifications,
  ) async {
    final serializable =
        notifications.map((n) => Map<String, dynamic>.from(n)).toList();
    await cacheData(_notificationsBox, 'list', serializable);
  }

  /// 캐시된 알림 목록 조회
  List<Map<String, dynamic>>? getCachedNotifications() {
    final data = getCachedData(_notificationsBox, 'list');
    if (data == null) return null;
    return (data as List)
        .map((item) => Map<String, dynamic>.from(item as Map))
        .toList();
  }

  /// 알림 캐시 유효 여부 (TTL: 30분)
  bool isNotificationsCacheValid() {
    return isCacheValid(
      _notificationsBox,
      'list',
      ttl: const Duration(minutes: 30),
    );
  }
}
