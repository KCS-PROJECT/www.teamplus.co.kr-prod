// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'attendance_cache_dao.dart';

// ignore_for_file: type=lint
mixin _$AttendanceCacheDaoMixin on DatabaseAccessor<LocalDatabase> {
  $AttendanceCacheTable get attendanceCache => attachedDatabase.attendanceCache;
  AttendanceCacheDaoManager get managers => AttendanceCacheDaoManager(this);
}

class AttendanceCacheDaoManager {
  final _$AttendanceCacheDaoMixin _db;
  AttendanceCacheDaoManager(this._db);
  $$AttendanceCacheTableTableManager get attendanceCache =>
      $$AttendanceCacheTableTableManager(
          _db.attachedDatabase, _db.attendanceCache);
}
