import '../entities/notification.dart';

abstract class NotificationRepository {
  Future<List<Notification>> getNotifications({
    int limit = 20,
    int skip = 0,
  });

  Future<Notification> getNotification(String notificationId);

  Future<int> getUnreadCount();

  Future<void> markAsRead(String notificationId);

  Future<void> deleteNotification(String notificationId);
}
