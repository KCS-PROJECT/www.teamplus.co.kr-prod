import 'package:drift/drift.dart';

import '../bridge_kv_whitelist.dart';
import '../local_database.dart';
import '../tables/kv_store_table.dart';

part 'kv_store_dao.g.dart';

/// 범용 KV 저장 DAO.
///
/// WebView Bridge `storage` 핸들러가 이 DAO를 통해 `ns:web:` 프리픽스 키만 접근한다.
/// 네이티브 코드는 [namespace]를 자유롭게 지정 가능 (`web`/`app`/`sys`).
@DriftAccessor(tables: [KvStore])
class KvStoreDao extends DatabaseAccessor<LocalDatabase> with _$KvStoreDaoMixin {
  KvStoreDao(super.db);

  /// 단일 키 조회. 만료 시 자동 삭제 후 null 반환.
  Future<KvEntry?> get(String fullKey) async {
    final row = await (select(kvStore)..where((t) => t.key.equals(fullKey)))
        .getSingleOrNull();
    if (row == null) return null;
    if (_isExpired(row.expiresAt)) {
      await (delete(kvStore)..where((t) => t.key.equals(fullKey))).go();
      return null;
    }
    return row;
  }

  /// 값 저장 (UPSERT). [ttlMs]가 null이면 영구 보관.
  Future<void> set({
    required String fullKey,
    required String value,
    required String namespace,
    int? ttlMs,
  }) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    await into(kvStore).insertOnConflictUpdate(
      KvStoreCompanion.insert(
        key: fullKey,
        value: value,
        namespace: namespace,
        updatedAt: now,
        expiresAt: ttlMs == null ? const Value.absent() : Value(now + ttlMs),
      ),
    );
  }

  /// 단일 키 삭제.
  Future<int> remove(String fullKey) {
    return (delete(kvStore)..where((t) => t.key.equals(fullKey))).go();
  }

  /// 특정 네임스페이스 전체 삭제 (Bridge `clear` 액션은 `web`만 허용).
  Future<int> clearNamespace(String namespace) {
    return (delete(kvStore)..where((t) => t.namespace.equals(namespace))).go();
  }

  /// prefix 매칭 키 목록 조회 (만료 키 제외, 최대 [limit]건).
  Future<List<String>> keysWithPrefix(
    String fullPrefix, {
    int limit = BridgeKvWhitelist.maxKeysReturnedFromKeysAction,
  }) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    final query = select(kvStore)
      ..where((t) =>
          t.key.like('$fullPrefix%') &
          (t.expiresAt.isNull() | t.expiresAt.isBiggerThanValue(now)))
      ..limit(limit);
    final rows = await query.get();
    return rows.map((r) => r.key).toList(growable: false);
  }

  /// 만료된 row를 정리 (idle 시점에 호출 권장).
  Future<int> purgeExpired() async {
    final now = DateTime.now().millisecondsSinceEpoch;
    return (delete(kvStore)
          ..where((t) =>
              t.expiresAt.isNotNull() & t.expiresAt.isSmallerThanValue(now)))
        .go();
  }

  bool _isExpired(int? expiresAt) {
    if (expiresAt == null) return false;
    return DateTime.now().millisecondsSinceEpoch >= expiresAt;
  }
}
