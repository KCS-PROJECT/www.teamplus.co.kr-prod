import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/network/api_error.dart';
import '../../../../core/theme/colors.dart';
import 'report_form_sheet.dart';

/// 사용자 안전 메뉴 (차단/신고)
///
/// 채팅 메시지, 매치 참가자 카드, 커뮤니티 게시글 등에서
/// long-press 시 호출합니다.
///
/// 사용 예시:
/// ```dart
/// GestureDetector(
///   onLongPress: () => UserSafetyMenu.show(
///     context,
///     targetUserId: post.authorId,
///     targetUserName: post.authorName,
///   ),
///   child: PostCard(...),
/// )
/// ```
class UserSafetyMenu {
  /// long-press 메뉴 표시
  static Future<void> show(
    BuildContext context, {
    required String targetUserId,
    required String targetUserName,
    String? postId,
    String? messageId,
  }) async {
    HapticFeedback.mediumImpact();

    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _UserSafetyBottomSheet(
        targetUserId: targetUserId,
        targetUserName: targetUserName,
        postId: postId,
        messageId: messageId,
      ),
    );
  }
}

class _UserSafetyBottomSheet extends StatelessWidget {
  final String targetUserId;
  final String targetUserName;
  final String? postId;
  final String? messageId;

  const _UserSafetyBottomSheet({
    required this.targetUserId,
    required this.targetUserName,
    this.postId,
    this.messageId,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // 핸들
            Container(
              margin: const EdgeInsets.only(top: 12),
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.dividers,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 16),

            // 대상 사용자명
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Text(
                targetUserName,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: AppColors.darkText,
                ),
              ),
            ),
            const SizedBox(height: 4),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 20),
              child: Text(
                '이 사용자에 대해 어떤 조치를 원하시나요?',
                style: TextStyle(fontSize: 13, color: AppColors.lightText),
              ),
            ),
            const SizedBox(height: 16),
            const Divider(height: 1),

            // 신고하기
            _SafetyMenuItem(
              icon: Icons.flag_outlined,
              iconColor: AppColors.error,
              label: '신고하기',
              description: '부적절한 행동을 신고합니다',
              onTap: () {
                Navigator.of(context).pop();
                showModalBottomSheet<void>(
                  context: context,
                  isScrollControlled: true,
                  backgroundColor: Colors.transparent,
                  builder: (_) => ReportFormSheet(
                    targetUserId: targetUserId,
                    targetUserName: targetUserName,
                    postId: postId,
                    messageId: messageId,
                  ),
                );
              },
            ),

            // 차단하기
            _SafetyMenuItem(
              icon: Icons.block_outlined,
              iconColor: const Color(0xFFEA580C),
              label: '차단하기',
              description: '이 사용자의 콘텐츠를 숨깁니다',
              onTap: () {
                Navigator.of(context).pop();
                _confirmBlock(context);
              },
            ),

            // 취소
            const Divider(height: 1),
            _SafetyMenuItem(
              icon: Icons.close,
              iconColor: AppColors.lightText,
              label: '취소',
              onTap: () => Navigator.of(context).pop(),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  void _confirmBlock(BuildContext context) {
    final messenger = ScaffoldMessenger.of(context);
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text(
          '차단 확인',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
        ),
        content: Text(
          '$targetUserName 님을 차단하시겠습니까?\n차단된 사용자의 콘텐츠는 더 이상 표시되지 않습니다.',
          style: const TextStyle(fontSize: 14, color: AppColors.darkText),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text(
              '취소',
              style: TextStyle(color: AppColors.lightText),
            ),
          ),
          TextButton(
            onPressed: () async {
              Navigator.of(ctx).pop();
              try {
                await ApiClient().post(
                  '/users/me/blocks',
                  data: {'targetUserId': targetUserId},
                );
                messenger.showSnackBar(
                  const SnackBar(
                    content: Text('차단되었습니다.'),
                    backgroundColor: Color(0xFFEA580C),
                  ),
                );
              } on ApiError catch (e) {
                messenger.showSnackBar(SnackBar(content: Text(e.message)));
              } catch (_) {
                messenger.showSnackBar(
                  const SnackBar(content: Text('차단 중 오류가 발생했습니다.')),
                );
              }
            },
            child: const Text(
              '차단하기',
              style: TextStyle(
                color: Color(0xFFEA580C),
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SafetyMenuItem extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String label;
  final String? description;
  final VoidCallback onTap;

  const _SafetyMenuItem({
    required this.icon,
    required this.iconColor,
    required this.label,
    required this.onTap,
    this.description,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: iconColor.withValues(alpha: 0.1),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, color: iconColor, size: 20),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: description != null
                          ? AppColors.darkText
                          : AppColors.lightText,
                    ),
                  ),
                  if (description != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      description!,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.lightText,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
