import 'package:drift/drift.dart';

/// 알림 목록 캐시 (Hive `notifications_cache` Box 1:1 변환).
///
/// `cacheKey` 는 항상 'list' (단일 row).
/// TTL: 30분 (DAO 레벨에서 적용).
@DataClassName('NotificationsCacheRow')
class NotificationsCache extends Table {
  TextColumn get cacheKey => text()();
  TextColumn get data => text()(); // JSON List
  IntColumn get updatedAt => integer()();

  @override
  Set<Column> get primaryKey => {cacheKey};
}
