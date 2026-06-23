import 'package:drift/drift.dart';

/// 범용 KV 저장 테이블.
///
/// **네임스페이스 규약**:
/// - `ns:web:<userKey>` — WebView Bridge `storage` 핸들러 노출 영역 (sandboxed)
/// - `ns:app:<key>`     — Flutter 네이티브 화면 전용 (Bridge 접근 차단)
/// - `ns:sys:<key>`     — 시스템 메타 (예: 'sys:schemaVersion')
///
/// Bridge는 `BridgeKvWhitelist`를 통해 `ns:web:` prefix만 read/write 허용.
/// 도메인 테이블(profile_cache 등)은 절대 노출하지 않는다.
@DataClassName('KvEntry')
class KvStore extends Table {
  TextColumn get key => text()();
  TextColumn get value => text()();
  TextColumn get namespace => text()();
  IntColumn get updatedAt => integer()();
  IntColumn get expiresAt => integer().nullable()();

  @override
  Set<Column> get primaryKey => {key};
}
