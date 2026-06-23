import 'package:drift/drift.dart';

/// 사용자 프로필 캐시 (Hive `profile_cache` Box 1:1 변환).
///
/// TTL: 1시간 (DAO 레벨에서 적용).
@DataClassName('ProfileCacheRow')
class ProfileCache extends Table {
  TextColumn get userId => text()();
  TextColumn get data => text()(); // JSON
  IntColumn get updatedAt => integer()();

  @override
  Set<Column> get primaryKey => {userId};
}
