import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/providers/shared_providers.dart';
import '../../../../core/theme/colors.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../shared/widgets/teamplus_app_bar.dart';

class CalendarScreen extends ConsumerStatefulWidget {
  const CalendarScreen({super.key});

  @override
  ConsumerState<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends ConsumerState<CalendarScreen> {
  late DateTime _currentMonth;
  DateTime? _selectedDate;
  bool _isCalendarView = true;
  bool _isSortByTime = true;
  bool _isLoading = false;

  // 백엔드 CalendarEvent.color 스펙과 일치
  static const Color teamTrainingColor = Color(0xFFDC2626);
  static const Color personalLessonColor = Color(0xFF16A34A);
  static const Color tournamentColor = Color(0xFF0284C7);

  Map<DateTime, List<ScheduleItem>> _schedules = {};
  final Set<EventType> _activeFilters = {
    EventType.teamTraining,
    EventType.personalLesson,
    EventType.tournament
  };

  ApiClient get _apiClient => ref.read(apiClientProvider);

  @override
  void initState() {
    super.initState();
    _currentMonth = DateTime(DateTime.now().year, DateTime.now().month, 1);
    _selectedDate = DateTime.now();
    _fetchCalendarEvents();
  }

  /// GET /api/v1/calendar?month=YYYY-MM → CalendarDay[] 파싱
  Future<void> _fetchCalendarEvents() async {
    setState(() => _isLoading = true);
    try {
      final monthStr =
          '${_currentMonth.year}-${_currentMonth.month.toString().padLeft(2, '0')}';
      final response = await _apiClient.get(
        '/api/v1/calendar',
        queryParameters: {'month': monthStr},
      );

      final data = response.data;
      // 백엔드가 CalendarDay[] 직접 반환하거나 { data: [...] } 래핑
      final List<dynamic> calendarDays;
      if (data is List) {
        calendarDays = data;
      } else if (data is Map<String, dynamic> && data['data'] is List) {
        calendarDays = data['data'] as List;
      } else {
        calendarDays = [];
      }

      final Map<DateTime, List<ScheduleItem>> newSchedules = {};

      for (final dayEntry in calendarDays) {
        if (dayEntry is! Map<String, dynamic>) continue;
        final dateStr = dayEntry['date'] as String?;
        if (dateStr == null) continue;
        final date = DateTime.tryParse(dateStr);
        if (date == null) continue;
        final dateKey = DateTime(date.year, date.month, date.day);

        final events = dayEntry['events'] as List<dynamic>? ?? [];
        for (final event in events) {
          if (event is! Map<String, dynamic>) continue;
          final typeStr = event['type'] as String? ?? '';
          final eventType = _mapEventType(typeStr);
          final color = _getEventTypeColor(eventType);
          final timeStart = event['timeStart'] as String? ?? '';
          final timeEnd = event['timeEnd'] as String? ?? '';

          newSchedules.putIfAbsent(dateKey, () => []).add(ScheduleItem(
                title: event['title'] as String? ?? '',
                time: _formatIsoTimeRange(timeStart, timeEnd),
                eventType: eventType,
                color: color,
              ));
        }
      }

      if (mounted) {
        setState(() {
          _schedules = newSchedules;
          _isLoading = false;
        });
      }
    } catch (e) {
      debugPrint('[Calendar] API 호출 실패: $e');
      if (mounted) setState(() => _isLoading = false);
    }
  }

  EventType _mapEventType(String type) {
    switch (type) {
      case 'TEAM_TRAINING':
        return EventType.teamTraining;
      case 'PERSONAL_LESSON':
        return EventType.personalLesson;
      case 'TOURNAMENT':
        return EventType.tournament;
      default:
        return EventType.teamTraining;
    }
  }

  Color _getEventTypeColor(EventType type) {
    switch (type) {
      case EventType.teamTraining:
        return teamTrainingColor;
      case EventType.personalLesson:
        return personalLessonColor;
      case EventType.tournament:
        return tournamentColor;
    }
  }

  String _getEventTypeName(EventType type) {
    switch (type) {
      case EventType.teamTraining:
        return '팀훈련';
      case EventType.personalLesson:
        return '개인레슨';
      case EventType.tournament:
        return '대회';
    }
  }

  /// ISO 시간("2026-04-15T10:00:00.000Z")을 로컬 시간 표시로 변환
  String _formatIsoTimeRange(String startIso, String endIso) {
    if (startIso.isEmpty) return '';
    try {
      final start = DateTime.parse(startIso).toLocal();
      final startStr = _formatLocalTime(start.hour, start.minute);
      if (endIso.isNotEmpty) {
        final end = DateTime.parse(endIso).toLocal();
        final endStr = _formatLocalTime(end.hour, end.minute);
        return '$startStr ~ $endStr';
      }
      return startStr;
    } catch (_) {
      return '';
    }
  }

  String _formatLocalTime(int hour, int minute) {
    final period = hour >= 12 ? '오후' : '오전';
    final displayHour = hour == 0 ? 12 : (hour > 12 ? hour - 12 : hour);
    return '$period $displayHour:${minute.toString().padLeft(2, '0')}';
  }

  List<ScheduleItem> _filtered(List<ScheduleItem> items) {
    return items.where((s) => _activeFilters.contains(s.eventType)).toList();
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark
          .copyWith(statusBarColor: Colors.transparent),
      child: Scaffold(
        backgroundColor: AppColors.background,
        appBar: _buildAppBar(),
        body: Column(
          children: [
            _buildViewModeToggle(),
            _buildCalendarHeader(),
            _buildFilterChips(),
            if (_isCalendarView) ...[
              _buildWeekdayHeader(),
              Expanded(
                child: _isLoading
                    ? const Center(child: CircularProgressIndicator())
                    : SingleChildScrollView(
                        child: Column(
                          children: [
                            _buildCalendarGrid(),
                            const SizedBox(height: AppTheme.spacingMD),
                            _buildStatusLegend(),
                            const SizedBox(height: AppTheme.spacingMD),
                            if (_selectedDate != null) _buildScheduleList(),
                            const SizedBox(height: AppTheme.spacingXL),
                          ],
                        ),
                      ),
              ),
            ] else ...[
              _buildSortModeToggle(),
              Expanded(
                child: _isLoading
                    ? const Center(child: CircularProgressIndicator())
                    : _buildListView(),
              ),
            ],
          ],
        ),
      ),
    );
  }

