// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'schedules_cache_dao.dart';

// ignore_for_file: type=lint
mixin _$SchedulesCacheDaoMixin on DatabaseAccessor<LocalDatabase> {
  $SchedulesCacheTable get schedulesCache => attachedDatabase.schedulesCache;
  SchedulesCacheDaoManager get managers => SchedulesCacheDaoManager(this);
}

class SchedulesCacheDaoManager {
  final _$SchedulesCacheDaoMixin _db;
  SchedulesCacheDaoManager(this._db);
  $$SchedulesCacheTableTableManager get schedulesCache =>
      $$SchedulesCacheTableTableManager(
          _db.attachedDatabase, _db.schedulesCache);
}
