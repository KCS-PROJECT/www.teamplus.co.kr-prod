import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/identity/identity_service.dart' as svc;
import '../../../../core/providers/shared_providers.dart';
import '../../../../core/theme/colors.dart';
import '../../../../shared/widgets/teamplus_app_bar.dart';
import '../../presentation/screens/identity_verification_screen.dart'
    show IdentityVerificationResult, IdentityProvider, IdentityPurpose;

/// 본인인증 게이트웨이 선택 화면
///
/// 4가지 인증 제공자(NICE · KG이니시스 · 카카오 · PASS) 중 선택 후
/// 실제 인증 WebView로 이동한다.
class IdentityVerifyScreen extends ConsumerStatefulWidget {
  /// 인증 완료 후 돌아갈 GoRouter 경로 (optional)
  final String? returnPath;

  const IdentityVerifyScreen({super.key, this.returnPath});

  @override
  ConsumerState<IdentityVerifyScreen> createState() =>
      _IdentityVerifyScreenState();
}

class _IdentityVerifyScreenState extends ConsumerState<IdentityVerifyScreen> {
  bool _isLoading = false;
  IdentityProvider? _selectedProvider;

  Future<void> _startVerification(IdentityProvider provider) async {
    if (_isLoading) return;
    setState(() {
      _isLoading = true;
      _selectedProvider = provider;
    });

    try {
      final identityService = ref.read(identityServiceProvider);

      // 1. 백엔드에서 authUrl 수령
      final initResult = await identityService.initiateVerification(
        provider: svc.IdentityProvider.values[provider.index],
        purpose: svc.IdentityPurpose.registration,
      );

      if (!mounted) return;

      if (!initResult.success ||
          initResult.authUrl == null ||
          initResult.requestId == null) {
        _showError(initResult.errorMessage ?? '본인인증 요청에 실패했습니다.');
        return;
      }

      // 2. WebView 인증 화면으로 이동
      final result = await context.push<IdentityVerificationResult>(
        '/identity-verify',
        extra: {
          'authUrl': initResult.authUrl!,
          'requestId': initResult.requestId!,
          'provider': provider,
          'purpose': IdentityPurpose.registration,
        },
      );

      if (!mounted) return;

      // 3. 인증 결과 처리
      if (result == null || !result.isSuccess) {
        final msg = result?.errorMessage ?? '본인인증이 취소되었습니다.';
        _showError(msg);
        return;
      }

      // 4. Backend 결과 저장 (POST /identity/verify-callback)
      await _saveVerificationResult(result);

      if (mounted && widget.returnPath != null) {
        context.go(widget.returnPath!);
      } else if (mounted) {
        _showSuccess(result);
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[IdentityVerifyScreen] error: $e');
      if (mounted) {
        _showError('본인인증 중 오류가 발생했습니다. 다시 시도해주세요.');
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _selectedProvider = null;
        });
      }
    }
  }

  Future<void> _saveVerificationResult(
      IdentityVerificationResult result) async {
    try {
      final apiClient = ref.read(apiClientProvider);
      await apiClient.post(
        '/identity/verify-callback',
        data: {
          'requestId': result.requestId,
          'provider': result.provider,
          if (result.ci != null) 'ci': result.ci,
          if (result.di != null) 'di': result.di,
          if (result.verifiedName != null) 'verifiedName': result.verifiedName,
          if (result.verifiedPhone != null)
            'verifiedPhone': result.verifiedPhone,
          if (result.verifiedBirthdate != null)
            'verifiedBirthdate': result.verifiedBirthdate,
        },
      );
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[IdentityVerifyScreen] verify-callback error: $e');
      }
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: AppColors.error,
      ),
    );
  }

  void _showSuccess(IdentityVerificationResult result) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.verified_user, color: AppColors.success, size: 28),
            SizedBox(width: 12),
            Text('본인인증 완료'),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (result.verifiedName != null) Text('이름: ${result.verifiedName}'),
            if (result.verifiedPhone != null)
              Text('연락처: ${result.verifiedPhone}'),
            const SizedBox(height: 8),
            const Text(
              '본인인증이 완료되었습니다.',
              style: TextStyle(color: AppColors.lightText, fontSize: 13),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('확인'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const TeamplusAppBar(title: '본인인증'),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                '인증 방법을 선택해주세요',
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                  color: AppColors.darkText,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                '안전한 서비스 이용을 위해 본인인증이 필요합니다.',
                style: TextStyle(fontSize: 14, color: AppColors.lightText),
              ),
              const SizedBox(height: 32),

              // 4가지 게이트웨이 카드
              _GatewayCard(
                provider: IdentityProvider.nice,
                title: 'NICE 본인인증',
                subtitle: '전국민 사용 가능 · 신용평가 기반',
                iconColor: const Color(0xFF003087),
                iconData: Icons.security,
                isLoading:
                    _isLoading && _selectedProvider == IdentityProvider.nice,
                onTap: _isLoading
                    ? null
                    : () => _startVerification(IdentityProvider.nice),
              ),
              const SizedBox(height: 12),

              _GatewayCard(
                provider: IdentityProvider.kgInicis,
                title: 'KG이니시스 본인인증',
                subtitle: '신용카드 기반 간편 인증',
                iconColor: const Color(0xFF1A6BB3),
                iconData: Icons.credit_card,
                isLoading: _isLoading &&
                    _selectedProvider == IdentityProvider.kgInicis,
                onTap: _isLoading
                    ? null
                    : () => _startVerification(IdentityProvider.kgInicis),
              ),
              const SizedBox(height: 12),

              _GatewayCard(
                provider: IdentityProvider.kakao,
                title: '카카오 본인인증',
                subtitle: '카카오톡 간편 인증',
                iconColor: const Color(0xFFFEE500),
                iconData: Icons.chat_bubble,
                iconForeground: const Color(0xFF191919),
                isLoading:
                    _isLoading && _selectedProvider == IdentityProvider.kakao,
                onTap: _isLoading
                    ? null
                    : () => _startVerification(IdentityProvider.kakao),
              ),
              const SizedBox(height: 12),

              _GatewayCard(
                provider: IdentityProvider.pass,
                title: 'PASS 본인인증',
                subtitle: 'SK · KT · LG U+ 통신사 인증',
                iconColor: const Color(0xFF6C1DD4),
                iconData: Icons.smartphone,
                isLoading:
                    _isLoading && _selectedProvider == IdentityProvider.pass,
                onTap: _isLoading
                    ? null
                    : () => _startVerification(IdentityProvider.pass),
              ),

              const Spacer(),

              // 안내 문구
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.background,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.info_outline,
                        size: 18, color: AppColors.lightText),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        '본인인증 정보는 서비스 이용 확인 목적으로만 사용되며, '
                        '관련 법령에 따라 안전하게 보호됩니다.',
                        style: TextStyle(
                            fontSize: 12,
                            color: AppColors.lightText,
                            height: 1.5),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 게이트웨이 선택 카드
class _GatewayCard extends StatelessWidget {
  final IdentityProvider provider;
  final String title;
  final String subtitle;
  final Color iconColor;
  final IconData iconData;
  final Color? iconForeground;
  final bool isLoading;
  final VoidCallback? onTap;

  const _GatewayCard({
    required this.provider,
    required this.title,
    required this.subtitle,
    required this.iconColor,
    required this.iconData,
    this.iconForeground,
    required this.isLoading,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.borderColor),
          ),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: iconColor,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  iconData,
                  color: iconForeground ?? Colors.white,
                  size: 24,
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: AppColors.darkText,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        fontSize: 13,
                        color: AppColors.lightText,
                      ),
                    ),
                  ],
                ),
              ),
              if (isLoading)
                const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              else
                const Icon(
                  Icons.chevron_right,
                  color: AppColors.lightText,
                ),
            ],
          ),
        ),
      ),
    );
  }
}
