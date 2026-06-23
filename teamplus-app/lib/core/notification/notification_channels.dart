import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Android 알림 채널 정의 단일 출처(SoT).
///
/// 채널 생성(`_createNotificationChannels`)과 알림 표시(`showNotification`),
/// 타입→채널 매핑(`_getChannelFromData`)이 모두 이 정의를 참조하여
/// 채널 id·이름이 코드 곳곳에 하드코딩·중복되지 않도록 한다.
class NotificationChannel {
  final String id;
  final String name;
  final String description;
  final Importance importance;

  const NotificationChannel({
    required this.id,
    required this.name,
    required this.description,
    required this.importance,
  });

  AndroidNotificationChannel toAndroidChannel() => AndroidNotificationChannel(
        id,
        name,
        description: description,
        importance: importance,
      );
}

class NotificationChannels {
  NotificationChannels._();

  static const NotificationChannel defaultChannel = NotificationChannel(
    id: 'teamplus_default',
    name: 'TEAMPLUS 알림',
    description: '일반 알림',
    importance: Importance.high,
  );

  static const NotificationChannel payment = NotificationChannel(
    id: 'teamplus_payment',
    name: '결제 알림',
    description: '결제 관련 알림',
    importance: Importance.max,
  );

  static const NotificationChannel lesson = NotificationChannel(
    id: 'teamplus_class',
    name: '수업 알림',
    description: '수업 및 출석 관련 알림',
    importance: Importance.high,
  );

  static const NotificationChannel notice = NotificationChannel(
    id: 'teamplus_notice',
    name: '공지사항',
    description: '클럽 공지사항',
    importance: Importance.defaultImportance,
  );

  static const List<NotificationChannel> all = [
    defaultChannel,
    payment,
    lesson,
    notice,
  ];

  /// 채널 id로 정의를 조회한다. 일치하는 채널이 없으면 기본 채널을 반환.
  static NotificationChannel byId(String? id) {
    return all.firstWhere(
      (c) => c.id == id,
      orElse: () => defaultChannel,
    );
  }
}
