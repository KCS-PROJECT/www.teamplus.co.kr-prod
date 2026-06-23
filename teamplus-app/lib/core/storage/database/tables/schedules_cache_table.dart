import 'package:drift/drift.dart';

/// 수업 일정 캐시 (Hive `schedules_cache` Box 1:1 변환).
///
/// `cacheKey` 예시: 'month_2026-04' — 월별 다중 키 지원.
/// TTL: 6시간 (DAO 레벨에서 적용).
@DataClassName('SchedulesCacheRow')
class SchedulesCache extends Table {
  TextColumn get cacheKey => text()();
  TextColumn get data => text()(); // JSON List
  IntColumn get updatedAt => integer()();

  @override
  Set<Column> get primaryKey => {cacheKey};
}
