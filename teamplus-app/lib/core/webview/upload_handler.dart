import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart' show debugPrint;
import 'package:image_picker/image_picker.dart';
import 'package:mime/mime.dart';
import 'package:path/path.dart' as p;

import '../network/api_client.dart';
import '../storage/file_storage_service.dart';
import '../upload/permission_service.dart';
import '../upload/upload_service.dart';
import 'webview_bridge.dart';

/// Bridge `upload` 핸들러
///
/// ## 제공 액션 (`args[0]` = action string, `args[1]` = Map params)
/// - `pickImage`, `pickMultipleImages`, `pickFile`
/// - `uploadToServer`, `deleteRemote`
/// - `uploadVideo` (2026-05-23 — multipart 단일 채널, POST /api/v1/videos)
/// - `saveLocal`, `readLocal`, `listLocal`, `renameLocal`, `deleteLocal`
/// - `clearCategory`, `getStorageInfo`
/// - `requestPermission` (`{ kind: 'camera' | 'photos' | 'microphone' }`)
/// - `openSettings`
///
/// 모든 응답은 `{ success, data?, error? }` 형태.
/// 실패 시 `error = { code, message }`.
class UploadHandler {
  /// 싱글톤 인스턴스 — 내부 서비스(FileStorageService, UploadService,
  /// ImagePicker)를 앱 수명 동안 단 한 번만 초기화하여 재사용.
  ///
  /// 테스트 또는 의존성 주입이 필요한 경우 [UploadHandler.withDependencies]
  /// 팩터리를 통해 별도 인스턴스를 생성할 수 있다.
  static final UploadHandler _instance = UploadHandler._internal();

  /// 기본 factory — 항상 싱글톤 반환.
  /// 기존 `UploadHandler()` 호출부 인터페이스를 그대로 유지한다.
  factory UploadHandler() => _instance;

  /// 의존성 주입용 named constructor (테스트·특수 케이스 전용).
  factory UploadHandler.withDependencies({
    FileStorageService? storage,
    UploadPermissionService? permissions,
    UploadService? uploadService,
    ImagePicker? imagePicker,
  }) {
    return UploadHandler._custom(
      storage: storage ?? FileStorageService(),
      permissions: permissions ?? const UploadPermissionService(),
      uploadService: uploadService ?? UploadService(),
      imagePicker: imagePicker ?? ImagePicker(),
    );
  }

  /// 싱글톤 기본 초기화.
  UploadHandler._internal()
      : _storage = FileStorageService(),
        _permissions = const UploadPermissionService(),
        _uploadService = UploadService(),
        _imagePicker = ImagePicker(),
        _apiClient = ApiClient();

  /// 커스텀 의존성 초기화 (withDependencies 전용).
  UploadHandler._custom({
    required FileStorageService storage,
    required UploadPermissionService permissions,
    required UploadService uploadService,
    required ImagePicker imagePicker,
    ApiClient? apiClient,
  })  : _storage = storage,
        _permissions = permissions,
        _uploadService = uploadService,
        _imagePicker = imagePicker,
        _apiClient = apiClient ?? ApiClient();

  final FileStorageService _storage;
  final UploadPermissionService _permissions;
  final UploadService _uploadService;
  final ImagePicker _imagePicker;
  final ApiClient _apiClient;

  /// 단일 진입점 — 기존 `_handleWithLogging` 패턴과 호환
  Future<Map<String, dynamic>> handle(List<dynamic> args) async {
    try {
      final (action, params) = _parseArgs(args);
      switch (action) {
        case 'pickImage':
          return _success(await _pickImage(params));
        case 'pickMultipleImages':
          return _success({'files': await _pickMultipleImages(params)});
        case 'pickFile':
          return _success(await _pickFile(params));
        case 'uploadToServer':
          return _success((await _uploadToServer(params)).toJson());
        case 'deleteRemote':
          return _success(await _deleteRemote(params));
        case 'uploadVideo':
          return _success(await _uploadVideo(params));
        case 'saveLocal':
          return _success((await _saveLocal(params)).toJson());
        case 'readLocal':
          return _success((await _readLocal(params)).toJson());
        case 'listLocal':
          return _success({'files': await _listLocal(params)});
        case 'renameLocal':
          return _success((await _renameLocal(params)).toJson());
        case 'deleteLocal':
          return _success(await _deleteLocal(params));
        case 'clearCategory':
          return _success(await _clearCategory(params));
        case 'getStorageInfo':
          return _success((await _storage.storageInfo()).toJson());
        case 'requestPermission':
          return _success(await _requestPermission(params));
        case 'openSettings':
          return _success({'opened': await _permissions.openSettings()});
        default:
          return _error(
            'UNKNOWN_ACTION',
            '알 수 없는 업로드 액션입니다: $action',
          );
      }
    } on UploadException catch (e) {
      return _error(e.code, e.message);
    } on FileStorageException catch (e) {
      return _error(e.code, e.message);
    } catch (e) {
      // _handleWithLogging 래퍼가 상위에서 로깅 담당
      return _error('UPLOAD_UNKNOWN', '업로드 처리 중 오류: $e');
    }
  }

