import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/providers/shared_providers.dart';
import '../../data/datasources/notification_remote_datasource.dart';
import '../../data/repositories/notification_repository_impl.dart';
import '../../domain/entities/notification.dart';
import '../../domain/repositories/notification_repository.dart';

// Remote Datasource Provider
final notificationRemoteDatasourceProvider =
    Provider<NotificationRemoteDatasource>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return NotificationRemoteDatasource(apiClient);
});

// Repository Provider
final notificationRepositoryProvider = Provider<NotificationRepository>((ref) {
  final datasource = ref.watch(notificationRemoteDatasourceProvider);
  return NotificationRepositoryImpl(datasource);
});

// Notifications List Provider (with pagination)
// Using record type for stable parameter comparison
// autoDispose: limit/skip 조합별 캐시가 앱 수명 동안 누적되지 않도록 화면
// unmount 시 해제 (2026-07-28).
final notificationsProvider = FutureProvider.autoDispose
    .family<List<Notification>, ({int limit, int skip})>((
  ref,
  params,
) async {
  final repository = ref.watch(notificationRepositoryProvider);
  return repository.getNotifications(limit: params.limit, skip: params.skip);
});

// Unread Count Provider
final unreadCountProvider = FutureProvider<int>((ref) async {
  final repository = ref.watch(notificationRepositoryProvider);
  return repository.getUnreadCount();
});

// Single Notification Provider
// autoDispose: id 별 캐시 무한 누적 방지 (2026-07-28).
final singleNotificationProvider = FutureProvider.autoDispose
    .family<Notification, String>((ref, notificationId) async {
  final repository = ref.watch(notificationRepositoryProvider);
  return repository.getNotification(notificationId);
});

// Mark as Read Mutation
// autoDispose: 캐시 잔존 시 동일 id 재실행이 캐시로 스킵되는 문제 + id 별
// 캐시 누적 방지 (2026-07-28).
final markAsReadProvider = FutureProvider.autoDispose.family<void, String>((
  ref,
  notificationId,
) async {
  final repository = ref.watch(notificationRepositoryProvider);
  await repository.markAsRead(notificationId);

  // Invalidate only unread count provider
  // Don't invalidate notificationsProvider to avoid infinite loops
  ref.invalidate(unreadCountProvider);
});

// Delete Notification Mutation
// autoDispose: markAsReadProvider 와 동일 사유 (2026-07-28).
final deleteNotificationProvider =
    FutureProvider.autoDispose.family<void, String>((
  ref,
  notificationId,
) async {
  final repository = ref.watch(notificationRepositoryProvider);
  await repository.deleteNotification(notificationId);

  // Invalidate only unread count provider
  // Don't invalidate notificationsProvider to avoid infinite loops
  ref.invalidate(unreadCountProvider);
});

// Pagination State Notifier
//
// 사용: `ref.read(paginationStateProvider.notifier).update((limit: 20, skip: 20))`
class PaginationStateNotifier extends Notifier<({int limit, int skip})> {
  @override
  ({int limit, int skip}) build() => (limit: 20, skip: 0);

  void update(({int limit, int skip}) value) => state = value;
}

final paginationStateProvider =
    NotifierProvider<PaginationStateNotifier, ({int limit, int skip})>(
        PaginationStateNotifier.new);
