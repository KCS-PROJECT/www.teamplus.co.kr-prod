import 'package:flutter/material.dart';
import '../../../../core/theme/colors.dart';

/// 퀵 메뉴 아이템 데이터
class QuickMenuItem {
  final IconData icon;
  final String label;
  final String? badge;
  final VoidCallback onTap;

  const QuickMenuItem({
    required this.icon,
    required this.label,
    this.badge,
    required this.onTap,
  });
}

/// 홈 화면 퀵 메뉴 그리드
/// AI 스타일 금지: 단색 배경, 심플한 아이콘 스타일
class HomeQuickMenu extends StatelessWidget {
  final List<QuickMenuItem> items;

  const HomeQuickMenu({
    super.key,
    required this.items,
  });

  @override
  Widget build(BuildContext context) {
    final screenWidth = MediaQuery.of(context).size.width;
    final itemWidth = (screenWidth - 32) / items.length;

    return SizedBox(
      height: 90,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: items
              .map((item) => SizedBox(
                    width: itemWidth,
                    child: _buildMenuItem(item),
                  ))
              .toList(),
        ),
      ),
    );
  }

  Widget _buildMenuItem(QuickMenuItem item) {
    return GestureDetector(
      onTap: item.onTap,
      behavior: HitTestBehavior.opaque,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // 아이콘 컨테이너
          Stack(
            clipBehavior: Clip.none,
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: AppColors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: AppColors.borderColor,
                    width: 1,
                  ),
                ),
                child: Icon(
                  item.icon,
                  color: AppColors.darkText,
                  size: 26,
                ),
              ),
              // 배지
              if (item.badge != null)
                Positioned(
                  right: -4,
                  top: -4,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 6,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.error,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      item.badge!,
                      style: const TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),
          // 라벨
          Text(
            item.label,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: AppColors.darkText,
            ),
            textAlign: TextAlign.center,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}
