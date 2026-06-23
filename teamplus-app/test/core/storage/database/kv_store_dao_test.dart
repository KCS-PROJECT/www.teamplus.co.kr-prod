import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teamplus_app/core/storage/database/bridge_kv_whitelist.dart';
import 'package:teamplus_app/core/storage/database/local_database.dart';

void main() {
  late LocalDatabase db;

  setUp(() {
    db = LocalDatabase.forTesting(NativeDatabase.memory());
  });

  tearDown(() async {
    await db.close();
  });

  group('KvStoreDao 기본 CRUD', () {
    test('set → get round-trip', () async {
      await db.kvStoreDao.set(
        fullKey: 'ns:web:ui.theme',
        value: '{"mode":"dark"}',
        namespace: BridgeKvWhitelist.namespaceWeb,
      );
      final row = await db.kvStoreDao.get('ns:web:ui.theme');
      expect(row, isNotNull);
      expect(row!.value, '{"mode":"dark"}');
      expect(row.namespace, 'web');
      expect(row.expiresAt, isNull);
    });

    test('동일 키 set은 UPSERT (덮어쓰기)', () async {
      await db.kvStoreDao.set(
        fullKey: 'ns:web:k',
        value: 'v1',
        namespace: 'web',
      );
      await db.kvStoreDao.set(
        fullKey: 'ns:web:k',
        value: 'v2',
        namespace: 'web',
      );
      final row = await db.kvStoreDao.get('ns:web:k');
      expect(row?.value, 'v2');
    });

    test('remove로 삭제', () async {
      await db.kvStoreDao.set(
        fullKey: 'ns:web:tmp',
        value: 'x',
        namespace: 'web',
      );
      final affected = await db.kvStoreDao.remove('ns:web:tmp');
      expect(affected, 1);
      expect(await db.kvStoreDao.get('ns:web:tmp'), isNull);
    });

    test('clearNamespace는 해당 ns만 삭제', () async {
      await db.kvStoreDao
          .set(fullKey: 'ns:web:a', value: '1', namespace: 'web');
      await db.kvStoreDao
          .set(fullKey: 'ns:app:b', value: '2', namespace: 'app');
      final affected = await db.kvStoreDao.clearNamespace('web');
      expect(affected, 1);
      expect(await db.kvStoreDao.get('ns:web:a'), isNull);
      expect(await db.kvStoreDao.get('ns:app:b'), isNotNull);
    });
  });

  group('KvStoreDao TTL', () {
    test('만료 항목은 get 시 null + 자동 삭제', () async {
      // 과거 시각으로 직접 INSERT (이미 만료된 상태)
      final pastExpiry = DateTime.now()
              .subtract(const Duration(seconds: 1))
              .millisecondsSinceEpoch;
      await db.into(db.kvStore).insert(
            KvStoreCompanion.insert(
              key: 'ns:web:expired',
              value: 'gone',
              namespace: 'web',
              updatedAt: pastExpiry - 1000,
              expiresAt: Value(pastExpiry),
            ),
          );

      // 만료 전 데이터 1건 존재 확인
      final beforeRow =
          await (db.select(db.kvStore)..where((t) => t.key.equals('ns:web:expired')))
              .getSingleOrNull();
      expect(beforeRow, isNotNull);

      // get → null + side-effect로 삭제
      final result = await db.kvStoreDao.get('ns:web:expired');
      expect(result, isNull);

      final afterRow =
          await (db.select(db.kvStore)..where((t) => t.key.equals('ns:web:expired')))
              .getSingleOrNull();
      expect(afterRow, isNull, reason: '만료 항목은 자동 삭제되어야 함');
    });

    test('미래 만료 항목은 정상 반환', () async {
      await db.kvStoreDao.set(
        fullKey: 'ns:web:fresh',
        value: 'still good',
        namespace: 'web',
        ttlMs: 60000, // 60s
      );
      final row = await db.kvStoreDao.get('ns:web:fresh');
      expect(row?.value, 'still good');
    });

    test('purgeExpired는 만료된 row만 삭제', () async {
      final now = DateTime.now().millisecondsSinceEpoch;
      await db.into(db.kvStore).insert(KvStoreCompanion.insert(
            key: 'ns:web:e1',
            value: '1',
            namespace: 'web',
            updatedAt: now,
            expiresAt: Value(now - 1000),
          ));
      await db.into(db.kvStore).insert(KvStoreCompanion.insert(
            key: 'ns:web:e2',
            value: '2',
            namespace: 'web',
            updatedAt: now,
            expiresAt: Value(now + 60000),
          ));
      await db.into(db.kvStore).insert(KvStoreCompanion.insert(
            key: 'ns:web:permanent',
            value: '3',
            namespace: 'web',
            updatedAt: now,
          ));

      final purged = await db.kvStoreDao.purgeExpired();
      expect(purged, 1);

      final remaining = await db.select(db.kvStore).get();
      expect(remaining.map((r) => r.key).toSet(),
          {'ns:web:e2', 'ns:web:permanent'});
    });
  });

  group('KvStoreDao keysWithPrefix', () {
    test('prefix 매칭, 만료 제외, limit 적용', () async {
      final now = DateTime.now().millisecondsSinceEpoch;
      await db.kvStoreDao.set(
        fullKey: 'ns:web:ui.theme',
        value: 'a',
        namespace: 'web',
      );
      await db.kvStoreDao.set(
        fullKey: 'ns:web:ui.lang',
        value: 'b',
        namespace: 'web',
      );
      await db.kvStoreDao.set(
        fullKey: 'ns:web:other.x',
        value: 'c',
        namespace: 'web',
      );
      // 만료 항목
      await db.into(db.kvStore).insert(KvStoreCompanion.insert(
            key: 'ns:web:ui.expired',
            value: 'd',
            namespace: 'web',
            updatedAt: now,
            expiresAt: Value(now - 1000),
          ));

      final keys = await db.kvStoreDao.keysWithPrefix('ns:web:ui.');
      expect(keys.toSet(), {'ns:web:ui.theme', 'ns:web:ui.lang'},
          reason: '만료 항목 제외, ui. prefix 만');

      final limited =
          await db.kvStoreDao.keysWithPrefix('ns:web:ui.', limit: 1);
      expect(limited.length, 1);
    });
  });
}
