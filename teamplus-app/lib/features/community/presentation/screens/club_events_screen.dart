import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../../core/providers/shared_providers.dart';
import '../../../../core/theme/colors.dart';
import '../../../../shared/widgets/teamplus_app_bar.dart';
import '../../../../shared/widgets/app_button.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../../data/community_api.dart';

/// Backend ClubEvent.status: draft|published|closed|cancelled
/// 운영자 role(ADMIN/DIRECTOR/COACH/ACADEMY_DIRECTOR)만 draft 노출.
/// 일반 사용자(PARENT/CHILD/TEEN)는 draft 자동 필터링.
const _adminRoles = {'ADMIN', 'DIRECTOR', 'COACH', 'ACADEMY_DIRECTOR'};

/// 클럽 이벤트 전체 목록 화면
class ClubEventsScreen extends ConsumerStatefulWidget {
  const ClubEventsScreen({super.key});

  @override
  ConsumerState<ClubEventsScreen> createState() => _ClubEventsScreenState();
}

class _ClubEventsScreenState extends ConsumerState<ClubEventsScreen> {
  List<TeamEventDto> _events = [];
  bool _isLoading = true;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _loadEvents();
  }

  Future<void> _loadEvents() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final currentClub = await ref.read(currentClubProvider.future);
      if (currentClub == null) {
        setState(() {
          _isLoading = false;
          _errorMessage = '선택된 클럽이 없습니다.';
        });
        return;
      }

      final communityApi = ref.read(communityApiProvider);
      final events = await communityApi.getClubEvents(
        clubId: currentClub.id,
        limit: 50, // 전체 목록이므로 더 많이 가져옴
      );

      // P2-GAP-APP-003: draft 상태 이벤트는 운영자(ADMIN/DIRECTOR/COACH/ACADEMY_DIRECTOR) 만 노출.
      // 일반 사용자(PARENT/CHILD/TEEN) 는 draft 자동 필터링하여 미공개 콘텐츠 노출 방지.
      final userType = await ref.read(currentUserTypeProvider.future);
      final isAdmin =
          userType != null && _adminRoles.contains(userType.toUpperCase());
      final filtered =
          isAdmin ? events : events.where((e) => e.status != 'draft').toList();

      setState(() {
        _events = filtered;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _isLoading = false;
        _errorMessage = '이벤트를 불러올 수 없습니다.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const TeamplusAppBar(title: '이벤트'),
      body: RefreshIndicator(
        onRefresh: _loadEvents,
        child: _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(
        child: CircularProgressIndicator(),
      );
    }

    if (_errorMessage != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.error_outline,
              size: 48,
              color: AppColors.error.withValues(alpha: 0.7),
            ),
            const SizedBox(height: 16),
            Text(
              _errorMessage!,
              style: const TextStyle(
                fontSize: 16,
                color: AppColors.lightText,
              ),
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _loadEvents,
              child: const Text('다시 시도'),
            ),
          ],
        ),
      );
    }

    if (_events.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.event_busy,
              size: 64,
              color: AppColors.lightText.withValues(alpha: 0.5),
            ),
            const SizedBox(height: 16),
            const Text(
              '예정된 이벤트가 없습니다.',
              style: TextStyle(
                fontSize: 16,
                color: AppColors.lightText,
              ),
            ),
          ],
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: _events.length,
      separatorBuilder: (context, index) => const SizedBox(height: 12),
      itemBuilder: (context, index) {
        final event = _events[index];
        return _EventCard(
          event: event,
          onTap: () => _showEventDetail(event),
        );
      },
    );
  }

  void _showEventDetail(TeamEventDto event) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (context) => _EventDetailSheet(
        event: event,
        teamId: ref.read(currentClubProvider).value!.id,
        onRegistered: _loadEvents,
      ),
    );
  }
}

/// 이벤트 카드 위젯
class _EventCard extends StatelessWidget {
  final TeamEventDto event;
  final VoidCallback onTap;

