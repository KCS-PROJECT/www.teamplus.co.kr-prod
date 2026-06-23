import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/colors.dart';
import '../../../../shared/widgets/teamplus_app_bar.dart';
import '../providers/notification_provider.dart';
import '../widgets/notification_item.dart';

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() =>
      _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  late ScrollController _scrollController;

  @override
  void initState() {
    super.initState();
    _scrollController = ScrollController();
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final paginationState = ref.watch(paginationStateProvider);
    // Create a stable parameter object to prevent unnecessary rebuilds
    final params = (limit: paginationState.limit, skip: paginationState.skip);
    final notificationsAsync = ref.watch(
      notificationsProvider(params),
    );
    final unreadCountAsync = ref.watch(unreadCountProvider);

    return Scaffold(
      appBar: const TeamplusAppBar(title: '알림'),
      body: notificationsAsync.when(
        data: (notifications) {
          return Column(
            children: [
              // Unread Count Badge
              if (unreadCountAsync.hasValue)
                Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 12,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.primaryLight,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      '읽지 않은 알림: ${unreadCountAsync.value ?? 0}개',
                      style: const TextStyle(
                        color: AppColors.primary,
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                      ),
                    ),
                  ),
                ),

              // Notifications List
              if (notifications.isNotEmpty)
                Expanded(
                  child: ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    itemCount: notifications.length,
                    itemBuilder: (context, index) {
                      final notification = notifications[index];
                      return NotificationItem(
                        notification: notification,
                        onMarkAsRead: () {
                          ref
                              .read(markAsReadProvider(notification.id).future)
                              .ignore();
                        },
                        onDelete: () {
                          ref
                              .read(deleteNotificationProvider(notification.id)
                                  .future)
                              .ignore();
                        },
                      );
                    },
                  ),
                )
              else
                const Expanded(
                  child: Center(
                    child: Text(
                      '등록된 알림이 없습니다.',
                      style: TextStyle(
                        color: AppColors.lightText,
                        fontSize: 16,
                      ),
                    ),
                  ),
                ),

              // Pagination Controls
              if (notifications.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      ElevatedButton(
                        onPressed: paginationState.skip > 0
                            ? () {
                                ref
                                    .read(paginationStateProvider.notifier)
                                    .update(
                                  (
                                    limit: paginationState.limit,
                                    skip: (paginationState.skip -
                                            paginationState.limit)
                                        .clamp(0, double.infinity)
                                        .toInt(),
                                  ),
                                );
                              }
                            : null,
                        child: const Text('이전'),
                      ),
                      Text(
                        '${paginationState.skip + 1} - ${paginationState.skip + notifications.length}',
                        style: const TextStyle(
                          color: AppColors.lightText,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      ElevatedButton(
                        onPressed: notifications.length >= paginationState.limit
                            ? () {
                                ref
                                    .read(paginationStateProvider.notifier)
                                    .update(
                                  (
                                    limit: paginationState.limit,
                                    skip: paginationState.skip +
                                        paginationState.limit,
                                  ),
                                );
                              }
                            : null,
                        child: const Text('다음'),
                      ),
                    ],
                  ),
                ),
            ],
          );
        },
        loading: () {
          return const Center(
            child: CircularProgressIndicator(),
          );
        },
        error: (error, stackTrace) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(
                    Icons.error_outline,
                    size: 48,
                    color: AppColors.error,
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    '알림을 불러오는 중 오류가 발생했습니다.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 16,
                      color: AppColors.darkText,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    error.toString(),
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 13,
                      color: AppColors.lightText,
                    ),
                  ),
                  const SizedBox(height: 24),
                  ElevatedButton.icon(
                    onPressed: () {
                      final params = (
                        limit: paginationState.limit,
                        skip: paginationState.skip
                      );
                      // ignore: unused_result
                      ref.refresh(
                        notificationsProvider(params),
                      );
                    },
                    icon: const Icon(Icons.refresh),
                    label: const Text('다시 시도'),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
