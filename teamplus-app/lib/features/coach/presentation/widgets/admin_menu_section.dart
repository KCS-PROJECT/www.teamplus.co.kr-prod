import 'package:flutter/material.dart';
import '../../../../core/theme/colors.dart';
import '../../../../core/logging/menu_logger.dart';

/// 관리 메뉴 아이템 데이터
class AdminMenuItem {
  final String label;
  final VoidCallback onAddTap;
  final VoidCallback onEditTap;

  const AdminMenuItem({
    required this.label,
    required this.onAddTap,
    required this.onEditTap,
  });
}

/// 관리 메뉴 섹션
/// PDF 참고: 클럽 및 회원관리, 클럽훈련 관리, 영수증 관리
class AdminMenuSection extends StatelessWidget {
  final String title;
  final List<AdminMenuItem> items;

  const AdminMenuSection({
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
          margin: const EdgeInsets.only(bottom: 4),
          decoration: BoxDecoration(
            color: AppColors.primary,
            borderRadius: BorderRadius.circular(4),
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
        const SizedBox(height: 16),
      ],
    );
  }

  Widget _buildMenuItem(AdminMenuItem item) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
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

          // + 추가 버튼
          GestureDetector(
            onTap: () {
              MenuLogger.logMenuTap(
                menuLabel: '${item.label} (추가)',
                sectionTitle: title,
                screenName:
                    'teamplus_app/lib/features/coach/presentation/screens/coach_admin_screen.dart',
                filePath:
                    'teamplus_app/lib/features/coach/presentation/widgets/admin_menu_section.dart',
              );
              item.onAddTap();
            },
            child: const Padding(
              padding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.add,
                    size: 14,
                    color: AppColors.success,
                  ),
                  SizedBox(width: 2),
                  Text(
                    '추가',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: AppColors.success,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 8),

          // 변경 버튼
          GestureDetector(
            onTap: () {
              MenuLogger.logMenuTap(
                menuLabel: '${item.label} (변경)',
                sectionTitle: title,
                screenName:
                    'teamplus_app/lib/features/coach/presentation/screens/coach_admin_screen.dart',
                filePath:
                    'teamplus_app/lib/features/coach/presentation/widgets/admin_menu_section.dart',
              );
              item.onEditTap();
            },
            child: const Padding(
              padding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.edit,
                    size: 14,
                    color: AppColors.warning,
                  ),
                  SizedBox(width: 2),
                  Text(
                    '변경',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: AppColors.warning,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
