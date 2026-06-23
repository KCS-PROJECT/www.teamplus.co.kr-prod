import 'package:drift/drift.dart';

/// 출석 기록 캐시 (Hive `attendance_cache` Box 1:1 변환).
///
/// `cacheKey` 예시: 'user_42'.
/// TTL: 12시간 (DAO 레벨에서 적용).
@DataClassName('AttendanceCacheRow')
class AttendanceCache extends Table {
  TextColumn get cacheKey => text()();
  TextColumn get data => text()(); // JSON List
  IntColumn get updatedAt => integer()();

  @override
  Set<Column> get primaryKey => {cacheKey};
}
