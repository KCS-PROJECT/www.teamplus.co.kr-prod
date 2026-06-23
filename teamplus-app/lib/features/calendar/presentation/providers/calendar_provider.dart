import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/providers/shared_providers.dart';

// ──────────────────────────────────────────────────────────
// 캘린더 일정 조회
// GET /dashboard/calendar?month=YYYY-MM
// ──────────────────────────────────────────────────────────

/// 현재 선택된 월 Notifier (YYYY-MM 형식)
///
/// 사용: `ref.read(selectedMonthProvider.notifier).setMonth('2026-05')`
class SelectedMonthNotifier extends Notifier<String> {
  @override
  String build() {
    final now = DateTime.now();
    return '${now.year}-${now.month.toString().padLeft(2, '0')}';
  }

  void setMonth(String month) => state = month;
}

final selectedMonthProvider =
    NotifierProvider<SelectedMonthNotifier, String>(SelectedMonthNotifier.new);

/// 캘린더 이벤트 데이터 Provider
///
/// 백엔드 `GET /api/v1/dashboard/calendar?month=YYYY-MM` 를 호출합니다.
/// 색상 코드: red(팀 훈련), green(개인레슨), blue(대회)
final calendarEventsProvider =
    FutureProvider.family<List<Map<String, dynamic>>, String>(
        (ref, month) async {
  final apiClient = ref.watch(apiClientProvider);
  try {
    final response = await apiClient.get(
      '/dashboard/calendar',
      queryParameters: {'month': month},
    );

    final data = response.data;

    // 응답 구조: { events: [...] } 또는 { data: { events: [...] } }
    List events;
    if (data is Map<String, dynamic> && data['events'] is List) {
      events = data['events'] as List;
    } else if (data is Map<String, dynamic> &&
        data['data'] is Map &&
        (data['data'] as Map)['events'] is List) {
      events = (data['data'] as Map)['events'] as List;
    } else {
      events = [];
    }

    return events.whereType<Map<String, dynamic>>().toList();
  } catch (e) {
    throw Exception('일정을 불러올 수 없습니다.');
  }
});
