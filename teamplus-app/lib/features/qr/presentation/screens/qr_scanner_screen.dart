import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../../../../core/constants/api_constants.dart';
import '../../../../core/theme/colors.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../shared/widgets/app_button.dart';
import '../../qr_scanner_service.dart';

/// QR 코드 스캐너 화면
/// 출석 체크인용 QR 스캔 화면
class QrScannerScreen extends ConsumerStatefulWidget {
  const QrScannerScreen({super.key});

  @override
  ConsumerState<QrScannerScreen> createState() => _QrScannerScreenState();
}

class _QrScannerScreenState extends ConsumerState<QrScannerScreen>
    with WidgetsBindingObserver {
  final QrScannerService _scannerService = QrScannerService();
  late MobileScannerController _controller;
  bool _hasPermission = false;
  bool _isProcessing = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _initializeScanner();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _scannerService.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // 앱이 백그라운드로 가면 스캐너 중지, 포그라운드로 오면 재시작
    if (state == AppLifecycleState.inactive) {
      _scannerService.stopScanner();
    } else if (state == AppLifecycleState.resumed) {
      _scannerService.startScanner();
    }
  }

  Future<void> _initializeScanner() async {
    // 카메라 권한 요청
    final hasPermission = await _scannerService.requestCameraPermission();

    if (!hasPermission) {
      setState(() {
        _hasPermission = false;
        _errorMessage = '카메라 권한이 필요합니다. 설정에서 권한을 허용해주세요.';
      });
      return;
    }

    setState(() {
      _hasPermission = true;
      _errorMessage = null;
    });

    // 스캐너 컨트롤러 생성
    _controller = _scannerService.createController(
      autoStart: true,
      detectionSpeed: DetectionSpeed.normal,
      facing: CameraFacing.back,
    );
  }

  Future<void> _handleQrDetected(BarcodeCapture capture) async {
    // 이미 처리 중이면 무시
    if (_isProcessing) return;

    // QR 코드 유효성 검증
    if (!_scannerService.isValidQrCode(capture)) return;

    final barcode = capture.barcodes.first;
    final qrCode = barcode.rawValue!;

    setState(() {
      _isProcessing = true;
    });

    // 출석 QR 코드 파싱 (UUID v4 직접 or 레거시 딥링크)
    final parsed = _scannerService.parseAttendanceQrCode(qrCode);

    if (parsed == null) {
      setState(() {
        _isProcessing = false;
        _errorMessage = '유효하지 않은 QR 코드입니다. 출석 체크인 QR 코드를 스캔해주세요.';
      });
      // 2초 후 에러 메시지 초기화하여 재시도 가능하도록
      Future.delayed(const Duration(seconds: 2), () {
        if (mounted) {
          setState(() {
            _errorMessage = null;
            _isProcessing = false;
          });
        }
      });
      return;
    }

    // UUID v4 경로 — caller(WebView Bridge 또는 직접 push)에게 qrData 반환.
    // API 호출 및 결과 UI는 caller 쪽(Web `/qr-scan` 등)에서 처리한다.
    final qrData = parsed['qrData'];
    if (qrData != null && mounted) {
      Navigator.pop<String>(context, qrData);
      return;
    }

    // 레거시 딥링크 경로 (scheduleId + memberId) — 현행 설계에서는 Backend가
    // UUID만 발급하므로 사실상 도달 불가. 호환을 위해 빈 문자열 pop으로 처리.
    if (mounted) {
      Navigator.pop<String>(context, '');
    }
  }

  Future<void> _toggleFlash() async {
    await _scannerService.toggleTorch();
    setState(() {});
  }

  /// 시스템 설정 앱으로 이동하여 카메라 권한을 변경하도록 유도
  Future<void> _openAppSettings() async {
    await _scannerService.openSystemSettings();
  }

  /// 카메라 권한 없이도 출석할 수 있는 대체 경로.
  /// 학생 본인의 QR(/my-qr)을 코치에게 보여주면 코치가 스캔하여 출석 처리한다.
  /// WebView 라우트 계약(extra: url/title/showAppBar/showBottomNav) 준수.
  void _openMyQrCode() {
    context.push('/webview', extra: {
      'url': '${ApiConstants.webAppUrl}/my-qr',
      'title': '내 QR 코드',
      'showAppBar': true,
      'showBottomNav': false,
    });
  }

  /// 권한 거부 시 닫기 → 메인(대시보드) 화면으로 이동
  void _closeAndGoHome() {
    if (!mounted) return;
    context.go('/dashboard');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('QR 체크인'),
        backgroundColor: Colors.transparent,
        foregroundColor: Colors.white,
        elevation: 0,
        // 카메라 다크 viewport 위에 투명 AppBar — status bar 아이콘은 라이트로 강제.
        systemOverlayStyle: const SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
          statusBarIconBrightness: Brightness.light, // Android (dark camera)
          statusBarBrightness: Brightness.dark, // iOS (dark camera)
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, size: 20),
          tooltip: '뒤로가기',
          onPressed: () {
            if (Navigator.of(context).canPop()) {
              Navigator.of(context).pop();
            } else {
              context.pop();
            }
          },
        ),
      ),
      extendBodyBehindAppBar: true,
      body: Stack(
        children: [
          // QR 스캐너 카메라 뷰
          // ♿ 접근성: VoiceOver/TalkBack 에 "QR 코드 스캔" 영역으로 알리고,
          //   상태 변경(에러 메시지 등) 은 liveRegion 으로 즉시 안내.
          if (_hasPermission)
            Semantics(
              label: 'QR 코드 스캔',
              liveRegion: true,
              child: MobileScanner(
                controller: _controller,
                onDetect: _handleQrDetected,
              ),
            )
          else
            _buildPermissionDeniedView(),

          // 오버레이 UI
          _buildOverlay(),

          // 하단 제어 버튼
          if (_hasPermission) _buildControls(),

          // 에러 메시지 표시
          if (_errorMessage != null) _buildErrorMessage(),

          // 로딩 인디케이터
          if (_isProcessing) _buildLoadingOverlay(),
        ],
      ),
    );
  }

  Widget _buildPermissionDeniedView() {
    return Container(
      color: AppColors.darkBackground,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(AppTheme.spacingLG),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Icon(
                  Icons.camera_alt_outlined,
                  size: 40,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: AppTheme.spacingLG),
              Text(
                _errorMessage ?? '카메라 권한이 필요합니다.',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 16,
                  color: Colors.white70,
                ),
              ),
              const SizedBox(height: AppTheme.spacingSM),
              const Text(
                "카메라 권한 없이도 '내 QR 코드'를 코치에게 보여주면 출석할 수 있어요.",
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 14,
                  color: Colors.white60,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: AppTheme.spacingLG),
              SizedBox(
                width: 220,
                child: PrimaryButton(
                  label: '권한 설정하기',
                  onPressed: _openAppSettings,
                ),
              ),
              const SizedBox(height: AppTheme.spacingSM),
              // 카메라 없이 출석하는 대체 경로 — 내 QR을 코치에게 제시
              SizedBox(
                width: 220,
                height: 48,
                child: TextButton(
                  onPressed: _openMyQrCode,
                  style: TextButton.styleFrom(
                    foregroundColor: Colors.white,
                    backgroundColor: AppColors.primary.withValues(alpha: 0.2),
                    shape: RoundedRectangleBorder(
                      borderRadius:
                          BorderRadius.circular(AppTheme.radiusMedium),
                      side: BorderSide(
                        color: AppColors.primary.withValues(alpha: 0.5),
                        width: 1,
                      ),
                    ),
                  ),
                  child: const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.qr_code, size: 20),
                      SizedBox(width: AppTheme.spacingSM),
                      Text(
                        '내 QR 코드 보기',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: AppTheme.spacingSM),
              SizedBox(
                width: 220,
                height: 48,
                child: TextButton(
                  onPressed: _closeAndGoHome,
                  style: TextButton.styleFrom(
                    foregroundColor: Colors.white70,
                    shape: RoundedRectangleBorder(
                      borderRadius:
                          BorderRadius.circular(AppTheme.radiusMedium),
                      side: const BorderSide(color: Colors.white24, width: 1),
                    ),
                  ),
                  child: const Text(
                    '닫기',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildOverlay() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.5),
      ),
      child: Stack(
        children: [
          // 스캔 영역 cutout with corner decorations
          Center(
            child: Container(
              width: 260,
              height: 260,
              decoration: BoxDecoration(
                border: Border.all(
                  color: AppColors.accent,
                  width: 3,
                ),
                borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
              ),
              child: Stack(
                children: [
                  // Corner decorations
                  _buildCorner(Alignment.topLeft),
                  _buildCorner(Alignment.topRight),
                  _buildCorner(Alignment.bottomLeft),
                  _buildCorner(Alignment.bottomRight),
                ],
              ),
            ),
          ),
          // 안내 텍스트
          Positioned(
            top: MediaQuery.of(context).padding.top + 80,
            left: AppTheme.spacingLG,
            right: AppTheme.spacingLG,
            child: Column(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppTheme.spacingMD,
                    vertical: AppTheme.spacingSM,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.accent.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.qr_code_scanner,
                        size: 20,
                        color: Colors.white,
                      ),
                      SizedBox(width: AppTheme.spacingSM),
                      Text(
                        'QR 코드를 스캔해주세요',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppTheme.spacingSM),
                const Text(
                  '출석 체크인 QR 코드를 프레임 안에 맞춰주세요',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 14,
                    color: Colors.white70,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCorner(Alignment alignment) {
    return Align(
      alignment: alignment,
      child: Container(
        width: 24,
        height: 24,
        decoration: BoxDecoration(
          border: Border(
            top: alignment == Alignment.topLeft ||
                    alignment == Alignment.topRight
                ? const BorderSide(color: Colors.white, width: 4)
                : BorderSide.none,
            bottom: alignment == Alignment.bottomLeft ||
                    alignment == Alignment.bottomRight
                ? const BorderSide(color: Colors.white, width: 4)
                : BorderSide.none,
            left: alignment == Alignment.topLeft ||
                    alignment == Alignment.bottomLeft
                ? const BorderSide(color: Colors.white, width: 4)
                : BorderSide.none,
            right: alignment == Alignment.topRight ||
                    alignment == Alignment.bottomRight
                ? const BorderSide(color: Colors.white, width: 4)
                : BorderSide.none,
          ),
        ),
      ),
    );
  }

  Widget _buildControls() {
    return Positioned(
      bottom: 48,
      left: 0,
      right: 0,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // 플래시 토글 버튼 - 56dp touch target (WCAG compliant)
          Material(
            color: _controller.torchEnabled
                ? AppColors.accent
                : Colors.black.withValues(alpha: 0.6),
            shape: const CircleBorder(),
            child: InkWell(
              onTap: _toggleFlash,
              customBorder: const CircleBorder(),
              child: SizedBox(
                width: 56,
                height: 56,
                child: Icon(
                  _controller.torchEnabled ? Icons.flash_on : Icons.flash_off,
                  color: Colors.white,
                  size: 26,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorMessage() {
    return Positioned(
      bottom: 130,
      left: AppTheme.spacingLG,
      right: AppTheme.spacingLG,
      child: Container(
        padding: const EdgeInsets.all(AppTheme.spacingMD),
        decoration: BoxDecoration(
          color: AppColors.error,
          borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.3),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
              ),
              child: const Icon(
                Icons.error_outline,
                color: Colors.white,
                size: 20,
              ),
            ),
            const SizedBox(width: AppTheme.spacingSM),
            Expanded(
              child: Text(
                _errorMessage!,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: Colors.white,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLoadingOverlay() {
    return Container(
      color: Colors.black.withValues(alpha: 0.8),
      child: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: AppColors.accent.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Center(
                child: CircularProgressIndicator(
                  valueColor: AlwaysStoppedAnimation<Color>(AppColors.accent),
                  strokeWidth: 3,
                ),
              ),
            ),
            const SizedBox(height: AppTheme.spacingLG),
            const Text(
              '출석 확인 중...',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: AppTheme.spacingSM),
            const Text(
              '잠시만 기다려주세요',
              style: TextStyle(
                fontSize: 14,
                color: Colors.white70,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
