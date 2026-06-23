// NativeBackGuard E2E 위젯 테스트
//
// 검증 범위:
//   - macOS/Linux 테스트 환경(Platform.isAndroid=false)에서의 안전 분기
//   - 기본 속성값 (디자인 리뉴얼 v6 텍스트)
//   - 위젯 렌더링 충돌 없음
//
// 제약: Platform.isAndroid는 dart:io 정적 변수라 호스트 OS에서만 검증 가능.
//   Android 실제 백키 동작은 통합 테스트(integration_test/) 또는 디바이스에서 검증.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teamplus_app/shared/widgets/native_back_guard.dart';

void main() {
  group('NativeBackGuard — 기본 속성', () {
    test('기본 title 은 리뉴얼 v6 텍스트', () {
      const widget = NativeBackGuard(child: SizedBox.shrink());
      expect(widget.title, '팀플러스를\n완전히 종료하시겠습니까?');
    });

    test('기본 message 는 리뉴얼 v6 텍스트', () {
      const widget = NativeBackGuard(child: SizedBox.shrink());
      expect(widget.message, '종료하면 알림을 받을 수 없으며,\n다음 수업 일정도 확인할 수 없어요.');
    });

    test('기본 confirmText 는 "예"', () {
      const widget = NativeBackGuard(child: SizedBox.shrink());
      expect(widget.confirmText, '예');
    });

    test('기본 cancelText 는 "아니요"', () {
      const widget = NativeBackGuard(child: SizedBox.shrink());
      expect(widget.cancelText, '아니요');
    });

    test('커스텀 텍스트 주입 가능', () {
      const widget = NativeBackGuard(
        title: 'TEST_TITLE',
        message: 'TEST_MSG',
        confirmText: 'TEST_OK',
        cancelText: 'TEST_NO',
        child: SizedBox.shrink(),
      );
      expect(widget.title, 'TEST_TITLE');
      expect(widget.message, 'TEST_MSG');
      expect(widget.confirmText, 'TEST_OK');
      expect(widget.cancelText, 'TEST_NO');
    });
  });

  group('NativeBackGuard — 렌더링 (macOS 테스트 환경: Platform.isAndroid=false)', () {
    testWidgets('child 가 정상 렌더링', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: NativeBackGuard(
            child: Scaffold(
              body: Center(child: Text('CHILD_CONTENT')),
            ),
          ),
        ),
      );

      expect(find.text('CHILD_CONTENT'), findsOneWidget);
    });

    testWidgets('non-Android 환경에서는 PopScope 없이 child 그대로 반환', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: NativeBackGuard(
            child: Scaffold(body: Text('NO_POPSCOPE')),
          ),
        ),
      );

      // macOS/Linux 테스트 환경에서는 Platform.isAndroid=false 분기 → PopScope 미적용
      expect(find.byType(PopScope), findsNothing);
      expect(find.text('NO_POPSCOPE'), findsOneWidget);
    });

    testWidgets('렌더링 충돌 없음 (스모크)', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: NativeBackGuard(
            child: Scaffold(
              appBar: null,
              body: SizedBox.expand(),
            ),
          ),
        ),
      );

      expect(tester.takeException(), isNull);
    });

    testWidgets('중첩 NativeBackGuard 도 안전', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: NativeBackGuard(
            child: NativeBackGuard(
              child: Scaffold(body: Text('NESTED')),
            ),
          ),
        ),
      );

      expect(find.text('NESTED'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });
}
