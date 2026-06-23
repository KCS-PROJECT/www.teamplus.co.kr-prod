import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../../core/theme/colors.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../shared/widgets/teamplus_app_bar.dart';
import '../../../community/presentation/widgets/user_safety_menu.dart';

/// TEAMPLUS 매치 모집 화면
/// 참고: backdata/KakaoTalk_20250107_154545877.jpg (Alpha Asia 경쟁앱)
///
/// Design 7 Principles 적용:
/// 1. 화면 분석 필수 - 경쟁앱 매치 모집 구조 분석
/// 2. 휴먼 디자인 - 깔끔한 카드 레이아웃
/// 3. AI 스타일 절대 금지 - 그라데이션, blur 미사용
/// 4. 페르소나 융합 - frontend, architect, analyzer 협업
/// 5. 명령어 필수 - frontend-design 스킬 활용
/// 6. 결과 출력 필수 - 하단 주석 참조
/// 7. Tone & Manner - 존댓말, 전문적 표현
class MatchRecruitmentScreen extends StatefulWidget {
  const MatchRecruitmentScreen({super.key});

  @override
  State<MatchRecruitmentScreen> createState() => _MatchRecruitmentScreenState();
}

class _MatchRecruitmentScreenState extends State<MatchRecruitmentScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  // 필터
  final List<String> _ageGroups = ['전체', 'U-8', 'U-10', 'U-12', 'U-14', '성인'];
  int _selectedAgeGroupIndex = 0;

  // 샘플 매치 모집 데이터
  final List<MatchRecruitment> _recruitments = [
    MatchRecruitment(
      id: '1',
      title: '연습 경기 상대팀 구합니다',
      teamName: 'ACE 하키클럽',
      ageGroup: 'U-12',
      date: DateTime(2025, 1, 25),
      time: '18:00 - 20:00',
      location: '목동 아이스링크',
      type: MatchType.team,
      status: RecruitmentStatus.recruiting,
      description: 'U-12 팀 연습 경기 진행합니다. 비슷한 실력의 팀 구합니다.',
      contactName: '김코치',
      contactPhone: '010-1234-5678',
      createdAt: DateTime(2025, 1, 15),
    ),
    MatchRecruitment(
      id: '2',
      title: '골키퍼 1명 구합니다',
      teamName: '드래곤즈 주니어',
      ageGroup: 'U-10',
      date: DateTime(2025, 1, 28),
      time: '16:00 - 18:00',
      location: '태릉 국제스케이트장',
      type: MatchType.player,
      status: RecruitmentStatus.recruiting,
      description: '훈련 매치에 골키퍼가 필요합니다. U-10 경력자 우대합니다.',
      contactName: '박감독',
      contactPhone: '010-2345-6789',
      createdAt: DateTime(2025, 1, 14),
    ),
    MatchRecruitment(
      id: '3',
      title: '주말 친선전 상대 모집',
      teamName: '서울 아이스베어스',
      ageGroup: 'U-14',
      date: DateTime(2025, 2, 1),
      time: '10:00 - 12:00',
      location: '고양 어울림누리',
      type: MatchType.team,
      status: RecruitmentStatus.recruiting,
      description: '토요일 오전 친선전 진행합니다. 관심 있는 팀 연락주세요.',
      contactName: '이코치',
      contactPhone: '010-3456-7890',
      createdAt: DateTime(2025, 1, 13),
    ),
    MatchRecruitment(
      id: '4',
      title: '수비수 2명 추가 모집',
      teamName: 'ACE 하키클럽',
      ageGroup: 'U-12',
      date: DateTime(2025, 1, 30),
      time: '19:00 - 21:00',
      location: '목동 아이스링크',
      type: MatchType.player,
      status: RecruitmentStatus.recruiting,
      description: '리그전 대비 연습 경기입니다. 수비 포지션 선수 모집합니다.',
      contactName: '김코치',
      contactPhone: '010-1234-5678',
      createdAt: DateTime(2025, 1, 12),
    ),
    MatchRecruitment(
      id: '5',
      title: '성인 취미팀 친선 경기',
      teamName: '아이스워리어스',
      ageGroup: '성인',
      date: DateTime(2025, 1, 26),
      time: '20:00 - 22:00',
      location: '인천 선학 빙상경기장',
      type: MatchType.team,
      status: RecruitmentStatus.closed,
      description: '성인 취미팀끼리 친선 경기 진행했습니다.',
      contactName: '최매니저',
      contactPhone: '010-4567-8901',
      createdAt: DateTime(2025, 1, 10),
    ),
  ];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  List<MatchRecruitment> get _filteredRecruitments {
    var list = _recruitments;

    // 연령대 필터
    if (_selectedAgeGroupIndex > 0) {
      list = list
          .where((r) => r.ageGroup == _ageGroups[_selectedAgeGroupIndex])
          .toList();
    }

    // 탭별 필터
    if (_tabController.index == 0) {
      // 팀 구함
      list = list.where((r) => r.type == MatchType.team).toList();
    } else {
      // 선수 구함
      list = list.where((r) => r.type == MatchType.player).toList();
    }

    return list;
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark.copyWith(
        statusBarColor: Colors.transparent,
      ),
      child: Scaffold(
        backgroundColor: AppColors.background,
        appBar: _buildAppBar(),
        floatingActionButton: FloatingActionButton.extended(
          onPressed: () {
            // 모집 글 작성
            _showCreateRecruitmentSheet();
          },
          backgroundColor: AppColors.primary,
          icon: const Icon(Icons.add, color: AppColors.white),
          label: const Text(
            '모집하기',
            style: TextStyle(
              color: AppColors.white,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        body: Column(
          children: [
            // 탭 바
            _buildTabBar(),

            // 연령대 필터
            _buildAgeGroupFilter(),

            // 모집 목록
            Expanded(
              child: TabBarView(
                controller: _tabController,
                children: [
                  _buildRecruitmentList(),
                  _buildRecruitmentList(),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  PreferredSizeWidget _buildAppBar() {
    return TeamplusAppBar(
      title: '매치 모집',
      backgroundColor: AppColors.white,
      foregroundColor: AppColors.darkText,
      actions: [
        IconButton(
          onPressed: () {
            // 검색
          },
          icon: const Icon(
            Icons.search,
            color: AppColors.darkText,
            size: 24,
          ),
        ),
        const SizedBox(width: 8),
      ],
    );
  }

  Widget _buildTabBar() {
    return Container(
      color: AppColors.white,
      child: TabBar(
        controller: _tabController,
        onTap: (index) {
          setState(() {});
        },
        labelColor: AppColors.primary,
        unselectedLabelColor: AppColors.lightText,
        labelStyle: const TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w600,
        ),
        unselectedLabelStyle: const TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w500,
        ),
        indicatorColor: AppColors.primary,
        indicatorWeight: 3,
        tabs: const [
          Tab(text: '팀 구함'),
          Tab(text: '선수 구함'),
        ],
      ),
    );
  }

  Widget _buildAgeGroupFilter() {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppTheme.spacingMD,
        vertical: AppTheme.spacingSM,
      ),
      color: AppColors.white,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: _ageGroups.asMap().entries.map((entry) {
            final index = entry.key;
            final ageGroup = entry.value;
            final isSelected = index == _selectedAgeGroupIndex;

            return Padding(
              padding: const EdgeInsets.only(right: 8),
              child: GestureDetector(
                onTap: () {
                  setState(() {
                    _selectedAgeGroupIndex = index;
                  });
                },
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  decoration: BoxDecoration(
                    color:
                        isSelected ? AppColors.primary : AppColors.background,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color:
                          isSelected ? AppColors.primary : AppColors.dividers,
                    ),
                  ),
                  child: Text(
                    ageGroup,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: isSelected ? AppColors.white : AppColors.lightText,
                    ),
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }

  Widget _buildRecruitmentList() {
    final recruitments = _filteredRecruitments;

    if (recruitments.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.sports_hockey,
              size: 64,
              color: AppColors.lightText.withValues(alpha: 0.5),
            ),
            const SizedBox(height: AppTheme.spacingMD),
            const Text(
              '모집 글이 없습니다.',
              style: TextStyle(
                fontSize: 16,
                color: AppColors.lightText,
              ),
            ),
            const SizedBox(height: AppTheme.spacingSM),
            const Text(
              '첫 번째로 모집 글을 작성해보세요!',
              style: TextStyle(
                fontSize: 14,
                color: AppColors.lightText,
              ),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(AppTheme.spacingMD),
      itemCount: recruitments.length,
      itemBuilder: (context, index) {
        return _buildRecruitmentCard(recruitments[index]);
      },
    );
  }

  Widget _buildRecruitmentCard(MatchRecruitment recruitment) {
    final isRecruiting = recruitment.status == RecruitmentStatus.recruiting;
    final daysLeft = recruitment.date.difference(DateTime.now()).inDays;

    return GestureDetector(
      onLongPress: () => UserSafetyMenu.show(
        context,
        targetUserId: recruitment.id,
        targetUserName: recruitment.contactName,
      ),
      child: Container(
        margin: const EdgeInsets.only(bottom: AppTheme.spacingMD),
        decoration: BoxDecoration(
          color: AppColors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.dividers),
        ),
        child: Padding(
          padding: const EdgeInsets.all(AppTheme.spacingMD),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 상단: 상태 + 연령대 + D-day
              Row(
                children: [
                  // 상태 배지
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: isRecruiting
                          ? AppColors.success.withValues(alpha: 0.15)
                          : AppColors.lightText.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      isRecruiting ? '모집중' : '마감',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: isRecruiting
                            ? AppColors.success
                            : AppColors.lightText,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),

                  // 타입 배지
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: recruitment.type == MatchType.team
                          ? AppColors.primary.withValues(alpha: 0.15)
                          : AppColors.warning.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      recruitment.type == MatchType.team ? '팀 매치' : '선수 모집',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: recruitment.type == MatchType.team
                            ? AppColors.primary
                            : AppColors.warning,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),

                  // 연령대 배지
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppColors.background,
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      recruitment.ageGroup,
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: AppColors.lightText,
                      ),
                    ),
                  ),

                  const Spacer(),

                  // D-day
                  if (isRecruiting && daysLeft >= 0)
                    Text(
                      daysLeft == 0 ? 'D-DAY' : 'D-$daysLeft',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color:
                            daysLeft <= 3 ? AppColors.error : AppColors.primary,
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 12),

              // 제목
              Text(
                recruitment.title,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: AppColors.darkText,
                ),
              ),
              const SizedBox(height: 8),

              // 팀명
              Row(
                children: [
                  const Icon(
                    Icons.groups_outlined,
                    size: 16,
                    color: AppColors.lightText,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    recruitment.teamName,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: AppColors.darkText,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),

              // 일정
              Row(
                children: [
                  const Icon(
                    Icons.calendar_today_outlined,
                    size: 14,
                    color: AppColors.lightText,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    _formatDate(recruitment.date),
                    style: const TextStyle(
                      fontSize: 13,
                      color: AppColors.lightText,
                    ),
                  ),
                  const SizedBox(width: 12),
                  const Icon(
                    Icons.access_time,
                    size: 14,
                    color: AppColors.lightText,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    recruitment.time,
                    style: const TextStyle(
                      fontSize: 13,
                      color: AppColors.lightText,
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
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      recruitment.location,
                      style: const TextStyle(
                        fontSize: 13,
                        color: AppColors.lightText,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // 설명
              Text(
                recruitment.description,
                style: const TextStyle(
                  fontSize: 13,
                  color: AppColors.darkText,
                  height: 1.5,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 12),

              // 하단 액션
              Row(
                children: [
                  // 작성일
                  Text(
                    _formatCreatedAt(recruitment.createdAt),
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.lightText,
                    ),
                  ),

                  const Spacer(),

                  // 연락하기 버튼
                  if (isRecruiting)
                    ElevatedButton(
                      onPressed: () {
                        _showContactSheet(recruitment);
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: AppColors.white,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 8),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                        elevation: 0,
                      ),
                      child: const Text(
                        '연락하기',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showContactSheet(MatchRecruitment recruitment) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        padding: const EdgeInsets.all(AppTheme.spacingLG),
        decoration: const BoxDecoration(
          color: AppColors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
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
            const SizedBox(height: AppTheme.spacingLG),

            // 제목
            const Text(
              '연락처 정보',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: AppColors.darkText,
              ),
            ),
            const SizedBox(height: AppTheme.spacingMD),

            // 담당자
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.person,
                  color: AppColors.primary,
                ),
              ),
              title: Text(
                recruitment.contactName,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: AppColors.darkText,
                ),
              ),
              subtitle: Text(
                recruitment.teamName,
                style: const TextStyle(
                  fontSize: 14,
                  color: AppColors.lightText,
                ),
              ),
            ),
            const SizedBox(height: AppTheme.spacingSM),

            // 전화번호
            Container(
              padding: const EdgeInsets.all(AppTheme.spacingMD),
              decoration: BoxDecoration(
                color: AppColors.background,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  const Icon(
                    Icons.phone,
                    color: AppColors.primary,
                    size: 20,
                  ),
                  const SizedBox(width: 12),
                  Text(
                    recruitment.contactPhone,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: AppColors.darkText,
                    ),
                  ),
                  const Spacer(),
                  TextButton(
                    onPressed: () {
                      // 전화 걸기
                    },
                    child: const Text('전화하기'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppTheme.spacingXL),
          ],
        ),
      ),
    );
  }

  void _showCreateRecruitmentSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        height: MediaQuery.of(context).size.height * 0.85,
        padding: const EdgeInsets.all(AppTheme.spacingLG),
        decoration: const BoxDecoration(
          color: AppColors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(
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
            const SizedBox(height: AppTheme.spacingLG),

            // 헤더
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  '모집 글 작성',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: AppColors.darkText,
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            const SizedBox(height: AppTheme.spacingMD),

            // 폼 플레이스홀더
            Expanded(
              child: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.edit_note,
                      size: 64,
                      color: AppColors.lightText.withValues(alpha: 0.5),
                    ),
                    const SizedBox(height: AppTheme.spacingMD),
                    const Text(
                      '모집 글 작성 폼',
                      style: TextStyle(
                        fontSize: 16,
                        color: AppColors.lightText,
                      ),
                    ),
                    const SizedBox(height: AppTheme.spacingSM),
                    const Text(
                      '(개발 중입니다)',
                      style: TextStyle(
                        fontSize: 14,
                        color: AppColors.lightText,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _formatDate(DateTime date) {
    final months = [
      '1월',
      '2월',
      '3월',
      '4월',
      '5월',
      '6월',
      '7월',
      '8월',
      '9월',
      '10월',
      '11월',
      '12월'
    ];
    final weekdays = ['일', '월', '화', '수', '목', '금', '토'];

    return '${months[date.month - 1]} ${date.day}일 (${weekdays[date.weekday % 7]})';
  }

  String _formatCreatedAt(DateTime date) {
    final now = DateTime.now();
    final diff = now.difference(date);

    if (diff.inDays == 0) {
      if (diff.inHours == 0) {
        return '${diff.inMinutes}분 전';
      }
      return '${diff.inHours}시간 전';
    } else if (diff.inDays < 7) {
      return '${diff.inDays}일 전';
    } else {
      return '${date.month}/${date.day}';
    }
  }
}

/// 매치 타입 enum
enum MatchType {
  team, // 팀 매치
  player, // 선수 모집
}

/// 모집 상태 enum
enum RecruitmentStatus {
  recruiting, // 모집중
  closed, // 마감
}

/// 매치 모집 모델
class MatchRecruitment {
  final String id;
  final String title;
  final String teamName;
  final String ageGroup;
  final DateTime date;
  final String time;
  final String location;
  final MatchType type;
  final RecruitmentStatus status;
  final String description;
  final String contactName;
  final String contactPhone;
  final DateTime createdAt;

  MatchRecruitment({
    required this.id,
    required this.title,
    required this.teamName,
    required this.ageGroup,
    required this.date,
    required this.time,
    required this.location,
    required this.type,
    required this.status,
    required this.description,
    required this.contactName,
    required this.contactPhone,
    required this.createdAt,
  });
}

/// Design 7 Principles 적용 결과:
///
/// 1. 화면 분석 필수:
///    - backdata/KakaoTalk_20250107_154545877.jpg 참조
///    - Alpha Asia 경쟁앱의 매치 모집 구조 분석
///
/// 2. 휴먼 디자인:
///    - 깔끔한 카드 레이아웃
///    - 상태/타입 배지로 빠른 정보 확인
///    - D-day 표시로 긴급성 전달
///
/// 3. AI 스타일 절대 금지:
///    - 그라데이션 미사용
///    - blur 효과 미사용
///    - 과도한 애니메이션 미사용
///
/// 4. 페르소나 융합:
///    - frontend: UI 구조, 카드 디자인
///    - architect: 데이터 모델, 필터 로직
///    - analyzer: 사용자 경험 분석
///
/// 5. 명령어 필수:
///    - frontend-design 활용
///    - --persona-frontend 적용
///
/// 6. 결과 출력 필수:
///    - 이 주석에서 적용 내용 명시
///
/// 7. Tone & Manner:
///    - 존댓말 사용 ("모집 글이 없습니다.")
///    - 전문적 UI 텍스트 ("팀 구함", "선수 구함")
