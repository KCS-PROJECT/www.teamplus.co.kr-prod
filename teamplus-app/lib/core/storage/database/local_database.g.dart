// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'local_database.dart';

// ignore_for_file: type=lint
class $KvStoreTable extends KvStore with TableInfo<$KvStoreTable, KvEntry> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $KvStoreTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _keyMeta = const VerificationMeta('key');
  @override
  late final GeneratedColumn<String> key = GeneratedColumn<String>(
      'key', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _valueMeta = const VerificationMeta('value');
  @override
  late final GeneratedColumn<String> value = GeneratedColumn<String>(
      'value', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _namespaceMeta =
      const VerificationMeta('namespace');
  @override
  late final GeneratedColumn<String> namespace = GeneratedColumn<String>(
      'namespace', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _updatedAtMeta =
      const VerificationMeta('updatedAt');
  @override
  late final GeneratedColumn<int> updatedAt = GeneratedColumn<int>(
      'updated_at', aliasedName, false,
      type: DriftSqlType.int, requiredDuringInsert: true);
  static const VerificationMeta _expiresAtMeta =
      const VerificationMeta('expiresAt');
  @override
  late final GeneratedColumn<int> expiresAt = GeneratedColumn<int>(
      'expires_at', aliasedName, true,
      type: DriftSqlType.int, requiredDuringInsert: false);
  @override
  List<GeneratedColumn> get $columns =>
      [key, value, namespace, updatedAt, expiresAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'kv_store';
  @override
  VerificationContext validateIntegrity(Insertable<KvEntry> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('key')) {
      context.handle(
          _keyMeta, key.isAcceptableOrUnknown(data['key']!, _keyMeta));
    } else if (isInserting) {
      context.missing(_keyMeta);
    }
    if (data.containsKey('value')) {
      context.handle(
          _valueMeta, value.isAcceptableOrUnknown(data['value']!, _valueMeta));
    } else if (isInserting) {
      context.missing(_valueMeta);
    }
    if (data.containsKey('namespace')) {
      context.handle(_namespaceMeta,
          namespace.isAcceptableOrUnknown(data['namespace']!, _namespaceMeta));
    } else if (isInserting) {
      context.missing(_namespaceMeta);
    }
    if (data.containsKey('updated_at')) {
      context.handle(_updatedAtMeta,
          updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta));
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    if (data.containsKey('expires_at')) {
      context.handle(_expiresAtMeta,
          expiresAt.isAcceptableOrUnknown(data['expires_at']!, _expiresAtMeta));
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {key};
  @override
  KvEntry map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return KvEntry(
      key: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}key'])!,
      value: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}value'])!,
      namespace: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}namespace'])!,
      updatedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}updated_at'])!,
      expiresAt: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}expires_at']),
    );
  }

  @override
  $KvStoreTable createAlias(String alias) {
    return $KvStoreTable(attachedDatabase, alias);
  }
}

