import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';
import '../../../../core/auth/token_storage.dart';
import '../../../../core/theme/colors.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../shared/widgets/teamplus_app_bar.dart';

/// 내 프로필 QR 코드 화면
/// - qr_flutter 4 활용, 5분 TTL 자동 재생성
/// - MVP: 앱 자체 생성 (userId + userName + userType + exp + nonce)
/// - 추후 BE /users/me/profile-qr JWT 토큰으로 교체 가능
class MyProfileQrScreen extends ConsumerStatefulWidget {
  const MyProfileQrScreen({super.key});

  @override
  ConsumerState<MyProfileQrScreen> createState() => _MyProfileQrScreenState();
}

class _MyProfileQrScreenState extends ConsumerState<MyProfileQrScreen> {
  static const int _ttlSeconds = 300; // 5분

  String? _userId;
  String? _userName;
  String? _userType;
  bool _isLoading = true;
  bool _isSharing = false;

  String _qrData = '';
  int _remainingSeconds = _ttlSeconds;
  Timer? _countdownTimer;
  final _random = Random.secure();
  final _qrKey = GlobalKey();

  @override
  void initState() {
    super.initState();
    _loadUserInfo();
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    super.dispose();
  }

  Future<void> _loadUserInfo() async {
    final bundle = await TokenStorage().readAuthBundle();
    if (!mounted) return;
    setState(() {
      _userId = bundle.userId;
      _userName = bundle.userName;
      _userType = bundle.userType;
      _isLoading = false;
    });
    _generateQr();
    _startCountdown();
  }

  void _generateQr() {
    final nonce = List.generate(
      8,
      (_) => _random.nextInt(36).toRadixString(36),
    ).join();
    final exp = DateTime.now().millisecondsSinceEpoch + (_ttlSeconds * 1000);
    final payload = {
      'userId': _userId ?? '',
      'userName': _userName ?? '',
      'userType': _userType ?? '',
      'type': 'PROFILE_QR',
      'exp': exp,
      'nonce': nonce,
    };
    setState(() {
      _qrData = jsonEncode(payload);
      _remainingSeconds = _ttlSeconds;
    });
  }