  PreferredSizeWidget _buildAppBar() {
    return TeamplusAppBar(
      title: '일정',
      backgroundColor: AppColors.white,
      foregroundColor: AppColors.darkText,
      actions: [
        IconButton(
          onPressed: () {
            setState(() {
              _currentMonth =
                  DateTime(DateTime.now().year, DateTime.now().month, 1);
              _selectedDate = DateTime.now();
            });
            _fetchCalendarEvents();
          },
          icon: const Icon(Icons.today_outlined,
              color: AppColors.primary, size: 24),
        ),
        const SizedBox(width: 8),
      ],
    );
  }

  Widget _buildViewModeToggle() {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppTheme.spacingMD,
        vertical: AppTheme.spacingSM,
      ),
      color: AppColors.white,
      child: Row(
        children: [
          Expanded(
            child: Container(
              decoration: BoxDecoration(
                color: AppColors.background,
                borderRadius: BorderRadius.circular(8),
              ),
              padding: const EdgeInsets.all(4),
              child: Row(
                children: [
                  Expanded(
                    child: GestureDetector(
                      onTap: () => setState(() => _isCalendarView = true),
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        decoration: BoxDecoration(
                          color: _isCalendarView
                              ? AppColors.white
                              : Colors.transparent,
                          borderRadius: BorderRadius.circular(6),
                          boxShadow: _isCalendarView
                              ? [
                                  BoxShadow(
                                    color: Colors.black.withValues(alpha: 0.05),
                                    blurRadius: 2,
                                    offset: const Offset(0, 1),
                                  ),
                                ]
                              : null,
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              Icons.calendar_month_outlined,
                              size: 18,
                              color: _isCalendarView
                                  ? AppColors.primary
                                  : AppColors.lightText,
                            ),
                            const SizedBox(width: 6),
                            Text(
                              '달력',
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: _isCalendarView
                                    ? AppColors.primary
                                    : AppColors.lightText,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    child: GestureDetector(
                      onTap: () => setState(() => _isCalendarView = false),
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        decoration: BoxDecoration(
                          color: !_isCalendarView
                              ? AppColors.white
                              : Colors.transparent,
                          borderRadius: BorderRadius.circular(6),
                          boxShadow: !_isCalendarView
                              ? [
                                  BoxShadow(
                                    color: Colors.black.withValues(alpha: 0.05),
                                    blurRadius: 2,
                                    offset: const Offset(0, 1),
                                  ),
                                ]
                              : null,
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              Icons.format_list_bulleted,
                              size: 18,
                              color: !_isCalendarView
                                  ? AppColors.primary
                                  : AppColors.lightText,
                            ),
                            const SizedBox(width: 6),
                            Text(
                              '리스트',
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: !_isCalendarView
                                    ? AppColors.primary
                                    : AppColors.lightText,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCalendarHeader() {
    const months = [
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
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppTheme.spacingMD,
        vertical: AppTheme.spacingSM,
      ),
      color: AppColors.white,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          IconButton(
            onPressed: () {
              setState(() {
                _currentMonth =
                    DateTime(_currentMonth.year, _currentMonth.month - 1, 1);
              });
              _fetchCalendarEvents();
            },
            icon: const Icon(Icons.chevron_left,
                color: AppColors.darkText, size: 28),
          ),
          Text(
            '${_currentMonth.year}년 ${months[_currentMonth.month - 1]}',
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: AppColors.darkText,
            ),
          ),
          IconButton(
            onPressed: () {
              setState(() {
                _currentMonth =
                    DateTime(_currentMonth.year, _currentMonth.month + 1, 1);
              });
              _fetchCalendarEvents();
            },
            icon: const Icon(Icons.chevron_right,
                color: AppColors.darkText, size: 28),
          ),
        ],
      ),
    );
  }

  /// 이벤트 타입 필터 칩 행 (팀훈련/개인레슨/대회)
  Widget _buildFilterChips() {
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: AppTheme.spacingMD, vertical: 10),
      color: AppColors.white,
      child: Row(
        children: [
          _buildFilterChip(EventType.teamTraining, '팀훈련', teamTrainingColor),
          const SizedBox(width: 8),
          _buildFilterChip(
              EventType.personalLesson, '개인레슨', personalLessonColor),
          const SizedBox(width: 8),
          _buildFilterChip(EventType.tournament, '대회', tournamentColor),
        ],
      ),
    );
  }

  Widget _buildFilterChip(EventType type, String label, Color color) {
    final isActive = _activeFilters.contains(type);
    return GestureDetector(
      onTap: () {
        setState(() {
          if (isActive) {
            // 마지막 하나는 해제 불가
            if (_activeFilters.length > 1) _activeFilters.remove(type);
          } else {
            _activeFilters.add(type);
          }
        });
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isActive ? color.withValues(alpha: 0.1) : AppColors.background,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
              color: isActive ? color : AppColors.dividers, width: 1.5),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                color: isActive ? color : AppColors.lightText,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: isActive ? color : AppColors.lightText,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSortModeToggle() {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppTheme.spacingMD,
        vertical: AppTheme.spacingSM,
      ),
      color: AppColors.white,
      child: Row(
        children: [
          GestureDetector(
            onTap: () => setState(() => _isSortByTime = true),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              decoration: BoxDecoration(
                color: _isSortByTime ? AppColors.primary : AppColors.background,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                '시간',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: _isSortByTime ? AppColors.white : AppColors.lightText,
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: () => setState(() => _isSortByTime = false),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              decoration: BoxDecoration(
                color:
                    !_isSortByTime ? AppColors.primary : AppColors.background,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                '구분',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: !_isSortByTime ? AppColors.white : AppColors.lightText,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildListView() {
    final List<MapEntry<DateTime, ScheduleItem>> allSchedules = [];
    _schedules.forEach((date, schedules) {
      if (date.year == _currentMonth.year &&
          date.month == _currentMonth.month) {
        for (final schedule in schedules) {
          if (_activeFilters.contains(schedule.eventType)) {
            allSchedules.add(MapEntry(date, schedule));
          }
        }
      }
    });

    if (allSchedules.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.event_busy_outlined,
              size: 64,
              color: AppColors.lightText.withValues(alpha: 0.5),
            ),
            const SizedBox(height: AppTheme.spacingMD),
            const Text(
              '이번 달 예정된 일정이 없습니다.',
              style: TextStyle(fontSize: 16, color: AppColors.lightText),
            ),
          ],
        ),
      );
    }

    if (_isSortByTime) {
      allSchedules.sort((a, b) => a.key.compareTo(b.key));
      return _buildTimeBasedList(allSchedules);
    } else {
      return _buildCategoryBasedList(allSchedules);
    }
  }

  Widget _buildTimeBasedList(List<MapEntry<DateTime, ScheduleItem>> schedules) {
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    return ListView.builder(
      padding: const EdgeInsets.all(AppTheme.spacingMD),
      itemCount: schedules.length,
      itemBuilder: (context, index) {
        final entry = schedules[index];
        final date = entry.key;
        final schedule = entry.value;
        final showDateHeader =
            index == 0 || schedules[index - 1].key.day != date.day;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (showDateHeader) ...[
              if (index > 0) const SizedBox(height: AppTheme.spacingMD),
              Padding(
                padding: const EdgeInsets.only(bottom: AppTheme.spacingSM),
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Text(
                    '${date.day}일 (${weekdays[date.weekday % 7]})',
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: AppColors.primary,
                    ),
                  ),
                ),
              ),
            ],
            _buildListScheduleCard(schedule),
            const SizedBox(height: AppTheme.spacingSM),
          ],
        );
      },
    );
  }

  Widget _buildCategoryBasedList(
      List<MapEntry<DateTime, ScheduleItem>> schedules) {
    final groups = <EventType, List<MapEntry<DateTime, ScheduleItem>>>{};
    for (final entry in schedules) {
      groups.putIfAbsent(entry.value.eventType, () => []);
      groups[entry.value.eventType]!.add(entry);
    }

    const order = [
      EventType.teamTraining,
      EventType.personalLesson,
      EventType.tournament
    ];
    return ListView(
      padding: const EdgeInsets.all(AppTheme.spacingMD),
      children: order.where((t) => groups.containsKey(t)).map((type) {
        final items = groups[type]!;
        final typeName = _getEventTypeName(type);
        final typeColor = _getEventTypeColor(type);

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(bottom: AppTheme.spacingSM),
              child: Row(
                children: [
                  Container(
                    width: 12,
                    height: 12,
                    decoration:
                        BoxDecoration(color: typeColor, shape: BoxShape.circle),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '$typeName (${items.length})',
                    style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: typeColor),
                  ),
                ],
              ),
            ),
            ...items.map((entry) => Padding(
                  padding: const EdgeInsets.only(bottom: AppTheme.spacingSM),
                  child: _buildListScheduleCard(entry.value,
                      showDate: true, date: entry.key),
                )),
            const SizedBox(height: AppTheme.spacingMD),
          ],
        );
      }).toList(),
    );
  }

