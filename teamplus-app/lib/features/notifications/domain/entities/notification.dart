class Notification {
  final String id;
  final String notificationType;
  final String title;
  final String message;
  final bool isRead;
  final DateTime createdAt;

  const Notification({
    required this.id,
    required this.notificationType,
    required this.title,
    required this.message,
    required this.isRead,
    required this.createdAt,
  });

  // Copy with method for state updates
  Notification copyWith({
    String? id,
    String? notificationType,
    String? title,
    String? message,
    bool? isRead,
    DateTime? createdAt,
  }) {
    return Notification(
      id: id ?? this.id,
      notificationType: notificationType ?? this.notificationType,
      title: title ?? this.title,
      message: message ?? this.message,
      isRead: isRead ?? this.isRead,
      createdAt: createdAt ?? this.createdAt,
    );
  }
}
