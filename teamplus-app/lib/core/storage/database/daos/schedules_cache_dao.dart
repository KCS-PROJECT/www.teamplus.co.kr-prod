import 'dart:convert';

import 'package:drift/drift.dart';

import '../local_database.dart';
import '../tables/schedules_cache_table.dart';

part 'schedules_cache_dao.g.dart';

/// 수업 일정 캐시 DAO (Hive `schedules_cache` Box 1:1 변환).
///
/// 키 형식: 'month_2026-04'. TTL 6시간.
@DriftAccessor(tables: [SchedulesCache])
class SchedulesCacheDao extends DatabaseAccessor<LocalDatabase>
    with _$SchedulesCacheDaoMixin {
  SchedulesCacheDao(super.db);

  static const Duration defaultTtl = Duration(hours: 6);

  String _monthKey(String yyyymm) => 'month_$yyyymm';

  Future<void> saveMonth(
    String yyyymm,
    List<Map<String, dynamic>> schedules,
  ) async {
    await into(schedulesCache).insertOnConflictUpdate(
      SchedulesCacheCompanion.insert(
        cacheKey: _monthKey(yyyymm),
        data: jsonEncode(schedules),
        updatedAt: DateTime.now().millisecondsSinceEpoch,
      ),
    );
  }

  Future<List<Map<String, dynamic>>?> getMonth(
    String yyyymm, {
    Duration ttl = defaultTtl,
  }) async {
    final row = await (select(schedulesCache)
          ..where((t) => t.cacheKey.equals(_monthKey(yyyymm))))
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
    return delete(schedulesCache).go();
  }
}
