import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:mime/mime.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

/// 업로드 카테고리 (서버 UploadCategory enum 과 1:1)
enum UploadCategory {
  image('IMAGE'),
  avatar('AVATAR'),
  document('DOCUMENT'),
  video('VIDEO'),
  attachment('ATTACHMENT');

  final String serverName;
  const UploadCategory(this.serverName);

  static UploadCategory fromString(String value) {
    final normalized = value.toUpperCase();
    return UploadCategory.values.firstWhere(
      (c) => c.serverName == normalized,
      orElse: () => throw ArgumentError('Unknown upload category: $value'),
    );
  }

  String get dirName => serverName.toLowerCase();
}

/// 로컬 파일 저장소 서비스
///
/// 앱 내부 `ApplicationDocumentsDirectory/teamplus_uploads/{category}/{YYYY}/{MM}/`
/// 경로에 파일을 저장·읽기·이름변경·삭제·조회한다.
///
/// ## 보안: Path Sandbox
/// 모든 path 인자는 `teamplus_uploads/` 바운더리 안에 있어야 한다.
/// 바깥 경로 접근 시 [FileStorageException] 발생.
class FileStorageService {
  FileStorageService();

  static const String _rootDirName = 'teamplus_uploads';
  static const int _maxFilenameLength = 180;

  Directory? _rootCache;

  /// 루트 디렉토리 (`<docs>/teamplus_uploads/`) — 최초 호출 시 생성
  Future<Directory> get root async {
    if (_rootCache != null) return _rootCache!;
    final docs = await getApplicationDocumentsDirectory();
    final root = Directory(p.join(docs.path, _rootDirName));
    if (!await root.exists()) {
      await root.create(recursive: true);
    }
    _rootCache = root;
    return root;
  }

  /// 카테고리 + 연월 디렉토리 반환 (없으면 생성)
  Future<Directory> resolveMonthlyDir(UploadCategory category) async {
    final rootDir = await root;
    final now = DateTime.now().toUtc();
    final year = now.year.toString();
    final month = now.month.toString().padLeft(2, '0');
    final dir = Directory(p.join(rootDir.path, category.dirName, year, month));
    if (!await dir.exists()) {
      await dir.create(recursive: true);
    }
    return dir;
  }

  /// Base64 문자열 → 파일 저장 (자동 연월 디렉토리)
  ///
  /// [originalName] 은 정보용으로만 보관되며, 실제 저장 파일명은 안전하게 새로 만든다.
  Future<StoredFile> saveBase64({
    required String base64Data,
    required UploadCategory category,
    required String originalName,
  }) async {
    final bytes = _decodeBase64(base64Data);
    return saveBytes(
      bytes: bytes,
      category: category,
      originalName: originalName,
    );
  }

  /// 바이트 → 파일 저장
  Future<StoredFile> saveBytes({
    required Uint8List bytes,
    required UploadCategory category,
    required String originalName,
  }) async {
    final dir = await resolveMonthlyDir(category);
    final ext = _safeExtension(originalName);
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final random = _randomHex(8);
    final storedName = '$timestamp-$random$ext';
    final file = File(p.join(dir.path, storedName));

    await file.writeAsBytes(bytes, flush: true);

    return StoredFile(
      path: file.path,
      relativePath: _toRelative(file.path, await _rootPath()),
      originalName: _sanitizeOriginalName(originalName),
      storedName: storedName,
      size: bytes.length,
      mimeType:
          lookupMimeType(file.path, headerBytes: bytes.take(16).toList()) ??
              'application/octet-stream',
      createdAt: DateTime.now().toUtc(),
      category: category,
    );
  }

  /// 파일 읽기 (base64 반환)
  Future<StoredFileContent> readAsBase64(String absolutePath) async {
    final file = await _assertInsideRoot(absolutePath);
    final bytes = await file.readAsBytes();
    return StoredFileContent(
      path: file.path,
      size: bytes.length,
      mimeType:
          lookupMimeType(file.path, headerBytes: bytes.take(16).toList()) ??
              'application/octet-stream',
      dataBase64: base64Encode(bytes),
    );
  }

