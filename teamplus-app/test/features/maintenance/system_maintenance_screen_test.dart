// M4 · 시스템 점검 공지 화면 — 위젯 테스트 (동적 제목·내용·기간)
//
// 검증 범위:
//   1) 제목 — 주입 시 동적 표시, 미주입 시 기본 문구
//   2) 내용(content) — 주입 시 본문 표시
//   3) 기간(startAt/expiresAt) — 주입 시 시작/종료 표시
//   4) onConfirm — 있으면 버튼 노출, 없으면 숨김(점검 차단 모드)
//   5) PopScope canPop:false (백키 차단)
//   6) CustomPainter 페인트 안전 + 멀티 viewport
//
// 주의: `_dotsController.repeat()` 무한 애니메이션 → pumpAndSettle 불가. 고정 프레임 펌프 사용.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teamplus_app/features/maintenance/presentation/screens/system_maintenance_screen.dart';

void main() {
  const testViewSize = Size(390, 844);

  Widget wrap(Widget child) => MaterialApp(
        home: child,
        theme: ThemeData(fontFamily: 'Pretendard'),
      );

  Future<void> pumpScreen(WidgetTester tester, Widget child) async {
    await tester.pumpWidget(wrap(child));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 16));
  }

  void setView(WidgetTester tester, [Size size = testViewSize]) {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
  }

  group('SystemMaintenanceScreen — 제목/내용/기간 (동적)', () {
    testWidgets('제목 미주입 시 기본 문구 표시', (tester) async {
      setView(tester);
      await pumpScreen(tester, const SystemMaintenanceScreen());
      expect(find.text('잠시 빙판을 정비 중이에요'), findsOneWidget);
    });

    testWidgets('제목 주입 시 공지 카드에 표시(히어로는 기본 문구 유지)', (tester) async {
      setView(tester);
      await pumpScreen(
        tester,
        const SystemMaintenanceScreen(title: '긴급 서버 점검 안내'),
      );
      // 등록 제목은 '공지' 카드에 표시
      expect(find.text('긴급 서버 점검 안내'), findsOneWidget);
      // 히어로는 항상 기본 브랜드 문구(항상 노출)
      expect(find.text('잠시 빙판을 정비 중이에요'), findsOneWidget);
      // '공지' 라벨 노출
      expect(find.text('공지사항'), findsOneWidget);
    });

    testWidgets('내용(content) 주입 시 본문 표시', (tester) async {
      setView(tester);
      await pumpScreen(
        tester,
        const SystemMaintenanceScreen(
          content: '데이터센터 전원 작업으로 일시 중단됩니다. 양해 부탁드립니다.',
        ),
      );
      expect(
        find.text('데이터센터 전원 작업으로 일시 중단됩니다. 양해 부탁드립니다.'),
        findsOneWidget,
      );
    });

    testWidgets('제목+내용 동시 주입 시 공지 카드에 둘 다 표시', (tester) async {
      setView(tester);
      await pumpScreen(
        tester,
        const SystemMaintenanceScreen(
          title: '시스템 점검 안내',
          content: '6월 19일 02:00~04:00 결제·출석이 일시 중단됩니다.',
        ),
      );
      expect(find.text('시스템 점검 안내'), findsOneWidget);
      expect(find.text('6월 19일 02:00~04:00 결제·출석이 일시 중단됩니다.'), findsOneWidget);
      expect(find.text('공지사항'), findsOneWidget);
    });

    testWidgets('기간 주입 시 점검일/점검시간 행 표시(같은 날 → 날짜 1개 + 시간 범위)',
        (tester) async {
      setView(tester);
      await pumpScreen(
        tester,
        SystemMaintenanceScreen(
          startAt: DateTime(2026, 3, 6, 2, 0),
          expiresAt: DateTime(2026, 3, 6, 6, 0),
        ),
      );
      expect(find.text('점검일'), findsOneWidget);
      expect(find.text('점검시간'), findsOneWidget);
      // 같은 날 → 날짜 1개, 시간은 범위(HH:mm ~ HH:mm)
      expect(find.text('2026.03.06'), findsOneWidget);
      expect(find.text('02:00 ~ 06:00'), findsOneWidget);
    });

    testWidgets('여러 날 점검 → 점검일 날짜 범위(yyyy.MM.dd ~ MM.dd)', (tester) async {
      setView(tester);
      await pumpScreen(
        tester,
        SystemMaintenanceScreen(
          startAt: DateTime(2026, 5, 17, 2, 0),
          expiresAt: DateTime(2026, 5, 18, 6, 0),
        ),
      );
      expect(find.text('2026.05.17 ~ 05.18'), findsOneWidget);
    });

    testWidgets('상태 배지(영문) + 진행 라벨(한글)이 항상 표시', (tester) async {
      setView(tester);
      await pumpScreen(tester, const SystemMaintenanceScreen());
      expect(find.text('SYSTEM MAINTENANCE'), findsOneWidget);
      expect(find.text('점검 진행 중'), findsOneWidget);
    });
  });

  group('SystemMaintenanceScreen — 확인 버튼(차단 모드)', () {
    testWidgets('onConfirm 주입 시 CTA 버튼 노출', (tester) async {
      setView(tester);
      await pumpScreen(tester, SystemMaintenanceScreen(onConfirm: () {}));
      expect(find.text('확인했어요'), findsOneWidget);
    });

    testWidgets('onConfirm 없으면 확인 버튼 숨김 (빠져나갈 경로 없음)', (tester) async {
      setView(tester);
      await pumpScreen(tester, const SystemMaintenanceScreen());
      expect(find.text('확인했어요'), findsNothing);
    });

    testWidgets('onConfirm 탭 시 콜백 호출', (tester) async {
      setView(tester);
      var count = 0;
      await pumpScreen(
        tester,
        SystemMaintenanceScreen(onConfirm: () => count++),
      );
      await tester.tap(find.text('확인했어요'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 16));
      expect(count, 1);
    });
  });

  group('SystemMaintenanceScreen — 백키 차단', () {
    testWidgets('PopScope canPop:false 적용', (tester) async {
      setView(tester);
      await pumpScreen(tester, const SystemMaintenanceScreen());
      final popScopes = tester.widgetList<PopScope>(find.byType(PopScope));
      expect(popScopes, isNotEmpty);
      expect(popScopes.first.canPop, isFalse);
    });
  });

  group('SystemMaintenanceScreen — 렌더링 안정성', () {
    testWidgets('CustomPainter 페인트 시 예외 없음', (tester) async {
      setView(tester);
      await pumpScreen(tester, const SystemMaintenanceScreen());
      expect(tester.takeException(), isNull);
      expect(find.byType(CustomPaint), findsAtLeastNWidgets(2));
    });

    testWidgets('제목+내용+기간 모두 주입해도 예외 없음', (tester) async {
      setView(tester);
      await pumpScreen(
        tester,
        SystemMaintenanceScreen(
          title: '점검 안내',
          content: '내용' * 200, // 긴 내용 (스크롤 대상)
          startAt: DateTime(2026, 3, 6, 2, 0),
          expiresAt: DateTime(2026, 3, 6, 6, 0),
        ),
      );
      expect(tester.takeException(), isNull);
      expect(find.text('점검 안내'), findsOneWidget);
    });
  });

  group('SystemMaintenanceScreen — 멀티 viewport', () {
    final viewports = <String, Size>{
      'iPhone SE': const Size(320, 568),
      'iPhone 13': const Size(390, 844),
      'iPhone 14 Pro Max': const Size(430, 932),
      'Android 작은': const Size(360, 640),
    };

    for (final entry in viewports.entries) {
      testWidgets('${entry.key} 안전 렌더링', (tester) async {
        setView(tester, entry.value);
        await pumpScreen(tester, const SystemMaintenanceScreen());
        expect(tester.takeException(), isNull, reason: '${entry.key} 예외');
        expect(find.text('잠시 빙판을 정비 중이에요'), findsOneWidget);
      });
    }
  });

  group('SystemMaintenanceScreen — SystemUiOverlayStyle', () {
    testWidgets('AnnotatedRegion dark icons / transparent statusbar',
        (tester) async {
      setView(tester);
      await pumpScreen(tester, const SystemMaintenanceScreen());
      final annotatedRegion = find.byWidgetPredicate(
        (w) => w is AnnotatedRegion<SystemUiOverlayStyle>,
      );
      expect(annotatedRegion, findsOneWidget);
      final widget = tester.widget<AnnotatedRegion<SystemUiOverlayStyle>>(
        annotatedRegion,
      );
      expect(widget.value.statusBarColor, Colors.transparent);
      expect(widget.value.statusBarIconBrightness, Brightness.dark);
    });
  });

  group('SystemMaintenanceScreen — 보강 요소(진행바·예상완료·고객센터·사유)', () {
    testWidgets('expiresAt 있으면 "예상 완료" 표시', (tester) async {
      setView(tester);
      await pumpScreen(
        tester,
        SystemMaintenanceScreen(expiresAt: DateTime(2026, 5, 18, 18, 0)),
      );
      expect(find.textContaining('예상 완료'), findsOneWidget);
    });

    testWidgets('expiresAt 없으면 "예상 완료" 숨김(진행 라벨은 유지)', (tester) async {
      setView(tester);
      await pumpScreen(tester, const SystemMaintenanceScreen());
      expect(find.textContaining('예상 완료'), findsNothing);
      expect(find.text('점검 진행 중'), findsOneWidget);
    });

    testWidgets('고객센터 안내는 차단 모드에서도 항상 노출', (tester) async {
      setView(tester);
      await pumpScreen(tester, const SystemMaintenanceScreen());
      expect(find.text('문제가 계속되나요?'), findsOneWidget);
      // csPhone/csHours 미주입 → 기본 상수 폴백
      expect(find.text('고객센터 02-557-5321 · 평일 09:00~18:00'), findsOneWidget);
    });

    testWidgets('csPhone/csHours 주입 시 서버값으로 고객센터 표시', (tester) async {
      setView(tester);
      await pumpScreen(
        tester,
        const SystemMaintenanceScreen(
          csPhone: '1600-7777',
          csHours: '매일 08:00~22:00',
        ),
      );
      expect(find.text('고객센터 1600-7777 · 매일 08:00~22:00'), findsOneWidget);
      // 기본 상수는 더 이상 표시되지 않음(서버값 우선)
      expect(find.text('고객센터 02-557-5321 · 평일 09:00~18:00'), findsNothing);
    });

    testWidgets('reason 주입 시에만 점검사유 행 표시', (tester) async {
      setView(tester);
      await pumpScreen(
        tester,
        SystemMaintenanceScreen(
          startAt: DateTime(2026, 5, 17, 2, 0),
          expiresAt: DateTime(2026, 5, 18, 6, 0),
          reason: '보안 업데이트',
        ),
      );
      expect(find.text('점검사유'), findsOneWidget);
      expect(find.text('보안 업데이트'), findsOneWidget);
    });

    testWidgets('reason 미주입 시 점검사유 행 숨김', (tester) async {
      setView(tester);
      await pumpScreen(
        tester,
        SystemMaintenanceScreen(
          startAt: DateTime(2026, 5, 17, 2, 0),
          expiresAt: DateTime(2026, 5, 18, 6, 0),
        ),
      );
      expect(find.text('점검사유'), findsNothing);
    });

    testWidgets('serverNow 와 다른 날 → 예상 완료에 MM.dd 접두(서버 시각 기준)',
        (tester) async {
      setView(tester);
      await pumpScreen(
        tester,
        SystemMaintenanceScreen(
          serverNow: DateTime(2026, 5, 17, 10, 0),
          expiresAt: DateTime(2026, 5, 18, 18, 0),
        ),
      );
      expect(find.textContaining('05.18 오후 06:00'), findsOneWidget);
    });

    testWidgets('serverNow 와 같은 날 → 예상 완료는 시간만(날짜 접두 없음)', (tester) async {
      setView(tester);
      await pumpScreen(
        tester,
        SystemMaintenanceScreen(
          serverNow: DateTime(2026, 5, 18, 9, 0),
          expiresAt: DateTime(2026, 5, 18, 18, 0),
        ),
      );
      expect(find.textContaining('오후 06:00'), findsOneWidget);
      expect(find.textContaining('05.18 오후'), findsNothing);
    });

    testWidgets('noticeDate 주입 시 공지 상세 카드에 날짜(yyyy.MM.dd) 표시', (tester) async {
      setView(tester);
      await pumpScreen(
        tester,
        SystemMaintenanceScreen(
          title: '정기 시스템 점검 안내',
          content: '점검 안내 본문입니다.',
          noticeDate: DateTime(2026, 5, 15),
        ),
      );
      expect(find.text('공지사항'), findsOneWidget);
      expect(find.text('정기 시스템 점검 안내'), findsOneWidget);
      expect(find.text('2026.05.15'), findsOneWidget);
    });
  });
}