class KvEntry extends DataClass implements Insertable<KvEntry> {
  final String key;
  final String value;
  final String namespace;
  final int updatedAt;
  final int? expiresAt;
  const KvEntry(
      {required this.key,
      required this.value,
      required this.namespace,
      required this.updatedAt,
      this.expiresAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['key'] = Variable<String>(key);
    map['value'] = Variable<String>(value);
    map['namespace'] = Variable<String>(namespace);
    map['updated_at'] = Variable<int>(updatedAt);
    if (!nullToAbsent || expiresAt != null) {
      map['expires_at'] = Variable<int>(expiresAt);
    }
    return map;
  }

  KvStoreCompanion toCompanion(bool nullToAbsent) {
    return KvStoreCompanion(
      key: Value(key),
      value: Value(value),
      namespace: Value(namespace),
      updatedAt: Value(updatedAt),
      expiresAt: expiresAt == null && nullToAbsent
          ? const Value.absent()
          : Value(expiresAt),
    );
  }

  factory KvEntry.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return KvEntry(
      key: serializer.fromJson<String>(json['key']),
      value: serializer.fromJson<String>(json['value']),
      namespace: serializer.fromJson<String>(json['namespace']),
      updatedAt: serializer.fromJson<int>(json['updatedAt']),
      expiresAt: serializer.fromJson<int?>(json['expiresAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'key': serializer.toJson<String>(key),
      'value': serializer.toJson<String>(value),
      'namespace': serializer.toJson<String>(namespace),
      'updatedAt': serializer.toJson<int>(updatedAt),
      'expiresAt': serializer.toJson<int?>(expiresAt),
    };
  }

  KvEntry copyWith(
          {String? key,
          String? value,
          String? namespace,
          int? updatedAt,
          Value<int?> expiresAt = const Value.absent()}) =>
      KvEntry(
        key: key ?? this.key,
        value: value ?? this.value,
        namespace: namespace ?? this.namespace,
        updatedAt: updatedAt ?? this.updatedAt,
        expiresAt: expiresAt.present ? expiresAt.value : this.expiresAt,
      );
  KvEntry copyWithCompanion(KvStoreCompanion data) {
    return KvEntry(
      key: data.key.present ? data.key.value : this.key,
      value: data.value.present ? data.value.value : this.value,
      namespace: data.namespace.present ? data.namespace.value : this.namespace,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
      expiresAt: data.expiresAt.present ? data.expiresAt.value : this.expiresAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('KvEntry(')
          ..write('key: $key, ')
          ..write('value: $value, ')
          ..write('namespace: $namespace, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('expiresAt: $expiresAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(key, value, namespace, updatedAt, expiresAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is KvEntry &&
          other.key == this.key &&
          other.value == this.value &&
          other.namespace == this.namespace &&
          other.updatedAt == this.updatedAt &&
          other.expiresAt == this.expiresAt);
}

class KvStoreCompanion extends UpdateCompanion<KvEntry> {
  final Value<String> key;
  final Value<String> value;
  final Value<String> namespace;
  final Value<int> updatedAt;
  final Value<int?> expiresAt;
  final Value<int> rowid;
  const KvStoreCompanion({
    this.key = const Value.absent(),
    this.value = const Value.absent(),
    this.namespace = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.expiresAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  KvStoreCompanion.insert({
    required String key,
    required String value,
    required String namespace,
    required int updatedAt,
    this.expiresAt = const Value.absent(),
    this.rowid = const Value.absent(),
  })  : key = Value(key),
        value = Value(value),
        namespace = Value(namespace),
        updatedAt = Value(updatedAt);
  static Insertable<KvEntry> custom({
    Expression<String>? key,
    Expression<String>? value,
    Expression<String>? namespace,
    Expression<int>? updatedAt,
    Expression<int>? expiresAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (key != null) 'key': key,
      if (value != null) 'value': value,
      if (namespace != null) 'namespace': namespace,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (expiresAt != null) 'expires_at': expiresAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  KvStoreCompanion copyWith(
      {Value<String>? key,
      Value<String>? value,
      Value<String>? namespace,
      Value<int>? updatedAt,
      Value<int?>? expiresAt,
      Value<int>? rowid}) {
    return KvStoreCompanion(
      key: key ?? this.key,
      value: value ?? this.value,
      namespace: namespace ?? this.namespace,
      updatedAt: updatedAt ?? this.updatedAt,
      expiresAt: expiresAt ?? this.expiresAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (key.present) {
      map['key'] = Variable<String>(key.value);
    }
    if (value.present) {
      map['value'] = Variable<String>(value.value);
    }
    if (namespace.present) {
      map['namespace'] = Variable<String>(namespace.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<int>(updatedAt.value);
    }
    if (expiresAt.present) {
      map['expires_at'] = Variable<int>(expiresAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('KvStoreCompanion(')
          ..write('key: $key, ')
          ..write('value: $value, ')
          ..write('namespace: $namespace, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('expiresAt: $expiresAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $ProfileCacheTable extends ProfileCache
    with TableInfo<$ProfileCacheTable, ProfileCacheRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ProfileCacheTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _userIdMeta = const VerificationMeta('userId');
  @override
  late final GeneratedColumn<String> userId = GeneratedColumn<String>(
      'user_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _dataMeta = const VerificationMeta('data');
  @override
  late final GeneratedColumn<String> data = GeneratedColumn<String>(
      'data', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _updatedAtMeta =
      const VerificationMeta('updatedAt');
  @override
  late final GeneratedColumn<int> updatedAt = GeneratedColumn<int>(
      'updated_at', aliasedName, false,
      type: DriftSqlType.int, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns => [userId, data, updatedAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'profile_cache';
  @override
  VerificationContext validateIntegrity(Insertable<ProfileCacheRow> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('user_id')) {
      context.handle(_userIdMeta,
          userId.isAcceptableOrUnknown(data['user_id']!, _userIdMeta));
    } else if (isInserting) {
      context.missing(_userIdMeta);
    }
    if (data.containsKey('data')) {
      context.handle(
          _dataMeta, this.data.isAcceptableOrUnknown(data['data']!, _dataMeta));
    } else if (isInserting) {
      context.missing(_dataMeta);
    }
    if (data.containsKey('updated_at')) {
      context.handle(_updatedAtMeta,
          updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta));
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {userId};
  @override
  ProfileCacheRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return ProfileCacheRow(
      userId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}user_id'])!,
      data: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}data'])!,
      updatedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}updated_at'])!,
    );
  }

  @override
  $ProfileCacheTable createAlias(String alias) {
    return $ProfileCacheTable(attachedDatabase, alias);
  }
}

class ProfileCacheRow extends DataClass implements Insertable<ProfileCacheRow> {
  final String userId;
  final String data;
  final int updatedAt;
  const ProfileCacheRow(
      {required this.userId, required this.data, required this.updatedAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['user_id'] = Variable<String>(userId);
    map['data'] = Variable<String>(data);
    map['updated_at'] = Variable<int>(updatedAt);
    return map;
  }

  ProfileCacheCompanion toCompanion(bool nullToAbsent) {
    return ProfileCacheCompanion(
      userId: Value(userId),
      data: Value(data),
      updatedAt: Value(updatedAt),
    );
  }

  factory ProfileCacheRow.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return ProfileCacheRow(
      userId: serializer.fromJson<String>(json['userId']),
      data: serializer.fromJson<String>(json['data']),
      updatedAt: serializer.fromJson<int>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'userId': serializer.toJson<String>(userId),
      'data': serializer.toJson<String>(data),
      'updatedAt': serializer.toJson<int>(updatedAt),
    };
  }

  ProfileCacheRow copyWith({String? userId, String? data, int? updatedAt}) =>
      ProfileCacheRow(
        userId: userId ?? this.userId,
        data: data ?? this.data,
        updatedAt: updatedAt ?? this.updatedAt,
      );
  ProfileCacheRow copyWithCompanion(ProfileCacheCompanion data) {
    return ProfileCacheRow(
      userId: data.userId.present ? data.userId.value : this.userId,
      data: data.data.present ? data.data.value : this.data,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('ProfileCacheRow(')
          ..write('userId: $userId, ')
          ..write('data: $data, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(userId, data, updatedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is ProfileCacheRow &&
          other.userId == this.userId &&
          other.data == this.data &&
          other.updatedAt == this.updatedAt);
}

class ProfileCacheCompanion extends UpdateCompanion<ProfileCacheRow> {
  final Value<String> userId;
  final Value<String> data;
  final Value<int> updatedAt;
  final Value<int> rowid;
  const ProfileCacheCompanion({
    this.userId = const Value.absent(),
    this.data = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  ProfileCacheCompanion.insert({
    required String userId,
    required String data,
    required int updatedAt,
    this.rowid = const Value.absent(),
  })  : userId = Value(userId),
        data = Value(data),
        updatedAt = Value(updatedAt);
  static Insertable<ProfileCacheRow> custom({
    Expression<String>? userId,
    Expression<String>? data,
    Expression<int>? updatedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (userId != null) 'user_id': userId,
      if (data != null) 'data': data,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  ProfileCacheCompanion copyWith(
      {Value<String>? userId,
      Value<String>? data,
      Value<int>? updatedAt,
      Value<int>? rowid}) {
    return ProfileCacheCompanion(
      userId: userId ?? this.userId,
      data: data ?? this.data,
      updatedAt: updatedAt ?? this.updatedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (userId.present) {
      map['user_id'] = Variable<String>(userId.value);
    }
    if (data.present) {
      map['data'] = Variable<String>(data.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<int>(updatedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ProfileCacheCompanion(')
          ..write('userId: $userId, ')
          ..write('data: $data, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $SchedulesCacheTable extends SchedulesCache
    with TableInfo<$SchedulesCacheTable, SchedulesCacheRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $SchedulesCacheTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _cacheKeyMeta =
      const VerificationMeta('cacheKey');
  @override
  late final GeneratedColumn<String> cacheKey = GeneratedColumn<String>(
      'cache_key', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _dataMeta = const VerificationMeta('data');
  @override
  late final GeneratedColumn<String> data = GeneratedColumn<String>(
      'data', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _updatedAtMeta =
      const VerificationMeta('updatedAt');
  @override
  late final GeneratedColumn<int> updatedAt = GeneratedColumn<int>(
      'updated_at', aliasedName, false,
      type: DriftSqlType.int, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns => [cacheKey, data, updatedAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'schedules_cache';
  @override
  VerificationContext validateIntegrity(Insertable<SchedulesCacheRow> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('cache_key')) {
      context.handle(_cacheKeyMeta,
          cacheKey.isAcceptableOrUnknown(data['cache_key']!, _cacheKeyMeta));
    } else if (isInserting) {
      context.missing(_cacheKeyMeta);
    }
    if (data.containsKey('data')) {
      context.handle(
          _dataMeta, this.data.isAcceptableOrUnknown(data['data']!, _dataMeta));
    } else if (isInserting) {
      context.missing(_dataMeta);
    }
    if (data.containsKey('updated_at')) {
      context.handle(_updatedAtMeta,
          updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta));
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {cacheKey};
  @override
  SchedulesCacheRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return SchedulesCacheRow(
      cacheKey: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}cache_key'])!,
      data: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}data'])!,
      updatedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}updated_at'])!,
    );
  }

  @override
  $SchedulesCacheTable createAlias(String alias) {
    return $SchedulesCacheTable(attachedDatabase, alias);
  }
}

class SchedulesCacheRow extends DataClass
    implements Insertable<SchedulesCacheRow> {
  final String cacheKey;
  final String data;
  final int updatedAt;
  const SchedulesCacheRow(
      {required this.cacheKey, required this.data, required this.updatedAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['cache_key'] = Variable<String>(cacheKey);
    map['data'] = Variable<String>(data);
    map['updated_at'] = Variable<int>(updatedAt);
    return map;
  }

  SchedulesCacheCompanion toCompanion(bool nullToAbsent) {
    return SchedulesCacheCompanion(
      cacheKey: Value(cacheKey),
      data: Value(data),
      updatedAt: Value(updatedAt),
    );
  }

  factory SchedulesCacheRow.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return SchedulesCacheRow(
      cacheKey: serializer.fromJson<String>(json['cacheKey']),
      data: serializer.fromJson<String>(json['data']),
      updatedAt: serializer.fromJson<int>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'cacheKey': serializer.toJson<String>(cacheKey),
      'data': serializer.toJson<String>(data),
      'updatedAt': serializer.toJson<int>(updatedAt),
    };
  }

  SchedulesCacheRow copyWith(
          {String? cacheKey, String? data, int? updatedAt}) =>
      SchedulesCacheRow(
        cacheKey: cacheKey ?? this.cacheKey,
        data: data ?? this.data,
        updatedAt: updatedAt ?? this.updatedAt,
      );
  SchedulesCacheRow copyWithCompanion(SchedulesCacheCompanion data) {
    return SchedulesCacheRow(
      cacheKey: data.cacheKey.present ? data.cacheKey.value : this.cacheKey,
      data: data.data.present ? data.data.value : this.data,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('SchedulesCacheRow(')
          ..write('cacheKey: $cacheKey, ')
          ..write('data: $data, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(cacheKey, data, updatedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is SchedulesCacheRow &&
          other.cacheKey == this.cacheKey &&
          other.data == this.data &&
          other.updatedAt == this.updatedAt);
}

class SchedulesCacheCompanion extends UpdateCompanion<SchedulesCacheRow> {
  final Value<String> cacheKey;
  final Value<String> data;
  final Value<int> updatedAt;
  final Value<int> rowid;
  const SchedulesCacheCompanion({
    this.cacheKey = const Value.absent(),
    this.data = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  SchedulesCacheCompanion.insert({
    required String cacheKey,
    required String data,
    required int updatedAt,
    this.rowid = const Value.absent(),
  })  : cacheKey = Value(cacheKey),
        data = Value(data),
        updatedAt = Value(updatedAt);
  static Insertable<SchedulesCacheRow> custom({
    Expression<String>? cacheKey,
    Expression<String>? data,
    Expression<int>? updatedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (cacheKey != null) 'cache_key': cacheKey,
      if (data != null) 'data': data,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  SchedulesCacheCompanion copyWith(
      {Value<String>? cacheKey,
      Value<String>? data,
      Value<int>? updatedAt,
      Value<int>? rowid}) {
    return SchedulesCacheCompanion(
      cacheKey: cacheKey ?? this.cacheKey,
      data: data ?? this.data,
      updatedAt: updatedAt ?? this.updatedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (cacheKey.present) {
      map['cache_key'] = Variable<String>(cacheKey.value);
    }
    if (data.present) {
      map['data'] = Variable<String>(data.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<int>(updatedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('SchedulesCacheCompanion(')
          ..write('cacheKey: $cacheKey, ')
          ..write('data: $data, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $AttendanceCacheTable extends AttendanceCache
    with TableInfo<$AttendanceCacheTable, AttendanceCacheRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $AttendanceCacheTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _cacheKeyMeta =
      const VerificationMeta('cacheKey');
  @override
  late final GeneratedColumn<String> cacheKey = GeneratedColumn<String>(
      'cache_key', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _dataMeta = const VerificationMeta('data');
  @override
  late final GeneratedColumn<String> data = GeneratedColumn<String>(
      'data', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _updatedAtMeta =
      const VerificationMeta('updatedAt');
  @override
  late final GeneratedColumn<int> updatedAt = GeneratedColumn<int>(
      'updated_at', aliasedName, false,
      type: DriftSqlType.int, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns => [cacheKey, data, updatedAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'attendance_cache';
  @override
  VerificationContext validateIntegrity(Insertable<AttendanceCacheRow> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('cache_key')) {
      context.handle(_cacheKeyMeta,
          cacheKey.isAcceptableOrUnknown(data['cache_key']!, _cacheKeyMeta));
    } else if (isInserting) {
      context.missing(_cacheKeyMeta);
    }
    if (data.containsKey('data')) {
      context.handle(
          _dataMeta, this.data.isAcceptableOrUnknown(data['data']!, _dataMeta));
    } else if (isInserting) {
      context.missing(_dataMeta);
    }
    if (data.containsKey('updated_at')) {
      context.handle(_updatedAtMeta,
          updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta));
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {cacheKey};
  @override
  AttendanceCacheRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return AttendanceCacheRow(
      cacheKey: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}cache_key'])!,
      data: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}data'])!,
      updatedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}updated_at'])!,
    );
  }

  @override
  $AttendanceCacheTable createAlias(String alias) {
    return $AttendanceCacheTable(attachedDatabase, alias);
  }
}

class AttendanceCacheRow extends DataClass
    implements Insertable<AttendanceCacheRow> {
  final String cacheKey;
  final String data;
  final int updatedAt;
  const AttendanceCacheRow(
      {required this.cacheKey, required this.data, required this.updatedAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['cache_key'] = Variable<String>(cacheKey);
    map['data'] = Variable<String>(data);
    map['updated_at'] = Variable<int>(updatedAt);
    return map;
  }

  AttendanceCacheCompanion toCompanion(bool nullToAbsent) {
    return AttendanceCacheCompanion(
      cacheKey: Value(cacheKey),
      data: Value(data),
      updatedAt: Value(updatedAt),
    );
  }

  factory AttendanceCacheRow.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return AttendanceCacheRow(
      cacheKey: serializer.fromJson<String>(json['cacheKey']),
      data: serializer.fromJson<String>(json['data']),
      updatedAt: serializer.fromJson<int>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'cacheKey': serializer.toJson<String>(cacheKey),
      'data': serializer.toJson<String>(data),
      'updatedAt': serializer.toJson<int>(updatedAt),
    };
  }

  AttendanceCacheRow copyWith(
          {String? cacheKey, String? data, int? updatedAt}) =>
      AttendanceCacheRow(
        cacheKey: cacheKey ?? this.cacheKey,
        data: data ?? this.data,
        updatedAt: updatedAt ?? this.updatedAt,
      );
  AttendanceCacheRow copyWithCompanion(AttendanceCacheCompanion data) {
    return AttendanceCacheRow(
      cacheKey: data.cacheKey.present ? data.cacheKey.value : this.cacheKey,
      data: data.data.present ? data.data.value : this.data,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('AttendanceCacheRow(')
          ..write('cacheKey: $cacheKey, ')
          ..write('data: $data, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(cacheKey, data, updatedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is AttendanceCacheRow &&
          other.cacheKey == this.cacheKey &&
          other.data == this.data &&
          other.updatedAt == this.updatedAt);
}

class AttendanceCacheCompanion extends UpdateCompanion<AttendanceCacheRow> {
  final Value<String> cacheKey;
  final Value<String> data;
  final Value<int> updatedAt;
  final Value<int> rowid;
  const AttendanceCacheCompanion({
    this.cacheKey = const Value.absent(),
    this.data = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  AttendanceCacheCompanion.insert({
    required String cacheKey,
    required String data,
    required int updatedAt,
    this.rowid = const Value.absent(),
  })  : cacheKey = Value(cacheKey),
        data = Value(data),
        updatedAt = Value(updatedAt);
  static Insertable<AttendanceCacheRow> custom({
    Expression<String>? cacheKey,
    Expression<String>? data,
    Expression<int>? updatedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (cacheKey != null) 'cache_key': cacheKey,
      if (data != null) 'data': data,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  AttendanceCacheCompanion copyWith(
      {Value<String>? cacheKey,
      Value<String>? data,
      Value<int>? updatedAt,
      Value<int>? rowid}) {
    return AttendanceCacheCompanion(
      cacheKey: cacheKey ?? this.cacheKey,
      data: data ?? this.data,
      updatedAt: updatedAt ?? this.updatedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (cacheKey.present) {
      map['cache_key'] = Variable<String>(cacheKey.value);
    }
    if (data.present) {
      map['data'] = Variable<String>(data.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<int>(updatedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('AttendanceCacheCompanion(')
          ..write('cacheKey: $cacheKey, ')
          ..write('data: $data, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $NotificationsCacheTable extends NotificationsCache
    with TableInfo<$NotificationsCacheTable, NotificationsCacheRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $NotificationsCacheTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _cacheKeyMeta =
      const VerificationMeta('cacheKey');
  @override
  late final GeneratedColumn<String> cacheKey = GeneratedColumn<String>(
      'cache_key', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _dataMeta = const VerificationMeta('data');
  @override
  late final GeneratedColumn<String> data = GeneratedColumn<String>(
      'data', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _updatedAtMeta =
      const VerificationMeta('updatedAt');
  @override
  late final GeneratedColumn<int> updatedAt = GeneratedColumn<int>(
      'updated_at', aliasedName, false,
      type: DriftSqlType.int, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns => [cacheKey, data, updatedAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'notifications_cache';
  @override
  VerificationContext validateIntegrity(
      Insertable<NotificationsCacheRow> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('cache_key')) {
      context.handle(_cacheKeyMeta,
          cacheKey.isAcceptableOrUnknown(data['cache_key']!, _cacheKeyMeta));
    } else if (isInserting) {
      context.missing(_cacheKeyMeta);
    }
    if (data.containsKey('data')) {
      context.handle(
          _dataMeta, this.data.isAcceptableOrUnknown(data['data']!, _dataMeta));
    } else if (isInserting) {
      context.missing(_dataMeta);
    }
    if (data.containsKey('updated_at')) {
      context.handle(_updatedAtMeta,
          updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta));
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {cacheKey};
  @override
  NotificationsCacheRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return NotificationsCacheRow(
      cacheKey: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}cache_key'])!,
      data: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}data'])!,
      updatedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}updated_at'])!,
    );
  }

  @override
  $NotificationsCacheTable createAlias(String alias) {
    return $NotificationsCacheTable(attachedDatabase, alias);
  }
}

class NotificationsCacheRow extends DataClass
    implements Insertable<NotificationsCacheRow> {
  final String cacheKey;
  final String data;
  final int updatedAt;
  const NotificationsCacheRow(
      {required this.cacheKey, required this.data, required this.updatedAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['cache_key'] = Variable<String>(cacheKey);
    map['data'] = Variable<String>(data);
    map['updated_at'] = Variable<int>(updatedAt);
    return map;
  }

  NotificationsCacheCompanion toCompanion(bool nullToAbsent) {
    return NotificationsCacheCompanion(
      cacheKey: Value(cacheKey),
      data: Value(data),
      updatedAt: Value(updatedAt),
    );
  }

  factory NotificationsCacheRow.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return NotificationsCacheRow(
      cacheKey: serializer.fromJson<String>(json['cacheKey']),
      data: serializer.fromJson<String>(json['data']),
      updatedAt: serializer.fromJson<int>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'cacheKey': serializer.toJson<String>(cacheKey),
      'data': serializer.toJson<String>(data),
      'updatedAt': serializer.toJson<int>(updatedAt),
    };
  }

  NotificationsCacheRow copyWith(
          {String? cacheKey, String? data, int? updatedAt}) =>
      NotificationsCacheRow(
        cacheKey: cacheKey ?? this.cacheKey,
        data: data ?? this.data,
        updatedAt: updatedAt ?? this.updatedAt,
      );
  NotificationsCacheRow copyWithCompanion(NotificationsCacheCompanion data) {
    return NotificationsCacheRow(
      cacheKey: data.cacheKey.present ? data.cacheKey.value : this.cacheKey,
      data: data.data.present ? data.data.value : this.data,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('NotificationsCacheRow(')
          ..write('cacheKey: $cacheKey, ')
          ..write('data: $data, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(cacheKey, data, updatedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is NotificationsCacheRow &&
          other.cacheKey == this.cacheKey &&
          other.data == this.data &&
          other.updatedAt == this.updatedAt);
}

class NotificationsCacheCompanion
    extends UpdateCompanion<NotificationsCacheRow> {
  final Value<String> cacheKey;
  final Value<String> data;
  final Value<int> updatedAt;
  final Value<int> rowid;
  const NotificationsCacheCompanion({
    this.cacheKey = const Value.absent(),
    this.data = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  NotificationsCacheCompanion.insert({
    required String cacheKey,
    required String data,
    required int updatedAt,
    this.rowid = const Value.absent(),
  })  : cacheKey = Value(cacheKey),
        data = Value(data),
        updatedAt = Value(updatedAt);
  static Insertable<NotificationsCacheRow> custom({
    Expression<String>? cacheKey,
    Expression<String>? data,
    Expression<int>? updatedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (cacheKey != null) 'cache_key': cacheKey,
      if (data != null) 'data': data,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  NotificationsCacheCompanion copyWith(
      {Value<String>? cacheKey,
      Value<String>? data,
      Value<int>? updatedAt,
      Value<int>? rowid}) {
    return NotificationsCacheCompanion(
      cacheKey: cacheKey ?? this.cacheKey,
      data: data ?? this.data,
      updatedAt: updatedAt ?? this.updatedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (cacheKey.present) {
      map['cache_key'] = Variable<String>(cacheKey.value);
    }
    if (data.present) {
      map['data'] = Variable<String>(data.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<int>(updatedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('NotificationsCacheCompanion(')
          ..write('cacheKey: $cacheKey, ')
          ..write('data: $data, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

abstract class _$LocalDatabase extends GeneratedDatabase {
  _$LocalDatabase(QueryExecutor e) : super(e);
  $LocalDatabaseManager get managers => $LocalDatabaseManager(this);
  late final $KvStoreTable kvStore = $KvStoreTable(this);
  late final $ProfileCacheTable profileCache = $ProfileCacheTable(this);
  late final $SchedulesCacheTable schedulesCache = $SchedulesCacheTable(this);
  late final $AttendanceCacheTable attendanceCache =
      $AttendanceCacheTable(this);
  late final $NotificationsCacheTable notificationsCache =
      $NotificationsCacheTable(this);
  late final KvStoreDao kvStoreDao = KvStoreDao(this as LocalDatabase);
  late final ProfileCacheDao profileCacheDao =
      ProfileCacheDao(this as LocalDatabase);
  late final SchedulesCacheDao schedulesCacheDao =
      SchedulesCacheDao(this as LocalDatabase);
  late final AttendanceCacheDao attendanceCacheDao =
      AttendanceCacheDao(this as LocalDatabase);
  late final NotificationsCacheDao notificationsCacheDao =
      NotificationsCacheDao(this as LocalDatabase);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [
        kvStore,
        profileCache,
        schedulesCache,
        attendanceCache,
        notificationsCache
      ];
}

typedef $$KvStoreTableCreateCompanionBuilder = KvStoreCompanion Function({
  required String key,
  required String value,
  required String namespace,
  required int updatedAt,
  Value<int?> expiresAt,
  Value<int> rowid,
});
typedef $$KvStoreTableUpdateCompanionBuilder = KvStoreCompanion Function({
  Value<String> key,
  Value<String> value,
  Value<String> namespace,
  Value<int> updatedAt,
  Value<int?> expiresAt,
  Value<int> rowid,
});

class $$KvStoreTableFilterComposer
    extends Composer<_$LocalDatabase, $KvStoreTable> {
  $$KvStoreTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get key => $composableBuilder(
      column: $table.key, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get value => $composableBuilder(
      column: $table.value, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get namespace => $composableBuilder(
      column: $table.namespace, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get updatedAt => $composableBuilder(
      column: $table.updatedAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get expiresAt => $composableBuilder(
      column: $table.expiresAt, builder: (column) => ColumnFilters(column));
}

class $$KvStoreTableOrderingComposer
    extends Composer<_$LocalDatabase, $KvStoreTable> {
  $$KvStoreTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get key => $composableBuilder(
      column: $table.key, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get value => $composableBuilder(
      column: $table.value, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get namespace => $composableBuilder(
      column: $table.namespace, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get updatedAt => $composableBuilder(
      column: $table.updatedAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get expiresAt => $composableBuilder(
      column: $table.expiresAt, builder: (column) => ColumnOrderings(column));
}

class $$KvStoreTableAnnotationComposer
    extends Composer<_$LocalDatabase, $KvStoreTable> {
  $$KvStoreTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get key =>
      $composableBuilder(column: $table.key, builder: (column) => column);

  GeneratedColumn<String> get value =>
      $composableBuilder(column: $table.value, builder: (column) => column);

  GeneratedColumn<String> get namespace =>
      $composableBuilder(column: $table.namespace, builder: (column) => column);

  GeneratedColumn<int> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);

  GeneratedColumn<int> get expiresAt =>
      $composableBuilder(column: $table.expiresAt, builder: (column) => column);
}

class $$KvStoreTableTableManager extends RootTableManager<
    _$LocalDatabase,
    $KvStoreTable,
    KvEntry,
    $$KvStoreTableFilterComposer,
    $$KvStoreTableOrderingComposer,
    $$KvStoreTableAnnotationComposer,
    $$KvStoreTableCreateCompanionBuilder,
    $$KvStoreTableUpdateCompanionBuilder,
    (KvEntry, BaseReferences<_$LocalDatabase, $KvStoreTable, KvEntry>),
    KvEntry,
    PrefetchHooks Function()> {
  $$KvStoreTableTableManager(_$LocalDatabase db, $KvStoreTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$KvStoreTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$KvStoreTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$KvStoreTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> key = const Value.absent(),
            Value<String> value = const Value.absent(),
            Value<String> namespace = const Value.absent(),
            Value<int> updatedAt = const Value.absent(),
            Value<int?> expiresAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              KvStoreCompanion(
            key: key,
            value: value,
            namespace: namespace,
            updatedAt: updatedAt,
            expiresAt: expiresAt,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String key,
            required String value,
            required String namespace,
            required int updatedAt,
            Value<int?> expiresAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              KvStoreCompanion.insert(
            key: key,
            value: value,
            namespace: namespace,
            updatedAt: updatedAt,
            expiresAt: expiresAt,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$KvStoreTableProcessedTableManager = ProcessedTableManager<
    _$LocalDatabase,
    $KvStoreTable,
    KvEntry,
    $$KvStoreTableFilterComposer,
    $$KvStoreTableOrderingComposer,
    $$KvStoreTableAnnotationComposer,
    $$KvStoreTableCreateCompanionBuilder,
    $$KvStoreTableUpdateCompanionBuilder,
    (KvEntry, BaseReferences<_$LocalDatabase, $KvStoreTable, KvEntry>),
    KvEntry,
    PrefetchHooks Function()>;
typedef $$ProfileCacheTableCreateCompanionBuilder = ProfileCacheCompanion
    Function({
  required String userId,
  required String data,
  required int updatedAt,
  Value<int> rowid,
});
typedef $$ProfileCacheTableUpdateCompanionBuilder = ProfileCacheCompanion
    Function({
  Value<String> userId,
  Value<String> data,
  Value<int> updatedAt,
  Value<int> rowid,
});

class $$ProfileCacheTableFilterComposer
    extends Composer<_$LocalDatabase, $ProfileCacheTable> {
  $$ProfileCacheTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get userId => $composableBuilder(
      column: $table.userId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get data => $composableBuilder(
      column: $table.data, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get updatedAt => $composableBuilder(
      column: $table.updatedAt, builder: (column) => ColumnFilters(column));
}

class $$ProfileCacheTableOrderingComposer
    extends Composer<_$LocalDatabase, $ProfileCacheTable> {
  $$ProfileCacheTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get userId => $composableBuilder(
      column: $table.userId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get data => $composableBuilder(
      column: $table.data, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get updatedAt => $composableBuilder(
      column: $table.updatedAt, builder: (column) => ColumnOrderings(column));
}

class $$ProfileCacheTableAnnotationComposer
    extends Composer<_$LocalDatabase, $ProfileCacheTable> {
  $$ProfileCacheTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get userId =>
      $composableBuilder(column: $table.userId, builder: (column) => column);

  GeneratedColumn<String> get data =>
      $composableBuilder(column: $table.data, builder: (column) => column);

  GeneratedColumn<int> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);
}

class $$ProfileCacheTableTableManager extends RootTableManager<
    _$LocalDatabase,
    $ProfileCacheTable,
    ProfileCacheRow,
    $$ProfileCacheTableFilterComposer,
    $$ProfileCacheTableOrderingComposer,
    $$ProfileCacheTableAnnotationComposer,
    $$ProfileCacheTableCreateCompanionBuilder,
    $$ProfileCacheTableUpdateCompanionBuilder,
    (
      ProfileCacheRow,
      BaseReferences<_$LocalDatabase, $ProfileCacheTable, ProfileCacheRow>
    ),
    ProfileCacheRow,
    PrefetchHooks Function()> {
  $$ProfileCacheTableTableManager(_$LocalDatabase db, $ProfileCacheTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$ProfileCacheTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$ProfileCacheTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$ProfileCacheTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> userId = const Value.absent(),
            Value<String> data = const Value.absent(),
            Value<int> updatedAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              ProfileCacheCompanion(
            userId: userId,
            data: data,
            updatedAt: updatedAt,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String userId,
            required String data,
            required int updatedAt,
            Value<int> rowid = const Value.absent(),
          }) =>
              ProfileCacheCompanion.insert(
            userId: userId,
            data: data,
            updatedAt: updatedAt,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$ProfileCacheTableProcessedTableManager = ProcessedTableManager<
    _$LocalDatabase,
    $ProfileCacheTable,
    ProfileCacheRow,
    $$ProfileCacheTableFilterComposer,
    $$ProfileCacheTableOrderingComposer,
    $$ProfileCacheTableAnnotationComposer,
    $$ProfileCacheTableCreateCompanionBuilder,
    $$ProfileCacheTableUpdateCompanionBuilder,
    (
      ProfileCacheRow,
      BaseReferences<_$LocalDatabase, $ProfileCacheTable, ProfileCacheRow>
    ),
    ProfileCacheRow,
    PrefetchHooks Function()>;
typedef $$SchedulesCacheTableCreateCompanionBuilder = SchedulesCacheCompanion
    Function({
  required String cacheKey,
  required String data,
  required int updatedAt,
  Value<int> rowid,
});
typedef $$SchedulesCacheTableUpdateCompanionBuilder = SchedulesCacheCompanion
    Function({
  Value<String> cacheKey,
  Value<String> data,
  Value<int> updatedAt,
  Value<int> rowid,
});

class $$SchedulesCacheTableFilterComposer
    extends Composer<_$LocalDatabase, $SchedulesCacheTable> {
  $$SchedulesCacheTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get cacheKey => $composableBuilder(
      column: $table.cacheKey, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get data => $composableBuilder(
      column: $table.data, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get updatedAt => $composableBuilder(
      column: $table.updatedAt, builder: (column) => ColumnFilters(column));
}

class $$SchedulesCacheTableOrderingComposer
    extends Composer<_$LocalDatabase, $SchedulesCacheTable> {
  $$SchedulesCacheTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get cacheKey => $composableBuilder(
      column: $table.cacheKey, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get data => $composableBuilder(
      column: $table.data, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get updatedAt => $composableBuilder(
      column: $table.updatedAt, builder: (column) => ColumnOrderings(column));
}

class $$SchedulesCacheTableAnnotationComposer
    extends Composer<_$LocalDatabase, $SchedulesCacheTable> {
  $$SchedulesCacheTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get cacheKey =>
      $composableBuilder(column: $table.cacheKey, builder: (column) => column);

  GeneratedColumn<String> get data =>
      $composableBuilder(column: $table.data, builder: (column) => column);

  GeneratedColumn<int> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);
}

class $$SchedulesCacheTableTableManager extends RootTableManager<
    _$LocalDatabase,
    $SchedulesCacheTable,
    SchedulesCacheRow,
    $$SchedulesCacheTableFilterComposer,
    $$SchedulesCacheTableOrderingComposer,
    $$SchedulesCacheTableAnnotationComposer,
    $$SchedulesCacheTableCreateCompanionBuilder,
    $$SchedulesCacheTableUpdateCompanionBuilder,
    (
      SchedulesCacheRow,
      BaseReferences<_$LocalDatabase, $SchedulesCacheTable, SchedulesCacheRow>
    ),
    SchedulesCacheRow,
    PrefetchHooks Function()> {
  $$SchedulesCacheTableTableManager(
      _$LocalDatabase db, $SchedulesCacheTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$SchedulesCacheTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$SchedulesCacheTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$SchedulesCacheTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> cacheKey = const Value.absent(),
            Value<String> data = const Value.absent(),
            Value<int> updatedAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              SchedulesCacheCompanion(
            cacheKey: cacheKey,
            data: data,
            updatedAt: updatedAt,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String cacheKey,
            required String data,
            required int updatedAt,
            Value<int> rowid = const Value.absent(),
          }) =>
              SchedulesCacheCompanion.insert(
            cacheKey: cacheKey,
            data: data,
            updatedAt: updatedAt,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$SchedulesCacheTableProcessedTableManager = ProcessedTableManager<
    _$LocalDatabase,
    $SchedulesCacheTable,
    SchedulesCacheRow,
    $$SchedulesCacheTableFilterComposer,
    $$SchedulesCacheTableOrderingComposer,
    $$SchedulesCacheTableAnnotationComposer,
    $$SchedulesCacheTableCreateCompanionBuilder,
    $$SchedulesCacheTableUpdateCompanionBuilder,
    (
      SchedulesCacheRow,
      BaseReferences<_$LocalDatabase, $SchedulesCacheTable, SchedulesCacheRow>
    ),
    SchedulesCacheRow,
    PrefetchHooks Function()>;
typedef $$AttendanceCacheTableCreateCompanionBuilder = AttendanceCacheCompanion
    Function({
  required String cacheKey,
  required String data,
  required int updatedAt,
  Value<int> rowid,
});
typedef $$AttendanceCacheTableUpdateCompanionBuilder = AttendanceCacheCompanion
    Function({
  Value<String> cacheKey,
  Value<String> data,
  Value<int> updatedAt,
  Value<int> rowid,
});

class $$AttendanceCacheTableFilterComposer
    extends Composer<_$LocalDatabase, $AttendanceCacheTable> {
  $$AttendanceCacheTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get cacheKey => $composableBuilder(
      column: $table.cacheKey, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get data => $composableBuilder(
      column: $table.data, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get updatedAt => $composableBuilder(
      column: $table.updatedAt, builder: (column) => ColumnFilters(column));
}

class $$AttendanceCacheTableOrderingComposer
    extends Composer<_$LocalDatabase, $AttendanceCacheTable> {
  $$AttendanceCacheTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get cacheKey => $composableBuilder(
      column: $table.cacheKey, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get data => $composableBuilder(
      column: $table.data, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get updatedAt => $composableBuilder(
      column: $table.updatedAt, builder: (column) => ColumnOrderings(column));
}

class $$AttendanceCacheTableAnnotationComposer
    extends Composer<_$LocalDatabase, $AttendanceCacheTable> {
  $$AttendanceCacheTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get cacheKey =>
      $composableBuilder(column: $table.cacheKey, builder: (column) => column);

  GeneratedColumn<String> get data =>
      $composableBuilder(column: $table.data, builder: (column) => column);

  GeneratedColumn<int> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);
}

class $$AttendanceCacheTableTableManager extends RootTableManager<
    _$LocalDatabase,
    $AttendanceCacheTable,
    AttendanceCacheRow,
    $$AttendanceCacheTableFilterComposer,
    $$AttendanceCacheTableOrderingComposer,
    $$AttendanceCacheTableAnnotationComposer,
    $$AttendanceCacheTableCreateCompanionBuilder,
    $$AttendanceCacheTableUpdateCompanionBuilder,
    (
      AttendanceCacheRow,
      BaseReferences<_$LocalDatabase, $AttendanceCacheTable, AttendanceCacheRow>
    ),
    AttendanceCacheRow,
    PrefetchHooks Function()> {
  $$AttendanceCacheTableTableManager(
      _$LocalDatabase db, $AttendanceCacheTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$AttendanceCacheTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$AttendanceCacheTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$AttendanceCacheTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> cacheKey = const Value.absent(),
            Value<String> data = const Value.absent(),
            Value<int> updatedAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              AttendanceCacheCompanion(
            cacheKey: cacheKey,
            data: data,
            updatedAt: updatedAt,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String cacheKey,
            required String data,
            required int updatedAt,
            Value<int> rowid = const Value.absent(),
          }) =>
              AttendanceCacheCompanion.insert(
            cacheKey: cacheKey,
            data: data,
            updatedAt: updatedAt,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$AttendanceCacheTableProcessedTableManager = ProcessedTableManager<
    _$LocalDatabase,
    $AttendanceCacheTable,
    AttendanceCacheRow,
    $$AttendanceCacheTableFilterComposer,
    $$AttendanceCacheTableOrderingComposer,
    $$AttendanceCacheTableAnnotationComposer,
    $$AttendanceCacheTableCreateCompanionBuilder,
    $$AttendanceCacheTableUpdateCompanionBuilder,
    (
      AttendanceCacheRow,
      BaseReferences<_$LocalDatabase, $AttendanceCacheTable, AttendanceCacheRow>
    ),
    AttendanceCacheRow,
    PrefetchHooks Function()>;
typedef $$NotificationsCacheTableCreateCompanionBuilder
    = NotificationsCacheCompanion Function({
  required String cacheKey,
  required String data,
  required int updatedAt,
  Value<int> rowid,
});
typedef $$NotificationsCacheTableUpdateCompanionBuilder
    = NotificationsCacheCompanion Function({
  Value<String> cacheKey,
  Value<String> data,
  Value<int> updatedAt,
  Value<int> rowid,
});

class $$NotificationsCacheTableFilterComposer
    extends Composer<_$LocalDatabase, $NotificationsCacheTable> {
  $$NotificationsCacheTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get cacheKey => $composableBuilder(
      column: $table.cacheKey, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get data => $composableBuilder(
      column: $table.data, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get updatedAt => $composableBuilder(
      column: $table.updatedAt, builder: (column) => ColumnFilters(column));
}

class $$NotificationsCacheTableOrderingComposer
    extends Composer<_$LocalDatabase, $NotificationsCacheTable> {
  $$NotificationsCacheTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get cacheKey => $composableBuilder(
      column: $table.cacheKey, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get data => $composableBuilder(
      column: $table.data, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get updatedAt => $composableBuilder(
      column: $table.updatedAt, builder: (column) => ColumnOrderings(column));
}

class $$NotificationsCacheTableAnnotationComposer
    extends Composer<_$LocalDatabase, $NotificationsCacheTable> {
  $$NotificationsCacheTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get cacheKey =>
      $composableBuilder(column: $table.cacheKey, builder: (column) => column);

  GeneratedColumn<String> get data =>
      $composableBuilder(column: $table.data, builder: (column) => column);

  GeneratedColumn<int> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);
}

class $$NotificationsCacheTableTableManager extends RootTableManager<
    _$LocalDatabase,
    $NotificationsCacheTable,
    NotificationsCacheRow,
    $$NotificationsCacheTableFilterComposer,
    $$NotificationsCacheTableOrderingComposer,
    $$NotificationsCacheTableAnnotationComposer,
    $$NotificationsCacheTableCreateCompanionBuilder,
    $$NotificationsCacheTableUpdateCompanionBuilder,
    (
      NotificationsCacheRow,
      BaseReferences<_$LocalDatabase, $NotificationsCacheTable,
          NotificationsCacheRow>
    ),
    NotificationsCacheRow,
    PrefetchHooks Function()> {
  $$NotificationsCacheTableTableManager(
      _$LocalDatabase db, $NotificationsCacheTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$NotificationsCacheTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$NotificationsCacheTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$NotificationsCacheTableAnnotationComposer(
                  $db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> cacheKey = const Value.absent(),
            Value<String> data = const Value.absent(),
            Value<int> updatedAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              NotificationsCacheCompanion(
            cacheKey: cacheKey,
            data: data,
            updatedAt: updatedAt,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String cacheKey,
            required String data,
            required int updatedAt,
            Value<int> rowid = const Value.absent(),
          }) =>
              NotificationsCacheCompanion.insert(
            cacheKey: cacheKey,
            data: data,
            updatedAt: updatedAt,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$NotificationsCacheTableProcessedTableManager = ProcessedTableManager<
    _$LocalDatabase,
    $NotificationsCacheTable,
    NotificationsCacheRow,
    $$NotificationsCacheTableFilterComposer,
    $$NotificationsCacheTableOrderingComposer,
    $$NotificationsCacheTableAnnotationComposer,
    $$NotificationsCacheTableCreateCompanionBuilder,
    $$NotificationsCacheTableUpdateCompanionBuilder,
    (
      NotificationsCacheRow,
      BaseReferences<_$LocalDatabase, $NotificationsCacheTable,
          NotificationsCacheRow>
    ),
    NotificationsCacheRow,
    PrefetchHooks Function()>;

class $LocalDatabaseManager {
  final _$LocalDatabase _db;
  $LocalDatabaseManager(this._db);
  $$KvStoreTableTableManager get kvStore =>
      $$KvStoreTableTableManager(_db, _db.kvStore);
  $$ProfileCacheTableTableManager get profileCache =>
      $$ProfileCacheTableTableManager(_db, _db.profileCache);
  $$SchedulesCacheTableTableManager get schedulesCache =>
      $$SchedulesCacheTableTableManager(_db, _db.schedulesCache);
  $$AttendanceCacheTableTableManager get attendanceCache =>
      $$AttendanceCacheTableTableManager(_db, _db.attendanceCache);
  $$NotificationsCacheTableTableManager get notificationsCache =>
      $$NotificationsCacheTableTableManager(_db, _db.notificationsCache);
}
