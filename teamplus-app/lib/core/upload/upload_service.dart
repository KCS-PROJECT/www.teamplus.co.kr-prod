import 'dart:io';

import 'package:dio/dio.dart';
import 'package:http_parser/http_parser.dart' show MediaType;
import 'package:mime/mime.dart';
import 'package:path/path.dart' as p;

import '../network/api_client.dart';
import '../storage/file_storage_service.dart';

/// 서버 응답 (teamplus-backend `FileResponseDto` 와 1:1)
///
/// 2026-05-20 — Phase 5.1 확장:
///   - `thumbUrl` (자동 생성 썸네일, IMAGE/AVATAR)
///   - `exifJson` (EXIF 메타데이터, IMAGE)
///   - `uploaderId` · `refType` · `refId` (postMessage 이벤트 전파용)
class RemoteUploadedFile {
  final String id;
  final String category;
  final String originalName;
  final String url;
  final String mimeType;
  final int size;
  final int? width;
  final int? height;
  final String? thumbUrl;
  final Map<String, dynamic>? exifJson;
  final String? uploaderId;
  final String? refType;
  final String? refId;
  final DateTime createdAt;

  const RemoteUploadedFile({
    required this.id,
    required this.category,
    required this.originalName,
    required this.url,
    required this.mimeType,
    required this.size,
    this.width,
    this.height,
    this.thumbUrl,
    this.exifJson,
    this.uploaderId,
    this.refType,
    this.refId,
    required this.createdAt,
  });

  factory RemoteUploadedFile.fromJson(Map<String, dynamic> json) {
    final exifRaw = json['exifJson'];
    return RemoteUploadedFile(
      id: json['id'] as String,
      category: json['category'] as String,
      originalName: json['originalName'] as String,
      url: json['url'] as String,
      mimeType: json['mimeType'] as String,
      size: (json['size'] as num).toInt(),
      width: (json['width'] as num?)?.toInt(),
      height: (json['height'] as num?)?.toInt(),
      thumbUrl: json['thumbUrl'] as String?,
      exifJson: exifRaw is Map ? Map<String, dynamic>.from(exifRaw) : null,
      uploaderId: json['uploaderId'] as String?,
      refType: json['refType'] as String?,
      refId: json['refId'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'category': category,
        'originalName': originalName,
        'url': url,
        'mimeType': mimeType,
        'size': size,
        if (width != null) 'width': width,
        if (height != null) 'height': height,
        if (thumbUrl != null) 'thumbUrl': thumbUrl,
        if (exifJson != null) 'exifJson': exifJson,
        if (uploaderId != null) 'uploaderId': uploaderId,
        if (refType != null) 'refType': refType,
        if (refId != null) 'refId': refId,
        'createdAt': createdAt.toIso8601String(),
      };
}

/// 업로드 실패 예외
class UploadException implements Exception {
  final String code;
  final String message;
  final int? statusCode;

  const UploadException(this.code, this.message, {this.statusCode});

  @override
  String toString() => 'UploadException($code): $message';
}

/// 백엔드 통합 파일 업로드 서비스
///
/// TEAMPLUS `POST /api/v1/files/upload` 엔드포인트로 multipart/form-data 전송.
/// JWT 토큰은 `ApiClient` 의 `_AuthInterceptor` 가 자동 첨부한다.
class UploadService {
  UploadService({ApiClient? apiClient}) : _apiClient = apiClient ?? ApiClient();

  final ApiClient _apiClient;

  static const String _endpoint = '/files/upload';

  /// 로컬 파일 → 백엔드 업로드
  ///
  /// [localPath] 는 기기 절대 경로. [category] 는 서버 [UploadCategory] enum 문자열
  /// (IMAGE/AVATAR/DOCUMENT/VIDEO/ATTACHMENT).
  Future<RemoteUploadedFile> uploadFile({
    required String localPath,
    required UploadCategory category,
    String? refType,
    String? refId,
    String? originalName,
    CancelToken? cancelToken,
  }) async {
    final file = File(localPath);
    if (!await file.exists()) {
      throw const UploadException(
        'FILE_NOT_FOUND',
        '업로드할 파일을 찾을 수 없습니다.',
      );
    }

    final effectiveName = originalName ?? p.basename(localPath);
    final mimeType = lookupMimeType(localPath) ?? 'application/octet-stream';

    final formData = FormData.fromMap({
      'category': category.serverName,
      if (refType != null) 'refType': refType,
      if (refId != null) 'refId': refId,
      'file': await MultipartFile.fromFile(
        localPath,
        filename: effectiveName,
        contentType: _parseContentType(mimeType),
      ),
    });

    try {
      final response = await _apiClient.dio.post(
        _endpoint,
        data: formData,
        options: Options(
          contentType: 'multipart/form-data',
          headers: {
            // FormData 헤더 보존
            'Accept': 'application/json',
          },
          // ApiClient.BaseOptions 의 send/receive 15s/10s 를 multipart 5MB 업로드용으로
          // override. 모바일 셀룰러 환경에서 5MB · 3G 전송 시 15s 초과 가능.
          sendTimeout: const Duration(seconds: 30),
          receiveTimeout: const Duration(seconds: 30),
        ),
        cancelToken: cancelToken,
      );

      final data = response.data;
      if (data is! Map<String, dynamic>) {
        throw const UploadException(
          'INVALID_RESPONSE',
          '서버 응답 형식이 올바르지 않습니다.',
        );
      }
      return RemoteUploadedFile.fromJson(data);
    } on DioException catch (e) {
      throw _mapDioError(e);
    }
  }

  /// 업로드 후 서버 삭제
  Future<void> deleteRemote(String fileId) async {
    try {
      await _apiClient.dio.delete('/files/$fileId');
    } on DioException catch (e) {
      throw _mapDioError(e);
    }
  }

  MediaType? _parseContentType(String mime) {
    final slash = mime.indexOf('/');
    if (slash <= 0 || slash == mime.length - 1) return null;
    return MediaType(mime.substring(0, slash), mime.substring(slash + 1));
  }

  UploadException _mapDioError(DioException e) {
    final status = e.response?.statusCode;
    String code = 'UPLOAD_ERROR';
    String message = '파일 업로드에 실패했습니다.';

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
    }

    return UploadException(code, message, statusCode: status);
  }
}
