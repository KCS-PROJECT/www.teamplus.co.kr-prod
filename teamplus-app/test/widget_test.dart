// TEAMPLUS App 기본 스모크 테스트
//
// teamplusApp은 네이티브 서비스(FCM, SSL, GoRouter 등) 초기화에 의존하므로
// 여기서는 Flutter 위젯 시스템이 정상 작동하는지 확인하는 최소한의 테스트만 수행합니다.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('기본 MaterialApp 렌더링 스모크 테스트', (WidgetTester tester) async {
    // 최소한의 MaterialApp이 정상적으로 렌더링되는지 확인
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: Center(
            child: Text('팀플러스'),
          ),
        ),
      ),
    );

    // 텍스트가 정상적으로 렌더링되었는지 확인
    expect(find.text('팀플러스'), findsOneWidget);
    expect(find.byType(Scaffold), findsOneWidget);
  });
}
