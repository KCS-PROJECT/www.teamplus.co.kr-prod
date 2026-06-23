import 'dart:convert';

import 'package:drift/drift.dart';

import '../local_database.dart';
import '../tables/attendance_cache_table.dart';

part 'attendance_cache_dao.g.dart';

/// 출석 기록 캐시 DAO (Hive `attendance_cache` Box 1:1 변환).
///
/// 키 형식: 'user_42'. TTL 12시간.
@DriftAccessor(tables: [AttendanceCache])
class AttendanceCacheDao extends DatabaseAccessor<LocalDatabase>
    with _$AttendanceCacheDaoMixin {
  AttendanceCacheDao(super.db);

  static const Duration defaultTtl = Duration(hours: 12);

  String _userKey(String userId) => 'user_$userId';

  Future<void> saveForUser(
    String userId,
    List<Map<String, dynamic>> records,
  ) async {
    await into(attendanceCache).insertOnConflictUpdate(
      AttendanceCacheCompanion.insert(
        cacheKey: _userKey(userId),
        data: jsonEncode(records),
        updatedAt: DateTime.now().millisecondsSinceEpoch,
      ),
    );
  }

  Future<List<Map<String, dynamic>>?> getForUser(
    String userId, {
    Duration ttl = defaultTtl,
  }) async {
    final row = await (select(attendanceCache)
          ..where((t) => t.cacheKey.equals(_userKey(userId))))
        .getSingleOrNull();
    if (row == null) return null;
    final age = DateTime.now().millisecondsSinceEpoch - row.updatedAt;
    if (age > ttl.inMilliseconds) return null;
    final list = jsonDecode(row.data) as List<dynamic>;
    return list
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList(growable: false);
  }

  Future<int> clear() {
    return delete(attendanceCache).go();
  }
}
