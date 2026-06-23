import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../../core/theme/colors.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../shared/widgets/app_card.dart';
import '../../../../shared/widgets/teamplus_app_bar.dart';
import '../../../../shared/widgets/native_back_guard.dart';
import '../../../../core/providers/shared_providers.dart';
import '../../../community/data/community_api.dart';

class ParentDashboardScreen extends ConsumerStatefulWidget {
  const ParentDashboardScreen({super.key});

  @override
  ConsumerState<ParentDashboardScreen> createState() =>
      _ParentDashboardScreenState();
}

class _ParentDashboardScreenState extends ConsumerState<ParentDashboardScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _animationController;
  late Animation<double> _fadeAnimation;

  // 현재 선택된 클럽은 currentClubProvider를 통해 관리합니다.

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      duration: const Duration(milliseconds: 600),
      vsync: this,
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

  void _showClubSwitcherBottomSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        return Consumer(
          builder: (context, ref, _) {
            final clubsAsync = ref.watch(myClubsProvider);
            final currentClubAsync = ref.watch(currentClubProvider);

            return SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(AppTheme.spacingMD),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Handle
                    Center(
                      child: Container(
                        width: 40,
                        height: 4,
                        decoration: BoxDecoration(
                          color: AppColors.dividers,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                    const SizedBox(height: AppTheme.spacingMD),
                    const Text(
                      '내 팀 선택',
                      style: AppTheme.headingH3,
                    ),
                    const SizedBox(height: AppTheme.spacingXS),
                    const Text(
                      '여러 팀에 가입된 경우, 기본으로 사용할 팀을 선택해주세요.',
                      style: AppTheme.captionText,
                    ),
                    const SizedBox(height: AppTheme.spacingMD),
                    clubsAsync.when(
                      loading: () => const Center(
                        child: Padding(
                          padding: EdgeInsets.symmetric(
                            vertical: AppTheme.spacingMD,
                          ),
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            valueColor: AlwaysStoppedAnimation<Color>(
                              AppColors.primary,
                            ),
                          ),
                        ),
                      ),
                      error: (error, stack) => const Padding(
                        padding: EdgeInsets.symmetric(
                          vertical: AppTheme.spacingMD,
                        ),
                        child: Text(
                          '팀 목록을 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
                          style: AppTheme.captionText,
                        ),
                      ),
                      data: (clubs) {
                        if (clubs.isEmpty) {
                          return const Padding(
                            padding: EdgeInsets.symmetric(
                              vertical: AppTheme.spacingMD,
                            ),
                            child: Text(
                              '가입된 팀이 없습니다. 팀 참가하기 메뉴에서 초대코드를 입력해주세요.',
                              style: AppTheme.captionText,
                            ),
                          );
                        }

                        return currentClubAsync.when(
                          loading: () => const Center(
                            child: Padding(
                              padding: EdgeInsets.symmetric(
                                vertical: AppTheme.spacingMD,
                              ),
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                valueColor: AlwaysStoppedAnimation<Color>(
                                  AppColors.primary,
                                ),
                              ),
                            ),
                          ),
                          error: (error, stack) => const SizedBox.shrink(),
                          data: (currentClub) {
                            return Flexible(
                              child: ListView.separated(
                                shrinkWrap: true,
                                itemCount: clubs.length,
                                separatorBuilder: (_, __) => const Divider(
                                  height: 1,
                                  color: AppColors.dividers,
                                ),
                                itemBuilder: (context, index) {
                                  final club = clubs[index];
                                  final isActive = currentClub != null &&
                                      currentClub.id == club.id;

                                  return ListTile(
                                    contentPadding: const EdgeInsets.symmetric(
                                      horizontal: AppTheme.spacingSM,
                                      vertical: AppTheme.spacingXS,
                                    ),
                                    title: Text(
                                      club.name,
                                      style: const TextStyle(
                                        fontSize: 16,
                                        fontWeight: FontWeight.w600,
                                        color: AppColors.darkText,
                                      ),
                                    ),
                                    subtitle: Text(
                                      club.teamCode,
                                      style: const TextStyle(
                                        fontSize: 13,
                                        color: AppColors.lightText,
                                      ),
                                    ),
                                    trailing: isActive
                                        ? Container(
                                            padding: const EdgeInsets.symmetric(
                                              horizontal: 8,
                                              vertical: 2,
                                            ),
                                            decoration: BoxDecoration(
                                              color: AppColors.primary
                                                  .withValues(alpha: 0.08),
                                              borderRadius:
                                                  BorderRadius.circular(12),
                                            ),
                                            child: const Text(
                                              '기본',
                                              style: TextStyle(
                                                fontSize: 11,
                                                fontWeight: FontWeight.w600,
                                                color: AppColors.primary,
                                              ),
                                            ),
                                          )
                                        : null,
                                    onTap: () async {
                                      final prefs =
                                          ref.read(appPreferencesProvider);
                                      await prefs.setCurrentClubId(club.id);
                                      ref.invalidate(currentClubProvider);
                                      if (context.mounted) {
                                        Navigator.of(context).pop();
                                      }
                                    },
                                  );
                                },
                              ),
                            );
                          },
                        );
                      },
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    // 안드로이드 하드웨어 백키 가드 — 학부모 로그인 후 stack 루트 진입점이므로
    // 백키 시 종료 확인 다이얼로그를 띄워 실수 종료를 방지한다.
    return NativeBackGuard(
      child: Scaffold(
        backgroundColor: AppColors.background,
        appBar: TeamplusAppBar(
          title: 'TEAMPLUS',
          backgroundColor: AppColors.white,
          foregroundColor: AppColors.darkText,
          showBackButton: false,
          actions: [
            // Club Switcher Button
            IconButton(
              icon: const Icon(Icons.swap_horiz),
              tooltip: '클럽 전환',
              onPressed: _showClubSwitcherBottomSheet,
            ),
            // Notification Button (48dp touch target)
            IconButton(
              icon: Stack(
                children: [
                  const Icon(Icons.notifications_outlined),
                  Positioned(
                    right: 0,
                    top: 0,
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
              onPressed: () => context.push('/notifications'),
              tooltip: '알림',
            ),
            // Profile Button (48dp touch target)
            IconButton(
              icon: const Icon(Icons.person_outline),
              onPressed: () => context.push('/profile'),
              tooltip: '프로필',
            ),
            const SizedBox(width: 8),
          ],
        ),
        body: SafeArea(
          child: FadeTransition(
            opacity: _fadeAnimation,
            child: RefreshIndicator(
              onRefresh: () async {
                // 기본 클럽 정보를 새로고침하고 커뮤니티/이벤트 섹션을 업데이트합니다.
                ref.invalidate(currentClubProvider);
                await ref.read(currentClubProvider.future);
              },
              color: AppColors.primary,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(AppTheme.spacingMD),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Welcome Section
                    _buildWelcomeSection(),
                    const SizedBox(height: AppTheme.spacingLG),

                    // Credit Status Card
                    const CreditStatusCard(
                      usedCredits: 7,
                      totalCredits: 8,
                      expiryDate: '90일 후',
                    ),
                    const SizedBox(height: AppTheme.spacingMD),

                    // Next Class Card
                    _buildNextClassCard(),
                    const SizedBox(height: AppTheme.spacingLG),

                    // Quick Actions (48dp minimum touch targets)
                    _buildQuickActionsSection(),
                    const SizedBox(height: AppTheme.spacingLG),

                    // Club Feed (Community)
                    _buildCommunitySection(),
                    const SizedBox(height: AppTheme.spacingLG),

                    // Upcoming Club Events
                    _buildUpcomingEventsSection(),
                    const SizedBox(height: AppTheme.spacingLG),

                    // Recent Attendance
                    _buildRecentAttendanceSection(),
                    const SizedBox(height: AppTheme.spacingMD),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildWelcomeSection() {
    return const Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '안녕하세요, 홍길동님',
          style: AppTheme.headingH2,
        ),
        SizedBox(height: AppTheme.spacingXS),
        Text(
          '오늘도 즐거운 하루 되세요!',
          style: AppTheme.captionText,
        ),
      ],
    );
  }

  Widget _buildCommunitySection() {
    final currentClubAsync = ref.watch(currentClubProvider);
    final communityApi = ref.read(communityApiProvider);

    return currentClubAsync.when(
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(vertical: AppTheme.spacingMD),
        child: Center(
          child: CircularProgressIndicator(
            strokeWidth: 2,
            valueColor: AlwaysStoppedAnimation<Color>(AppColors.primary),
          ),
        ),
      ),
      error: (error, stack) => const Padding(
        padding: EdgeInsets.symmetric(vertical: AppTheme.spacingMD),
        child: Text(
          '팀 정보를 불러오는 중 오류가 발생했습니다. 다시 시도해주세요.',
          style: AppTheme.captionText,
        ),
      ),
      data: (club) {
        if (club == null) {
          return const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '팀 소식',
                style: AppTheme.headingH3,
              ),
              SizedBox(height: AppTheme.spacingXS),
              Text(
                '팀에 가입하면 여기에서 공지와 소식을 확인할 수 있습니다.',
                style: AppTheme.captionText,
              ),
            ],
          );
        }

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '팀 소식',
              style: AppTheme.headingH3,
            ),
            const SizedBox(height: AppTheme.spacingXS),
            const Text(
              '팀에서 등록한 공지와 안내를 확인해주세요.',
              style: AppTheme.captionText,
            ),
            const SizedBox(height: AppTheme.spacingSM),
            FutureBuilder<List<TeamPostDto>>(
              future: communityApi.getClubPosts(
                clubId: club.id,
                limit: 3,
              ),
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Padding(
                    padding: EdgeInsets.symmetric(vertical: AppTheme.spacingMD),
                    child: Center(
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        valueColor: AlwaysStoppedAnimation<Color>(
                          AppColors.primary,
                        ),
                      ),
                    ),
                  );
                }

                if (snapshot.hasError) {
                  return const Padding(
                    padding: EdgeInsets.symmetric(vertical: AppTheme.spacingMD),
                    child: Text(
                      '팀 소식을 불러오는 중 오류가 발생했습니다. 다시 시도해주세요.',
                      style: AppTheme.captionText,
                    ),
                  );
                }

                final posts = snapshot.data ?? [];
                if (posts.isEmpty) {
                  return const Padding(
                    padding: EdgeInsets.symmetric(vertical: AppTheme.spacingMD),
                    child: Text(
                      '등록된 데이터가 없습니다.',
                      style: AppTheme.captionText,
                    ),
                  );
                }

                final dateFormatter = DateFormat('M월 d일 (E)', 'ko_KR');

                return Column(
                  children: posts
                      .map(
                        (post) => AppCard(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                children: [
                                  Expanded(
                                    child: Text(
                                      post.title,
                                      style: AppTheme.headingH3,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                  const SizedBox(width: AppTheme.spacingSM),
                                  _buildPostTypeChip(post.postType),
                                ],
                              ),
                              const SizedBox(height: AppTheme.spacingXS),
                              Text(
                                post.content,
                                style: AppTheme.captionText,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                              const SizedBox(height: AppTheme.spacingSM),
                              Row(
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    dateFormatter.format(post.createdAt),
                                    style: const TextStyle(
                                      fontSize: 12,
                                      color: AppColors.lightText,
                                    ),
                                  ),
                                  if (post.isPinned)
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 8,
                                        vertical: 2,
                                      ),
                                      decoration: BoxDecoration(
                                        color: AppColors.primary
                                            .withValues(alpha: 0.08),
                                        borderRadius: BorderRadius.circular(12),
                                      ),
                                      child: const Text(
                                        '상단 고정',
                                        style: TextStyle(
                                          fontSize: 11,
                                          fontWeight: FontWeight.w600,
                                          color: AppColors.primary,
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      )
                      .toList(),
                );
              },
            ),
          ],
        );
      },
    );
  }

  Widget _buildUpcomingEventsSection() {
    final currentClubAsync = ref.watch(currentClubProvider);
    final communityApi = ref.read(communityApiProvider);

    return currentClubAsync.when(
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(vertical: AppTheme.spacingMD),
        child: Center(
          child: CircularProgressIndicator(
            strokeWidth: 2,
            valueColor: AlwaysStoppedAnimation<Color>(AppColors.primary),
          ),
        ),
      ),
      error: (error, stack) => const Padding(
        padding: EdgeInsets.symmetric(vertical: AppTheme.spacingMD),
        child: Text(
          '팀 정보를 불러오는 중 오류가 발생했습니다. 다시 시도해주세요.',
          style: AppTheme.captionText,
        ),
      ),
      data: (club) {
        if (club == null) {
          return const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '다가오는 팀 이벤트',
                style: AppTheme.headingH3,
              ),
              SizedBox(height: AppTheme.spacingXS),
              Text(
                '팀 이벤트는 팀에서 모집 공지를 등록하면 표시됩니다.',
                style: AppTheme.captionText,
              ),
            ],
          );
        }

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '다가오는 팀 이벤트',
              style: AppTheme.headingH3,
            ),
            const SizedBox(height: AppTheme.spacingXS),
            const Text(
              '체험, 클리닉, 대회 등 팀 이벤트 일정을 확인할 수 있습니다.',
              style: AppTheme.captionText,
            ),
            const SizedBox(height: AppTheme.spacingSM),
            FutureBuilder<List<TeamEventDto>>(
              future: communityApi.getClubEvents(
                clubId: club.id,
                limit: 3,
              ),
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Padding(
                    padding: EdgeInsets.symmetric(vertical: AppTheme.spacingMD),
                    child: Center(
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        valueColor: AlwaysStoppedAnimation<Color>(
                          AppColors.primary,
                        ),
                      ),
                    ),
                  );
                }

                if (snapshot.hasError) {
                  return const Padding(
                    padding: EdgeInsets.symmetric(vertical: AppTheme.spacingMD),
                    child: Text(
                      '이벤트 정보를 불러오는 중 오류가 발생했습니다. 다시 시도해주세요.',
                      style: AppTheme.captionText,
                    ),
                  );
                }

                final events = snapshot.data ?? [];
                if (events.isEmpty) {
                  return const Padding(
                    padding: EdgeInsets.symmetric(vertical: AppTheme.spacingMD),
                    child: Text(
                      '등록된 데이터가 없습니다.',
                      style: AppTheme.captionText,
                    ),
                  );
                }

                final dateFormatter = DateFormat('M월 d일 (E)', 'ko_KR');

                return Column(
                  children: events
                      .map(
                        (event) => AppCard(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                children: [
                                  Expanded(
                                    child: Text(
                                      event.title,
                                      style: AppTheme.headingH3,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                  const SizedBox(width: AppTheme.spacingSM),
                                  _buildEventStatusChip(event.status),
                                ],
                              ),
                              const SizedBox(height: AppTheme.spacingXS),
                              if (event.description != null &&
                                  event.description!.isNotEmpty)
                                Text(
                                  event.description!,
                                  style: AppTheme.captionText,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              const SizedBox(height: AppTheme.spacingSM),
                              Row(
                                children: [
                                  const Icon(
                                    Icons.calendar_today,
                                    size: 14,
                                    color: AppColors.lightText,
                                  ),
                                  const SizedBox(width: AppTheme.spacingXS),
                                  Text(
                                    '${dateFormatter.format(event.startAt)} ~ ${dateFormatter.format(event.endAt)}',
                                    style: const TextStyle(
                                      fontSize: 12,
                                      color: AppColors.lightText,
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      )
                      .toList(),
                );
              },
            ),
          ],
        );
      },
    );
  }

  Widget _buildNextClassCard() {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: AppColors.primaryLight,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(
                      Icons.calendar_today,
                      size: 20,
                      color: AppColors.primary,
                    ),
                  ),
                  const SizedBox(width: AppTheme.spacingSM),
                  const Text(
                    '다음 수업',
                    style: AppTheme.headingH3,
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: AppColors.info.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
                ),
                child: const Text(
                  '내일',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: AppColors.info,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppTheme.spacingMD),
          const Divider(color: AppColors.dividers),
          const SizedBox(height: AppTheme.spacingMD),

          // Class Info
          _buildInfoRow(
            Icons.sports_hockey,
            '초급 스케이팅',
            AppColors.primary,
            isBold: true,
          ),
          const SizedBox(height: AppTheme.spacingSM),
          _buildInfoRow(
            Icons.calendar_today,
            '2026.01.05 (일요일)',
            AppColors.lightText,
          ),
          const SizedBox(height: AppTheme.spacingSM),
          _buildInfoRow(
            Icons.access_time,
            '19:00 - 20:00',
            AppColors.lightText,
          ),
          const SizedBox(height: AppTheme.spacingSM),
          _buildInfoRow(
            Icons.person_outline,
            '담당코치: 김철수',
            AppColors.lightText,
          ),
        ],
      ),
    );
  }

  Widget _buildPostTypeChip(String postType) {
    String label;
    Color color;

    switch (postType) {
      case 'NOTICE':
      case 'notice':
        label = '공지';
        color = AppColors.primary;
        break;
      case 'RECRUIT':
      case 'recruit':
        label = '모집';
        color = AppColors.accent;
        break;
      default:
        label = '안내';
        color = AppColors.info;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: color,
        ),
      ),
    );
  }

  Widget _buildEventStatusChip(String status) {
    String label;
    Color color;

    switch (status) {
      case 'OPEN':
      case 'open':
        label = '모집중';
        color = AppColors.primary;
        break;
      case 'CLOSED':
      case 'closed':
        label = '마감';
        color = AppColors.lightText;
        break;
      case 'CANCELLED':
      case 'cancelled':
        label = '취소';
        color = AppColors.error;
        break;
      default:
        label = status;
        color = AppColors.info;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: color,
        ),
      ),
    );
  }

  Widget _buildInfoRow(IconData icon, String text, Color color,
      {bool isBold = false}) {
    return Row(
      children: [
        Icon(icon, size: 18, color: color),
        const SizedBox(width: AppTheme.spacingSM),
        Text(
          text,
          style: TextStyle(
            fontSize: 14,
            color: color,
            fontWeight: isBold ? FontWeight.w600 : FontWeight.normal,
          ),
        ),
      ],
    );
  }

  Widget _buildQuickActionsSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          '빠른 작업',
          style: AppTheme.headingH3,
        ),
        const SizedBox(height: AppTheme.spacingSM),

        // Row 1
        Row(
          children: [
            Expanded(
              child: _QuickActionButton(
                icon: Icons.qr_code,
                label: 'QR 체크인',
                color: AppColors.primary,
                onTap: () => context.push('/qr-checkin'),
              ),
            ),
            const SizedBox(width: AppTheme.spacingSM),
            Expanded(
              child: _QuickActionButton(
                icon: Icons.school,
                label: '수업 신청',
                color: AppColors.accent,
                onTap: () => context.push('/classes'),
              ),
            ),
          ],
        ),
        const SizedBox(height: AppTheme.spacingSM),

        // Row 2
        Row(
          children: [
            Expanded(
              child: _QuickActionButton(
                icon: Icons.history,
                label: '출석 기록',
                color: AppColors.success,
                onTap: () => context.push('/attendance-history'),
              ),
            ),
            const SizedBox(width: AppTheme.spacingSM),
            Expanded(
              child: _QuickActionButton(
                icon: Icons.payment,
                label: '결제 내역',
                color: AppColors.warning,
                onTap: () => context.push('/payment-history'),
              ),
            ),
          ],
        ),
        const SizedBox(height: AppTheme.spacingSM),

        // Row 3 - New Design Screens
        Row(
          children: [
            Expanded(
              child: _QuickActionButton(
                icon: Icons.home,
                label: '새 홈화면',
                color: AppColors.info,
                onTap: () => context.push('/home'),
              ),
            ),
            const SizedBox(width: AppTheme.spacingSM),
            Expanded(
              child: _QuickActionButton(
                icon: Icons.child_care,
                label: '자녀 관리',
                color: const Color(0xFFEA580C),
                onTap: () => context.push('/children'),
              ),
            ),
          ],
        ),
        const SizedBox(height: AppTheme.spacingSM),

        // Row 4 - Lesson Card
        Row(
          children: [
            Expanded(
              child: _QuickActionButton(
                icon: Icons.credit_card,
                label: '레슨 카드',
                color: const Color(0xFF5C6B7A),
                onTap: () => context.push('/lesson-card'),
              ),
            ),
            const SizedBox(width: AppTheme.spacingSM),
            const Expanded(child: SizedBox()), // 빈 공간
          ],
        ),
      ],
    );
  }

  Widget _buildRecentAttendanceSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              '최근 출석',
              style: AppTheme.headingH3,
            ),
            TextButton(
              onPressed: () => context.push('/attendance-history'),
              style: TextButton.styleFrom(
                minimumSize: const Size(48, 48), // WCAG touch target
              ),
              child: const Text(
                '전체보기',
                style: TextStyle(
                  color: AppColors.accent,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: AppTheme.spacingXS),

        // Attendance Records
        const AttendanceCard(
          date: '2026.01.04 (토요일)',
          className: '초급 스케이팅',
          time: '19:00 - 20:00',
          status: '출석 완료',
          isPresent: true,
        ),
        const AttendanceCard(
          date: '2026.01.02 (목요일)',
          className: '중급 스케이팅',
          time: '18:00 - 19:00',
          status: '출석 완료',
          isPresent: true,
        ),
      ],
    );
  }
}

/// Quick Action Button - 48dp minimum height (WCAG AA compliant)
class _QuickActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _QuickActionButton({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
        child: Container(
          // 56dp height ensures 48dp touch target with padding
          height: 72,
          padding: const EdgeInsets.symmetric(
            horizontal: AppTheme.spacingMD,
            vertical: AppTheme.spacingSM,
          ),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
            border: Border.all(
              color: color.withValues(alpha: 0.15),
              width: 1,
            ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, size: 22, color: color),
              ),
              const SizedBox(width: AppTheme.spacingSM),
              Flexible(
                child: Text(
                  label,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: color,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