  /// 카테고리(선택) 내 모든 파일 목록
  Future<List<StoredFileMeta>> list({UploadCategory? category}) async {
    final rootDir = await root;
    final target = category == null
        ? rootDir
        : Directory(p.join(rootDir.path, category.dirName));
    if (!await target.exists()) return const [];

    final results = <StoredFileMeta>[];
    await for (final entity
        in target.list(recursive: true, followLinks: false)) {
      if (entity is! File) continue;
      final stat = await entity.stat();
      final relative = _toRelative(entity.path, rootDir.path);
      final segments = p.split(relative);
      UploadCategory? resolvedCategory;
      if (segments.isNotEmpty) {
        resolvedCategory = UploadCategory.values.firstWhere(
          (c) => c.dirName == segments.first,
          orElse: () => UploadCategory.attachment,
        );
      }
      results.add(StoredFileMeta(
        path: entity.path,
        relativePath: relative,
        size: stat.size,
        modifiedAt: stat.modified.toUtc(),
        category: resolvedCategory ?? UploadCategory.attachment,
        storedName: p.basename(entity.path),
        mimeType: lookupMimeType(entity.path) ?? 'application/octet-stream',
      ));
    }
    results.sort((a, b) => b.modifiedAt.compareTo(a.modifiedAt));
    return results;
  }

  /// 파일명 변경 (연월 디렉토리 유지)
  Future<StoredFileMeta> rename({
    required String oldAbsolutePath,
    required String newFileName,
  }) async {
    final source = await _assertInsideRoot(oldAbsolutePath);
    final sanitized = _sanitizeOriginalName(newFileName);
    final ext = _safeExtension(sanitized);
    final dir = source.parent;
    final base = p.basenameWithoutExtension(sanitized);
    final candidate = '$base$ext';
    final destPath = p.join(dir.path, candidate);

    if (candidate.isEmpty || candidate == '.') {
      throw const FileStorageException(
          'NEW_NAME_INVALID', '변경할 파일명이 올바르지 않습니다.');
    }
    if (await File(destPath).exists()) {
      throw const FileStorageException(
          'NEW_NAME_CONFLICT', '같은 이름의 파일이 이미 존재합니다.');
    }

    await _assertInsideRoot(destPath, allowMissing: true);
    final renamed = await source.rename(destPath);
    final stat = await renamed.stat();
    final rootPath = await _rootPath();
    return StoredFileMeta(
      path: renamed.path,
      relativePath: _toRelative(renamed.path, rootPath),
      size: stat.size,
      modifiedAt: stat.modified.toUtc(),
      category: _categoryFromPath(renamed.path, rootPath) ??
          UploadCategory.attachment,
      storedName: p.basename(renamed.path),
      mimeType: lookupMimeType(renamed.path) ?? 'application/octet-stream',
    );
  }

  /// 단일 파일 삭제
  Future<void> delete(String absolutePath) async {
    final file = await _assertInsideRoot(absolutePath);
    if (await file.exists()) {
      await file.delete();
    }
  }

  /// 카테고리 전체 삭제 (디렉토리째 비우기 — 연월 구조 유지)
  Future<int> clearCategory(UploadCategory category) async {
    final rootDir = await root;
    final target = Directory(p.join(rootDir.path, category.dirName));
    if (!await target.exists()) return 0;

    var deleted = 0;
    await for (final entity
        in target.list(recursive: true, followLinks: false)) {
      if (entity is File) {
        await entity.delete();
        deleted += 1;
      }
    }
    return deleted;
  }

  /// 저장소 정보 (총 사용량 · 카테고리별 파일 수)
  Future<StorageInfo> storageInfo() async {
    final rootDir = await root;
    final byCategory = <String, int>{};
    var totalBytes = 0;
    var totalFiles = 0;

    for (final category in UploadCategory.values) {
      final dir = Directory(p.join(rootDir.path, category.dirName));
      if (!await dir.exists()) {
        byCategory[category.serverName] = 0;
        continue;
      }
      var count = 0;
      await for (final entity
          in dir.list(recursive: true, followLinks: false)) {
        if (entity is! File) continue;
        final stat = await entity.stat();
        totalBytes += stat.size;
        totalFiles += 1;
        count += 1;
      }
      byCategory[category.serverName] = count;
    }

    return StorageInfo(
      totalBytes: totalBytes,
      fileCount: totalFiles,
      byCategory: byCategory,
      rootPath: rootDir.path,
    );
  }

  // ==================== 내부 유틸 ====================

  Future<String> _rootPath() async => (await root).path;

  /// 루트 밖 접근 시 예외 발생
  Future<File> _assertInsideRoot(String absolutePath,
      {bool allowMissing = false}) async {
    final rootDir = await root;
    final normalized = p.normalize(p.absolute(absolutePath));
    final rootNormalized = p.normalize(rootDir.path);
    if (!p.isWithin(rootNormalized, normalized) &&
        normalized != rootNormalized) {
      throw const FileStorageException(
        'PATH_OUTSIDE_SANDBOX',
        '허용되지 않은 경로 접근입니다.',
      );
    }
    final file = File(normalized);
    if (!allowMissing && !await file.exists()) {
      throw const FileStorageException('FILE_NOT_FOUND', '파일을 찾을 수 없습니다.');
    }
    return file;
  }

