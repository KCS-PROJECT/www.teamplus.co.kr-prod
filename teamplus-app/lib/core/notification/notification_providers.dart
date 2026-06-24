import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'push_notification_service.dart';

/// 푸시 알림 서비스 Provider.
///
/// [PushNotificationApi] 추상 인터페이스를 반환하여 호출부가 구현 세부사항
/// ([PushNotificationService])에 직접 결합되지 않도록 한다.
/// 기본 구현은 기존 싱글톤([PushNotificationService])이므로 `PushNotificationService()`
/// 를 직접 호출하던 기존 경로와 동작이 동일하다(하위 호환).
///
/// 테스트에서는 다음과 같이 Mock 으로 교체할 수 있다:
/// ```dart
/// ProviderContainer(overrides: [
///   pushNotificationProvider.overrideWithValue(MockPushNotificationApi()),
/// ]);
/// ```
final pushNotificationProvider = Provider<PushNotificationApi>(
  (ref) => PushNotificationService(),
);
