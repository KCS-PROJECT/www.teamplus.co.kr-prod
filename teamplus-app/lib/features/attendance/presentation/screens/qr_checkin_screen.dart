import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/providers/shared_providers.dart';
import '../../../../core/security/screen_capture_guard.dart';
import '../../../../core/theme/colors.dart';
import '../../../../shared/widgets/app_button.dart';
import '../../../../shared/widgets/teamplus_app_bar.dart';
import '../../../../shared/utils/cancelable_timer.dart';

class QRCheckInScreen extends ConsumerStatefulWidget {
  final String? scheduleId;

  const QRCheckInScreen({super.key, this.scheduleId});

  @override
  ConsumerState<QRCheckInScreen> createState() => _QRCheckInScreenState();
}

class _QRCheckInScreenState extends ConsumerState<QRCheckInScreen>
    with ConsumerScreenCaptureMixin {
  bool _isCheckedIn = false;
  bool _isLoading = false;
  String? _errorMessage;
  int _countdown = 30;
  final CancelableTimer _countdownTimer = CancelableTimer();
  String _qrCode = '';

  ApiClient get _apiClient => ref.read(apiClientProvider);

  @override
  void initState() {
    super.initState();
    _generateQRCode();
  }

  @override
  void dispose() {
    _countdownTimer.cancel();
    super.dispose();
  }

  void _startCountdown() {
    _countdownTimer.cancel();
    setState(() {
      _countdown = 30;
    });

    _countdownTimer.startPeriodic(const Duration(seconds: 1), () {
      if (_countdown > 0) {
        setState(() {
          _countdown--;
        });
      } else {
        _refreshQRCode();
      }
    });
  }

  /// 백엔드에서 QR 코드 생성
  Future<void> _generateQRCode() async {
    try {
      setState(() {
        _isLoading = true;
        _errorMessage = null;
      });

      final response = await _apiClient.post(
        '/attendance/qr-generate',
        data: {
          if (widget.scheduleId != null) 'scheduleId': widget.scheduleId,
        },
      );

      final data = response.data;
      final qrData = data is Map<String, dynamic> && data['data'] != null
          ? data['data']
          : data;

      setState(() {
        _qrCode = qrData is Map<String, dynamic>
            ? (qrData['qrCode'] as String? ?? qrData['code'] as String? ?? '')
            : qrData.toString();
        _isLoading = false;
      });

      _startCountdown();
    } catch (e) {
      setState(() {
        _isLoading = false;
        _errorMessage = 'QR 코드 생성에 실패했습니다. 다시 시도해주세요.';
        _qrCode = '';
      });
    }
  }

  void _refreshQRCode() {
    _countdownTimer.cancel();
    _generateQRCode();
  }

  /// 백엔드 체크인 API 호출
  Future<void> _handleCheckIn() async {
    if (_qrCode.isEmpty) return;

    try {
      setState(() {
        _isLoading = true;
        _errorMessage = null;
      });

      await _apiClient.post(
        '/attendance/check-in',
        // Backend DTO: { qrData: UUID, childId?: string }
        data: {
          'qrData': _qrCode,
        },
      );

      setState(() {
        _isCheckedIn = true;
        _isLoading = false;
      });

      _countdownTimer.cancel();

      // 3초 후 자동 닫기
      Future.delayed(const Duration(seconds: 3), () {
        if (mounted) {
          Navigator.pop(context, true);
        }
      });
    } catch (e) {
      setState(() {
        _isLoading = false;
        _errorMessage = _parseCheckInError(e);
      });
    }
  }

  String _parseCheckInError(dynamic error) {
    if (error is DioException) {
      final data = error.response?.data;
      if (data is Map<String, dynamic>) {
        return data['message'] as String? ?? '출석 체크인에 실패했습니다.';
      }
    }
    return '출석 체크인에 실패했습니다. 다시 시도해주세요.';
  }

  @override
  Widget build(BuildContext context) {
    if (_isCheckedIn) {
      return _buildSuccessScreen();
    }

    return Scaffold(
      appBar: const TeamplusAppBar(title: 'QR 체크인'),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Spacer(),

              // Title
              const Text(
                'QR 코드를 보여주세요!',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.bold,
                  color: AppColors.darkText,
                ),
              ),
              const SizedBox(height: 32),

              // QR Code Display
              Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: AppColors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: AppColors.primary,
                    width: 2,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.primary.withValues(alpha: 0.1),
                      blurRadius: 20,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Column(
                  children: [
                    // QR Code 실제 렌더링
                    _qrCode.isNotEmpty
                        ? QrImageView(
                            data: _qrCode,
                            version: QrVersions.auto,
                            size: 200,
                            backgroundColor: AppColors.white,
                            eyeStyle: const QrEyeStyle(
                              eyeShape: QrEyeShape.square,
                              color: AppColors.darkText,
                            ),
                            dataModuleStyle: const QrDataModuleStyle(
                              dataModuleShape: QrDataModuleShape.square,
                              color: AppColors.darkText,
                            ),
                          )
                        : Container(
                            width: 200,
                            height: 200,
                            decoration: BoxDecoration(
                              color: AppColors.background,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: _isLoading
                                ? const Center(
                                    child: CircularProgressIndicator())
                                : const Icon(Icons.qr_code_2,
                                    size: 160, color: AppColors.lightText),
                          ),
                    const SizedBox(height: 16),
                    Text(
                      _qrCode.isEmpty
                          ? '...'
                          : '${_qrCode.substring(0, _qrCode.length > 8 ? 8 : _qrCode.length)}****',
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: AppColors.darkText,
                        letterSpacing: 2,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // Countdown
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 8,
                ),
                decoration: BoxDecoration(
                  color: _countdown <= 10
                      ? AppColors.warning.withValues(alpha: 0.1)
                      : AppColors.info.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.timer,
                      size: 16,
                      color:
                          _countdown <= 10 ? AppColors.warning : AppColors.info,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      '코드가 $_countdown초 후 변경됩니다',
                      style: TextStyle(
                        fontSize: 14,
                        color: _countdown <= 10
                            ? AppColors.warning
                            : AppColors.info,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 32),

              // Instructions
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.background,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  children: [
                    _buildInstructionRow(
                      '코치님에게 보여주세요!',
                      Icons.visibility,
                    ),
                    const SizedBox(height: 8),
                    _buildInstructionRow(
                      '카메라로 스캔해도 돼요!',
                      Icons.camera_alt,
                    ),
                  ],
                ),
              ),
              const Spacer(),

              // 에러 메시지
              if (_errorMessage != null)
                Container(
                  margin: const EdgeInsets.only(bottom: 16),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.error.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.error_outline,
                          color: AppColors.error, size: 20),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _errorMessage!,
                          style: const TextStyle(
                              color: AppColors.error, fontSize: 14),
                        ),
                      ),
                    ],
                  ),
                ),

              // 체크인 버튼
              SecondaryButton(
                label: _isLoading ? '처리 중...' : '출석 체크인',
                onPressed:
                    _isLoading || _qrCode.isEmpty ? null : _handleCheckIn,
                icon: Icons.check,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSuccessScreen() {
    return Scaffold(
      backgroundColor: AppColors.success,
      body: SafeArea(
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 120,
                height: 120,
                decoration: const BoxDecoration(
                  color: AppColors.white,
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.check_circle,
                  size: 80,
                  color: AppColors.success,
                ),
              ),
              const SizedBox(height: 32),
              const Text(
                '출석 완료!',
                style: TextStyle(
                  fontSize: 32,
                  fontWeight: FontWeight.bold,
                  color: AppColors.white,
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                '출석이 기록되었어요!',
                style: TextStyle(
                  fontSize: 18,
                  color: AppColors.white,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                '다음 수업도 화이팅!',
                style: TextStyle(
                  fontSize: 18,
                  color: AppColors.white,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildInstructionRow(String text, IconData icon) {
    return Row(
      children: [
        Icon(icon, size: 20, color: AppColors.lightText),
        const SizedBox(width: 12),
        Text(
          text,
          style: const TextStyle(
            fontSize: 14,
            color: AppColors.lightText,
          ),
        ),
      ],
    );
  }
}
