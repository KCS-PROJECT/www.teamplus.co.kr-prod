import 'package:json_annotation/json_annotation.dart';
import '../../domain/entities/notification.dart';

part 'notification_model.g.dart';

@JsonSerializable()
class NotificationModel extends Notification {
  const NotificationModel({
    required super.id,
    required super.notificationType,
    required super.title,
    required super.message,
    required super.isRead,
    required super.createdAt,
  });

  factory NotificationModel.fromJson(Map<String, dynamic> json) =>
      _$NotificationModelFromJson(json);

  Map<String, dynamic> toJson() => _$NotificationModelToJson(this);

  // Convert to domain entity
  Notification toEntity() => Notification(
        id: id,
        notificationType: notificationType,
        title: title,
        message: message,
        isRead: isRead,
        createdAt: createdAt,
      );
}
