import '../../../../core/network/api_client.dart';
import '../models/notification_model.dart';

class NotificationRemoteDatasource {
  final ApiClient _apiClient;

  NotificationRemoteDatasource(this._apiClient);

  Future<List<NotificationModel>> getNotifications({
    int limit = 20,
    int skip = 0,
  }) async {
    try {
      final response = await _apiClient.get(
        '/notifications',
        queryParameters: {
          'limit': limit,
          'skip': skip,
        },
      );

      // Handle different response structures
      if (response.data is List) {
        final List<dynamic> data = response.data;
        return data
            .map((json) =>
                NotificationModel.fromJson(json as Map<String, dynamic>))
            .toList();
      } else if (response.data is Map) {
        final Map<String, dynamic> data = response.data;
        final List<dynamic> notifications = data['data'] ?? [];
        return notifications
            .map((json) =>
                NotificationModel.fromJson(json as Map<String, dynamic>))
            .toList();
      }

      return [];
    } catch (e) {
      rethrow;
    }
  }

  Future<NotificationModel> getNotification(String notificationId) async {
    try {
      final response = await _apiClient.get('/notifications/$notificationId');

      if (response.data is Map) {
        return NotificationModel.fromJson(
            response.data as Map<String, dynamic>);
      }

      throw Exception('Invalid response format');
    } catch (e) {
      rethrow;
    }
  }

  Future<int> getUnreadCount() async {
    try {
      final response = await _apiClient.get('/notifications/stats/unread');

      if (response.data is Map) {
        final Map<String, dynamic> data = response.data;
        return data['unreadCount'] ?? 0;
      }

      return 0;
    } catch (e) {
      rethrow;
    }
  }

  Future<void> markAsRead(String notificationId) async {
    try {
      await _apiClient.patch('/notifications/$notificationId/read');
    } catch (e) {
      rethrow;
    }
  }

  Future<void> deleteNotification(String notificationId) async {
    try {
      await _apiClient.delete('/notifications/$notificationId');
    } catch (e) {
      rethrow;
    }
  }
}
