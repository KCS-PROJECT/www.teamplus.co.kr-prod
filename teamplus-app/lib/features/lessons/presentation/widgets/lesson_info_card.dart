import 'package:flutter/material.dart';

/// 레슨 정보 카드 (코치 정보 포함)
/// AI 스타일 금지: 그라데이션, blur 효과 미사용
/// 인간적인 디자인: 블루그레이 배경, 명확한 계층구조
class LessonInfoCard extends StatelessWidget {
  final String clubName;
  final String coachName;
  final String coachPhone;
  final VoidCallback onContactTap;
  final VoidCallback onCallTap;

  const LessonInfoCard({
    super.key,
    required this.clubName,
    required this.coachName,
    required this.coachPhone,
    required this.onContactTap,
    required this.onCallTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF5C6B7A), // 블루그레이 (이미지 참고)
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          // 상단 정보 영역
          Padding(
            padding: const EdgeInsets.all(20),
            child: Row(
              children: [
                // 코치 아바타
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.2),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.person,
                    color: Colors.white,
                    size: 28,
                  ),
                ),
                const SizedBox(width: 16),

                // 클럽 & 코치 정보
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        clubName,
                        style: const TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                          letterSpacing: -0.3,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '$coachName · $coachPhone',
                        style: TextStyle(
                          fontSize: 13,
                          color: Colors.white.withValues(alpha: 0.8),
                        ),
                      ),
                    ],
                  ),
                ),

                // 액션 버튼들
                Row(
                  children: [
                    // 연락처 버튼
                    _buildCircleButton(
                      icon: Icons.contact_page_outlined,
                      onTap: onContactTap,
                    ),
                    const SizedBox(width: 12),
                    // 전화 버튼
                    _buildCircleButton(
                      icon: Icons.phone,
                      onTap: onCallTap,
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCircleButton({
    required IconData icon,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.2),
          shape: BoxShape.circle,
        ),
        child: Icon(
          icon,
          color: Colors.white,
          size: 20,
        ),
      ),
    );
  }
}
