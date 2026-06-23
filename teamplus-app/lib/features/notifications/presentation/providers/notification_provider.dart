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
final notificationsProvider =
    FutureProvider.family<List<Notification>, ({int limit, int skip})>((
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
final singleNotificationProvider =
    FutureProvider.family<Notification, String>((ref, notificationId) async {
  final repository = ref.watch(notificationRepositoryProvider);
  return repository.getNotification(notificationId);
});

// Mark as Read Mutation
final markAsReadProvider = FutureProvider.family<void, String>((
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
final deleteNotificationProvider = FutureProvider.family<void, String>((
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
