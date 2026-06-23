import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/colors.dart';
import '../widgets/home_banner_card.dart';
import '../widgets/home_quick_menu.dart';

/// TEAMPLUS 메인 홈 화면
/// Premium Design & Feature-rich Dashboard
class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen>
    with SingleTickerProviderStateMixin {
  int _currentNavIndex = 0;
  late AnimationController _animationController;
  late Animation<double> _fadeAnimation;

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );
    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _animationController, curve: Curves.easeOut),
    );
    _animationController.forward();
  }

  @override
  void dispose() {
    _animationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark.copyWith(
        statusBarColor: Colors.transparent,
      ),
      child: Scaffold(
        backgroundColor: const Color(0xFFF5F7FA), // Premium Light Background
        body: FadeTransition(
          opacity: _fadeAnimation,
          child: CustomScrollView(
            slivers: [
              // Premium App Bar
              _buildSliverAppBar(),

              // Welcome & Stats Section
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
                  child: _buildWelcomeSection(),
                ),
              ),

              // Banner Section (Carousel Style)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: HomeBannerCard(
                    title: 'TEAMPLUS 2025 시즌 오픈',
                    subtitle: '새로운 시작, 최고의 경험\n지금 등록하세요',
                    date: 'D-5',
                    onTap: () {},
                  ),
                ),
              ),

              // Quick Actions Grid - 기본 메뉴
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.only(top: 24, bottom: 8),
                  child: HomeQuickMenu(
                    items: [
                      QuickMenuItem(
                        icon: Icons.qr_code_scanner,
                        label: 'QR 출석',
                        badge: null,
                        onTap: () => _handleQuickAction('attendance'),
                      ),
                      QuickMenuItem(
                        icon: Icons.calendar_today_rounded,
                        label: '일정관리',
                        badge: null,
                        onTap: () => context.push('/calendar'),
                      ),
                      QuickMenuItem(
                        icon: Icons.payment_rounded,
                        label: '결제내역',
                        badge: 'New',
                        onTap: () => _handleQuickAction('payment'),
                      ),
                      QuickMenuItem(
                        icon: Icons.people_alt_rounded,
                        label: '우리 아이',
                        badge: null,
                        onTap: () => _handleQuickAction('children'),
                      ),
                    ],
                  ),
                ),
              ),

              // Quick Actions Grid - 추가 메뉴 (대회, 구장, 매치)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 24),
                  child: HomeQuickMenu(
                    items: [
                      QuickMenuItem(
                        icon: Icons.emoji_events_rounded,
                        label: '대회/경기',
                        badge: null,
                        onTap: () => context.push('/tournaments'),
                      ),
                      QuickMenuItem(
                        icon: Icons.location_on_rounded,
                        label: '구장 정보',
                        badge: null,
                        onTap: () => context.push('/rinks'),
                      ),
                      QuickMenuItem(
                        icon: Icons.groups_rounded,
                        label: '매치 모집',
                        badge: 'Hot',
                        onTap: () => context.push('/match-recruitment'),
                      ),
                      QuickMenuItem(
                        icon: Icons.storefront_rounded,
                        label: '용품샵',
                        badge: null,
                        onTap: () => context.push('/shop-admin'),
                      ),
                    ],
                  ),
                ),
              ),

              // "Next Up" - Upcoming Class Highlight
              SliverToBoxAdapter(
                child: _buildSectionHeader(
                  title: '다가오는 수업',
                  emoji: '🏒',
                  onMoreTap: () => context.push('/classes'),
                ),
              ),

              // Upcoming Class List
              SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                sliver: SliverList(
                  delegate: SliverChildListDelegate([
                    _buildPremiumClassCard(
                      title: '주니어 아이스하키 A반',
                      club: 'ACE 하키 클럽',
                      time: '오늘 16:00',
                      location: '목동 아이스링크',
                      isToday: true,
                    ),
                    const SizedBox(height: 16),
                    _buildPremiumClassCard(
                      title: '골리 특별 훈련',
                      club: 'TEAMPLUS',
                      time: '내일 18:00',
                      location: '고양 어울림누리',
                      isToday: false,
                    ),
                    const SizedBox(height: 100), // Bottom padding
                  ]),
                ),
              ),
            ],
          ),
        ),
        bottomNavigationBar: _buildModernBottomNavBar(),
        floatingActionButton: FloatingActionButton(
          onPressed: () {
            // Quick Add or Chat
          },
          elevation: 4,
          backgroundColor: AppColors.primary,
          child: const Icon(Icons.add, color: Colors.white),
        ),
        floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
      ),
    );
  }

  // Premium Light Background color constant
  static const Color _bgColor = Color(0xFFF5F7FA);

  Widget _buildSliverAppBar() {
    return SliverAppBar(
      expandedHeight: 60,
      floating: true,
      pinned: true,
      backgroundColor: _bgColor,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      flexibleSpace: FlexibleSpaceBar(
        background: Container(color: _bgColor),
      ),
      title: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: AppColors.primary,
              borderRadius: BorderRadius.circular(10),
            ),
            child:
                const Icon(Icons.sports_hockey, color: Colors.white, size: 20),
          ),
          const SizedBox(width: 10),
          const Text(
            'TEAMPLUS',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: AppColors.darkText,
              letterSpacing: -0.5,
            ),
          ),
        ],
      ),
      actions: [
        IconButton(
          onPressed: () {},
          icon: Stack(
            children: [
              const Icon(Icons.notifications_none_rounded,
                  color: AppColors.darkText, size: 28),
              Positioned(
                right: 2,
                top: 2,
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
        ),
        const SizedBox(width: 8),
        Padding(
          padding: const EdgeInsets.only(right: 16),
          child: CircleAvatar(
            radius: 18,
            backgroundColor: AppColors.primary.withValues(alpha: 0.1),
            child: const Icon(Icons.person, color: AppColors.primary, size: 20),
          ),
        ),
      ],
    );
  }

  Widget _buildWelcomeSection() {
    return const Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '반갑습니다, 홍길동님!',
          style: TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.bold,
            color: AppColors.darkText,
            height: 1.3,
          ),
        ),
        SizedBox(height: 8),
        Text(
          '오늘도 아이들의 꿈을 응원합니다.',
          style: TextStyle(
            fontSize: 15,
            color: AppColors.lightText,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }

  void _handleQuickAction(String action) {
    switch (action) {
      case 'attendance':
        context.push('/qr-checkin');
        break;
      case 'payment':
        context.push('/payment-history');
        break;
      case 'children':
        context.push('/children');
        break;
    }
  }

  Widget _buildPremiumClassCard({
    required String title,
    required String club,
    required String time,
    required String location,
    required bool isToday,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 20,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () {},
          borderRadius: BorderRadius.circular(20),
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Row(
              children: [
                Container(
                  width: 60,
                  height: 60,
                  decoration: BoxDecoration(
                    color: isToday
                        ? AppColors.primary.withValues(alpha: 0.1)
                        : AppColors.background,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        isToday ? 'Today' : 'Next',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color:
                              isToday ? AppColors.primary : AppColors.lightText,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Icon(
                        Icons.schedule,
                        color:
                            isToday ? AppColors.primary : AppColors.lightText,
                        size: 20,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: AppColors.darkText,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '$club • $location',
                        style: const TextStyle(
                          fontSize: 13,
                          color: AppColors.lightText,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF5F7FA),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          time,
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: AppColors.darkText,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(
                  Icons.arrow_forward_ios_rounded,
                  size: 16,
                  color: AppColors.lightText.withValues(alpha: 0.5),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildSectionHeader({
    required String title,
    required String emoji,
    required VoidCallback onMoreTap,
  }) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 10, 20, 12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: AppColors.darkText,
                  letterSpacing: -0.3,
                ),
              ),
              if (emoji.isNotEmpty) ...[
                const SizedBox(width: 4),
                Text(emoji, style: const TextStyle(fontSize: 18)),
              ],
            ],
          ),
          GestureDetector(
            onTap: onMoreTap,
            child: const Text(
              '더보기',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppColors.primary,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildModernBottomNavBar() {
    return Container(
      height: 80,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 20,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _buildNavItem(Icons.home_rounded, '홈', 0),
          _buildNavItem(Icons.sports_hockey, '수업', 1),
          const SizedBox(width: 48), // Space for FAB
          _buildNavItem(Icons.chat_bubble_rounded, '채팅', 2),
          _buildNavItem(Icons.person_rounded, '내 정보', 3),
        ],
      ),
    );
  }

  Widget _buildNavItem(IconData icon, String label, int index) {
    final isSelected = _currentNavIndex == index;
    return GestureDetector(
      onTap: () {
        setState(() => _currentNavIndex = index);
        // Navigation Logic Here
        switch (index) {
          case 1:
            context.push('/classes');
            break;
          case 2:
            context.push('/notifications');
            break;
          case 3:
            context.push('/profile');
            break;
        }
      },
      behavior: HitTestBehavior.opaque,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: isSelected
                  ? AppColors.primary.withValues(alpha: 0.1)
                  : Colors.transparent,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              icon,
              color: isSelected ? AppColors.primary : AppColors.lightText,
              size: 24,
            ),
          ),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
              color: isSelected ? AppColors.primary : AppColors.lightText,
            ),
          ),
        ],
      ),
    );
  }
}
