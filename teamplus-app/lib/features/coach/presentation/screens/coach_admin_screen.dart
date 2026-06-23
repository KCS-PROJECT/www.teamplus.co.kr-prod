import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/auth/user_role.dart';
import '../../../../core/theme/colors.dart';
import '../../../../shared/widgets/app_drawer.dart';
import '../../../../shared/widgets/teamplus_app_bar.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../widgets/coach_profile_header.dart';
import '../widgets/admin_menu_section.dart';
import '../widgets/schedule_tab_view.dart';
import '../widgets/recent_activity_section.dart';

/// TEAMPLUS 감독 관리 화면
/// 참고: 마이링크 감독 페이지 PDF
///
/// Design 7 Principles 적용:
/// 1. 화면 분석 필수 - PDF 6페이지 구조 분석 완료
/// 2. 휴먼 디자인 - 전문적인 관리 시스템 UI
/// 3. AI 스타일 절대 금지 - 그라데이션, blur 효과 미사용
/// 4. 페르소나 융합 - frontend, architect, backend 협업
/// 5. 명령어 필수 - frontend-design 스킬 활용
/// 6. 결과 출력 필수 - 하단 주석 참조
/// 7. Tone & Manner - 존댓말, 전문적 표현
class CoachAdminScreen extends ConsumerStatefulWidget {
  const CoachAdminScreen({super.key});

  @override
  ConsumerState<CoachAdminScreen> createState() => _CoachAdminScreenState();
}