  UploadCategory? _categoryFromPath(String absolutePath, String rootPath) {
    final relative = _toRelative(absolutePath, rootPath);
    final segments = p.split(relative);
    if (segments.isEmpty) return null;
    for (final c in UploadCategory.values) {
      if (c.dirName == segments.first) return c;
    }
    return null;
  }

  String _toRelative(String absolute, String root) {
    return p.relative(absolute, from: root);
  }

  String _sanitizeOriginalName(String name) {
    final base = p.basename(name).trim();
    if (base.isEmpty) return 'file';
    final cleaned = base
        .replaceAll(RegExp(r'[\x00-\x1f<>:"|?*\\\/]'), '')
        .replaceAll(RegExp(r'^\.+'), '');
    final result = cleaned.isEmpty ? 'file' : cleaned;
    return result.length > _maxFilenameLength
        ? result.substring(0, _maxFilenameLength)
        : result;
  }

  String _safeExtension(String name) {
    final raw = p.extension(name).toLowerCase();
    final safe = raw.replaceAll(RegExp(r'[^.a-z0-9]'), '');
    return safe.length > 10 ? safe.substring(0, 10) : safe;
  }

  Uint8List _decodeBase64(String data) {
    final cleaned =
        data.contains(',') ? data.substring(data.indexOf(',') + 1) : data;
    try {
      return base64Decode(cleaned);
    } catch (_) {
      throw const FileStorageException(
          'INVALID_BASE64', 'base64 데이터가 올바르지 않습니다.');
    }
  }

  String _randomHex(int bytes) {
    final random = math.Random.secure();
    final values = List<int>.generate(bytes, (_) => random.nextInt(256));
    return values.map((v) => v.toRadixString(16).padLeft(2, '0')).join();
  }
}

/// 저장 완료 결과
class StoredFile {
  final String path;
  final String relativePath;
  final String originalName;
  final String storedName;
  final int size;
  final String mimeType;
  final DateTime createdAt;
  final UploadCategory category;

  const StoredFile({
    required this.path,
    required this.relativePath,
    required this.originalName,
    required this.storedName,
    required this.size,
    required this.mimeType,
    required this.createdAt,
    required this.category,
  });

  Map<String, dynamic> toJson() => {
        'path': path,
        'relativePath': relativePath,
        'originalName': originalName,
        'storedName': storedName,
        'size': size,
        'mimeType': mimeType,
        'createdAt': createdAt.toIso8601String(),
        'category': category.serverName,
      };
}

/// 조회 결과 (path·size·mime)
class StoredFileMeta {
  final String path;
  final String relativePath;
  final int size;
  final DateTime modifiedAt;
  final UploadCategory category;
  final String storedName;
  final String mimeType;

  const StoredFileMeta({
    required this.path,
    required this.relativePath,
    required this.size,
    required this.modifiedAt,
    required this.category,
    required this.storedName,
    required this.mimeType,
  });

  Map<String, dynamic> toJson() => {
        'path': path,
        'relativePath': relativePath,
        'size': size,
        'modifiedAt': modifiedAt.toIso8601String(),
        'category': category.serverName,
        'storedName': storedName,
        'mimeType': mimeType,
      };
}

/// 파일 읽기 결과 (dataBase64 포함)
class StoredFileContent {
  final String path;
  final int size;
  final String mimeType;
  final String dataBase64;

  const StoredFileContent({
    required this.path,
    required this.size,
    required this.mimeType,
    required this.dataBase64,
  });

  Map<String, dynamic> toJson() => {
        'path': path,
        'size': size,
        'mimeType': mimeType,
        'dataBase64': dataBase64,
      };
}

/// 저장소 통계
class StorageInfo {
  final int totalBytes;
  final int fileCount;
  final Map<String, int> byCategory;
  final String rootPath;

  const StorageInfo({
    required this.totalBytes,
    required this.fileCount,
    required this.byCategory,
    required this.rootPath,
  });

  Map<String, dynamic> toJson() => {
        'totalBytes': totalBytes,
        'fileCount': fileCount,
        'byCategory': byCategory,
        'rootPath': rootPath,
      };
}

/// 파일 저장소 전용 예외
class FileStorageException implements Exception {
  final String code;
  final String message;

  const FileStorageException(this.code, this.message);

  @override
  String toString() => 'FileStorageException($code): $message';
}
