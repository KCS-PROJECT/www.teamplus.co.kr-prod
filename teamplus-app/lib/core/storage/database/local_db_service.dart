import 'package:flutter/foundation.dart';

import 'daos/attendance_cache_dao.dart';
import 'daos/kv_store_dao.dart';
import 'daos/notifications_cache_dao.dart';
import 'daos/profile_cache_dao.dart';
import 'daos/schedules_cache_dao.dart';
import 'local_database.dart';

/// TEAMPLUS Flutter 앱의 SQLite 로컬 저장소 단일 진입점.
///
/// 사용 예:
/// ```dart
/// await LocalDbService.instance.initialize();
/// final dao = LocalDbService.instance.kvStore;
/// ```
///
/// **WARNING**: 토큰/비밀번호/PIN 등 민감 데이터는 **절대** 저장 금지.
/// 민감 데이터는 `flutter_secure_storage`(Keychain) 전용.
class LocalDbService {
  LocalDbService._();

  static final LocalDbService instance = LocalDbService._();

  LocalDatabase? _db;
  bool _initializing = false;
  bool _initialized = false;

  /// 초기화. idempotent하며 동시 호출 시에도 안전.
  ///
  /// 일반적으로 `lib/main.dart` `_deferredInit()`에서 `unawaited()`로 호출.
  Future<void> initialize() async {
    if (_initialized) return;
    if (_initializing) {
      while (_initializing) {
        await Future<void>.delayed(const Duration(milliseconds: 10));
      }
      return;
    }
    _initializing = true;
    try {
      _db ??= LocalDatabase();
      // beforeOpen 트리거를 위해 가벼운 쿼리 1회 (지연 오픈 워밍업)
      await _db!.customSelect('SELECT 1').get();
      _initialized = true;
      if (kDebugMode) {
        debugPrint('[LocalDb] 초기화 완료 (drift schemaVersion=${_db!.schemaVersion})');
      }
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[LocalDb] ⚠️ 초기화 실패: $e — 미초기화 상태 유지');
      }
      rethrow;
    } finally {
      _initializing = false;
    }
  }

  /// 테스트 전용 — 외부에서 만든 [LocalDatabase] 인스턴스 주입.
  @visibleForTesting
  void overrideDatabaseForTesting(LocalDatabase database) {
    _db = database;
    _initialized = true;
  }

  /// 테스트 전용 — 초기화 상태 리셋.
  @visibleForTesting
  Future<void> resetForTesting() async {
    await _db?.close();
    _db = null;
    _initialized = false;
    _initializing = false;
  }

  LocalDatabase get db {
    final database = _db;
    if (database == null) {
      throw StateError(
        'LocalDbService.initialize() 가 호출되지 않았습니다. '
        'main.dart _deferredInit() 또는 사용 직전에 await initialize() 를 호출하세요.',
      );
    }
    return database;
  }

  // ─────────────────────────────────────────────────────────────────────
  // DAO 단축 접근자
  // ─────────────────────────────────────────────────────────────────────

  bool get isReady => _initialized;

  /// 범용 KV (Bridge `storage` 핸들러도 이 DAO 경유).
  /// **WARNING**: `token|secret|password|pin|jwt|bearer` 패턴 키는 저장 금지.
  /// `BridgeKvWhitelist`에서 자동 reject 하지만 네이티브 호출자도 동일 규약 준수.
  KvStoreDao get kvStore => db.kvStoreDao;

  ProfileCacheDao get profileCache => db.profileCacheDao;

  SchedulesCacheDao get schedulesCache => db.schedulesCacheDao;

  AttendanceCacheDao get attendanceCache => db.attendanceCacheDao;

  NotificationsCacheDao get notificationsCache => db.notificationsCacheDao;
}