  void _startCountdown() {
    _countdownTimer?.cancel();
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() {
        if (_remainingSeconds > 0) {
          _remainingSeconds--;
        } else {
          _generateQr();
        }
      });
    });
  }

  void _refresh() {
    HapticFeedback.lightImpact();
    _countdownTimer?.cancel();
    _generateQr();
    _startCountdown();
  }

  Future<void> _shareQr() async {
    if (_isSharing) return;
    HapticFeedback.lightImpact();
    setState(() => _isSharing = true);

    try {
      // RepaintBoundary로 QR 위젯을 PNG 이미지로 캡처
      final boundary =
          _qrKey.currentContext?.findRenderObject() as RenderRepaintBoundary?;
      if (boundary == null) return;

      final image = await boundary.toImage(pixelRatio: 3.0);
      final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
      if (byteData == null) return;

      final bytes = byteData.buffer.asUint8List();
      final dir = await getTemporaryDirectory();
      final file = await File(
        '${dir.path}/teamplus_profile_qr.png',
      ).writeAsBytes(bytes);

      // share_plus 13.x: Share.shareXFiles → SharePlus.instance.share(ShareParams)
      await SharePlus.instance.share(
        ShareParams(
          files: [XFile(file.path, mimeType: 'image/png')],
          subject: 'TEAMPLUS 프로필 QR',
          text: '${_userName ?? ''}님의 TEAMPLUS 프로필 QR 코드입니다.',
        ),
      );
    } catch (e) {
      debugPrint('[QR] Share failed: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('공유 중 오류가 발생했습니다.')),
        );
      }
    } finally {
      if (mounted) setState(() => _isSharing = false);
    }
  }

  String get _countdownText {
    final m = _remainingSeconds ~/ 60;
    final s = _remainingSeconds % 60;
    return '${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
  }

  Color get _timerColor {
    if (_remainingSeconds > 60) return AppColors.success;
    if (_remainingSeconds > 30) return const Color(0xFFEAB308);
    return AppColors.error;
  }

  double get _timerProgress => _remainingSeconds / _ttlSeconds;

  String _userTypeLabel(String? type) {
    switch (type) {
      case 'ADMIN':
        return '관리자';
      case 'DIRECTOR':
        return '감독';
      case 'ACADEMY_DIRECTOR':
        return '아카데미 원장';
      case 'COACH':
        return '코치';
      case 'PARENT':
        return '학부모';
      case 'TEEN':
        return '청소년';
      case 'CHILD':
        return '아동';
      default:
        return '회원';
    }
  }

  Color _userTypeBgColor(String? type) {
    switch (type) {
      case 'COACH':
      case 'DIRECTOR':
      case 'ACADEMY_DIRECTOR':
        return AppColors.primary.withValues(alpha: 0.12);
      case 'PARENT':
        return AppColors.success.withValues(alpha: 0.12);
      case 'TEEN':
      case 'CHILD':
        return const Color(0xFF0284C7).withValues(alpha: 0.12);
      default:
        return AppColors.lightText.withValues(alpha: 0.12);
    }
  }

  Color _userTypeTextColor(String? type) {
    switch (type) {
      case 'COACH':
      case 'DIRECTOR':
      case 'ACADEMY_DIRECTOR':
        return AppColors.primary;
      case 'PARENT':
        return AppColors.success;
      case 'TEEN':
      case 'CHILD':
        return const Color(0xFF0284C7);
      default:
        return AppColors.lightText;
    }
  }

  String _initialsFromName(String? name) {
    if (name == null || name.isEmpty) return '?';
    final words = name.trim().split(' ');
    if (words.length >= 2) {
      return '${words[0][0]}${words[1][0]}'.toUpperCase();
    }
    return name.length >= 2 ? name.substring(0, 2) : name[0];
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark.copyWith(
        statusBarColor: Colors.transparent,
      ),
      child: Scaffold(
        backgroundColor: AppColors.background,
        appBar: _buildAppBar(),
        body: _isLoading
            ? const Center(child: CircularProgressIndicator())
            : _buildBody(),
      ),
    );
  }

  PreferredSizeWidget _buildAppBar() {
    return const TeamplusAppBar(
      title: '내 QR 코드',
      backgroundColor: AppColors.white,
      foregroundColor: AppColors.darkText,
    );
  }

  Widget _buildBody() {
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(
        horizontal: AppTheme.spacingLG,
        vertical: AppTheme.spacingXL,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          _buildUserInfo(),
          const SizedBox(height: AppTheme.spacingXL),
          _buildQrCard(),
          const SizedBox(height: AppTheme.spacingLG),
          _buildCountdown(),
          const SizedBox(height: AppTheme.spacingLG),
          _buildInfoText(),
          const SizedBox(height: AppTheme.spacingXL),
          _buildActionButtons(),
          const SizedBox(height: AppTheme.spacingMD),
        ],
      ),
    );
  }

  Widget _buildUserInfo() {
    final typeLabel = _userTypeLabel(_userType);
    final bgColor = _userTypeBgColor(_userType);
    final textColor = _userTypeTextColor(_userType);

    return Column(
      children: [
        // 프로필 사진 (이니셜 아바타)
        CircleAvatar(
          radius: 36,
          backgroundColor: AppColors.primary.withValues(alpha: 0.12),
          child: Text(
            _initialsFromName(_userName),
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w700,
              color: AppColors.primary,
            ),
          ),
        ),
        const SizedBox(height: 12),

        // 이름
        Text(
          _userName ?? '사용자',
          style: const TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.w700,
            color: AppColors.darkText,
          ),
        ),
        const SizedBox(height: 8),

        // 역할 뱃지
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
          decoration: BoxDecoration(
            color: bgColor,
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(
            typeLabel,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: textColor,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildQrCard() {
    if (_qrData.isEmpty) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        children: [
          RepaintBoundary(
            key: _qrKey,
            child: QrImageView(
              data: _qrData,
              version: QrVersions.auto,
              size: 240,
              backgroundColor: AppColors.white,
              errorStateBuilder: (context, err) {
                return const SizedBox(
                  width: 240,
                  height: 240,
                  child: Center(
                    child: Text(
                      'QR 생성 실패',
                      style: TextStyle(color: AppColors.error, fontSize: 14),
                    ),
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: const BoxDecoration(
                  color: AppColors.primary,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 6),
              const Text(
                'TEAMPLUS',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: AppColors.primary,
                  letterSpacing: 1.5,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildCountdown() {
    final color = _timerColor;
    final isWarning = _remainingSeconds <= 60;

    return Column(
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: _timerProgress,
            minHeight: 6,
            backgroundColor: AppColors.dividers,
            valueColor: AlwaysStoppedAnimation<Color>(color),
          ),
        ),
        const SizedBox(height: 10),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              isWarning ? Icons.warning_amber_rounded : Icons.timer_outlined,
              size: 16,
              color: color,
            ),
            const SizedBox(width: 6),
            Text(
              '$_countdownText 남음',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: color,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildInfoText() {
    return Container(
      padding: const EdgeInsets.all(AppTheme.spacingMD),
      decoration: BoxDecoration(
        color: AppColors.primary.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: AppColors.primary.withValues(alpha: 0.15),
        ),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline, size: 18, color: AppColors.primary),
          SizedBox(width: 10),
          Expanded(
            child: Text(
              'QR 코드를 스캔하여 본인 확인 또는 프로필 공유에 사용할 수 있습니다. 5분마다 자동으로 갱신됩니다.',
              style: TextStyle(
                fontSize: 13,
                color: AppColors.primary,
                height: 1.5,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActionButtons() {
    return Column(
      children: [
        // 공유하기 버튼
        SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            onPressed: _isSharing ? null : _shareQr,
            icon: _isSharing
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Icon(Icons.share_outlined, size: 20),
            label: Text(
              _isSharing ? '공유 중...' : '공유하기',
              style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
              ),
            ),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primary,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              disabledBackgroundColor: AppColors.primary.withValues(
                alpha: 0.5,
              ),
            ),
          ),
        ),
        const SizedBox(height: 10),
        // 새로고침 버튼
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            onPressed: _refresh,
            icon: const Icon(Icons.refresh_rounded, size: 20),
            label: const Text(
              '새로고침',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
            ),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.primary,
              side: const BorderSide(color: AppColors.primary, width: 1.5),
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
