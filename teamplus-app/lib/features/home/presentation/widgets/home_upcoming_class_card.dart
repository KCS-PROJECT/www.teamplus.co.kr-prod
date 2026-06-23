import 'package:flutter/material.dart';
import '../../../../core/theme/colors.dart';

/// 홈 화면 예정된 수업 카드
/// AI 스타일 금지: 그라데이션, 블러 효과 미사용
/// 인간적인 디자인: 명확한 정보 계층, 깔끔한 카드 레이아웃
class HomeUpcomingClassCard extends StatelessWidget {
  final String clubName;
  final String className;
  final int playerCount;
  final String dateTime;
  final String location;
  final String price;
  final int viewCount;
  final int commentCount;
  final String? imageUrl;
  final VoidCallback onTap;

  const HomeUpcomingClassCard({
    super.key,
    required this.clubName,
    required this.className,
    required this.playerCount,
    required this.dateTime,
    required this.location,
    required this.price,
    required this.viewCount,
    required this.commentCount,
    this.imageUrl,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: AppColors.borderColor,
            width: 1,
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 왼쪽 콘텐츠
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // 클럽명 + 인원 배지
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: AppColors.primaryLight,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            clubName,
                            style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: AppColors.primary,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          '$playerCount명',
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                            color: AppColors.lightText,
                          ),
                        ),
                        const Spacer(),
                        // 조회수 & 댓글
                        Row(
                          children: [
                            const Icon(
                              Icons.visibility_outlined,
                              size: 14,
                              color: AppColors.hintText,
                            ),
                            const SizedBox(width: 2),
                            Text(
                              '$viewCount',
                              style: const TextStyle(
                                fontSize: 11,
                                color: AppColors.hintText,
                              ),
                            ),
                            const SizedBox(width: 8),
                            const Icon(
                              Icons.chat_bubble_outline,
                              size: 14,
                              color: AppColors.hintText,
                            ),
                            const SizedBox(width: 2),
                            Text(
                              '$commentCount',
                              style: const TextStyle(
                                fontSize: 11,
                                color: AppColors.hintText,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),

                    // 수업명
                    Text(
                      className,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: AppColors.darkText,
                        letterSpacing: -0.3,
                      ),
                    ),
                    const SizedBox(height: 6),

                    // 날짜/시간
                    Row(
                      children: [
                        const Icon(
                          Icons.schedule_outlined,
                          size: 14,
                          color: AppColors.lightText,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          dateTime,
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                            color: AppColors.darkText,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),

                    // 장소
                    Row(
                      children: [
                        const Icon(
                          Icons.location_on_outlined,
                          size: 14,
                          color: AppColors.lightText,
                        ),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            location,
                            style: const TextStyle(
                              fontSize: 13,
                              color: AppColors.lightText,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),

                    // 가격
                    Text(
                      price,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: AppColors.primary,
                      ),
                    ),
                  ],
                ),
              ),

              // 오른쪽 이미지
              const SizedBox(width: 12),
              Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  color: AppColors.background,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: AppColors.borderColor,
                    width: 1,
                  ),
                ),
                child: imageUrl != null
                    ? ClipRRect(
                        borderRadius: BorderRadius.circular(7),
                        child: Image.network(
                          imageUrl!,
                          fit: BoxFit.cover,
                        ),
                      )
                    : const Icon(
                        Icons.sports_hockey,
                        size: 36,
                        color: AppColors.hintText,
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
