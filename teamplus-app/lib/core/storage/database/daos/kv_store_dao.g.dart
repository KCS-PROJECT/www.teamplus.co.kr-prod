// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'kv_store_dao.dart';

// ignore_for_file: type=lint
mixin _$KvStoreDaoMixin on DatabaseAccessor<LocalDatabase> {
  $KvStoreTable get kvStore => attachedDatabase.kvStore;
  KvStoreDaoManager get managers => KvStoreDaoManager(this);
}

class KvStoreDaoManager {
  final _$KvStoreDaoMixin _db;
  KvStoreDaoManager(this._db);
  $$KvStoreTableTableManager get kvStore =>
      $$KvStoreTableTableManager(_db.attachedDatabase, _db.kvStore);
}