  const _EventCard({
    required this.event,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isPast = event.endAt.isBefore(DateTime.now());

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: isPast ? AppColors.background : AppColors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isPast ? AppColors.dividers : AppColors.cardBorder,
          ),
        ),
        child: Row(
          children: [
            // 날짜 박스
            _DateBox(date: event.startAt, isPast: isPast),
            const SizedBox(width: 16),

            // 이벤트 정보
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // 유형 칩 + 상태
                  Row(
                    children: [
                      _EventTypeChip(type: event.eventType),
                      const SizedBox(width: 8),
                      _StatusChip(status: event.status, isPast: isPast),
                    ],
                  ),
                  const SizedBox(height: 8),

                  // 제목
                  Text(
                    event.title,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: isPast ? AppColors.lightText : AppColors.darkText,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),

                  // 시간
                  Row(
                    children: [
                      Icon(
                        Icons.access_time,
                        size: 14,
                        color:
                            isPast ? AppColors.hintText : AppColors.lightText,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        _formatTimeRange(event.startAt, event.endAt),
                        style: TextStyle(
                          fontSize: 13,
                          color:
                              isPast ? AppColors.hintText : AppColors.lightText,
                        ),
                      ),
                    ],
                  ),

                  // 정원
                  if (event.capacity != null) ...[
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Icon(
                          Icons.people,
                          size: 14,
                          color:
                              isPast ? AppColors.hintText : AppColors.lightText,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          '정원 ${event.capacity}명',
                          style: TextStyle(
                            fontSize: 13,
                            color: isPast
                                ? AppColors.hintText
                                : AppColors.lightText,
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),

            // 화살표
            Icon(
              Icons.chevron_right,
              color: isPast ? AppColors.hintText : AppColors.lightText,
            ),
          ],
        ),
      ),
    );
  }

  String _formatTimeRange(DateTime start, DateTime end) {
    final startFormat = DateFormat('HH:mm');
    final endFormat = DateFormat('HH:mm');
    return '${startFormat.format(start)} - ${endFormat.format(end)}';
  }
}

/// 날짜 박스
class _DateBox extends StatelessWidget {
  final DateTime date;
  final bool isPast;

  const _DateBox({required this.date, required this.isPast});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 56,
      padding: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(
        color: isPast
            ? AppColors.dividers
            : AppColors.primary.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        children: [
          Text(
            DateFormat('MMM').format(date).toUpperCase(),
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: isPast ? AppColors.hintText : AppColors.primary,
            ),
          ),
          Text(
            DateFormat('dd').format(date),
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.bold,
              color: isPast ? AppColors.hintText : AppColors.primary,
            ),
          ),
          Text(
            _getWeekdayKorean(date.weekday),
            style: TextStyle(
              fontSize: 11,
              color: isPast ? AppColors.hintText : AppColors.lightText,
            ),
          ),
        ],
      ),
    );
  }

  String _getWeekdayKorean(int weekday) {
    const weekdays = ['월', '화', '수', '목', '금', '토', '일'];
    return weekdays[weekday - 1];
  }
}

/// 이벤트 유형 칩
class _EventTypeChip extends StatelessWidget {
  final String type;

  const _EventTypeChip({required this.type});

  @override
  Widget build(BuildContext context) {
    final config = _getTypeConfig(type);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: config.color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        config.label,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w500,
          color: config.color,
        ),
      ),
    );
  }

  _TypeConfig _getTypeConfig(String type) {
    switch (type) {
      case 'clinic':
        return _TypeConfig('클리닉', AppColors.primary);
      case 'trial':
        return _TypeConfig('체험', AppColors.success);
      case 'tournament':
        return _TypeConfig('대회', AppColors.warning);
      case 'friendly':
        return _TypeConfig('친선', AppColors.info);
      case 'meeting':
        return _TypeConfig('모임', AppColors.accent);
      default:
        return _TypeConfig('이벤트', AppColors.lightText);
    }
  }
}

/// 상태 칩
class _StatusChip extends StatelessWidget {
  final String status;
  final bool isPast;

  const _StatusChip({required this.status, required this.isPast});

  @override
  Widget build(BuildContext context) {
    final config = isPast
        ? _StatusConfig('종료', AppColors.lightText)
        : _getStatusConfig(status);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: config.color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(4),
        border: Border.all(
          color: config.color.withValues(alpha: 0.3),
        ),
      ),
      child: Text(
        config.label,
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w500,
          color: config.color,
        ),
      ),
    );
  }

  _StatusConfig _getStatusConfig(String status) {
    switch (status) {
      case 'published':
        return _StatusConfig('모집중', AppColors.success);
      case 'closed':
        return _StatusConfig('마감', AppColors.warning);
      case 'cancelled':
        return _StatusConfig('취소', AppColors.error);
      case 'draft':
        return _StatusConfig('준비중', AppColors.lightText);
      default:
        return _StatusConfig(status, AppColors.lightText);
    }
  }
}

class _TypeConfig {
  final String label;
  final Color color;

  _TypeConfig(this.label, this.color);
}

class _StatusConfig {
  final String label;
  final Color color;

  _StatusConfig(this.label, this.color);
}

