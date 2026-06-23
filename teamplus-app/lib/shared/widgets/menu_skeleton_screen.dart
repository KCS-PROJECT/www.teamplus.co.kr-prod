import 'package:flutter/material.dart';
import '../../core/theme/colors.dart';
import 'teamplus_app_bar.dart';

class SkeletonSection {
  final String title;
  final int itemCount;
  final String? helperText;

  const SkeletonSection({
    required this.title,
    this.itemCount = 3,
    this.helperText,
  });
}

class MenuSkeletonScreen extends StatelessWidget {
  final String title;
  final String subtitle;
  final List<SkeletonSection> sections;

  const MenuSkeletonScreen({
    super.key,
    required this.title,
    required this.subtitle,
    required this.sections,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: TeamplusAppBar(
        title: title,
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            subtitle,
            style: const TextStyle(
              fontSize: 14,
              color: AppColors.lightText,
            ),
          ),
          const SizedBox(height: 16),
          ...sections.map(_buildSectionCard),
        ],
      ),
    );
  }

  Widget _buildSectionCard(SkeletonSection section) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            section.title,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: AppColors.darkText,
            ),
          ),
          if (section.helperText != null) ...[
            const SizedBox(height: 6),
            Text(
              section.helperText!,
              style: const TextStyle(
                fontSize: 12,
                color: AppColors.lightText,
              ),
            ),
          ],
          const SizedBox(height: 12),
          ...List.generate(section.itemCount, (index) {
            return Container(
              height: 12,
              margin: EdgeInsets.only(
                  bottom: index == section.itemCount - 1 ? 0 : 10),
              decoration: BoxDecoration(
                color: AppColors.borderColor.withValues(alpha: 0.35),
                borderRadius: BorderRadius.circular(6),
              ),
            );
          }),
          const SizedBox(height: 12),
          Row(
            children: [
              Container(
                width: 90,
                height: 28,
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(6),
                ),
              ),
              const SizedBox(width: 8),
              Container(
                width: 70,
                height: 28,
                decoration: BoxDecoration(
                  color: AppColors.borderColor.withValues(alpha: 0.35),
                  borderRadius: BorderRadius.circular(6),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
