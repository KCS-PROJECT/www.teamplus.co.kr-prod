import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/security/screen_capture_guard.dart';
import '../../../../core/theme/colors.dart';
import '../../../../core/providers/shared_providers.dart';
import '../../../../core/identity/identity_service.dart' as core_identity;
import '../../../../core/identity/identity_webview.dart';
import '../../../../shared/widgets/teamplus_app_bar.dart';
import '../../../../shared/widgets/app_card.dart';
import '../../../auth/presentation/screens/biometric_settings_screen.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../../../../core/security/app_lock_manager.dart';

/// 보안 설정 화면
///
/// 생체인증 설정·비밀번호 변경·본인인증 등 보안 관련 항목을 한 곳에서 관리합니다.
class ProfileSecurityScreen extends ConsumerWidget {
  const ProfileSecurityScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ScreenCaptureWrapper(
      child: Scaffold(
        appBar: const TeamplusAppBar(title: '보안 설정'),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // 섹션: 인증
              const _SectionLabel(label: '인증'),
              AppCard(
                child: Column(
                  children: [
                    _SecurityMenuItem(
                      icon: Icons.fingerprint,
                      iconColor: AppColors.primary,
                      title: '생체인증 설정',
                      subtitle: 'Face ID · 지문인식으로 빠르게 로그인',
                      onTap: () {
                        Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => const BiometricSettingsScreen(),
                          ),
                        );
                      },
                    ),
                    const Divider(height: 1),
                    _SecurityMenuItem(
                      icon: Icons.lock_outline,
                      iconColor: AppColors.primary,
                      title: '비밀번호 변경',
                      subtitle: '현재 비밀번호를 새 비밀번호로 변경',
                      onTap: () => context.push('/profile/password'),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // 섹션: 본인인증
              const _SectionLabel(label: '본인인증'),
              AppCard(
                child: _SecurityMenuItem(
                  icon: Icons.verified_user_outlined,
                  iconColor: AppColors.success,
                  title: '본인인증',
                  subtitle: 'NICE · PASS · 카카오 인증',
                  onTap: () {
                    // 본인인증 화면은 별도 플로우(identity_service 사용)로 진입
                    _showIdentityVerificationOptions(context);
                  },
                ),
              ),
              const SizedBox(height: 16),

              // 섹션: 세션 및 기기
              const _SectionLabel(label: '세션 및 기기'),
              AppCard(
                child: Column(
                  children: [
                    _SecurityMenuItem(
                      icon: Icons.phonelink_lock_outlined,
                      iconColor: AppColors.warning,
                      title: '자동 잠금 시간',
                      subtitle: '앱 비활성화 시 자동으로 잠금',
                      onTap: () => _showAutoLockOptions(context),
                    ),
                    const Divider(height: 1),
                    _SecurityMenuItem(
                      icon: Icons.logout,
                      iconColor: AppColors.error,
                      title: '모든 기기에서 로그아웃',
                      subtitle: '등록된 모든 기기의 세션을 종료합니다',
                      showArrow: false,
                      onTap: () => _confirmLogoutAll(context, ref),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // 안내 문구
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppColors.background,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: AppColors.borderColor, width: 1),
                ),
                child: const Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      Icons.shield_outlined,
                      size: 18,
                      color: AppColors.hintText,
                    ),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        '생체인증 정보는 기기에만 저장되며 서버로 전송되지 않습니다.\n개인정보 보호를 위해 정기적으로 비밀번호를 변경해 주세요.',
                        style: TextStyle(
                          fontSize: 12,
                          color: AppColors.hintText,
                          height: 1.6,
                        ),
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

  // 본인인증 시작 (IdentityService 연동)
  Future<void> _startIdentityVerification(
    BuildContext context,
    WidgetRef ref,
    core_identity.IdentityProvider provider,
  ) async {
    final identityService = ref.read(identityServiceProvider);

    // 로딩 표시
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('${provider.displayName} 본인인증을 시작합니다...'),
        duration: const Duration(seconds: 2),
      ),
    );

    // 1단계: 백엔드에서 인증 URL 발급
    final initiateResult = await identityService.initiateVerification(
      provider: provider,
      purpose: core_identity.IdentityPurpose.registration,
    );

    if (!context.mounted) return;

    if (!initiateResult.success || initiateResult.authUrl == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(initiateResult.errorMessage ?? '본인인증 요청에 실패했습니다.'),
          backgroundColor: AppColors.error,
        ),
      );
      return;
    }

    // 2단계: IdentityWebView로 인증 진행
    final webViewResult = await showIdentityWebView(
      context: context,
      authUrl: initiateResult.authUrl!,
      requestId: initiateResult.requestId!,
      provider: provider.code,
      purpose: 'registration',
    );

    if (!context.mounted) return;

    if (webViewResult != null && webViewResult.success) {
      // 3단계: 인증 결과 조회
      final verificationResult =
          await identityService.getVerificationResult(webViewResult.requestId);

      if (context.mounted) {
        if (verificationResult.success) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                '본인인증이 완료되었습니다. (${verificationResult.verifiedName ?? ""})',
              ),
              backgroundColor: AppColors.success,
            ),
          );
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content:
                  Text(verificationResult.errorMessage ?? '인증 결과 확인에 실패했습니다.'),
              backgroundColor: AppColors.error,
            ),
          );
        }
      }
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('본인인증이 취소되었습니다.'),
        ),
      );
    }
  }

  // 본인인증 옵션 다이얼로그
  void _showIdentityVerificationOptions(BuildContext context) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => Consumer(
        builder: (ctx, ref, _) => SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 8),
              Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.dividers,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                '본인인증 방법 선택',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: AppColors.darkText,
                ),
              ),
              const SizedBox(height: 8),
              _IdentityOption(
                icon: Icons.credit_card_outlined,
                label: 'NICE 본인인증',
                onTap: () {
                  Navigator.pop(ctx);
                  _startIdentityVerification(
                    context,
                    ref,
                    core_identity.IdentityProvider.nice,
                  );
                },
              ),
              _IdentityOption(
                icon: Icons.smartphone_outlined,
                label: 'PASS 인증',
                onTap: () {
                  Navigator.pop(ctx);
                  _startIdentityVerification(
                    context,
                    ref,
                    core_identity.IdentityProvider.pass,
                  );
                },
              ),
              _IdentityOption(
                icon: Icons.chat_bubble_outline,
                label: '카카오 인증',
                onTap: () {
                  Navigator.pop(ctx);
                  _startIdentityVerification(
                    context,
                    ref,
                    core_identity.IdentityProvider.kakao,
                  );
                },
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }

  // 자동 잠금 시간 선택 다이얼로그
  void _showAutoLockOptions(BuildContext context) {
    const options = [
      ('1분', 1),
      ('5분', 5),
      ('10분', 10),
      ('30분', 30),
    ];

    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 8),
            Center(
              child: Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.dividers,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 16, 20, 8),
              child: Text(
                '자동 잠금 시간',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: AppColors.darkText,
                ),
              ),
            ),
            ...options.map(
              (opt) => ListTile(
                title: Text('${opt.$1} 후 잠금'),
                trailing:
                    const Icon(Icons.chevron_right, color: AppColors.hintText),
                onTap: () async {
                  Navigator.pop(ctx);
                  await appLockManager.setSessionTimeoutMinutes(opt.$2);
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content:
                            Text('자동 잠금 시간이 ${opt.$1}(으)로 설정되었습니다.'),
                      ),
                    );
                  }
                },
              ),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  // 전체 기기 로그아웃 확인 다이얼로그
  void _confirmLogoutAll(BuildContext context, WidgetRef ref) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('모든 기기 로그아웃'),
        content: const Text(
          '모든 기기에서 로그아웃됩니다.\n다시 로그인이 필요합니다.\n계속하시겠습니까?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('취소'),
          ),
          TextButton(
            onPressed: () async {
              Navigator.pop(ctx);
              try {
                await ref.read(logoutAllProvider.future);
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('모든 기기에서 로그아웃되었습니다.'),
                      backgroundColor: AppColors.success,
                    ),
                  );
                  context.go('/login');
                }
              } catch (_) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('로그아웃 처리 중 오류가 발생했습니다.'),
                      backgroundColor: AppColors.error,
                    ),
                  );
                }
              }
            },
            child: const Text(
              '로그아웃',
              style: TextStyle(color: AppColors.error),
            ),
          ),
        ],
      ),
    );
  }
}

/// 섹션 레이블
class _SectionLabel extends StatelessWidget {
  final String label;
  const _SectionLabel({required this.label});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 8),
      child: Text(
        label,
        style: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: AppColors.hintText,
        ),
      ),
    );
  }
}

/// 보안 설정 메뉴 항목
class _SecurityMenuItem extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String title;
  final String subtitle;
  final bool showArrow;
  final VoidCallback onTap;

  const _SecurityMenuItem({
    required this.icon,
    required this.iconColor,
    required this.title,
    required this.subtitle,
    this.showArrow = true,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: iconColor.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(icon, size: 20, color: iconColor),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w500,
                      color: AppColors.darkText,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.hintText,
                    ),
                  ),
                ],
              ),
            ),
            if (showArrow)
              const Icon(
                Icons.chevron_right,
                color: AppColors.hintText,
                size: 20,
              ),
          ],
        ),
      ),
    );
  }
}

/// 본인인증 옵션 항목
class _IdentityOption extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _IdentityOption({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, color: AppColors.primary),
      title: Text(
        label,
        style: const TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w500,
          color: AppColors.darkText,
        ),
      ),
      trailing: const Icon(Icons.chevron_right, color: AppColors.hintText),
      onTap: onTap,
    );
  }
}