  // ==================== 선택 (pick) ====================

  Future<Map<String, dynamic>> _pickImage(Map<String, dynamic> params) async {
    final sourceStr = params['source']?.toString() ?? 'gallery';
    final source =
        sourceStr == 'camera' ? ImageSource.camera : ImageSource.gallery;

    final permission = source == ImageSource.camera
        ? await _permissions.requestCamera()
        : await _permissions.requestPhotoLibrary();
    if (!permission.granted) {
      throw UploadException(
        permission.permanentlyDenied
            ? 'PERMISSION_BLOCKED'
            : 'PERMISSION_DENIED',
        permission.message ?? '권한이 거부되었습니다.',
      );
    }

    final quality = _parseInt(params['quality']);
    final maxWidth = _parseDouble(params['maxWidth']);
    final maxHeight = _parseDouble(params['maxHeight']);

    final XFile? picked = await _imagePicker.pickImage(
      source: source,
      imageQuality: quality,
      maxWidth: maxWidth,
      maxHeight: maxHeight,
    );
    if (picked == null) {
      throw const UploadException('CANCELLED', '사용자가 선택을 취소했습니다.');
    }
    return _xfileToMap(picked);
  }

  Future<List<Map<String, dynamic>>> _pickMultipleImages(
    Map<String, dynamic> params,
  ) async {
    final permission = await _permissions.requestPhotoLibrary();
    if (!permission.granted) {
      throw UploadException(
        permission.permanentlyDenied
            ? 'PERMISSION_BLOCKED'
            : 'PERMISSION_DENIED',
        permission.message ?? '권한이 거부되었습니다.',
      );
    }

    final quality = _parseInt(params['quality']);
    final maxWidth = _parseDouble(params['maxWidth']);
    final maxHeight = _parseDouble(params['maxHeight']);
    final limit = _parseInt(params['maxCount']);

    final List<XFile> files = await _imagePicker.pickMultiImage(
      imageQuality: quality,
      maxWidth: maxWidth,
      maxHeight: maxHeight,
      limit: limit,
    );
    if (files.isEmpty) {
      throw const UploadException('CANCELLED', '선택된 이미지가 없습니다.');
    }
    final results = <Map<String, dynamic>>[];
    for (final f in files) {
      results.add(await _xfileToMap(f));
    }
    return results;
  }

  Future<Map<String, dynamic>> _pickFile(Map<String, dynamic> params) async {
    final List<String>? accept = (params['accept'] as List?)
        ?.map((e) => e.toString().replaceAll('.', '').toLowerCase())
        .toList();

    final result = await FilePicker.pickFiles(
      type: accept == null || accept.isEmpty ? FileType.any : FileType.custom,
      allowedExtensions: (accept == null || accept.isEmpty) ? null : accept,
      withData: false,
      allowMultiple: false,
    );
    if (result == null || result.files.isEmpty) {
      throw const UploadException('CANCELLED', '사용자가 파일 선택을 취소했습니다.');
    }
    final picked = result.files.first;
    if (picked.path == null) {
      throw const UploadException('PICK_NO_PATH', '선택한 파일의 경로를 가져오지 못했습니다.');
    }
    return {
      'name': picked.name,
      'path': picked.path,
      'size': picked.size,
      'mimeType': _guessMime(picked.path!, picked.name),
    };
  }

  // ==================== 업로드 ====================

