import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:permission_handler/permission_handler.dart';

/// QR 코드 스캔 결과
class QrScanResult {
  final String code;
  final DateTime scannedAt;

  QrScanResult({
    required this.code,
    required this.scannedAt,
  });

  Map<String, dynamic> toJson() {
    return {
      'code': code,
      'scannedAt': scannedAt.toIso8601String(),
    };
  }
}

/// QR 스캐너 서비스
class QrScannerService {
  static final QrScannerService _instance = QrScannerService._internal();

  factory QrScannerService() => _instance;

  QrScannerService._internal();

  MobileScannerController? _controller;

  /// 카메라 권한 요청
  Future<bool> requestCameraPermission() async {
    final status = await Permission.camera.status;

    if (status.isGranted) {
      return true;
    }

    if (status.isDenied) {
      final result = await Permission.camera.request();
      return result.isGranted;
    }

    if (status.isPermanentlyDenied) {
      // 설정으로 이동 안내
      await openAppSettings();
      return false;
    }

    return false;
  }

  /// 카메라 권한 상태 확인
  Future<bool> hasCameraPermission() async {
    final status = await Permission.camera.status;
    return status.isGranted;
  }

  /// iOS/Android 시스템 설정 앱(앱 권한 화면)으로 이동
  ///
  /// 사용자가 권한을 한 번 거부한 뒤에는 [Permission.camera.request] 가
  /// 더 이상 다이얼로그를 띄우지 않고 즉시 false 를 반환하므로,
  /// "권한 설정하기" 버튼은 반드시 이 메서드를 통해 시스템 설정으로 유도해야 한다.
  Future<bool> openSystemSettings() => openAppSettings();

  /// 스캐너 컨트롤러 생성
  MobileScannerController createController({
    bool autoStart = true,
    DetectionSpeed detectionSpeed = DetectionSpeed.normal,
    CameraFacing facing = CameraFacing.back,
    TorchState torchState = TorchState.off,
  }) {
    _controller = MobileScannerController(
      autoStart: autoStart,
      detectionSpeed: detectionSpeed,
      facing: facing,
      torchEnabled: torchState == TorchState.on,
    );
    return _controller!;
  }

  /// 스캐너 시작
  Future<void> startScanner() async {
    if (_controller != null) {
      await _controller!.start();
    }
  }

  /// 스캐너 중지
  Future<void> stopScanner() async {
    if (_controller != null) {
      await _controller!.stop();
    }
  }

  /// 플래시 토글
  Future<void> toggleTorch() async {
    if (_controller != null) {
      await _controller!.toggleTorch();
    }
  }

  /// 카메라 전환 (전면/후면)
  Future<void> switchCamera() async {
    if (_controller != null) {
      await _controller!.switchCamera();
    }
  }

  /// 스캐너 리소스 정리
  Future<void> dispose() async {
    if (_controller != null) {
      _controller!.dispose();
      _controller = null;
    }
  }

  /// QR 코드 바코드 검증
  bool isValidQrCode(BarcodeCapture capture) {
    final barcode = capture.barcodes.firstOrNull;
    if (barcode == null) return false;

    // QR 코드 타입 확인
    if (barcode.format != BarcodeFormat.qrCode) return false;

    // 코드 값 존재 확인
    if (barcode.rawValue == null || barcode.rawValue!.isEmpty) return false;

    return true;
  }

  /// QR 코드 파싱 (TEAMPLUS 출석 체크인 형식)
  ///
  /// 지원 포맷:
  /// 1. **UUID v4** — Backend `AttendanceQR.qrData` 가 생성하는 현행 포맷 (주 경로)
  /// 2. **레거시 딥링크** — `teamplus://checkin?scheduleId=xxx&memberId=xxx` (하위 호환)
  ///
  /// 반환 키:
  /// - UUID: `{'qrData': '...'}`
  /// - 딥링크: `{'scheduleId': '...', 'memberId': '...'}`
  Map<String, String>? parseAttendanceQrCode(String qrCode) {
    // 1) UUID v4 직접 매칭 (현행 Backend QR 포맷)
    final uuidV4 = RegExp(
      r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
      caseSensitive: false,
    );
    if (uuidV4.hasMatch(qrCode.trim())) {
      return {'qrData': qrCode.trim()};
    }

    // 2) 레거시 딥링크 fallback
    try {
      final uri = Uri.parse(qrCode);
      if (uri.scheme != 'teamplus') return null;
      if (uri.host != 'checkin') return null;

      final scheduleId = uri.queryParameters['scheduleId'];
      final memberId = uri.queryParameters['memberId'];
      if (scheduleId == null || memberId == null) return null;

      return {
        'scheduleId': scheduleId,
        'memberId': memberId,
      };
    } catch (e) {
      return null;
    }
  }

  /// 클럽 초대 QR 코드 파싱
  /// 형식: "teamplus://club-invite?code=XXX" 또는 raw 영숫자 코드 (6~20자)
  String? parseClubInviteCode(String qrCode) {
    final uri = Uri.tryParse(qrCode);
    if (uri != null && uri.scheme == 'teamplus' && uri.host == 'club-invite') {
      return uri.queryParameters['code'];
    }
    // raw 코드 fallback (6~20자 영숫자)
    if (RegExp(r'^[a-zA-Z0-9]{6,20}$').hasMatch(qrCode)) return qrCode;
    return null;
  }

  /// QR 코드 생성을 위한 데이터 형식
  static String generateAttendanceQrData({
    required String scheduleId,
    required String memberId,
  }) {
    return 'teamplus://checkin?scheduleId=$scheduleId&memberId=$memberId';
  }
}
