import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
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

/// 승인 대기 회원 항목 모델
class _PendingApprovalItem {
  final String approvalId;
  final String memberName;
  final String playerName;
  final String requestDate;

  const _PendingApprovalItem({
    required this.approvalId,
    required this.memberName,
    required this.playerName,
    required this.requestDate,
  });
}

/// 승인 대기 목록 Provider — GET /api/v1/member-approvals/pending
final _pendingApprovalsProvider =
    FutureProvider<List<_PendingApprovalItem>>((ref) async {
  final client = ref.read(apiClientProvider);
  try {
    final response =
        await client.get('/api/v1/member-approvals/pending?pageSize=10');
    final items = (response.data['items'] as List<dynamic>?) ?? [];
    final fmt = DateFormat('yyyy.MM.dd');
    return items.map((e) {
      final m = e as Map<String, dynamic>;
      final user = m['user'] as Map<String, dynamic>? ?? {};
      final lastName = user['lastName'] as String? ?? '';
      final firstName = user['firstName'] as String? ?? '';
      final age = m['playerAge'] as int?;
      final playerName = m['playerName'] as String? ?? '';
      final createdAt = m['createdAt'] != null
          ? DateTime.tryParse(m['createdAt'] as String) ?? DateTime.now()
          : DateTime.now();
      return _PendingApprovalItem(
        approvalId: m['id'] as String,
        memberName: '$lastName$firstName',
        playerName: age != null ? '$playerName ($age세)' : playerName,
        requestDate: fmt.format(createdAt),
      );
    }).toList();
  } catch (_) {
    return [];
  }
});

/// 코치 대시보드 화면
/// 오늘의 수업, 출석 현황, 회원 승인, 빠른 작업 제공
class CoachDashboardScreen extends ConsumerStatefulWidget {
  const CoachDashboardScreen({super.key});

  @override
  ConsumerState<CoachDashboardScreen> createState() =>
      _CoachDashboardScreenState();
}