/// 이벤트 상세 바텀시트
class _EventDetailSheet extends ConsumerWidget {
  final TeamEventDto event;
  final String teamId;
  final VoidCallback? onRegistered;

  const _EventDetailSheet({
    required this.event,
    required this.teamId,
    this.onRegistered,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isPast = event.endAt.isBefore(DateTime.now());

    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) {
        return Container(
          decoration: const BoxDecoration(
            color: AppColors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
          ),
          child: Column(
            children: [
              // 드래그 핸들
              Container(
                margin: const EdgeInsets.only(top: 12),
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.dividers,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),

              // 콘텐츠
              Expanded(
                child: SingleChildScrollView(
                  controller: scrollController,
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // 헤더: 유형 + 상태
                      Row(
                        children: [
                          _EventTypeChip(type: event.eventType),
                          const SizedBox(width: 8),
                          _StatusChip(status: event.status, isPast: isPast),
                        ],
                      ),
                      const SizedBox(height: 16),

                      // 제목
                      Text(
                        event.title,
                        style: const TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.bold,
                          color: AppColors.darkText,
                        ),
                      ),
                      const SizedBox(height: 20),

                      // 일시
                      _DetailRow(
                        icon: Icons.calendar_today,
                        label: '일시',
                        value: _formatDateRange(event.startAt, event.endAt),
                      ),

                      // 시간
                      _DetailRow(
                        icon: Icons.access_time,
                        label: '시간',
                        value: _formatTimeRange(event.startAt, event.endAt),
                      ),

                      // 정원
                      if (event.capacity != null)
                        _DetailRow(
                          icon: Icons.people,
                          label: '정원',
                          value: '${event.capacity}명',
                        ),

                      // 대상
                      if (event.targetLevel != null)
                        _DetailRow(
                          icon: Icons.person,
                          label: '대상',
                          value: event.targetLevel!,
                        ),

                      // 설명
                      if (event.description != null) ...[
                        const Divider(height: 32),
                        const Text(
                          '상세 내용',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                            color: AppColors.darkText,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          event.description!,
                          style: const TextStyle(
                            fontSize: 15,
                            color: AppColors.darkText,
                            height: 1.6,
                          ),
                        ),
                      ],

                      const SizedBox(height: 32),

                      // 신청 버튼 (진행 중인 이벤트만)
                      if (!isPast && event.status == 'published')
                        PrimaryButton(
                          label: '참가 신청하기',
                          onPressed: () async {
                            final messenger = ScaffoldMessenger.of(context);
                            Navigator.pop(context);
                            try {
                              await ref
                                  .read(communityApiProvider)
                                  .registerEventParticipation(
                                    teamId: teamId,
                                    eventId: event.id,
                                  );
                              onRegistered?.call();
                              messenger.showSnackBar(
                                const SnackBar(
                                  content: Text('참가 신청이 완료되었습니다.'),
                                  backgroundColor: AppColors.success,
                                ),
                              );
                            } on DioException catch (e) {
                              final code = e.response?.statusCode;
                              final msg = code == 409
                                  ? '이미 참가 신청하셨습니다.'
                                  : code == 410
                                      ? '신청 마감된 이벤트입니다.'
                                      : '신청 중 오류가 발생했습니다.';
                              messenger.showSnackBar(
                                SnackBar(
                                  content: Text(msg),
                                  backgroundColor: AppColors.error,
                                ),
                              );
                            } catch (_) {
                              messenger.showSnackBar(
                                const SnackBar(
                                  content: Text('신청 중 오류가 발생했습니다.'),
                                  backgroundColor: AppColors.error,
                                ),
                              );
                            }
                          },
                          icon: Icons.check,
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  String _formatDateRange(DateTime start, DateTime end) {
    final startFormat = DateFormat('yyyy년 MM월 dd일 (E)', 'ko');
    if (start.day == end.day) {
      return startFormat.format(start);
    }
    final endFormat = DateFormat('MM월 dd일 (E)', 'ko');
    return '${startFormat.format(start)} ~ ${endFormat.format(end)}';
  }

  String _formatTimeRange(DateTime start, DateTime end) {
    final format = DateFormat('HH:mm');
    return '${format.format(start)} - ${format.format(end)}';
  }
}

/// 상세 정보 행
class _DetailRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _DetailRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(
              icon,
              size: 18,
              color: AppColors.primary,
            ),
          ),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: const TextStyle(
                  fontSize: 12,
                  color: AppColors.lightText,
                ),
              ),
              Text(
                value,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w500,
                  color: AppColors.darkText,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