class _CoachAdminScreenState extends ConsumerState<CoachAdminScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  // 샘플 감독 데이터
  final CoachProfile _coachProfile = const CoachProfile(
    name: '김용 감독',
    clubName: '드래건스',
    phone: '010-1234-5678',
    email: 'coach@teamplus.com',
    location: '서현올림픽스포츠센터',
  );

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final screenWidth = MediaQuery.of(context).size.width;
    final isWideScreen = screenWidth > 600;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
      ),
      child: Scaffold(
        backgroundColor: AppColors.background,
        appBar: _buildAppBar(),
        body: Row(
          children: [
            // 사이드 메뉴 (태블릿/데스크탑)
            if (isWideScreen) _buildSideMenu(),

            // 메인 콘텐츠
            Expanded(
              child: Column(
                children: [
                  // 감독 프로필 헤더
                  CoachProfileHeader(
                    profile: _coachProfile,
                    onSettingsTap: () {},
                  ),

                  // 일정 탭 (정규훈련, 레슨일정, 경기일정)
                  _buildScheduleTabs(),

                  // 탭 콘텐츠
                  Expanded(
                    child: TabBarView(
                      controller: _tabController,
                      children: [
                        ScheduleTabView(
                          type: ScheduleType.training,
                          items: _getSampleTrainingItems(),
                        ),
                        ScheduleTabView(
                          type: ScheduleType.lesson,
                          items: _getSampleLessonItems(),
                        ),
                        ScheduleTabView(
                          type: ScheduleType.match,
                          items: _getSampleMatchItems(),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        // 모바일용 드로어 (접이식 메뉴)
        drawerEnableOpenDragGesture: false,
        drawer: isWideScreen
            ? null
            : const Drawer(child: AppDrawer(currentRoute: '/coach-admin')),
        floatingActionButton: _buildFAB(),
      ),
    );
  }

  /// 네이티브 AppBar
  PreferredSizeWidget _buildAppBar() {
    return TeamplusAppBar(
      title: '감독 관리',
      backgroundColor: AppColors.primary,
      foregroundColor: Colors.white,
      centerTitle: false,
      actions: [
        IconButton(
          icon: const Icon(Icons.notifications_outlined),
          onPressed: () => context.push('/notifications'),
        ),
        IconButton(
          icon: const Icon(Icons.settings_outlined),
          onPressed: () {},
        ),
      ],
    );
  }

  Widget _buildSideMenu() {
    return Container(
      width: 280,
      decoration: const BoxDecoration(
        color: AppColors.white,
        border: Border(
          right: BorderSide(
            color: AppColors.borderColor,
            width: 1,
          ),
        ),
      ),
      child: _buildSideMenuContent(),
    );
  }

  Widget _buildSideMenuContent() {
    final userTypeAsync = ref.watch(currentUserTypeProvider);
    final role = userRoleFromType(userTypeAsync.value);
    return SafeArea(
      child: Column(
        children: [
          // 로고 헤더
          Container(
            padding: const EdgeInsets.all(20),
            child: Row(
              children: [
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: AppColors.primary,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.sports_hockey, color: Colors.white, size: 20),
                      SizedBox(width: 6),
                      Text(
                        'TEAMPLUS',
                        style: TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                          fontSize: 14,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1),

          // 메뉴 섹션들 (스크롤 가능)
          Expanded(
            child: ListView(
              padding: const EdgeInsets.symmetric(vertical: 8),
              children: [
                // 클럽 및 회원관리
                _buildRoleSection(
                  role: role,
                  title: '클럽 및 회원관리',
                  items: [
                    _RoleAwareAdminItem(
                      label: '클럽정보',
                      onAddTap: () => _showClubInfoDialog(isAdd: true),
                      onEditTap: () => _showClubInfoDialog(isAdd: false),
                      allowedRoles: {UserRole.coach, UserRole.admin},
                    ),
                    _RoleAwareAdminItem(
                      label: '클럽멤버',
                      onAddTap: () => _showClubMemberDialog(isAdd: true),
                      onEditTap: () => _showClubMemberDialog(isAdd: false),
                      allowedRoles: {UserRole.coach, UserRole.admin},
                    ),
                  ],
                ),

                // 클럽훈련 관리
                _buildRoleSection(
                  role: role,
                  title: '클럽훈련 관리',
                  items: [
                    _RoleAwareAdminItem(
                      label: '클럽훈련정보',
                      onAddTap: () => _showTrainingInfoDialog(isAdd: true),
                      onEditTap: () => _showTrainingInfoDialog(isAdd: false),
                      allowedRoles: {UserRole.coach, UserRole.admin},
                    ),
                    _RoleAwareAdminItem(
                      label: '클럽출석관리',
                      onAddTap: () => context.push('/attendance-history'),
                      onEditTap: () => context.push('/attendance-history'),
                      allowedRoles: {UserRole.coach, UserRole.admin},
                    ),
                  ],
                ),

                // 영수증 관리
                _buildRoleSection(
                  role: role,
                  title: '영수증 관리',
                  items: [
                    _RoleAwareAdminItem(
                      label: '결제 정보',
                      onAddTap: () => context.push('/payment-history'),
                      onEditTap: () => context.push('/payment-history'),
                      allowedRoles: {UserRole.admin},
                    ),
                  ],
                ),

                const Divider(height: 32),

                // 최근 활동
                const RecentActivitySection(
                  activities: [
                    RecentActivity(
                      title: '드래건스',
                      subtitle: '클럽 정보',
                      icon: Icons.edit,
                    ),
                    RecentActivity(
                      title: '김민준 선수',
                      subtitle: '출석 확인',
                      icon: Icons.check_circle,
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

  Widget _buildScheduleTabs() {
    return Container(
      color: AppColors.white,
      child: Column(
        children: [
          TabBar(
            controller: _tabController,
            labelColor: AppColors.primary,
            unselectedLabelColor: AppColors.lightText,
            indicatorColor: AppColors.primary,
            indicatorWeight: 3,
            labelStyle: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w600,
            ),
            unselectedLabelStyle: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w500,
            ),
            tabs: const [
              Tab(text: '정규훈련'),
              Tab(text: '레슨일정'),
              Tab(text: '경기일정'),
            ],
          ),
          const Divider(height: 1),
        ],
      ),
    );
  }

  Widget _buildFAB() {
    return FloatingActionButton.extended(
      onPressed: () {
        _showAddScheduleBottomSheet();
      },
      backgroundColor: AppColors.primary,
      icon: const Icon(Icons.add, color: Colors.white),
      label: const Text(
        '일정 추가',
        style: TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  Widget _buildRoleSection({
    required UserRole role,
    required String title,
    required List<_RoleAwareAdminItem> items,
  }) {
    final visibleItems = items
        .where((item) => isRoleAllowed(role, item.allowedRoles))
        .map(
          (item) => AdminMenuItem(
            label: item.label,
            onAddTap: item.onAddTap,
            onEditTap: item.onEditTap,
          ),
        )
        .toList();

    if (visibleItems.isEmpty) {
      return const SizedBox.shrink();
    }

    return AdminMenuSection(
      title: title,
      items: visibleItems,
    );
  }

  // 다이얼로그 메서드들
  void _showClubInfoDialog({required bool isAdd}) {
    showDialog(
      context: context,
      builder: (context) => _ClubInfoDialog(isAdd: isAdd),
    );
  }

  void _showClubMemberDialog({required bool isAdd}) {
    showDialog(
      context: context,
      builder: (context) => _ClubMemberDialog(isAdd: isAdd),
    );
  }

  void _showTrainingInfoDialog({required bool isAdd}) {
    showDialog(
      context: context,
      builder: (context) => _TrainingInfoDialog(isAdd: isAdd),
    );
  }

  void _showAddScheduleBottomSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => const _AddScheduleBottomSheet(),
    );
  }

  // 샘플 데이터
  List<ScheduleItem> _getSampleTrainingItems() {
    return [
      const ScheduleItem(
        title: '드래건스 / 1월 정규훈련',
        location: '서현올림픽스포츠센터',
        attendeeCount: 12,
        dateRange: '2026-01-06 ~ 2026-01-31',
      ),
      const ScheduleItem(
        title: '드래건스 / 2월 정규훈련',
        location: '서현올림픽스포츠센터',
        attendeeCount: 0,
        dateRange: '2026-02-01 ~ 2026-02-28',
      ),
    ];
  }

  List<ScheduleItem> _getSampleLessonItems() {
    return [
      const ScheduleItem(
        title: '캐피탈스 여름특강',
        location: '서울대학교',
        attendeeCount: 8,
        dateRange: '2026-06-16 ~ 2026-07-07',
      ),
    ];
  }

  List<ScheduleItem> _getSampleMatchItems() {
    return [
      const ScheduleItem(
        title: '타이거샥스 / 1월 경기일정',
        location: '수원아이스하우스',
        attendeeCount: 15,
        dateRange: '2026-01-15',
      ),
    ];
  }
}

class _RoleAwareAdminItem {
  final String label;
  final VoidCallback onAddTap;
  final VoidCallback onEditTap;
  final Set<UserRole> allowedRoles;

  const _RoleAwareAdminItem({
    required this.label,
    required this.onAddTap,
    required this.onEditTap,
    required this.allowedRoles,
  });
}

/// 감독 프로필 데이터
class CoachProfile {
  final String name;
  final String clubName;
  final String phone;
  final String email;
  final String location;

  const CoachProfile({
    required this.name,
    required this.clubName,
    required this.phone,
    required this.email,
    required this.location,
  });
}

/// 일정 아이템 데이터
class ScheduleItem {
  final String title;
  final String location;
  final int attendeeCount;
  final String dateRange;

  const ScheduleItem({
    required this.title,
    required this.location,
    required this.attendeeCount,
    required this.dateRange,
  });
}

/// 일정 타입
enum ScheduleType { training, lesson, match }

/// 최근 활동 데이터
class RecentActivity {
  final String title;
  final String subtitle;
  final IconData icon;

  const RecentActivity({
    required this.title,
    required this.subtitle,
    required this.icon,
  });
}

// ============================================================
// 다이얼로그 위젯들
// ============================================================

/// 클럽 정보 다이얼로그
class _ClubInfoDialog extends StatefulWidget {
  final bool isAdd;

  const _ClubInfoDialog({required this.isAdd});

  @override
  State<_ClubInfoDialog> createState() => _ClubInfoDialogState();
}

class _ClubInfoDialogState extends State<_ClubInfoDialog> {
  final _clubNameController = TextEditingController();
  final _coachNameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _emailController = TextEditingController();
  final _locationController = TextEditingController();
  final _clubCodeController = TextEditingController();

  @override
  void dispose() {
    _clubNameController.dispose();
    _coachNameController.dispose();
    _phoneController.dispose();
    _emailController.dispose();
    _locationController.dispose();
    _clubCodeController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.isAdd ? '클럽 정보 추가' : '클럽 정보 변경'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _buildTextField(_clubNameController, '클럽명', Icons.sports_hockey),
            const SizedBox(height: 12),
            _buildTextField(_coachNameController, '감독이름', Icons.person),
            const SizedBox(height: 12),
            _buildTextField(_phoneController, '연락처', Icons.phone),
            const SizedBox(height: 12),
            _buildTextField(_emailController, '이메일', Icons.email),
            const SizedBox(height: 12),
            _buildTextField(_locationController, '훈련장소', Icons.location_on),
            const SizedBox(height: 12),
            _buildTextField(
                _clubCodeController, '클럽코드 (영문 팀명_이니셜)', Icons.code),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('취소'),
        ),
        ElevatedButton(
          onPressed: () {
            // 저장 로직
            Navigator.pop(context);
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                  content: Text(
                      widget.isAdd ? '클럽 정보가 추가되었습니다.' : '클럽 정보가 변경되었습니다.')),
            );
          },
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primary,
            foregroundColor: Colors.white,
          ),
          child: const Text('저장'),
        ),
      ],
    );
  }

  Widget _buildTextField(
      TextEditingController controller, String label, IconData icon) {
    return TextField(
      controller: controller,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon, size: 20),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
        ),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      ),
    );
  }
}

/// 클럽 멤버 다이얼로그
class _ClubMemberDialog extends StatefulWidget {
  final bool isAdd;

  const _ClubMemberDialog({required this.isAdd});

  @override
  State<_ClubMemberDialog> createState() => _ClubMemberDialogState();
}

class _ClubMemberDialogState extends State<_ClubMemberDialog> {
  final _searchController = TextEditingController();
  final List<MemberData> _members = [
    MemberData(
        name: '완도김', email: 'asd@asd.com', phone: '01012341234', club: '드래건스'),
    MemberData(
        name: '김명중',
        email: 'test@test.com',
        phone: '01012341234',
        club: '타이거샥스'),
    MemberData(
        name: '김루와',
        email: 'test@test.com',
        phone: '01012341234',
        club: '드래건스'),
  ];

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.isAdd ? '클럽 멤버 추가' : '클럽 멤버 변경'),
      content: SizedBox(
        width: 400,
        height: 400,
        child: Column(
          children: [
            // 검색바
            TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: '검색',
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                contentPadding: const EdgeInsets.symmetric(horizontal: 12),
              ),
            ),
            const SizedBox(height: 16),

            // 멤버 리스트
            Expanded(
              child: ListView.separated(
                itemCount: _members.length,
                separatorBuilder: (_, __) => const Divider(height: 1),
                itemBuilder: (context, index) {
                  final member = _members[index];
                  return CheckboxListTile(
                    value: false,
                    onChanged: (value) {},
                    title: Text(
                      '[선수] ${member.name} · ${member.email}',
                      style: const TextStyle(
                        fontSize: 14,
                        color: AppColors.accent,
                      ),
                    ),
                    subtitle: Text(
                      '${member.phone} · ${member.club}',
                      style: const TextStyle(fontSize: 12),
                    ),
                    controlAffinity: ListTileControlAffinity.leading,
                    dense: true,
                  );
                },
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('취소'),
        ),
        ElevatedButton(
          onPressed: () {
            Navigator.pop(context);
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                  content:
                      Text(widget.isAdd ? '멤버가 추가되었습니다.' : '멤버가 변경되었습니다.')),
            );
          },
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primary,
            foregroundColor: Colors.white,
          ),
          child: const Text('저장'),
        ),
      ],
    );
  }
}

class MemberData {
  final String name;
  final String email;
  final String phone;
  final String club;

  MemberData({
    required this.name,
    required this.email,
    required this.phone,
    required this.club,
  });
}

/// 훈련 정보 다이얼로그
class _TrainingInfoDialog extends StatefulWidget {
  final bool isAdd;

  const _TrainingInfoDialog({required this.isAdd});

  @override
  State<_TrainingInfoDialog> createState() => _TrainingInfoDialogState();
}

class _TrainingInfoDialogState extends State<_TrainingInfoDialog> {
  final _trainingNameController = TextEditingController();
  final _locationController = TextEditingController();
  final _contentController = TextEditingController();
  String? _selectedClub;
  String? _selectedCoach;
  DateTime? _selectedDate;

  @override
  void dispose() {
    _trainingNameController.dispose();
    _locationController.dispose();
    _contentController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.isAdd ? '클럽 훈련 정보 추가' : '클럽 훈련 정보 변경'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 클럽 선택
            const Text('클럽:', style: TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 4),
            DropdownButtonFormField<String>(
              initialValue: _selectedClub,
              hint: const Text('--------'),
              items: ['드래건스', '타이거샥스', '제니스플레임즈']
                  .map((e) => DropdownMenuItem(value: e, child: Text(e)))
                  .toList(),
              onChanged: (value) => setState(() => _selectedClub = value),
              decoration: InputDecoration(
                border:
                    OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              ),
            ),
            const SizedBox(height: 16),

            // 생성자 선택
            const Text('생성자:', style: TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 4),
            DropdownButtonFormField<String>(
              initialValue: _selectedCoach,
              hint: const Text('--------'),
              items: ['김용 감독', '김루와 감독', '김링크 감독']
                  .map((e) => DropdownMenuItem(value: e, child: Text(e)))
                  .toList(),
              onChanged: (value) => setState(() => _selectedCoach = value),
              decoration: InputDecoration(
                border:
                    OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              ),
            ),
            const SizedBox(height: 16),

            // 훈련명
            const Text('훈련명:', style: TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 4),
            TextField(
              controller: _trainingNameController,
              decoration: InputDecoration(
                hintText: '1월 정규 훈련',
                border:
                    OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
              ),
            ),
            const SizedBox(height: 16),

            // 장소
            const Text('장소:', style: TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 4),
            TextField(
              controller: _locationController,
              decoration: InputDecoration(
                border:
                    OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
              ),
            ),
            const SizedBox(height: 16),

            // 일정
            const Text('일정:', style: TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 4),
            InkWell(
              onTap: () async {
                final date = await showDatePicker(
                  context: context,
                  initialDate: DateTime.now(),
                  firstDate: DateTime(2024),
                  lastDate: DateTime(2030),
                );
                if (date != null) {
                  setState(() => _selectedDate = date);
                }
              },
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                decoration: BoxDecoration(
                  border: Border.all(color: AppColors.borderColor),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.calendar_today, size: 18),
                    const SizedBox(width: 8),
                    Text(
                      _selectedDate != null
                          ? '${_selectedDate!.year}-${_selectedDate!.month.toString().padLeft(2, '0')}-${_selectedDate!.day.toString().padLeft(2, '0')}'
                          : '날짜 선택',
                      style: TextStyle(
                        color: _selectedDate != null
                            ? AppColors.darkText
                            : AppColors.hintText,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // 내용
            const Text('내용:', style: TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 4),
            TextField(
              controller: _contentController,
              maxLines: 3,
              decoration: InputDecoration(
                border:
                    OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                contentPadding: const EdgeInsets.all(12),
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('취소'),
        ),
        ElevatedButton(
          onPressed: () {
            Navigator.pop(context);
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                  content: Text(
                      widget.isAdd ? '훈련 정보가 추가되었습니다.' : '훈련 정보가 변경되었습니다.')),
            );
          },
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primary,
            foregroundColor: Colors.white,
          ),
          child: const Text('저장'),
        ),
      ],
    );
  }
}

/// 일정 추가 바텀시트
class _AddScheduleBottomSheet extends StatefulWidget {
  const _AddScheduleBottomSheet();

  @override
  State<_AddScheduleBottomSheet> createState() =>
      _AddScheduleBottomSheetState();
}

class _AddScheduleBottomSheetState extends State<_AddScheduleBottomSheet> {
  int _selectedType = 0;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 핸들
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
              const SizedBox(height: 24),

              // 타이틀
              const Text(
                '일정 추가',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                  color: AppColors.darkText,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                '추가할 일정 유형을 선택해주세요',
                style: TextStyle(
                  fontSize: 14,
                  color: AppColors.lightText,
                ),
              ),
              const SizedBox(height: 24),

              // 일정 유형 선택
              Row(
                children: [
                  _buildTypeChip(0, '정규훈련', Icons.sports),
                  const SizedBox(width: 8),
                  _buildTypeChip(1, '레슨', Icons.school),
                  const SizedBox(width: 8),
                  _buildTypeChip(2, '경기', Icons.emoji_events),
                ],
              ),
              const SizedBox(height: 24),

              // 신청 버튼
              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton.icon(
                  onPressed: () {
                    Navigator.pop(context);
                    // 해당 유형의 추가 화면으로 이동
                  },
                  icon: const Icon(Icons.add),
                  label: const Text(
                    '일정 신청',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    elevation: 0,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTypeChip(int index, String label, IconData icon) {
    final isSelected = _selectedType == index;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _selectedType = index),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 16),
          decoration: BoxDecoration(
            color: isSelected ? AppColors.primary : AppColors.background,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isSelected ? AppColors.primary : AppColors.borderColor,
              width: 1.5,
            ),
          ),
          child: Column(
            children: [
              Icon(
                icon,
                color: isSelected ? Colors.white : AppColors.darkText,
                size: 28,
              ),
              const SizedBox(height: 8),
              Text(
                label,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: isSelected ? Colors.white : AppColors.darkText,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
