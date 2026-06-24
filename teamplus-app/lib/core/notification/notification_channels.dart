import 'dart:typed_data';

import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// 푸시/로컬 알림 공통 진동 패턴.
///
/// `[대기 0ms, 진동 500ms, 정지 250ms, 진동 500ms]` — 사용자가 확실히 인지할 수
/// 있는 길이. 채널(`AndroidNotificationChannel`)과 알림 디테일
/// (`AndroidNotificationDetails`) 양쪽에서 동일하게 사용한다.
///
/// `Int64List.fromList` 는 const 가 아니므로 top-level final 로 둔다.
final Int64List kNotificationVibrationPattern =
    Int64List.fromList(<int>[0, 500, 250, 500]);

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

  /// 채널을 진동·소리가 켜진 상태로 생성한다.
  ///
  /// `flutter_local_notifications` 의 기본값도 `enableVibration: true` /
  /// `playSound: true` 이지만, "진동이 울리지 않는다" 회귀를 방지하기 위해
  /// 명시적으로 지정하고 진동 패턴까지 부여한다. Android 8+ 에서는 채널 생성 후
  /// 이 설정이 동결되므로, 설정 변경 시 반드시 채널 id 를 버전업해야 한다
  /// (현재 `_v2`). 구버전 id 는 [legacyChannelIds] 에서 삭제한다.
  AndroidNotificationChannel toAndroidChannel() => AndroidNotificationChannel(
        id,
        name,
        description: description,
        importance: importance,
        playSound: true,
        enableVibration: true,
        vibrationPattern: kNotificationVibrationPattern,
      );
}

class NotificationChannels {
  NotificationChannels._();

  static const NotificationChannel defaultChannel = NotificationChannel(
    id: 'teamplus_default_v2',
    name: 'TEAMPLUS 알림',
    description: '일반 알림',
    importance: Importance.high,
  );

  static const NotificationChannel payment = NotificationChannel(
    id: 'teamplus_payment_v2',
    name: '결제 알림',
    description: '결제 관련 알림',
    importance: Importance.max,
  );

  static const NotificationChannel lesson = NotificationChannel(
    id: 'teamplus_class_v2',
    name: '수업 알림',
    description: '수업 및 출석 관련 알림',
    importance: Importance.high,
  );

  static const NotificationChannel notice = NotificationChannel(
    id: 'teamplus_notice_v2',
    name: '공지사항',
    description: '클럽 공지사항',
    importance: Importance.high,
  );

  static const List<NotificationChannel> all = [
    defaultChannel,
    payment,
    lesson,
    notice,
  ];

  /// 진동/소리 설정 없이 먼저 생성됐던 구버전 채널 id 목록.
  ///
  /// Android 8+ 는 채널의 진동/소리 설정을 생성 시점에 동결하고, 같은 id 로
  /// 삭제 후 재생성해도 이전 설정을 복원한다. 따라서 새 `_v2` 채널로 교체하면서
  /// 사용자 설정 화면에 남는 구버전 채널을 정리하기 위해 삭제 대상으로 둔다.
  static const List<String> legacyChannelIds = [
    'teamplus_default',
    'teamplus_payment',
    'teamplus_class',
    'teamplus_notice',
  ];

  /// 채널 id로 정의를 조회한다. 일치하는 채널이 없으면 기본 채널을 반환.
  static NotificationChannel byId(String? id) {
    return all.firstWhere(
      (c) => c.id == id,
      orElse: () => defaultChannel,
    );
  }
}
