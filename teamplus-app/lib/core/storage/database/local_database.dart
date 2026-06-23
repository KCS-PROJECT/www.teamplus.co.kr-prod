import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqlite3/sqlite3.dart';
import 'package:sqlite3_flutter_libs/sqlite3_flutter_libs.dart';

import 'daos/attendance_cache_dao.dart';
import 'daos/kv_store_dao.dart';
import 'daos/notifications_cache_dao.dart';
import 'daos/profile_cache_dao.dart';
import 'daos/schedules_cache_dao.dart';
import 'tables/attendance_cache_table.dart';
import 'tables/kv_store_table.dart';
import 'tables/notifications_cache_table.dart';
import 'tables/profile_cache_table.dart';
import 'tables/schedules_cache_table.dart';

part 'local_database.g.dart';

/// TEAMPLUS Flutter 앱 전용 로컬 SQLite 데이터베이스 (drift 2.x).
///
/// **WARNING**: 토큰/비밀번호/PIN 등 민감 데이터는 **절대** 이 DB에 저장하지 않는다.
/// 민감 데이터는 `flutter_secure_storage` (Keychain) 전용 격리.
///
/// 외부에서는 [LocalDbService]를 통해 접근하며, 본 클래스는 직접 인스턴스화 금지.
@DriftDatabase(
  tables: [
    KvStore,
    ProfileCache,
    SchedulesCache,
    AttendanceCache,
    NotificationsCache,
  ],
  daos: [
    KvStoreDao,
    ProfileCacheDao,
    SchedulesCacheDao,
    AttendanceCacheDao,
    NotificationsCacheDao,
  ],
)
class LocalDatabase extends _$LocalDatabase {
  LocalDatabase() : super(_openConnection());

  /// 테스트 전용 — 인메모리 DB 또는 임의 [QueryExecutor] 주입.
  LocalDatabase.forTesting(super.executor);

  @override
  int get schemaVersion => 1;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (m) async {
          await m.createAll();
        },
        onUpgrade: (m, from, to) async {
          // v1 — 초기 스키마. 후속 버전 ALTER 분기는 여기에 추가.
        },
        beforeOpen: (details) async {
          // 외래키 enable (현 스키마는 FK 없지만 향후 대비)
          await customStatement('PRAGMA foreign_keys = ON');
        },
      );
}

LazyDatabase _openConnection() {
  return LazyDatabase(() async {
    // iOS 16+ / Android 13+ 일부 단말에서 native sqlite3 라이브러리가
    // 시스템 기본보다 오래된 경우 drift 권장 fix 적용.
    if (Platform.isAndroid) {
      await applyWorkaroundToOpenSqlite3OnOldAndroidVersions();
    }
    final cachebase = (await getTemporaryDirectory()).path;
    sqlite3.tempDirectory = cachebase;

    final docs = await getApplicationDocumentsDirectory();
    final file = File(p.join(docs.path, 'teamplus.sqlite'));
    return NativeDatabase.createInBackground(file, logStatements: false);
  });
}