  Future<RemoteUploadedFile> _uploadToServer(
    Map<String, dynamic> params,
  ) async {
    final localPath = _requireString(params, 'localPath');
    final categoryStr = _requireString(params, 'category');
    final category = _parseCategory(categoryStr);
    final refType = params['refType']?.toString();
    final refId = params['refId']?.toString();

    final result = await _uploadService.uploadFile(
      localPath: localPath,
      category: category,
      refType: refType,
      refId: refId,
      originalName: params['originalName']?.toString(),
    );

    // 2026-05-20 — Phase 5.1: 업로드 성공 시 Web 에 file:created 이벤트 전파.
    // refType + refId 가 모두 있는 경우에만 송신 (useFileUploadSync 구독 키).
    if (refType != null &&
        refType.isNotEmpty &&
        refId != null &&
        refId.isNotEmpty) {
      try {
        final bridge = WebViewBridge.instance;
        if (bridge != null) {
          await bridge.sendUploadEventToWeb(
            type: 'file:created',
            refType: refType,
            refId: refId,
            file: result.toJson(),
            uploaderId: result.uploaderId ?? '',
          );
        }
      } catch (e) {
        // postMessage 실패는 업로드 자체 결과에 영향 주지 않음. 로그만 남김.
        debugPrint(
            '[UploadHandler] file:created postMessage failed (silent): $e');
      }
    }

    return result;
  }

  Future<Map<String, dynamic>> _deleteRemote(
    Map<String, dynamic> params,
  ) async {
    final fileId = _requireString(params, 'id');
    await _uploadService.deleteRemote(fileId);
    return {'deleted': true, 'id': fileId};
  }

  // ==================== 영상 업로드 (multipart 단일 채널 · 2026-05-23) ====================

  /// 영상 multipart 업로드 — `POST /api/v1/videos` 단일 호출.
  ///
  /// 모바일 카메라 직캡처 / 갤러리 선택 / 파일 매니저 3경로 모두 동일 액션 사용.
  /// 50MB 초과 시 backend 400 응답. 클라이언트 사전 압축(`video_compress`) 권장.
  ///
  /// params:
  ///   - `localPath` (필수) 영상 파일 절대 경로
  ///   - `title` (필수)
  ///   - `description`, `teamId`, `videoType` (`training`/`match`/`highlight`/`other`),
  ///     `tournamentId`, `matchId`, `classId`, `isPublic`, `duration`
  ///   - `contentType` (선택, 미지정 시 자동 추론)
  ///
  /// 응답: backend Video 엔티티 그대로.
  Future<Map<String, dynamic>> _uploadVideo(Map<String, dynamic> params) async {
    final localPath = _requireString(params, 'localPath');
    final title = _requireString(params, 'title');
    final contentType = params['contentType']?.toString() ??
        lookupMimeType(localPath) ??
        'video/mp4';

    final file = File(localPath);
    if (!await file.exists()) {
      throw const UploadException(
        'FILE_NOT_FOUND',
        '업로드할 영상 파일을 찾을 수 없습니다.',
      );
    }

    final length = await file.length();
    const maxSize = 50 * 1024 * 1024;
    if (length > maxSize) {
      throw const UploadException(
        'TOO_LARGE',
        '50MB 이하 영상만 업로드할 수 있습니다.',
      );
    }

    final filename = p.basename(localPath);

    // FormData — file + metadata 필드들을 한 번에.
    final formData = FormData.fromMap(<String, dynamic>{
      'file': await MultipartFile.fromFile(
        localPath,
        filename: filename,
        contentType: DioMediaType.parse(contentType),
      ),
      'title': title,
      if (params['description'] != null) 'description': params['description'],
      if (params['teamId'] != null) 'teamId': params['teamId'],
      if (params['videoType'] != null) 'videoType': params['videoType'],
      if (params['tournamentId'] != null)
        'tournamentId': params['tournamentId'],
      if (params['matchId'] != null) 'matchId': params['matchId'],
      if (params['classId'] != null) 'classId': params['classId'],
      if (params['isPublic'] != null) 'isPublic': params['isPublic'] == true,
      if (params['duration'] != null) 'duration': params['duration'],
    });

    try {
      final response = await _apiClient.dio.post(
        '/videos',
        data: formData,
        options: Options(contentType: 'multipart/form-data'),
        onSendProgress: (sent, total) {
          if (total > 0) {
            final percent = ((sent / total) * 100).toStringAsFixed(1);
            debugPrint(
                '[UploadHandler] uploadVideo progress: $percent% ($sent/$total bytes)');
          }
        },
      );

      final body = response.data;
      if (body is! Map<String, dynamic>) {
        throw const UploadException(
          'INVALID_RESPONSE',
          '영상 업로드 응답 형식이 올바르지 않습니다.',
        );
      }

      final data = body['data'];
      if (data is! Map<String, dynamic>) {
        throw const UploadException(
          'INVALID_RESPONSE',
          '영상 업로드 응답 본문에 data 필드가 없습니다.',
        );
      }

      return data;
    } on DioException catch (e) {
      throw _mapVideoUploadDioError(e);
    }
  }