Widget _buildCoachPostTypeChip(String postType) {
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

class _CoachDashboardScreenState extends ConsumerState<CoachDashboardScreen>
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

  /// 수업 카드 탭 시 코치 수업 관리 WebView 페이지로 이동.
  /// 현재 대시보드 수업 데이터는 하드코딩 mock 이므로 classId 없이 목록 페이지로 이동.
  /// Backend 수업 API 연동 후 classId 받아 `/coach/classes-manage/edit/{classId}` 경로로 확장.
  void _openClassManageWebView({String? classId}) {
    final path = classId != null
        ? '/coach/classes-manage/edit/$classId'
        : '/coach/classes-manage';
    context.push('/webview', extra: {
      'url': path,
      'title': '수업 관리',
      'showAppBar': false,
      'showBottomNav': false,
    });
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
                      '관리 팀 선택',
                      style: AppTheme.headingH3,
                    ),
                    const SizedBox(height: AppTheme.spacingXS),
                    const Text(
                      '여러 팀을 관리하는 경우, 기본으로 볼 팀을 선택해주세요.',
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
                              AppColors.accent,
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
                              '관리 중인 팀이 없습니다.',
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
                                  AppColors.accent,
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
                                              color: AppColors.accent
                                                  .withValues(alpha: 0.08),
                                              borderRadius:
                                                  BorderRadius.circular(12),
                                            ),
                                            child: const Text(
                                              '기본',
                                              style: TextStyle(
                                                fontSize: 11,
                                                fontWeight: FontWeight.w600,
                                                color: AppColors.accent,
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
    // 안드로이드 하드웨어 백키 가드 — 코치 로그인 후 stack 루트 진입점.
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
                        color: AppColors.warning,
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
                ref.invalidate(currentClubProvider);
                ref.invalidate(_pendingApprovalsProvider);
                await Future.wait([
                  ref.read(currentClubProvider.future),
                  ref.read(_pendingApprovalsProvider.future),
                ]);
              },
              color: AppColors.accent,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(AppTheme.spacingMD),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // 환영 메시지
                    const Text('안녕하세요, 김코치님', style: AppTheme.headingH2),
                    const SizedBox(height: AppTheme.spacingXS),
                    const Text('오늘도 좋은 수업 되세요!', style: AppTheme.captionText),
                    const SizedBox(height: AppTheme.spacingLG),

                    // 오늘의 수업 현황
                    const TodayClassStatusCard(
                      totalClasses: 3,
                      completedClasses: 1,
                      upcomingClass: '14:00 중급반',
                    ),
                    const SizedBox(height: AppTheme.spacingMD),

                    // 출석 체크 현황
                    const AttendanceStatusCard(
                      presentCount: 18,
                      absentCount: 2,
                      totalStudents: 20,
                    ),
                    const SizedBox(height: AppTheme.spacingLG),

                    // 회원 승인 대기
                    const Text('회원 승인 대기', style: AppTheme.headingH3),
                    const SizedBox(height: AppTheme.spacingSM),
                    Consumer(
                      builder: (context, ref, _) {
                        final approvalsAsync =
                            ref.watch(_pendingApprovalsProvider);
                        return approvalsAsync.when(
                          loading: () => const Padding(
                            padding: EdgeInsets.symmetric(vertical: 16),
                            child: Center(child: CircularProgressIndicator()),
                          ),
                          error: (_, __) => const SizedBox.shrink(),
                          data: (items) {
                            if (items.isEmpty) {
                              return const Padding(
                                padding: EdgeInsets.symmetric(vertical: 12),
                                child: Text(
                                  '승인 대기 중인 회원이 없습니다.',
                                  style: AppTheme.captionText,
                                ),
                              );
                            }
                            return Column(
                              children: items
                                  .map(
                                    (item) => Padding(
                                      padding: const EdgeInsets.only(
                                          bottom: AppTheme.spacingSM),
                                      child: PendingMemberCard(
                                        approvalId: item.approvalId,
                                        memberName: item.memberName,
                                        playerName: item.playerName,
                                        requestDate: item.requestDate,
                                        onSuccess: () => ref.invalidate(
                                            _pendingApprovalsProvider),
                                      ),
                                    ),
                                  )
                                  .toList(),
                            );
                          },
                        );
                      },
                    ),
                    const SizedBox(height: AppTheme.spacingLG),

                    // 빠른 작업 (72dp height - WCAG compliant)
                    _buildQuickActionsSection(context),
                    const SizedBox(height: AppTheme.spacingLG),

                    // 클럽 공지 요약
                    _buildCoachCommunitySection(),
                    const SizedBox(height: AppTheme.spacingLG),

                    // 오늘의 수업 목록
                    const Text('오늘의 수업', style: AppTheme.headingH3),
                    const SizedBox(height: AppTheme.spacingSM),
                    TodayClassCard(
                      className: '초급 스케이팅',
                      time: '10:00 - 11:00',
                      studentCount: 8,
                      maxStudents: 10,
                      status: ClassStatus.completed,
                      onTap: () => _openClassManageWebView(),
                    ),
                    TodayClassCard(
                      className: '중급 스케이팅',
                      time: '14:00 - 15:00',
                      studentCount: 6,
                      maxStudents: 8,
                      status: ClassStatus.upcoming,
                      onAttendance: () => context.push('/qr-scanner'),
                      onTap: () => _openClassManageWebView(),
                    ),
                    TodayClassCard(
                      className: '고급 스케이팅',
                      time: '18:00 - 19:00',
                      studentCount: 5,
                      maxStudents: 6,
                      status: ClassStatus.upcoming,
                      onAttendance: () => context.push('/qr-scanner'),
                      onTap: () => _openClassManageWebView(),
                    ),
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

  Widget _buildCoachCommunitySection() {
    final currentClubAsync = ref.watch(currentClubProvider);
    final communityApi = ref.read(communityApiProvider);
    final dateFormatter = DateFormat('M월 d일 (E)', 'ko_KR');

    return currentClubAsync.when(
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(vertical: AppTheme.spacingMD),
        child: Center(
          child: CircularProgressIndicator(
            strokeWidth: 2,
            valueColor: AlwaysStoppedAnimation<Color>(AppColors.accent),
          ),
        ),
      ),
      error: (error, stack) => const Padding(
        padding: EdgeInsets.symmetric(vertical: AppTheme.spacingMD),
        child: Text(
          '클럽 정보를 불러오는 중 오류가 발생했습니다. 다시 시도해주세요.',
          style: AppTheme.captionText,
        ),
      ),
      data: (club) {
        if (club == null) {
          return const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('클럽 공지', style: AppTheme.headingH3),
              SizedBox(height: AppTheme.spacingXS),
              Text(
                '클럽 정보를 등록하고 공지를 작성하면 여기에서 한눈에 확인할 수 있습니다.',
                style: AppTheme.captionText,
              ),
            ],
          );
        }

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('클럽 공지', style: AppTheme.headingH3),
                TextButton(
                  onPressed: () {
                    context.push('/coach-admin');
                  },
                  child: const Text(
                    '상세보기',
                    style: TextStyle(
                      color: AppColors.accent,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppTheme.spacingXS),
            const Text(
              '오늘 기준 최근 공지 3개를 보여줍니다.',
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
                          AppColors.accent,
                        ),
                      ),
                    ),
                  );
                }

                if (snapshot.hasError) {
                  return const Padding(
                    padding: EdgeInsets.symmetric(vertical: AppTheme.spacingMD),
                    child: Text(
                      '클럽 공지를 불러오는 중 오류가 발생했습니다. 다시 시도해주세요.',
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

                return Column(
                  children: posts
                      .map(
                        (post) => AppCard(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      post.title,
                                      style: const TextStyle(
                                        fontSize: 15,
                                        fontWeight: FontWeight.w600,
                                        color: AppColors.darkText,
                                      ),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                  const SizedBox(width: AppTheme.spacingSM),
                                  _buildCoachPostTypeChip(post.postType),
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
                              Text(
                                dateFormatter.format(post.createdAt),
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: AppColors.lightText,
                                ),
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

  Widget _buildQuickActionsSection(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('빠른 작업', style: AppTheme.headingH3),
        const SizedBox(height: AppTheme.spacingSM),

        // Row 1
        Row(
          children: [
            Expanded(
              child: _CoachQuickActionButton(
                icon: Icons.qr_code_2,
                label: 'QR 생성',
                color: AppColors.primary,
                onTap: () => context.push('/qr-scanner'),
              ),
            ),
            const SizedBox(width: AppTheme.spacingSM),
            Expanded(
              child: _CoachQuickActionButton(
                icon: Icons.school,
                label: '수업 관리',
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
              child: _CoachQuickActionButton(
                icon: Icons.people,
                label: '회원 목록',
                color: AppColors.success,
                onTap: () => context.push('/club-join'),
              ),
            ),
            const SizedBox(width: AppTheme.spacingSM),
            Expanded(
              child: _CoachQuickActionButton(
                icon: Icons.calendar_month,
                label: '일정 관리',
                color: AppColors.warning,
                onTap: () => context.push('/classes'),
              ),
            ),
          ],
        ),
        const SizedBox(height: AppTheme.spacingSM),

        // Row 3 - 감독 관리
        Row(
          children: [
            Expanded(
              child: _CoachQuickActionButton(
                icon: Icons.admin_panel_settings,
                label: '감독 관리',
                color: AppColors.primary,
                onTap: () => context.push('/coach-admin'),
              ),
            ),
            const SizedBox(width: AppTheme.spacingSM),
            Expanded(
              child: _CoachQuickActionButton(
                icon: Icons.receipt_long,
                label: '영수증 관리',
                color: AppColors.info,
                onTap: () => context.push('/payment-history'),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// Coach Quick Action Button - 72dp minimum height (WCAG AA compliant)
class _CoachQuickActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _CoachQuickActionButton({
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
          // 72dp height ensures WCAG compliant touch target
          height: 72,
          padding: const EdgeInsets.symmetric(
            horizontal: AppTheme.spacingMD,
            vertical: AppTheme.spacingSM,
          ),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
            border: Border.all(color: color.withValues(alpha: 0.15), width: 1),
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

/// 오늘의 수업 현황 카드
class TodayClassStatusCard extends StatelessWidget {
  final int totalClasses;
  final int completedClasses;
  final String upcomingClass;

  const TodayClassStatusCard({
    super.key,
    required this.totalClasses,
    required this.completedClasses,
    required this.upcomingClass,
  });

  @override
  Widget build(BuildContext context) {
    final progress = completedClasses / totalClasses;

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
                      Icons.today,
                      size: 20,
                      color: AppColors.primary,
                    ),
                  ),
                  const SizedBox(width: AppTheme.spacingSM),
                  const Text('오늘의 수업', style: AppTheme.headingH3),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: AppColors.accent.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
                ),
                child: Text(
                  '$completedClasses/$totalClasses 완료',
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: AppColors.accent,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppTheme.spacingMD),
          ClipRRect(
            borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
            child: LinearProgressIndicator(
              value: progress,
              backgroundColor: AppColors.dividers,
              valueColor: const AlwaysStoppedAnimation<Color>(AppColors.accent),
              minHeight: 8,
            ),
          ),
          const SizedBox(height: AppTheme.spacingMD),
          Row(
            children: [
              const Icon(Icons.access_time, size: 18, color: AppColors.accent),
              const SizedBox(width: AppTheme.spacingSM),
              Text(
                '다음 수업: $upcomingClass',
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: AppColors.accent,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// 출석 체크 현황 카드
class AttendanceStatusCard extends StatelessWidget {
  final int presentCount;
  final int absentCount;
  final int totalStudents;

  const AttendanceStatusCard({
    super.key,
    required this.presentCount,
    required this.absentCount,
    required this.totalStudents,
  });

  @override
  Widget build(BuildContext context) {
    final attendanceRate = (presentCount / totalStudents * 100).round();

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: AppColors.success.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(
                  Icons.fact_check,
                  size: 20,
                  color: AppColors.success,
                ),
              ),
              const SizedBox(width: AppTheme.spacingSM),
              const Text('오늘 출석 현황', style: AppTheme.headingH3),
            ],
          ),
          const SizedBox(height: AppTheme.spacingMD),
          Row(
            children: [
              Expanded(
                child: _buildStatItem(
                  label: '출석',
                  count: presentCount,
                  color: AppColors.success,
                  icon: Icons.check_circle,
                ),
              ),
              Container(width: 1, height: 56, color: AppColors.dividers),
              Expanded(
                child: _buildStatItem(
                  label: '결석',
                  count: absentCount,
                  color: AppColors.error,
                  icon: Icons.cancel,
                ),
              ),
              Container(width: 1, height: 56, color: AppColors.dividers),
              Expanded(
                child: _buildStatItem(
                  label: '출석률',
                  count: attendanceRate,
                  suffix: '%',
                  color: AppColors.accent,
                  icon: Icons.trending_up,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStatItem({
    required String label,
    required int count,
    required Color color,
    required IconData icon,
    String suffix = '명',
  }) {
    return Column(
      children: [
        Icon(icon, color: color, size: 24),
        const SizedBox(height: AppTheme.spacingSM),
        Text(
          '$count$suffix',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.bold,
            color: color,
          ),
        ),
        const SizedBox(height: AppTheme.spacingXS),
        Text(label, style: AppTheme.labelText),
      ],
    );
  }
}

/// 회원 승인 대기 카드
class PendingMemberCard extends ConsumerStatefulWidget {
  final String approvalId;
  final String memberName;
  final String playerName;
  final String requestDate;
  final VoidCallback? onSuccess;

  const PendingMemberCard({
    super.key,
    required this.approvalId,
    required this.memberName,
    required this.playerName,
    required this.requestDate,
    this.onSuccess,
  });

  @override
  ConsumerState<PendingMemberCard> createState() => _PendingMemberCardState();
}

class _PendingMemberCardState extends ConsumerState<PendingMemberCard> {
  bool _isProcessing = false;
  bool _isDone = false;
  String? _doneLabel;

  Future<void> _handleAction(bool approve) async {
    if (_isProcessing) return;
    setState(() => _isProcessing = true);

    final action = approve ? 'approve' : 'reject';
    try {
      final apiClient = ref.read(apiClientProvider);
      await apiClient.post(
        '/member-approvals/${widget.approvalId}/$action',
      );
      if (mounted) {
        setState(() {
          _isProcessing = false;
          _isDone = true;
          _doneLabel = approve ? '승인 완료' : '거절 완료';
        });
        widget.onSuccess?.call();
      }
    } on DioException catch (e) {
      if (kDebugMode) {
        debugPrint('[PendingMemberCard] $action error: ${e.message}');
      }
      if (mounted) {
        setState(() => _isProcessing = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(approve ? '승인 처리에 실패했습니다.' : '거절 처리에 실패했습니다.'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isProcessing = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('처리 중 오류가 발생했습니다.'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isDone) {
      return AppCard(
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: AppColors.lightText.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(24),
              ),
              child: const Icon(
                Icons.check_circle_outline,
                color: AppColors.lightText,
                size: 24,
              ),
            ),
            const SizedBox(width: AppTheme.spacingMD),
            Expanded(
              child: Text(
                '${widget.memberName} — $_doneLabel',
                style: const TextStyle(
                  fontSize: 14,
                  color: AppColors.lightText,
                ),
              ),
            ),
          ],
        ),
      );
    }

    return AppCard(
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: AppColors.warning.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(24),
            ),
            child: const Icon(
              Icons.person_add,
              color: AppColors.warning,
              size: 24,
            ),
          ),
          const SizedBox(width: AppTheme.spacingMD),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.memberName,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: AppColors.darkText,
                  ),
                ),
                const SizedBox(height: AppTheme.spacingXS),
                Text('선수: ${widget.playerName}', style: AppTheme.captionText),
                Text('신청일: ${widget.requestDate}', style: AppTheme.labelText),
              ],
            ),
          ),
          // Action buttons with 48dp touch targets
          if (_isProcessing)
            const SizedBox(
              width: 44,
              height: 44,
              child: Center(
                child: SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            )
          else
            Row(
              children: [
                Material(
                  color: AppColors.error.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                  child: InkWell(
                    onTap: () => _handleAction(false),
                    borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                    child: const SizedBox(
                      width: 44,
                      height: 44,
                      child:
                          Icon(Icons.close, color: AppColors.error, size: 20),
                    ),
                  ),
                ),
                const SizedBox(width: AppTheme.spacingSM),
                Material(
                  color: AppColors.success.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                  child: InkWell(
                    onTap: () => _handleAction(true),
                    borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                    child: const SizedBox(
                      width: 44,
                      height: 44,
                      child: Icon(
                        Icons.check,
                        color: AppColors.success,
                        size: 20,
                      ),
                    ),
                  ),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

/// 수업 상태
enum ClassStatus { completed, inProgress, upcoming }

/// 오늘의 수업 카드
class TodayClassCard extends StatelessWidget {
  final String className;
  final String time;
  final int studentCount;
  final int maxStudents;
  final ClassStatus status;
  final VoidCallback? onAttendance;
  final VoidCallback? onTap;

  const TodayClassCard({
    super.key,
    required this.className,
    required this.time,
    required this.studentCount,
    required this.maxStudents,
    required this.status,
    this.onAttendance,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final card = AppCard(
      child: Row(
        children: [
          Container(
            width: 4,
            height: 56,
            decoration: BoxDecoration(
              color: _getStatusColor(),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(width: AppTheme.spacingMD),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      className,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: AppColors.darkText,
                      ),
                    ),
                    const SizedBox(width: AppTheme.spacingSM),
                    _buildStatusBadge(),
                  ],
                ),
                const SizedBox(height: AppTheme.spacingXS),
                Row(
                  children: [
                    const Icon(
                      Icons.access_time,
                      size: 14,
                      color: AppColors.lightText,
                    ),
                    const SizedBox(width: AppTheme.spacingXS),
                    Text(time, style: AppTheme.captionText),
                    const SizedBox(width: AppTheme.spacingMD),
                    const Icon(
                      Icons.people,
                      size: 14,
                      color: AppColors.lightText,
                    ),
                    const SizedBox(width: AppTheme.spacingXS),
                    Text(
                      '$studentCount/$maxStudents명',
                      style: AppTheme.captionText,
                    ),
                  ],
                ),
              ],
            ),
          ),
          if (status == ClassStatus.upcoming)
            SizedBox(
              height: 40,
              child: OutlinedButton(
                onPressed: onAttendance,
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.accent,
                  side: const BorderSide(color: AppColors.accent),
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                  ),
                ),
                child: const Text(
                  '출석 시작',
                  style: TextStyle(fontWeight: FontWeight.w600),
                ),
              ),
            ),
          if (status == ClassStatus.completed)
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: AppColors.success.withValues(alpha: 0.1),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.check,
                color: AppColors.success,
                size: 18,
              ),
            ),
        ],
      ),
    );

    if (onTap == null) return card;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
        child: card,
      ),
    );
  }

  Color _getStatusColor() {
    switch (status) {
      case ClassStatus.completed:
        return AppColors.success;
      case ClassStatus.inProgress:
        return AppColors.warning;
      case ClassStatus.upcoming:
        return AppColors.accent;
    }
  }

  Widget _buildStatusBadge() {
    String label;
    Color color;

    switch (status) {
      case ClassStatus.completed:
        label = '완료';
        color = AppColors.success;
        break;
      case ClassStatus.inProgress:
        label = '진행중';
        color = AppColors.warning;
        break;
      case ClassStatus.upcoming:
        label = '예정';
        color = AppColors.info;
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
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
}
