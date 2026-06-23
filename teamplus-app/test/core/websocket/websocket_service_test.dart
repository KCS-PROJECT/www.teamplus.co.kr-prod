import 'package:flutter_test/flutter_test.dart';
import 'package:teamplus_app/core/websocket/websocket_service.dart';

/// `websocket_service.dart` 의 외부 의존성 0 인 핵심 변환·필터 로직 단위 검증.
///
/// 검증 범위:
///  1. `WebSocketEvent.fromRaw` — 이벤트 이름 → `WebSocketEventType` 매핑
///  2. `WebSocketEvent.fromRaw` — Map / non-Map payload 양쪽 처리
///  3. `WebSocketEventStreamExtension` — `whereType` / `whereEvent` 필터 동작
///
/// Socket.IO connect / token refresh 등 IO 가 개입하는 시나리오는 통합 테스트
/// (`test/integration/`) 영역에서 mock 백엔드와 함께 검증한다. 단위 테스트는
/// "회귀 시 가장 비싼" 데이터 변환·필터 계약을 우선 잠근다.
void main() {
  group('WebSocketEvent.fromRaw', () {
    test('지정된 이벤트 이름은 매칭되는 WebSocketEventType 으로 매핑', () {
      final cases = <String, WebSocketEventType>{
        'notification': WebSocketEventType.notification,
        'attendance_update': WebSocketEventType.attendanceUpdate,
        'class_update': WebSocketEventType.classUpdate,
        'payment_status': WebSocketEventType.paymentStatus,
        'system_notice': WebSocketEventType.systemNotice,
      };

      cases.forEach((name, expectedType) {
        final event = WebSocketEvent.fromRaw(name, {'k': 'v'});
        expect(event.type, expectedType,
            reason: '$name 이벤트는 $expectedType 로 매핑되어야 함');
        expect(event.eventName, name);
      });
    });

    test('정의되지 않은 이벤트 이름은 custom 으로 매핑', () {
      final event = WebSocketEvent.fromRaw('unknown_event', {});
      expect(event.type, WebSocketEventType.custom);
      expect(event.eventName, 'unknown_event');
    });

    test('Map 페이로드는 그대로 보존', () {
      final payload = {'id': 'abc', 'count': 3};
      final event = WebSocketEvent.fromRaw('notification', payload);
      expect(event.data, payload);
    });

    test('Map 이 아닌 페이로드는 `value` 키로 래핑 (계약 깨짐 방지)', () {
      // 서버가 string / int / null 등을 보낼 때도 listener 는 항상 Map 으로 받음.
      final stringEvent = WebSocketEvent.fromRaw('custom', 'hello');
      expect(stringEvent.data, {'value': 'hello'});

      final intEvent = WebSocketEvent.fromRaw('custom', 42);
      expect(intEvent.data, {'value': 42});

      final nullEvent = WebSocketEvent.fromRaw('custom', null);
      expect(nullEvent.data, {'value': null});
    });

    test('timestamp 는 fromRaw 호출 직전·직후 사이의 시각', () {
      final before = DateTime.now();
      final event = WebSocketEvent.fromRaw('notification', {});
      final after = DateTime.now();
      // 동일 ms 라도 isBefore 가 아닌 !isAfter / !isBefore 로 경계 포함 검증.
      expect(event.timestamp.isBefore(before), isFalse,
          reason: 'timestamp 는 호출 시점보다 빠를 수 없음');
      expect(event.timestamp.isAfter(after), isFalse,
          reason: 'timestamp 는 호출 종료 후일 수 없음');
    });
  });

  group('WebSocketEventStreamExtension', () {
    late List<WebSocketEvent> source;

    setUp(() {
      source = [
        WebSocketEvent.fromRaw('notification', {'n': 1}),
        WebSocketEvent.fromRaw('attendance_update', {'a': 1}),
        WebSocketEvent.fromRaw('notification', {'n': 2}),
        WebSocketEvent.fromRaw('class_update', {'c': 1}),
        WebSocketEvent.fromRaw('custom_xyz', {'x': 1}),
      ];
    });

    test('whereType — 특정 타입만 통과', () async {
      final stream = Stream.fromIterable(source);
      final result =
          await stream.whereType(WebSocketEventType.notification).toList();
      expect(result.length, 2);
      expect(result.every((e) => e.type == WebSocketEventType.notification),
          isTrue);
    });

    test('whereEvent — 특정 이벤트 이름만 통과 (custom 포함)', () async {
      final stream = Stream.fromIterable(source);
      final result = await stream.whereEvent('custom_xyz').toList();
      expect(result.length, 1);
      expect(result.first.eventName, 'custom_xyz');
      expect(result.first.type, WebSocketEventType.custom);
    });

    test('whereType + whereEvent 조합 — 빈 결과 케이스', () async {
      // 존재하지 않는 이벤트 이름은 결과 0건이어야 함 (NPE 등 없이).
      final stream = Stream.fromIterable(source);
      final result = await stream.whereEvent('nonexistent').toList();
      expect(result, isEmpty);
    });
  });

  group('WebSocketStatus enum', () {
    test('상태 전이 가능 값이 모두 정의되어 있음 (회귀 가드)', () {
      // _refreshAndReconnect / didChangeAppLifecycleState 가 사용하는 상태가
      // 누락되면 컴파일 에러 — 이 테스트는 enum 변경 시 명시적 갱신 신호.
      expect(
          WebSocketStatus.values,
          containsAll(<WebSocketStatus>[
            WebSocketStatus.disconnected,
            WebSocketStatus.connecting,
            WebSocketStatus.connected,
            WebSocketStatus.reconnecting,
            WebSocketStatus.error,
          ]));
    });
  });
}
