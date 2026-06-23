import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/constants/api_constants.dart';
import '../../../../core/theme/colors.dart';
import '../../../../core/logging/bridge_log_viewer.dart';
import '../../../../shared/widgets/app_card.dart';
import '../../../../shared/widgets/teamplus_app_bar.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../providers/profile_provider.dart';

/// 프로필 화면
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profileAsync = ref.watch(myProfileProvider);

    return Scaffold(
      appBar: const TeamplusAppBar(title: '내 정보'),
      body: SafeArea(
        child: profileAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.error_outline,
                    size: 48, color: AppColors.error),
                const SizedBox(height: 12),
                const Text('정보를 불러올 수 없습니다.'),
                const SizedBox(height: 16),
                TextButton(
                  onPressed: () => ref.invalidate(myProfileProvider),
                  child: const Text('다시 시도'),
                ),
              ],
            ),
          ),
          data: (profile) => _buildProfileContent(context, ref, profile),
        ),
      ),
    );
  }

  Widget _buildProfileContent(
    BuildContext context,
    WidgetRef ref,
    Map<String, dynamic>? profile,
  ) {
    final name = profile?['name'] as String? ?? '사용자';
    final email = profile?['email'] as String? ?? '';

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          // Profile Avatar
          Container(
            width: 100,
            height: 100,
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.1),
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.person,
              size: 56,
              color: AppColors.primary,
            ),
          ),
          const SizedBox(height: 16),

          // Name (API 데이터)
          Text(
            name,
            style: const TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.bold,
              color: AppColors.darkText,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            email,
            style: const TextStyle(
              fontSize: 16,
              color: AppColors.lightText,
            ),
          ),
          const SizedBox(height: 32),

          // Menu Items
          AppCard(
            child: Column(
              children: [
                _buildMenuItem(
                  icon: Icons.person_outline,
                  label: '프로필 수정',
                  onTap: () => context.push('/profile/edit'),
                ),
                const Divider(height: 1),
                _buildMenuItem(
                  icon: Icons.notifications_outlined,
                  label: '알림 설정',
                  onTap: () => context.push('/profile/notifications'),
                ),
                const Divider(height: 1),
                _buildMenuItem(
                  icon: Icons.lock_outline,
                  label: '비밀번호 변경',
                  onTap: () => context.push('/profile/password'),
                ),
                const Divider(height: 1),
                _buildMenuItem(
                  icon: Icons.shield_outlined,
                  label: '보안 설정',
                  onTap: () => context.push('/profile/security'),
                ),
                const Divider(height: 1),
                _buildMenuItem(
                  icon: Icons.help_outline,
                  label: '도움말',
                  onTap: () {
                    // 도움말은 WebView에서 제공 (teamplus-web)
                    context.push('/webview',
                        extra: {'url': '/help', 'title': '도움말'});
                  },
                ),
                const Divider(height: 1),
                // 약관·정책 — 웹 약관(/terms) WebView 로 표시 (앱 심사 대응)
                _buildMenuItem(
                  icon: Icons.description_outlined,
                  label: '이용약관',
                  onTap: () => context.push('/webview', extra: {
                    'url':
                        '${ApiConstants.webAppUrl}/terms?section=terms_of_service',
                    'title': '이용약관',
                    'showAppBar': true,
                    'showBottomNav': false,
                  }),
                ),
                const Divider(height: 1),
                _buildMenuItem(
                  icon: Icons.privacy_tip_outlined,
                  label: '개인정보 처리방침',
                  onTap: () => context.push('/webview', extra: {
                    'url':
                        '${ApiConstants.webAppUrl}/terms?section=privacy_policy',
                    'title': '개인정보 처리방침',
                    'showAppBar': true,
                    'showBottomNav': false,
                  }),
                ),
                // 개발자 도구 (Debug 모드에서만 표시)
                if (kDebugMode) ...[
                  const Divider(height: 1),
                  _buildMenuItem(
                    icon: Icons.bug_report_outlined,
                    label: '브릿지 로그 뷰어',
                    onTap: () {
                      showBridgeLogDialog(context);
                    },
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Logout Button
          AppCard(
            onTap: () async {
              // Show confirmation dialog
              final confirm = await showDialog<bool>(
                context: context,
                builder: (context) => AlertDialog(
                  title: const Text('로그아웃'),
                  content: const Text('정말 로그아웃하시겠습니까?'),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: const Text('취소'),
                    ),
                    TextButton(
                      onPressed: () => Navigator.pop(context, true),
                      child: const Text(
                        '로그아웃',
                        style: TextStyle(color: AppColors.error),
                      ),
                    ),
                  ],
                ),
              );

              if (confirm == true) {
                await ref.read(logoutProvider.future);
                if (context.mounted) {
                  // [2026-05-19] 네이티브 /login 폐기 → WebView /login/ 단일 SoT.
                  context.go('/webview');
                }
              }
            },
            child: const Row(
              children: [
                Icon(Icons.logout, color: AppColors.error, size: 24),
                SizedBox(width: 16),
                Expanded(
                  child: Text(
                    '로그아웃',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w500,
                      color: AppColors.error,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 32),

          // App Version
          const Text(
            '버전 1.0.0',
            style: TextStyle(
              fontSize: 12,
              color: AppColors.lightText,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMenuItem({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Row(
          children: [
            Icon(icon, color: AppColors.darkText, size: 24),
            const SizedBox(width: 16),
            Expanded(
              child: Text(
                label,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                  color: AppColors.darkText,
                ),
              ),
            ),
            const Icon(
              Icons.chevron_right,
              color: AppColors.lightText,
            ),
          ],
        ),
      ),
    );
  }
}