  Widget _buildListScheduleCard(ScheduleItem schedule,
      {bool showDate = false, DateTime? date}) {
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    return Container(
      padding: const EdgeInsets.all(AppTheme.spacingMD),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.dividers),
      ),
      child: Row(
        children: [
          Container(
            width: 4,
            height: 64,
            decoration: BoxDecoration(
                color: schedule.color, borderRadius: BorderRadius.circular(2)),
          ),
          const SizedBox(width: AppTheme.spacingMD),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        schedule.title,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: AppColors.darkText,
                        ),
                      ),
                    ),
                    _buildEventTypeBadge(schedule.eventType),
                  ],
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    if (showDate && date != null) ...[
                      const Icon(Icons.calendar_today_outlined,
                          size: 14, color: AppColors.lightText),
                      const SizedBox(width: 4),
                      Text(
                        '${date.day}일 (${weekdays[date.weekday % 7]})',
                        style: const TextStyle(
                            fontSize: 13, color: AppColors.lightText),
                      ),
                      const SizedBox(width: 12),
                    ],
                    if (schedule.time.isNotEmpty) ...[
                      const Icon(Icons.access_time,
                          size: 14, color: AppColors.lightText),
                      const SizedBox(width: 4),
                      Text(
                        schedule.time,
                        style: const TextStyle(
                            fontSize: 13, color: AppColors.lightText),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          const Icon(Icons.chevron_right, color: AppColors.lightText, size: 24),
        ],
      ),
    );
  }

  Widget _buildWeekdayHeader() {
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    return Container(
      padding: const EdgeInsets.symmetric(vertical: AppTheme.spacingSM),
      color: AppColors.white,
      child: Row(
        children: weekdays.asMap().entries.map((entry) {
          final index = entry.key;
          final day = entry.value;
          Color textColor = AppColors.darkText;
          if (index == 0) textColor = AppColors.error;
          if (index == 6) textColor = AppColors.primary;
          return Expanded(
            child: Center(
              child: Text(
                day,
                style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: textColor),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildCalendarGrid() {
    final firstDayOfMonth =
        DateTime(_currentMonth.year, _currentMonth.month, 1);
    final lastDayOfMonth =
        DateTime(_currentMonth.year, _currentMonth.month + 1, 0);
    final firstWeekday = firstDayOfMonth.weekday % 7;
    final totalDays = lastDayOfMonth.day;
    final totalCells = (firstWeekday + totalDays + 6) ~/ 7 * 7;
    final today = DateTime.now();

    return Container(
      color: AppColors.white,
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 7,
          childAspectRatio: 1.0,
        ),
        itemCount: totalCells,
        itemBuilder: (context, index) {
          if (index < firstWeekday || index >= firstWeekday + totalDays) {
            return const SizedBox();
          }
          final day = index - firstWeekday + 1;
          final date = DateTime(_currentMonth.year, _currentMonth.month, day);
          final isToday = date.year == today.year &&
              date.month == today.month &&
              date.day == today.day;
          final isSelected = _selectedDate != null &&
              date.year == _selectedDate!.year &&
              date.month == _selectedDate!.month &&
              date.day == _selectedDate!.day;
          final isSunday = index % 7 == 0;
          final isSaturday = index % 7 == 6;

          final rawSchedules = _schedules[date];
          final filteredDots = rawSchedules != null
              ? rawSchedules
                  .where((s) => _activeFilters.contains(s.eventType))
                  .toList()
              : <ScheduleItem>[];

          return GestureDetector(
            onTap: () => setState(() => _selectedDate = date),
            child: Container(
              margin: const EdgeInsets.all(2),
              decoration: BoxDecoration(
                color: isSelected ? AppColors.primary : Colors.transparent,
                borderRadius: BorderRadius.circular(8),
                border: isToday && !isSelected
                    ? Border.all(color: AppColors.primary, width: 2)
                    : null,
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    '$day',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: isToday || isSelected
                          ? FontWeight.w700
                          : FontWeight.w500,
                      color: isSelected
                          ? Colors.white
                          : isSunday
                              ? AppColors.error
                              : isSaturday
                                  ? AppColors.primary
                                  : AppColors.darkText,
                    ),
                  ),
                  if (filteredDots.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: filteredDots.take(3).map((schedule) {
                        return Container(
                          width: 6,
                          height: 6,
                          margin: const EdgeInsets.symmetric(horizontal: 1),
                          decoration: BoxDecoration(
                            color: schedule.color,
                            shape: BoxShape.circle,
                          ),
                        );
                      }).toList(),
                    ),
                  ],
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildStatusLegend() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppTheme.spacingMD),
      child: Container(
        padding: const EdgeInsets.all(AppTheme.spacingMD),
        decoration: BoxDecoration(
          color: AppColors.white,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: AppColors.dividers),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '색상 안내',
              style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: AppColors.darkText),
            ),
            const SizedBox(height: AppTheme.spacingSM),
            Wrap(
              spacing: AppTheme.spacingMD,
              runSpacing: AppTheme.spacingSM,
              children: [
                _buildLegendItem('팀훈련', teamTrainingColor),
                _buildLegendItem('개인레슨', personalLessonColor),
                _buildLegendItem('대회', tournamentColor),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLegendItem(String label, Color color) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 12,
          height: 12,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 6),
        Text(label,
            style: const TextStyle(fontSize: 13, color: AppColors.lightText)),
      ],
    );
  }

  Widget _buildScheduleList() {
    final dateKey =
        DateTime(_selectedDate!.year, _selectedDate!.month, _selectedDate!.day);
    final rawSchedules = _schedules[dateKey];
    final schedules =
        rawSchedules != null ? _filtered(rawSchedules) : <ScheduleItem>[];

    const months = [
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
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppTheme.spacingMD),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${months[_selectedDate!.month - 1]} ${_selectedDate!.day}일 (${weekdays[_selectedDate!.weekday % 7]})',
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: AppColors.darkText,
            ),
          ),
          const SizedBox(height: AppTheme.spacingSM),
          if (schedules.isEmpty)
            Container(
              padding: const EdgeInsets.all(AppTheme.spacingLG),
              decoration: BoxDecoration(
                color: AppColors.white,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppColors.dividers),
              ),
              child: const Center(
                child: Text(
                  '예정된 일정이 없습니다.',
                  style: TextStyle(fontSize: 14, color: AppColors.lightText),
                ),
              ),
            )
          else
            ...schedules.map(_buildScheduleCard),
        ],
      ),
    );
  }

  Widget _buildScheduleCard(ScheduleItem schedule) {
    return Container(
      margin: const EdgeInsets.only(bottom: AppTheme.spacingSM),
      padding: const EdgeInsets.all(AppTheme.spacingMD),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.dividers),
      ),
      child: Row(
        children: [
          Container(
            width: 4,
            height: 56,
            decoration: BoxDecoration(
                color: schedule.color, borderRadius: BorderRadius.circular(2)),
          ),
          const SizedBox(width: AppTheme.spacingMD),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      schedule.title,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: AppColors.darkText,
                      ),
                    ),
                    const SizedBox(width: 8),
                    _buildEventTypeBadge(schedule.eventType),
                  ],
                ),
                if (schedule.time.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Icon(Icons.access_time,
                          size: 14, color: AppColors.lightText),
                      const SizedBox(width: 4),
                      Text(
                        schedule.time,
                        style: const TextStyle(
                            fontSize: 13, color: AppColors.lightText),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
          const Icon(Icons.chevron_right, color: AppColors.lightText, size: 24),
        ],
      ),
    );
  }

  Widget _buildEventTypeBadge(EventType type) {
    final label = _getEventTypeName(type);
    final color = _getEventTypeColor(type);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        label,
        style:
            TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: color),
      ),
    );
  }
}

/// 이벤트 유형 (백엔드 CalendarEvent.type 매핑)
enum EventType {
  teamTraining, // TEAM_TRAINING
  personalLesson, // PERSONAL_LESSON
  tournament, // TOURNAMENT
}

/// 캘린더 일정 아이템 모델
class ScheduleItem {
  final String title;
  final String time;
  final EventType eventType;
  final Color color;

  ScheduleItem({
    required this.title,
    required this.time,
    required this.eventType,
    required this.color,
  });
}
