import 'package:flutter_test/flutter_test.dart';
import 'package:teamplus_app/core/notification/push_route_resolver.dart';

/// 푸시 payload 계약 v1 소비부 회귀 테스트.
///
/// 필드명(`linkUrl`/`type`)은 backend `push-payload.spec.ts` 와 상호 pin —
/// 어느 한쪽의 키 변경은 CI 에서 실패해 계약 드리프트를 잡는다.
/// 계약 SoT: docs/Architecture/PUSH_NOTIFICATION_GUIDE.md §6
void main() {
  group('resolvePushPath — ① linkUrl 우선 (계약 v1)', () {
    test('유효한 내부 linkUrl 이 있으면 그대로 반환', () {
      expect(
        resolvePushPath({'v': '1', 'type': 'chat_message', 'linkUrl': '/chat/room-1'}),
        '/chat/room-1',
      );
      expect(
        resolvePushPath({'linkUrl': '/classes/abc?tab=1'}),
        '/classes/abc?tab=1',
      );
    });

    test('linkUrl 이 type 폴백보다 우선한다', () {
      expect(
        resolvePushPath({'type': 'payment_success', 'linkUrl': '/payment/receipt-9'}),
        '/payment/receipt-9',
      );
    });
  });

  group('resolvePushPath — 비정상 linkUrl 거부 (이중 방어)', () {
    test('외부 URL·스킴·프로토콜 상대 URL 은 무시하고 폴백', () {
      expect(
        resolvePushPath({'linkUrl': 'https://evil.com/phish'}),
        '/notifications',
      );
      expect(
        resolvePushPath({'linkUrl': 'javascript:alert(1)'}),
        '/notifications',
      );
      expect(resolvePushPath({'linkUrl': '//evil.com'}), '/notifications');
      expect(resolvePushPath({'linkUrl': '/\\evil.com'}), '/notifications');
    });

    test('빈 문자열·비문자열 linkUrl 은 무시', () {
      expect(resolvePushPath({'linkUrl': ''}), '/notifications');
      expect(resolvePushPath({'linkUrl': 123}), '/notifications');
      expect(resolvePushPath({'linkUrl': null}), '/notifications');
    });
  });

  group('resolvePushPath — ② 구 payload type 폴백 (하위호환)', () {
    test('payment 계열 → /payment/history (실존 웹 라우트)', () {
      expect(resolvePushPath({'type': 'payment_success'}), '/payment/history');
      expect(resolvePushPath({'type': 'payment_failed'}), '/payment/history');
    });

    test('attendance 계열 → /attendance-history', () {
      expect(resolvePushPath({'type': 'child_attendance'}), '/attendance-history');
      expect(
        resolvePushPath({'type': 'attendance_modified'}),
        '/attendance-history',
      );
    });

    test('chat_message → /messages', () {
      expect(resolvePushPath({'type': 'chat_message'}), '/messages');
    });
  });

  group('resolvePushPath — ③ 최종 폴백', () {
    test('미매핑 type·빈 payload 는 웹 알림함으로', () {
      expect(resolvePushPath({'type': 'admin_push'}), '/notifications');
      expect(resolvePushPath({'type': 'unknown_type'}), '/notifications');
      expect(resolvePushPath(const {}), '/notifications');
    });
  });

  group('isValidInternalWebPath', () {
    test('내부 경로 허용', () {
      expect(isValidInternalWebPath('/notifications'), isTrue);
      expect(isValidInternalWebPath('/a/b?c=d'), isTrue);
    });

    test('외부/위험 경로 거부', () {
      expect(isValidInternalWebPath('notifications'), isFalse);
      expect(isValidInternalWebPath('//evil.com'), isFalse);
      expect(isValidInternalWebPath('/\\evil.com'), isFalse);
      expect(isValidInternalWebPath('teamplus://class/1'), isFalse);
    });
  });
}
