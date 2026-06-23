import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/colors.dart';
import '../../../../shared/widgets/teamplus_app_bar.dart';
import '../widgets/lesson_info_card.dart';
import '../widgets/lesson_action_button.dart';
import '../widgets/lesson_quick_action.dart';

/// TEAMPLUS 레슨 카드 화면
/// 참고: 골프 레슨카드 앱 디자인
///
/// Design 7 Principles 적용:
/// 1. 화면 분석 필수 - 레슨카드 화면 구조 분석 완료
/// 2. 휴먼 디자인 - 블루그레이 카드, 명확한 액션 버튼
/// 3. AI 스타일 절대 금지 - 그라데이션, blur 효과 미사용
/// 4. 페르소나 융합 - frontend, architect, backend 협업
/// 5. 명령어 필수 - frontend-design 스킬 활용
/// 6. 결과 출력 필수 - 하단 주석 참조
/// 7. Tone & Manner - 존댓말, 전문적 표현
class LessonCardScreen extends StatefulWidget {
  const LessonCardScreen({super.key});

  @override
  State<LessonCardScreen> createState() => _LessonCardScreenState();
}

class _LessonCardScreenState extends State<LessonCardScreen> {
  int _currentNavIndex = 0;

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark.copyWith(
        statusBarColor: Colors.transparent,
      ),
      child: Scaffold(
        backgroundColor: AppColors.background,
        appBar: _buildAppBar(),
        body: SingleChildScrollView(
          child: Column(
            children: [
              // 레슨 정보 카드
              Padding(
                padding: const EdgeInsets.all(16),
                child: LessonInfoCard(
                  clubName: 'ACE 아이스하키 클럽',
                  coachName: '김현수 코치',
                  coachPhone: '010-8943-4046',
                  onContactTap: () {
                    // 연락처 보기
                  },
                  onCallTap: () {
                    // 전화 걸기
                  },
                ),
              ),

              // 메인 액션 버튼들
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Row(
                  children: [
                    Expanded(
                      child: LessonActionButton(
                        icon: Icons.calendar_today_outlined,
                        label: '예약하기',
                        onTap: () {},
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: LessonActionButton(
                        icon: Icons.login_outlined,
                        label: '입장하기',
                        onTap: () {},
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: LessonActionButton(
                        icon: Icons.thumb_up_outlined,
                        label: '리뷰쓰기',
                        onTap: () {},
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // 퀵 액션 그리드
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
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
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceAround,
                        children: [
                          LessonQuickAction(
                            icon: Icons.qr_code_scanner,
                            label: 'QR스캔',
                            onTap: () {},
                          ),
                          LessonQuickAction(
                            icon: Icons.card_giftcard_outlined,
                            label: '선물하기',
                            onTap: () {},
                          ),
                          LessonQuickAction(
                            icon: Icons.view_week_outlined,
                            label: '바코드',
                            onTap: () {},
                          ),
                          LessonQuickAction(
                            icon: Icons.campaign_outlined,
                            label: '공지안내',
                            onTap: () {},
                          ),
                          LessonQuickAction(
                            icon: Icons.more_horiz,
                            label: '더보기',
                            onTap: () {},
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      // 선수 이름 태그
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            color: AppColors.background,
                            borderRadius: BorderRadius.circular(16),
                          ),
                          child: const Text(
                            '김민준',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: AppColors.darkText,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),

              // 레슨 현황 섹션
              _buildLessonStatusSection(),
              const SizedBox(height: 24),
            ],
          ),
        ),
        bottomNavigationBar: _buildBottomNavBar(),
      ),
    );
  }

  PreferredSizeWidget _buildAppBar() {
    final canPop = Navigator.of(context).canPop();
    final canGoBack = GoRouter.of(context).canPop();
    return TeamplusAppBar(
      title: '레슨카드',
      backgroundColor: AppColors.white,
      foregroundColor: AppColors.darkText,
      centerTitle: false,
      leading: (canPop || canGoBack)
          ? null
          : IconButton(
              tooltip: '메뉴',
              onPressed: () {},
              icon: const Icon(Icons.menu, color: AppColors.darkText),
            ),
      actions: [
        // QR 체크인 버튼
        Container(
          margin: const EdgeInsets.only(right: 8),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: AppColors.background,
            borderRadius: BorderRadius.circular(8),
          ),
          child: const Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.qr_code,
                size: 18,
                color: AppColors.darkText,
              ),
              SizedBox(width: 4),
              Text(
                'QR 체크인',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppColors.darkText,
                ),
              ),
            ],
          ),
        ),
        // 알림 버튼
        Stack(
          children: [
            IconButton(
              onPressed: () {},
              icon: const Icon(
                Icons.notifications_outlined,
                color: AppColors.darkText,
              ),
            ),
            Positioned(
              right: 10,
              top: 10,
              child: Container(
                width: 8,
                height: 8,
                decoration: const BoxDecoration(
                  color: AppColors.error,
                  shape: BoxShape.circle,
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildLessonStatusSection() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        padding: const EdgeInsets.all(20),
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
            const Text(
              '이번 달 레슨 현황',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: AppColors.darkText,
              ),
            ),
            const SizedBox(height: 20),

            // 레슨 현황 통계
            Row(
              children: [
                _buildStatusItem(
                  label: '총 수업',
                  value: '8회',
                  color: AppColors.primary,
                ),
                const SizedBox(width: 24),
                _buildStatusItem(
                  label: '출석',
                  value: '6회',
                  color: AppColors.success,
                ),
                const SizedBox(width: 24),
                _buildStatusItem(
                  label: '결석',
                  value: '1회',
                  color: AppColors.error,
                ),
                const SizedBox(width: 24),
                _buildStatusItem(
                  label: '남은 수업',
                  value: '1회',
                  color: AppColors.warning,
                ),
              ],
            ),
            const SizedBox(height: 20),

            // 진행바
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      '출석률',
                      style: TextStyle(
                        fontSize: 13,
                        color: AppColors.lightText,
                      ),
                    ),
                    Text(
                      '85%',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: AppColors.success,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: const LinearProgressIndicator(
                    value: 0.85,
                    minHeight: 8,
                    backgroundColor: AppColors.dividers,
                    valueColor:
                        AlwaysStoppedAnimation<Color>(AppColors.success),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatusItem({
    required String label,
    required String value,
    required Color color,
  }) {
    return Expanded(
      child: Column(
        children: [
          Text(
            value,
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: color,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: const TextStyle(
              fontSize: 11,
              color: AppColors.lightText,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBottomNavBar() {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 10,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: SafeArea(
        child: SizedBox(
          height: 64,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _buildNavItem(
                icon: Icons.credit_card_outlined,
                activeIcon: Icons.credit_card,
                label: '레슨카드',
                index: 0,
              ),
              _buildNavItem(
                icon: Icons.inventory_2_outlined,
                activeIcon: Icons.inventory_2,
                label: '보유상품',
                index: 1,
              ),
              _buildNavItem(
                icon: Icons.sports_hockey_outlined,
                activeIcon: Icons.sports_hockey,
                label: '레슨현황',
                index: 2,
              ),
              _buildNavItem(
                icon: Icons.schedule_outlined,
                activeIcon: Icons.schedule,
                label: '예약현황',
                index: 3,
              ),
              _buildNavItem(
                icon: Icons.history_outlined,
                activeIcon: Icons.history,
                label: '레슨기록',
                index: 4,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildNavItem({
    required IconData icon,
    required IconData activeIcon,
    required String label,
    required int index,
  }) {
    final isSelected = _currentNavIndex == index;
    return GestureDetector(
      onTap: () {
        setState(() {
          _currentNavIndex = index;
        });
        // 네비게이션 연결
        switch (index) {
          case 0: // 레슨카드 - 현재 화면
            break;
          case 1: // 보유상품
            context.push('/payment-history');
            break;
          case 2: // 레슨현황
            context.push('/classes');
            break;
          case 3: // 예약현황
            context.push('/attendance-history');
            break;
          case 4: // 레슨기록
            context.push('/attendance-history');
            break;
        }
      },
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: 64,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              isSelected ? activeIcon : icon,
              color: isSelected ? AppColors.primary : AppColors.lightText,
              size: 24,
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: TextStyle(
                fontSize: 10,
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                color: isSelected ? AppColors.primary : AppColors.lightText,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