  // ==================== Dio 에러 매핑 ====================

  UploadException _mapVideoUploadDioError(DioException e) {
    final status = e.response?.statusCode;
    String code = 'VIDEO_UPLOAD_ERROR';
    String message = '영상 업로드에 실패했습니다.';

    final data = e.response?.data;
    if (data is Map<String, dynamic>) {
      final serverCode = data['errorCode'] ?? data['code'];
      final serverMessage = data['message'];
      if (serverCode is String && serverCode.isNotEmpty) code = serverCode;
      if (serverMessage is String && serverMessage.isNotEmpty) {
        message = serverMessage;
      }
    }
    if (e.type == DioExceptionType.cancel) {
      code = 'CANCELLED';
      message = '업로드가 취소되었습니다.';
    } else if (e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.receiveTimeout ||
        e.type == DioExceptionType.sendTimeout) {
      code = 'TIMEOUT';
      message = '네트워크 요청 시간이 초과되었습니다.';
    } else if (e.type == DioExceptionType.connectionError) {
      code = 'NETWORK_ERROR';
      message = '네트워크 오류가 발생했습니다.';
    } else if (status == 413) {
      code = 'TOO_LARGE';
      message = '50MB 이하 영상만 업로드할 수 있습니다.';
    } else if (status == 403) {
      code = 'FORBIDDEN';
      message = data is Map<String, dynamic> && data['message'] is String
          ? data['message'] as String
          : '영상 업로드 권한이 없습니다.';
    }

    return UploadException(code, message, statusCode: status);
  }

  // ==================== 로컬 CRUD ====================

  Future<StoredFile> _saveLocal(Map<String, dynamic> params) async {
    final category = _parseCategory(_requireString(params, 'category'));
    final originalName = params['originalName']?.toString() ?? 'file.bin';

    // 1) base64 직접 전달
    final dataBase64 = params['dataBase64'];
    if (dataBase64 is String && dataBase64.isNotEmpty) {
      return _storage.saveBase64(
        base64Data: dataBase64,
        category: category,
        originalName: originalName,
      );
    }

    // 2) 로컬 path 복사 (이미 디바이스에 있는 파일)
    final sourcePath = params['sourcePath']?.toString();
    if (sourcePath != null && sourcePath.isNotEmpty) {
      final file = File(sourcePath);
      if (!await file.exists()) {
        throw const UploadException(
          'SOURCE_NOT_FOUND',
          '원본 파일을 찾을 수 없습니다.',
        );
      }
      final bytes = await file.readAsBytes();
      return _storage.saveBytes(
        bytes: Uint8List.fromList(bytes),
        category: category,
        originalName: originalName,
      );
    }

    throw const UploadException(
      'MISSING_DATA',
      'dataBase64 또는 sourcePath 중 하나가 필요합니다.',
    );
  }

  Future<StoredFileContent> _readLocal(Map<String, dynamic> params) async {
    final path = _requireString(params, 'path');
    return _storage.readAsBase64(path);
  }

  Future<List<Map<String, dynamic>>> _listLocal(
    Map<String, dynamic> params,
  ) async {
    final categoryStr = params['category']?.toString();
    final category = (categoryStr == null || categoryStr.isEmpty)
        ? null
        : _parseCategory(categoryStr);
    final list = await _storage.list(category: category);
    return list.map((m) => m.toJson()).toList();
  }

  Future<StoredFileMeta> _renameLocal(Map<String, dynamic> params) async {
    final oldPath = _requireString(params, 'oldPath');
    final newName = _requireString(params, 'newFileName');
    return _storage.rename(
      oldAbsolutePath: oldPath,
      newFileName: newName,
    );
  }

