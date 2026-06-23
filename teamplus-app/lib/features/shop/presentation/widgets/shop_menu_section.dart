import 'package:flutter/material.dart';
import '../../../../core/theme/colors.dart';
import '../../../../core/logging/menu_logger.dart';

/// 쇼핑몰 메뉴 아이템 데이터
class ShopMenuItem {
  final String label;
  final IconData icon;
  final VoidCallback onTap;

  const ShopMenuItem({
    required this.label,
    required this.icon,
    required this.onTap,
  });
}

/// 쇼핑몰 메뉴 섹션
/// admin_menu_section.dart 디자인 패턴 적용
class ShopMenuSection extends StatelessWidget {
  final String title;
  final List<ShopMenuItem> items;

  const ShopMenuSection({
    super.key,
    required this.title,
    required this.items,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 섹션 헤더
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          decoration: BoxDecoration(
            color: AppColors.primary,
            borderRadius: BorderRadius.circular(6),
          ),
          child: Text(
            title,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
          ),
        ),

        // 메뉴 아이템들
        ...items.map((item) => _buildMenuItem(item)),
        const SizedBox(height: 12),
      ],
    );
  }

  Widget _buildMenuItem(ShopMenuItem item) {
    return InkWell(
      onTap: () {
        MenuLogger.logMenuTap(
          menuLabel: item.label,
          sectionTitle: title,
          screenName:
              'teamplus_app/lib/features/shop/presentation/screens/shop_admin_screen.dart',
          filePath:
              'teamplus_app/lib/features/shop/presentation/widgets/shop_menu_section.dart',
        );
        item.onTap();
      },
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Row(
          children: [
            // 아이콘
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Icon(
                item.icon,
                size: 16,
                color: AppColors.primary,
              ),
            ),
            const SizedBox(width: 12),

            // 라벨
            Expanded(
              child: Text(
                item.label,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: AppColors.darkText,
                ),
              ),
            ),

            // 화살표
            const Icon(
              Icons.chevron_right,
              size: 18,
              color: AppColors.lightText,
            ),
          ],
        ),
      ),
    );
  }
}
