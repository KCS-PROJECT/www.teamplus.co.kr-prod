import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/providers/shared_providers.dart';
import '../../data/datetime_api.dart';

/// DateTime API Provider
final dateTimeApiProvider = Provider<DateTimeApi>(
  (ref) => DateTimeApi(ref.read(apiClientProvider)),
);

/// 날짜/시간 통합 조회 Provider
///
/// `family` 파라미터: baseDate (YYYYMMDD, null 이면 오늘)
///
/// 사용 예:
/// ```dart
/// // 오늘 기준
/// final dt = ref.watch(dateTimeProvider(null));
///
/// // 특정 날짜 기준
/// final dt = ref.watch(dateTimeProvider('20260415'));
///
/// dt.when(
///   data: (data) => Text(data.year),
///   loading: () => const CircularProgressIndicator(),
///   error: (e, s) => Text('오류: $e'),
/// );
/// ```
final dateTimeProvider =
    FutureProvider.family<DateTimeData, String?>((ref, baseDate) async {
  final api = ref.read(dateTimeApiProvider);
  return api.getAll(baseDate: baseDate);
});

/// React `useDateTime` 훅과 동일한 시그니처를 제공하는 Wrapper 결과 객체.
///
/// Web/Admin 의 `useDateTime()` 결과와 1:1 대응한다.
class DateTimeResult {
  final DateTimeData? data;
  final String year;
  final String month;
  final String date;
  final String dateTime;
  final String dateTimeSecond;
  final String dateTimeMillisecond;
  final List<String> weeklyDates;
  final List<String> monthlyDates;
  final bool isLoading;
  final Object? error;
  final void Function() refresh;

  const DateTimeResult({
    required this.data,
    required this.year,
    required this.month,
    required this.date,
    required this.dateTime,
    required this.dateTimeSecond,
    required this.dateTimeMillisecond,
    required this.weeklyDates,
    required this.monthlyDates,
    required this.isLoading,
    required this.error,
    required this.refresh,
  });
}

/// React 의 `useDateTime` 훅과 동일한 사용감을 제공하는 헬퍼.
///
/// ConsumerWidget / ConsumerStatefulWidget 의 `build` 안에서 호출한다.
///
/// ```dart
/// class MyScreen extends ConsumerWidget {
///   @override
///   Widget build(BuildContext context, WidgetRef ref) {
///     final dt = useDateTime(ref); // 오늘 기준
///     // 또는: final dt = useDateTime(ref, baseDate: '20260415');
///
///     if (dt.isLoading) return const CircularProgressIndicator();
///     if (dt.error != null) return Text('오류: ${dt.error}');
///
///     return Column(children: [
///       Text('년도: ${dt.year}'),
///       Text('주간: ${dt.weeklyDates.join(", ")}'),
///       ElevatedButton(onPressed: dt.refresh, child: const Text('새로고침')),
///     ]);
///   }
/// }
/// ```
DateTimeResult useDateTime(WidgetRef ref, {String? baseDate}) {
  final state = ref.watch(dateTimeProvider(baseDate));
  final data = state.value;
  return DateTimeResult(
    data: data,
    year: data?.year ?? '',
    month: data?.month ?? '',
    date: data?.date ?? '',
    dateTime: data?.dateTime ?? '',
    dateTimeSecond: data?.dateTimeSecond ?? '',
    dateTimeMillisecond: data?.dateTimeMillisecond ?? '',
    weeklyDates: data?.weeklyDates ?? const <String>[],
    monthlyDates: data?.monthlyDates ?? const <String>[],
    isLoading: state.isLoading,
    error: state.hasError ? state.error : null,
    refresh: () => ref.invalidate(dateTimeProvider(baseDate)),
  );
}
