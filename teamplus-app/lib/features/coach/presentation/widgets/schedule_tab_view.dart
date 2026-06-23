import 'package:flutter/material.dart';
import '../../../../core/theme/colors.dart';
import '../screens/coach_admin_screen.dart';

/// 일정 탭 뷰
/// PDF 참고: 정규훈련, 레슨일정, 경기일정 탭 콘텐츠
class ScheduleTabView extends StatelessWidget {
  final ScheduleType type;
  final List<ScheduleItem> items;

  const ScheduleTabView({
    super.key,
    required this.type,
    required this.items,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // 헤더 (일정 신청 버튼)
        Container(
          padding: const EdgeInsets.all(16),
          color: AppColors.white,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                _getTypeTitle(),
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: AppColors.darkText,
                ),
              ),
              OutlinedButton.icon(
                onPressed: () {
                  // 일정 신청
                },
                icon: const Icon(Icons.add, size: 18),
                label: const Text('레슨 신청'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.primary,
                  side: const BorderSide(color: AppColors.primary),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                ),
              ),
            ],
          ),
        ),
        const Divider(height: 1),

        // 아이템 리스트
        Expanded(
          child: items.isEmpty
              ? _buildEmptyState()
              : ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: items.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 12),
                  itemBuilder: (context, index) {
                    return _ScheduleCard(
                      item: items[index],
                      type: type,
                    );
                  },
                ),
        ),
      ],
    );
  }

  String _getTypeTitle() {
    switch (type) {
      case ScheduleType.training:
        return '정규훈련';
      case ScheduleType.lesson:
        return '레슨정보';
      case ScheduleType.match:
        return '경기정보';
    }
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            _getTypeIcon(),
            size: 64,
            color: AppColors.hintText,
          ),
          const SizedBox(height: 16),
          Text(
            '등록된 ${_getTypeTitle()}이 없습니다',
            style: const TextStyle(
              fontSize: 16,
              color: AppColors.lightText,
            ),
          ),
        ],
      ),
    );
  }

  IconData _getTypeIcon() {
    switch (type) {
      case ScheduleType.training:
        return Icons.sports;
      case ScheduleType.lesson:
        return Icons.school;
      case ScheduleType.match:
        return Icons.emoji_events;
    }
  }
}

/// 일정 카드
class _ScheduleCard extends StatelessWidget {
  final ScheduleItem item;
  final ScheduleType type;

  const _ScheduleCard({
    required this.item,
    required this.type,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.borderColor),
      ),
      child: Row(
        children: [
          // 팀 로고 플레이스홀더
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: AppColors.primaryLight,
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Center(
              child: Text(
                '팀로고',
                style: TextStyle(
                  fontSize: 10,
                  color: AppColors.primary,
                  fontWeight: FontWeight.w600,
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
                Text(
                  item.title,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: AppColors.darkText,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  item.location,
                  style: const TextStyle(
                    fontSize: 13,
                    color: AppColors.lightText,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '참석인원 ${item.attendeeCount} 명 / (결제 및 참석인원)',
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.hintText,
                  ),
                ),
              ],
            ),
          ),

          // 화살표
          const Icon(
            Icons.chevron_right,
            color: AppColors.hintText,
          ),
        ],
      ),
    );
  }
}
