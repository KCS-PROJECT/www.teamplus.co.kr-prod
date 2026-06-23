import 'package:flutter/material.dart';
import '../../../../core/theme/colors.dart';
import '../screens/children_management_screen.dart';

/// 자녀 정보 카드
/// AI 스타일 금지: 그라데이션, blur 효과 미사용
/// 인간적인 디자인: 아바타 + 정보 + 화살표 구조
class ChildCard extends StatelessWidget {
  final ChildData data;
  final VoidCallback onTap;
  final VoidCallback? onVideoUpload;

  const ChildCard({
    super.key,
    required this.data,
    required this.onTap,
    this.onVideoUpload,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: AppColors.borderColor,
            width: 1,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 메인 행: 아바타 + 정보 + 화살표
            Row(
              children: [
                // 아바타
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    color: data.avatarColor.withValues(alpha: 0.1),
                    shape: BoxShape.circle,
                  ),
                  child: Center(
                    child: Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        color: data.avatarColor.withValues(alpha: 0.2),
                        shape: BoxShape.circle,
                      ),
                      child: Center(
                        child: Text(
                          _getEmoji(data.name),
                          style: const TextStyle(fontSize: 24),
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 16),

                // 정보
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // 클럽명 + 반
                      Text(
                        '${data.clubName} ${data.className}',
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.lightText,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 4),
                      // 이름
                      Text(
                        data.name,
                        style: const TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w700,
                          color: AppColors.darkText,
                          letterSpacing: -0.3,
                        ),
                      ),
                    ],
                  ),
                ),

                // 화살표
                const Icon(
                  Icons.chevron_right,
                  size: 24,
                  color: AppColors.hintText,
                ),
              ],
            ),

            // 영상 등록 버튼 (onVideoUpload 제공 시 노출)
            if (onVideoUpload != null) ...[
              const SizedBox(height: 12),
              const Divider(height: 1, color: AppColors.dividers),
              const SizedBox(height: 8),
              GestureDetector(
                onTap: onVideoUpload,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.primaryLight.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.video_call_outlined,
                        size: 16,
                        color: AppColors.primary,
                      ),
                      SizedBox(width: 4),
                      Text(
                        '영상 등록',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: AppColors.primary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _getEmoji(String name) {
    // 이름에 따라 다른 이모지 반환 (실제로는 프로필 이미지 사용)
    final emojis = ['', '', '', '', ''];
    return emojis[name.hashCode.abs() % emojis.length];
  }
}
