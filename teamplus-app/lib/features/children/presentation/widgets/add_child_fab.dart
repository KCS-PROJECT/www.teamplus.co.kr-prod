import 'package:flutter/material.dart';
import '../../../../core/theme/colors.dart';

/// 자녀 추가 플로팅 버튼
/// AI 스타일 금지: 그라데이션, blur 효과 미사용
/// 인간적인 디자인: 심플한 오렌지 라운드 버튼
class AddChildFab extends StatelessWidget {
  final VoidCallback onPressed;

  const AddChildFab({
    super.key,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onPressed,
      child: Container(
        width: 64,
        height: 64,
        decoration: BoxDecoration(
          color: AppColors.warning, // 오렌지색 (이미지 참고)
          shape: BoxShape.circle,
          boxShadow: [
            BoxShadow(
              color: AppColors.warning.withValues(alpha: 0.3),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: const Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              '자녀',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
            ),
            Text(
              '추가',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
