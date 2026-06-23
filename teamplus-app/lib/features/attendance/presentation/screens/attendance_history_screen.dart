import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../../core/providers/shared_providers.dart';
import '../../../../core/theme/colors.dart';
import '../../../../shared/widgets/app_card.dart';
import '../../../../shared/widgets/teamplus_app_bar.dart';
import '../../data/attendance_api.dart';

/// 출석 기록 화면
class AttendanceHistoryScreen extends ConsumerStatefulWidget {
  const AttendanceHistoryScreen({super.key});

  @override
  ConsumerState<AttendanceHistoryScreen> createState() =>
      _AttendanceHistoryScreenState();
}

class _AttendanceHistoryScreenState
    extends ConsumerState<AttendanceHistoryScreen> {
  List<AttendanceDto> _attendanceRecords = [];
  bool _isLoading = true;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _loadAttendance();
  }

  Future<void> _loadAttendance() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      // 현재 선택된 클럽의 회원 ID 가져오기
      final currentClub = await ref.read(currentClubProvider.future);
      if (currentClub == null) {
        setState(() {
          _isLoading = false;
          _errorMessage = '선택된 클럽이 없습니다.';
        });
        return;
      }

      // 클럽 API를 통해 현재 사용자의 회원 정보 가져오기
      final clubsApi = ref.read(clubsApiProvider);
      final memberInfo = await clubsApi.getMyMemberInfo(currentClub.id);

      if (memberInfo == null) {
        setState(() {
          _isLoading = false;
          _errorMessage = '회원 정보를 찾을 수 없습니다.';
        });
        return;
      }

      // 출석 기록 조회
      final attendanceApi = ref.read(attendanceApiProvider);
      final records = await attendanceApi.getMemberAttendanceHistory(
        memberInfo.id,
        limit: 50,
      );

      setState(() {
        _attendanceRecords = records;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _isLoading = false;
        _errorMessage = '출석 기록을 불러올 수 없습니다.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    // Calculate stats
    final totalCount = _attendanceRecords.length;
    final presentCount = _attendanceRecords.where((r) => r.isPresent).length;
    final absentCount = totalCount - presentCount;
    final attendanceRate =
        totalCount > 0 ? (presentCount / totalCount * 100).round() : 0;

    return Scaffold(
      appBar: const TeamplusAppBar(title: '출석 기록'),
      body: RefreshIndicator(
        onRefresh: _loadAttendance,
        child:
            _buildBody(totalCount, presentCount, absentCount, attendanceRate),
      ),
    );
  }

  Widget _buildBody(
    int totalCount,
    int presentCount,
    int absentCount,
    int attendanceRate,
  ) {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
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
              onPressed: _loadAttendance,
              child: const Text('다시 시도'),
            ),
          ],
        ),
      );
    }

    if (_attendanceRecords.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.history,
              size: 64,
              color: AppColors.lightText.withValues(alpha: 0.5),
            ),
            const SizedBox(height: 16),
            const Text(
              '출석 기록이 없습니다',
              style: TextStyle(
                fontSize: 16,
                color: AppColors.lightText,
              ),
            ),
          ],
        ),
      );
    }

    return CustomScrollView(
      slivers: [
        // Stats Header
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: AppCard(
              child: Row(
                children: [
                  Expanded(
                    child: _buildStatItem(
                      label: '총 수업',
                      value: '$totalCount회',
                      color: AppColors.primary,
                    ),
                  ),
                  Container(
                    width: 1,
                    height: 48,
                    color: AppColors.dividers,
                  ),
                  Expanded(
                    child: _buildStatItem(
                      label: '출석',
                      value: '$presentCount회',
                      color: AppColors.success,
                    ),
                  ),
                  Container(
                    width: 1,
                    height: 48,
                    color: AppColors.dividers,
                  ),
                  Expanded(
                    child: _buildStatItem(
                      label: '결석',
                      value: '$absentCount회',
                      color: AppColors.error,
                    ),
                  ),
                  Container(
                    width: 1,
                    height: 48,
                    color: AppColors.dividers,
                  ),
                  Expanded(
                    child: _buildStatItem(
                      label: '출석률',
                      value: '$attendanceRate%',
                      color: AppColors.info,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),

        // Records List
        SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          sliver: SliverList(
            delegate: SliverChildBuilderDelegate(
              (context, index) {
                final record = _attendanceRecords[index];
                return _buildAttendanceCard(record);
              },
              childCount: _attendanceRecords.length,
            ),
          ),
        ),

        // Bottom Padding
        const SliverToBoxAdapter(
          child: SizedBox(height: 24),
        ),
      ],
    );
  }

  Widget _buildAttendanceCard(AttendanceDto record) {
    final dateFormatter = DateFormat('yyyy.MM.dd (E)', 'ko_KR');
    final timeFormatter = DateFormat('HH:mm');

    final date = record.scheduledDate != null
        ? dateFormatter.format(record.scheduledDate!)
        : '-';
    final time = record.checkedInAt != null
        ? '${timeFormatter.format(record.checkedInAt!)} 체크인'
        : '-';

    return AttendanceCard(
      date: date,
      className: record.className ?? '수업',
      time: time,
      status: record.statusText,
      isPresent: record.isPresent,
    );
  }

  Widget _buildStatItem({
    required String label,
    required String value,
    required Color color,
  }) {
    return Column(
      children: [
        Text(
          value,
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.bold,
            color: color,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          label,
          style: const TextStyle(
            fontSize: 12,
            color: AppColors.lightText,
          ),
        ),
      ],
    );
  }
}
