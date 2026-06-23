// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'profile_cache_dao.dart';

// ignore_for_file: type=lint
mixin _$ProfileCacheDaoMixin on DatabaseAccessor<LocalDatabase> {
  $ProfileCacheTable get profileCache => attachedDatabase.profileCache;
  ProfileCacheDaoManager get managers => ProfileCacheDaoManager(this);
}

class ProfileCacheDaoManager {
  final _$ProfileCacheDaoMixin _db;
  ProfileCacheDaoManager(this._db);
  $$ProfileCacheTableTableManager get profileCache =>
      $$ProfileCacheTableTableManager(_db.attachedDatabase, _db.profileCache);
}
