import 'dart:convert';

import 'package:drift/drift.dart';

import '../local_database.dart';
import '../tables/profile_cache_table.dart';

part 'profile_cache_dao.g.dart';

/// 사용자 프로필 캐시 DAO (Hive `profile_cache` Box 1:1 변환).
///
/// TTL: 1시간. 호출자가 [isValid]를 먼저 확인하거나 [getValidProfile]을 사용.
@DriftAccessor(tables: [ProfileCache])
class ProfileCacheDao extends DatabaseAccessor<LocalDatabase>
    with _$ProfileCacheDaoMixin {
  ProfileCacheDao(super.db);

  static const Duration defaultTtl = Duration(hours: 1);
  static const String currentUserKey = 'current_user';

  /// 프로필 저장 (UPSERT).
  Future<void> saveProfile(Map<String, dynamic> profile) async {
    await into(profileCache).insertOnConflictUpdate(
      ProfileCacheCompanion.insert(
        userId: currentUserKey,
        data: jsonEncode(profile),
        updatedAt: DateTime.now().millisecondsSinceEpoch,
      ),
    );
  }

  /// 캐시 만료 여부와 무관하게 조회.
  Future<Map<String, dynamic>?> getProfile() async {
    final row = await (select(profileCache)
          ..where((t) => t.userId.equals(currentUserKey)))
        .getSingleOrNull();
    if (row == null) return null;
    return jsonDecode(row.data) as Map<String, dynamic>;
  }

  /// TTL 내에서만 반환. 만료 시 null.
  Future<Map<String, dynamic>?> getValidProfile({
    Duration ttl = defaultTtl,
  }) async {
    final row = await (select(profileCache)
          ..where((t) => t.userId.equals(currentUserKey)))
        .getSingleOrNull();
    if (row == null) return null;
    final age = DateTime.now().millisecondsSinceEpoch - row.updatedAt;
    if (age > ttl.inMilliseconds) return null;
    return jsonDecode(row.data) as Map<String, dynamic>;
  }

  /// 프로필 캐시 삭제 (로그아웃 시 호출).
  Future<int> clear() {
    return delete(profileCache).go();
  }
}