  Future<Map<String, dynamic>> _deleteLocal(
    Map<String, dynamic> params,
  ) async {
    final path = _requireString(params, 'path');
    await _storage.delete(path);
    return {'deleted': true, 'path': path};
  }

  Future<Map<String, dynamic>> _clearCategory(
    Map<String, dynamic> params,
  ) async {
    final category = _parseCategory(_requireString(params, 'category'));
    final count = await _storage.clearCategory(category);
    return {'deletedCount': count, 'category': category.serverName};
  }

  Future<Map<String, dynamic>> _requestPermission(
    Map<String, dynamic> params,
  ) async {
    final kind = _requireString(params, 'kind');
    final UploadPermissionResult result;
    switch (kind) {
      case 'camera':
        result = await _permissions.requestCamera();
        break;
      case 'photos':
        result = await _permissions.requestPhotoLibrary();
        break;
      case 'microphone':
        result = await _permissions.requestMicrophone();
        break;
      default:
        throw UploadException('UNKNOWN_PERMISSION', '알 수 없는 권한 종류: $kind');
    }
    return result.toJson();
  }

  // ==================== 유틸 ====================

  Future<Map<String, dynamic>> _xfileToMap(XFile file) async {
    final size = await file.length();
    return {
      'name': p.basename(file.path),
      'path': file.path,
      'size': size,
      'mimeType': file.mimeType ?? _guessMime(file.path, file.name),
    };
  }

  String _guessMime(String path, String fallbackName) {
    final lower = path.toLowerCase();
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.heic')) return 'image/heic';
    if (lower.endsWith('.pdf')) return 'application/pdf';
    if (lower.endsWith('.mp4')) return 'video/mp4';
    if (lower.endsWith('.mov')) return 'video/quicktime';
    if (lower.endsWith('.webm')) return 'video/webm';
    if (lower.endsWith('.zip')) return 'application/zip';
    return 'application/octet-stream';
  }

  UploadCategory _parseCategory(String raw) {
    try {
      return UploadCategory.fromString(raw);
    } catch (_) {
      throw UploadException('INVALID_CATEGORY', '알 수 없는 카테고리: $raw');
    }
  }

  String _requireString(Map<String, dynamic> params, String key) {
    final value = params[key];
    if (value == null || value is! String || value.isEmpty) {
      throw UploadException('MISSING_PARAM', '필수 인자 누락: $key');
    }
    return value;
  }

  int? _parseInt(dynamic value) {
    if (value == null) return null;
    if (value is int) return value;
    if (value is num) return value.toInt();
    if (value is String) return int.tryParse(value);
    return null;
  }

  double? _parseDouble(dynamic value) {
    if (value == null) return null;
    if (value is double) return value;
    if (value is num) return value.toDouble();
    if (value is String) return double.tryParse(value);
    return null;
  }

  (String, Map<String, dynamic>) _parseArgs(List<dynamic> args) {
    if (args.isEmpty) {
      throw const UploadException('NO_ACTION', 'action 인자가 없습니다.');
    }

    String? action;
    Map<String, dynamic> params = {};

    final first = args.first;
    if (first is String) {
      action = first;
      if (args.length >= 2) {
        final maybeParams = args[1];
        params = _decodeParams(maybeParams);
      }
    } else if (first is Map) {
      params = Map<String, dynamic>.from(first);
      action = params['action']?.toString();
    }

    if (action == null || action.isEmpty) {
      throw const UploadException('NO_ACTION', 'action 인자가 비어있습니다.');
    }
    return (action, params);
  }

  Map<String, dynamic> _decodeParams(dynamic raw) {
    if (raw == null) return {};
    if (raw is Map) return Map<String, dynamic>.from(raw);
    if (raw is String && raw.trim().isNotEmpty) {
      try {
        final decoded = jsonDecode(raw);
        if (decoded is Map) return Map<String, dynamic>.from(decoded);
      } catch (_) {
        // fallthrough
      }
    }
    return {};
  }

  Map<String, dynamic> _success(dynamic data) => {
        'success': true,
        'data': data,
      };

  Map<String, dynamic> _error(String code, String message) => {
        'success': false,
        'error': {'code': code, 'message': message},
      };
}
