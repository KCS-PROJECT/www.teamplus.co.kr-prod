import '../../domain/entities/notification.dart';
import '../../domain/repositories/notification_repository.dart';
import '../datasources/notification_remote_datasource.dart';

class NotificationRepositoryImpl implements NotificationRepository {
  final NotificationRemoteDatasource _remoteDatasource;

  NotificationRepositoryImpl(this._remoteDatasource);

  @override
  Future<List<Notification>> getNotifications({
    int limit = 20,
    int skip = 0,
  }) async {
    try {
      final models = await _remoteDatasource.getNotifications(
        limit: limit,
        skip: skip,
      );
      return models.map((model) => model.toEntity()).toList();
    } catch (e) {
      rethrow;
    }
  }

  @override
  Future<Notification> getNotification(String notificationId) async {
    try {
      final model = await _remoteDatasource.getNotification(notificationId);
      return model.toEntity();
    } catch (e) {
      rethrow;
    }
  }

  @override
  Future<int> getUnreadCount() async {
    try {
      return await _remoteDatasource.getUnreadCount();
    } catch (e) {
      rethrow;
    }
  }

  @override
  Future<void> markAsRead(String notificationId) async {
    try {
      await _remoteDatasource.markAsRead(notificationId);
    } catch (e) {
      rethrow;
    }
  }

  @override
  Future<void> deleteNotification(String notificationId) async {
    try {
      await _remoteDatasource.deleteNotification(notificationId);
    } catch (e) {
      rethrow;
    }
  }
}
