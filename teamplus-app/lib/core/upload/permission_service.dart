import 'dart:io';
import 'package:permission_handler/permission_handler.dart';

/// 업로드 권한 결과
///
/// 카메라·갤러리·저장소 권한 요청 결과를 단일 구조로 표현한다.
/// - [granted] true: 즉시 진행 가능
/// - [permanentlyDenied] true: 사용자가 "다시 묻지 않음" 선택 → `openAppSettings()` 유도 필요
/// - [message] 사용자에게 표시할 한글 사유 (에러 토스트 등)
class UploadPermissionResult {
  final bool granted;
  final bool permanentlyDenied;
  final String? message;

  const UploadPermissionResult({
    required this.granted,
    this.permanentlyDenied = false,
    this.message,
  });

  Map<String, dynamic> toJson() => {
        'granted': granted,
        'permanentlyDenied': permanentlyDenied,
        if (message != null) 'message': message,
      };

  factory UploadPermissionResult.granted() =>
      const UploadPermissionResult(granted: true);

  factory UploadPermissionResult.denied({String? message}) =>
      UploadPermissionResult(
        granted: false,
        message: message ?? '권한이 거부되었습니다.',
      );

  factory UploadPermissionResult.permanentlyDenied({String? message}) =>
      UploadPermissionResult(
        granted: false,
        permanentlyDenied: true,
        message: message ?? '설정에서 권한을 허용해 주세요.',
      );
}

/// 업로드 관련 권한 관리 서비스
///
/// iOS·Android 플랫폼별 + Android 13(API 33)·14(API 34) 버전별 분기를 흡수한다.
class UploadPermissionService {
  const UploadPermissionService();

  /// 카메라 사용 권한 요청
  Future<UploadPermissionResult> requestCamera() async {
    return _requestSingle(
      Permission.camera,
      deniedMessage: '카메라 권한이 거부되어 촬영을 진행할 수 없습니다.',
    );
  }

  /// 사진(갤러리) 읽기 권한 요청 — 플랫폼/버전별 최적 권한 선택
  Future<UploadPermissionResult> requestPhotoLibrary() async {
    if (Platform.isIOS) {
      return _requestSingle(
        Permission.photos,
        deniedMessage: '사진 보관함 접근이 거부되었습니다.',
      );
    }
    if (Platform.isAndroid) {
      // Android 13+ (API 33) 이후: READ_MEDIA_IMAGES 를 위한 Permission.photos 사용
      // Android 12- (API 32 이하): READ_EXTERNAL_STORAGE 로 폴백
      // permission_handler 12.x 는 내부적으로 API level 을 자동 분기하지만
      // 구 버전 디바이스 호환을 위해 두 권한 모두 시도한다.
      final photos = await _requestSingle(
        Permission.photos,
        deniedMessage: '사진 권한이 거부되었습니다.',
      );
      if (photos.granted) return photos;

      // 하위 버전 폴백
      return _requestSingle(
        Permission.storage,
        deniedMessage: '저장소 권한이 거부되어 갤러리를 열 수 없습니다.',
      );
    }
    return UploadPermissionResult.granted();
  }

  /// 동영상 녹화용 마이크 권한 요청
  Future<UploadPermissionResult> requestMicrophone() async {
    return _requestSingle(
      Permission.microphone,
      deniedMessage: '마이크 권한이 거부되어 동영상 녹음이 제한됩니다.',
    );
  }

  /// 시스템 설정 화면 열기 (permanentlyDenied 상태 복구용)
  Future<bool> openSettings() => openAppSettings();

  Future<UploadPermissionResult> _requestSingle(
    Permission permission, {
    required String deniedMessage,
  }) async {
    final current = await permission.status;
    if (current.isGranted || current.isLimited) {
      return UploadPermissionResult.granted();
    }
    if (current.isPermanentlyDenied) {
      return UploadPermissionResult.permanentlyDenied(
        message: '$deniedMessage 앱 설정에서 수동으로 허용해 주세요.',
      );
    }

    final requested = await permission.request();
    if (requested.isGranted || requested.isLimited) {
      return UploadPermissionResult.granted();
    }
    if (requested.isPermanentlyDenied) {
      return UploadPermissionResult.permanentlyDenied(
        message: '$deniedMessage 앱 설정에서 수동으로 허용해 주세요.',
      );
    }
    return UploadPermissionResult.denied(message: deniedMessage);
  }
}
