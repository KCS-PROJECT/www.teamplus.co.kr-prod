import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../../core/theme/colors.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../shared/widgets/teamplus_app_bar.dart';

/// TEAMPLUS 대회/경기 화면
/// 참고: backdata/KakaoTalk_20250107_154545877.jpg (Alpha Asia 경쟁앱)
///
/// Design 7 Principles 적용:
/// 1. 화면 분석 필수 - 경쟁앱 대회/매치 구조 분석
/// 2. 휴먼 디자인 - 깔끔한 카드 레이아웃
/// 3. AI 스타일 절대 금지 - 그라데이션, blur 미사용
/// 4. 페르소나 융합 - frontend, architect, analyzer 협업
/// 5. 명령어 필수 - frontend-design 스킬 활용
/// 6. 결과 출력 필수 - 하단 주석 참조
/// 7. Tone & Manner - 존댓말, 전문적 표현
class TournamentScreen extends StatefulWidget {
  const TournamentScreen({super.key});

  @override
  State<TournamentScreen> createState() => _TournamentScreenState();
}

class _TournamentScreenState extends State<TournamentScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  // 대회 카테고리
  final List<String> _categories = ['전체', '리그전', '토너먼트', '친선경기', '훈련매치'];
  int _selectedCategoryIndex = 0;

  // 샘플 대회 데이터
  final List<Tournament> _tournaments = [
    Tournament(
      id: '1',
      title: '2025 TEAMPLUS 신년 리그',
      category: '리그전',
      date: DateTime(2025, 2, 15),
      endDate: DateTime(2025, 3, 30),
      location: '목동 아이스링크',
      status: TournamentStatus.recruiting,
      ageGroup: 'U-12',
      teamCount: 8,
      registeredTeams: 5,
      fee: 150000,
      imageUrl: null,
      description: '2025년 신년맞이 주니어 아이스하키 리그전',
    ),
    Tournament(
      id: '2',
      title: '서울시 주니어 하키 챔피언십',
      category: '토너먼트',
      date: DateTime(2025, 3, 1),
      endDate: DateTime(2025, 3, 2),
      location: '태릉 국제스케이트장',
      status: TournamentStatus.upcoming,
      ageGroup: 'U-10',
      teamCount: 16,
      registeredTeams: 16,
      fee: 200000,
      imageUrl: null,
      description: '서울시 주최 주니어 아이스하키 토너먼트',
    ),
    Tournament(
      id: '3',
      title: '고양 친선 매치',
      category: '친선경기',
      date: DateTime(2025, 1, 20),
      endDate: null,
      location: '고양 어울림누리',
      status: TournamentStatus.recruiting,
      ageGroup: 'U-8',
      teamCount: 4,
      registeredTeams: 2,
      fee: 50000,
      imageUrl: null,
      description: '주니어 친선 경기',
    ),
    Tournament(
      id: '4',
      title: '2024 겨울 리그 결승',
      category: '리그전',
      date: DateTime(2024, 12, 20),
      endDate: DateTime(2024, 12, 22),
      location: '목동 아이스링크',
      status: TournamentStatus.completed,
      ageGroup: 'U-12',
      teamCount: 4,
      registeredTeams: 4,
      fee: 100000,
      imageUrl: null,
      description: '2024년 겨울 리그 결승전',
    ),
    Tournament(
      id: '5',
      title: '훈련 매치 - ACE vs 드래곤즈',
      category: '훈련매치',
      date: DateTime(2025, 1, 25),
      endDate: null,
      location: '목동 아이스링크',
      status: TournamentStatus.recruiting,
      ageGroup: 'U-10',
      teamCount: 2,
      registeredTeams: 1,
      fee: 30000,
      imageUrl: null,
      description: 'ACE 하키클럽 vs 드래곤즈 훈련 매치',
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

  List<Tournament> get _filteredTournaments {
    var list = _tournaments;

    // 카테고리 필터
    if (_selectedCategoryIndex > 0) {
      list = list
          .where((t) => t.category == _categories[_selectedCategoryIndex])
          .toList();
    }

    // 탭별 필터
    if (_tabController.index == 0) {
      // 진행중/예정
      list = list
          .where((t) =>
              t.status == TournamentStatus.recruiting ||
              t.status == TournamentStatus.upcoming ||
              t.status == TournamentStatus.inProgress)
          .toList();
    } else {
      // 종료
      list = list.where((t) => t.status == TournamentStatus.completed).toList();
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
        body: Column(
          children: [
            // 탭 바
            _buildTabBar(),

            // 카테고리 필터
            _buildCategoryFilter(),

            // 대회 목록
            Expanded(
              child: TabBarView(
                controller: _tabController,
                children: [
                  _buildTournamentList(),
                  _buildTournamentList(),
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
      title: '대회/경기',
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
          Tab(text: '진행중/예정'),
          Tab(text: '종료'),
        ],
      ),
    );
  }

  Widget _buildCategoryFilter() {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppTheme.spacingMD,
        vertical: AppTheme.spacingSM,
      ),
      color: AppColors.white,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: _categories.asMap().entries.map((entry) {
            final index = entry.key;
            final category = entry.value;
            final isSelected = index == _selectedCategoryIndex;

            return Padding(
              padding: const EdgeInsets.only(right: 8),
              child: GestureDetector(
                onTap: () {
                  setState(() {
                    _selectedCategoryIndex = index;
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
                    category,
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

  Widget _buildTournamentList() {
    final tournaments = _filteredTournaments;

    if (tournaments.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.emoji_events_outlined,
              size: 64,
              color: AppColors.lightText.withValues(alpha: 0.5),
            ),
            const SizedBox(height: AppTheme.spacingMD),
            const Text(
              '등록된 대회가 없습니다.',
              style: TextStyle(
                fontSize: 16,
                color: AppColors.lightText,
              ),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(AppTheme.spacingMD),
      itemCount: tournaments.length,
      itemBuilder: (context, index) {
        return _buildTournamentCard(tournaments[index]);
      },
    );
  }

  Widget _buildTournamentCard(Tournament tournament) {
    return Container(
      margin: const EdgeInsets.only(bottom: AppTheme.spacingMD),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.dividers),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 상단 이미지/배너 영역
          Container(
            height: 120,
            decoration: BoxDecoration(
              color:
                  _getCategoryColor(tournament.category).withValues(alpha: 0.1),
              borderRadius:
                  const BorderRadius.vertical(top: Radius.circular(12)),
            ),
            child: Stack(
              children: [
                // 카테고리 아이콘
                Center(
                  child: Icon(
                    _getCategoryIcon(tournament.category),
                    size: 48,
                    color: _getCategoryColor(tournament.category)
                        .withValues(alpha: 0.3),
                  ),
                ),

                // 상태 배지
                Positioned(
                  top: 12,
                  left: 12,
                  child: _buildStatusBadge(tournament.status),
                ),

                // 카테고리 배지
                Positioned(
                  top: 12,
                  right: 12,
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: _getCategoryColor(tournament.category),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      tournament.category,
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: AppColors.white,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),

          // 대회 정보
          Padding(
            padding: const EdgeInsets.all(AppTheme.spacingMD),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 제목
                Text(
                  tournament.title,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: AppColors.darkText,
                  ),
                ),
                const SizedBox(height: 8),

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
                      _formatDateRange(tournament.date, tournament.endDate),
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
                    Text(
                      tournament.location,
                      style: const TextStyle(
                        fontSize: 13,
                        color: AppColors.lightText,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                // 하단 정보 (연령대, 팀 수, 참가비)
                Row(
                  children: [
                    // 연령대
                    _buildInfoChip(
                      Icons.people_outline,
                      tournament.ageGroup,
                    ),
                    const SizedBox(width: 8),

                    // 팀 수
                    _buildInfoChip(
                      Icons.groups_outlined,
                      '${tournament.registeredTeams}/${tournament.teamCount}팀',
                    ),

                    const Spacer(),

                    // 참가비
                    Text(
                      _formatCurrency(tournament.fee),
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: AppColors.primary,
                      ),
                    ),
                  ],
                ),

                // 모집 중인 경우 신청 버튼
                if (tournament.status == TournamentStatus.recruiting) ...[
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: () {
                        // 참가 신청
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: AppColors.white,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                        elevation: 0,
                      ),
                      child: const Text(
                        '참가 신청하기',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatusBadge(TournamentStatus status) {
    String label;
    Color backgroundColor;
    Color textColor;

    switch (status) {
      case TournamentStatus.recruiting:
        label = '모집중';
        backgroundColor = AppColors.success.withValues(alpha: 0.15);
        textColor = AppColors.success;
        break;
      case TournamentStatus.upcoming:
        label = '예정';
        backgroundColor = AppColors.primary.withValues(alpha: 0.15);
        textColor = AppColors.primary;
        break;
      case TournamentStatus.inProgress:
        label = '진행중';
        backgroundColor = AppColors.warning.withValues(alpha: 0.15);
        textColor = AppColors.warning;
        break;
      case TournamentStatus.completed:
        label = '종료';
        backgroundColor = AppColors.lightText.withValues(alpha: 0.15);
        textColor = AppColors.lightText;
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: textColor,
        ),
      ),
    );
  }

  Widget _buildInfoChip(IconData icon, String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.background,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon,
            size: 14,
            color: AppColors.lightText,
          ),
          const SizedBox(width: 4),
          Text(
            label,
            style: const TextStyle(
              fontSize: 12,
              color: AppColors.lightText,
            ),
          ),
        ],
      ),
    );
  }

  Color _getCategoryColor(String category) {
    switch (category) {
      case '리그전':
        return const Color(0xFF3B82F6); // Blue
      case '토너먼트':
        return const Color(0xFFF97316); // Orange
      case '친선경기':
        return const Color(0xFF22C55E); // Green
      case '훈련매치':
        return const Color(0xFF8B5CF6); // Purple
      default:
        return AppColors.primary;
    }
  }

  IconData _getCategoryIcon(String category) {
    switch (category) {
      case '리그전':
        return Icons.emoji_events;
      case '토너먼트':
        return Icons.sports_hockey;
      case '친선경기':
        return Icons.handshake;
      case '훈련매치':
        return Icons.fitness_center;
      default:
        return Icons.sports;
    }
  }

  String _formatDateRange(DateTime start, DateTime? end) {
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

    final startStr = '${start.year}.${months[start.month - 1]} ${start.day}일';

    if (end == null ||
        (start.year == end.year &&
            start.month == end.month &&
            start.day == end.day)) {
      return startStr;
    }

    final endStr = end.month == start.month
        ? '${end.day}일'
        : '${months[end.month - 1]} ${end.day}일';
    return '$startStr ~ $endStr';
  }

  String _formatCurrency(int amount) {
    if (amount >= 10000) {
      final man = amount ~/ 10000;
      final remainder = amount % 10000;
      if (remainder == 0) {
        return '$man만원';
      }
      return '$man만 ${remainder.toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (m) => '${m[1]},')}원';
    }
    return '${amount.toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (m) => '${m[1]},')}원';
  }
}

/// 대회 상태 enum
enum TournamentStatus {
  recruiting, // 모집중
  upcoming, // 예정
  inProgress, // 진행중
  completed, // 종료
}

/// 대회 모델
class Tournament {
  final String id;
  final String title;
  final String category;
  final DateTime date;
  final DateTime? endDate;
  final String location;
  final TournamentStatus status;
  final String ageGroup;
  final int teamCount;
  final int registeredTeams;
  final int fee;
  final String? imageUrl;
  final String description;

  Tournament({
    required this.id,
    required this.title,
    required this.category,
    required this.date,
    this.endDate,
    required this.location,
    required this.status,
    required this.ageGroup,
    required this.teamCount,
    required this.registeredTeams,
    required this.fee,
    this.imageUrl,
    required this.description,
  });
}

/// Design 7 Principles 적용 결과:
///
/// 1. 화면 분석 필수:
///    - backdata/KakaoTalk_20250107_154545877.jpg 참조
///    - Alpha Asia 경쟁앱의 대회/매치 구조 분석
///
/// 2. 휴먼 디자인:
///    - 깔끔한 카드 레이아웃
///    - 명확한 상태 표시 (모집중/예정/진행중/종료)
///    - 카테고리별 색상 구분
///
/// 3. AI 스타일 절대 금지:
///    - 그라데이션 미사용
///    - blur 효과 미사용
///    - 과도한 애니메이션 미사용
///
/// 4. 페르소나 융합:
///    - frontend: UI 구조, 카드 디자인
///    - architect: 데이터 모델, 상태 관리
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
///    - 존댓말 사용 ("참가 신청하기")
///    - 전문적 UI 텍스트 ("모집중", "예정")
