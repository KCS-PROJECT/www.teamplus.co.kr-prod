// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'notifications_cache_dao.dart';

// ignore_for_file: type=lint
mixin _$NotificationsCacheDaoMixin on DatabaseAccessor<LocalDatabase> {
  $NotificationsCacheTable get notificationsCache =>
      attachedDatabase.notificationsCache;
  NotificationsCacheDaoManager get managers =>
      NotificationsCacheDaoManager(this);
}

class NotificationsCacheDaoManager {
  final _$NotificationsCacheDaoMixin _db;
  NotificationsCacheDaoManager(this._db);
  $$NotificationsCacheTableTableManager get notificationsCache =>
      $$NotificationsCacheTableTableManager(
          _db.attachedDatabase, _db.notificationsCache);
}
