import 'dart:convert';

import 'package:drift/drift.dart';

import '../local_database.dart';
import '../tables/notifications_cache_table.dart';

part 'notifications_cache_dao.g.dart';

/// 알림 목록 캐시 DAO (Hive `notifications_cache` Box 1:1 변환).
///
/// 단일 row (cacheKey == 'list'). TTL 30분.
@DriftAccessor(tables: [NotificationsCache])
class NotificationsCacheDao extends DatabaseAccessor<LocalDatabase>
    with _$NotificationsCacheDaoMixin {
  NotificationsCacheDao(super.db);

  static const Duration defaultTtl = Duration(minutes: 30);
  static const String listKey = 'list';

  Future<void> saveList(List<Map<String, dynamic>> notifications) async {
    await into(notificationsCache).insertOnConflictUpdate(
      NotificationsCacheCompanion.insert(
        cacheKey: listKey,
        data: jsonEncode(notifications),
        updatedAt: DateTime.now().millisecondsSinceEpoch,
      ),
    );
  }

  Future<List<Map<String, dynamic>>?> getList({
    Duration ttl = defaultTtl,
  }) async {
    final row = await (select(notificationsCache)
          ..where((t) => t.cacheKey.equals(listKey)))
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
    return delete(notificationsCache).go();
  }
}
