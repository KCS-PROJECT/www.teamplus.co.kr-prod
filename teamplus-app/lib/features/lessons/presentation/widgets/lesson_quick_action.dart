import 'package:flutter/material.dart';
import '../../../../core/theme/colors.dart';

/// 레슨 퀵 액션 버튼 (QR스캔, 선물하기 등)
/// AI 스타일 금지: 그라데이션, blur 효과 미사용
/// 인간적인 디자인: 심플한 아이콘 + 라벨 구조
class LessonQuickAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const LessonQuickAction({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: 56,
        child: Column(
          children: [
            Icon(
              icon,
              size: 26,
              color: AppColors.darkText,
            ),
            const SizedBox(height: 6),
            Text(
              label,
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w500,
                color: AppColors.darkText,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
