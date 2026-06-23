// InitialDestinationGate — 시스템 점검 시작 차단 통합 테스트 (동적 공지)
//
// 검증: 앱 시작 시 점검 중이면 게이트가 M4(SystemMaintenanceScreen)를 표시하고
//       관리자가 등록한 제목·내용을 동적으로 보여주며, 다음 화면으로 넘어가지 않는다.
//       MaintenanceService 를 mock 으로 주입해 점검 ON 상태를 재현한다.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';
import 'package:teamplus_app/core/maintenance/maintenance_service.dart';
import 'package:teamplus_app/core/router/initial_destination.dart';
import 'package:teamplus_app/features/maintenance/presentation/screens/system_maintenance_screen.dart';

class _MockMaintenanceService extends Mock implements MaintenanceService {}

void main() {
  testWidgets(
    '점검 중이면 시작 게이트가 M4 화면에 등록 제목·내용을 표시하고 진입을 차단한다',
    (tester) async {
      final mock = _MockMaintenanceService();
      when(() => mock.check()).thenAnswer(
        (_) async => MaintenanceStatus(
          isUnderMaintenance: true,
          title: '긴급 서버 점검 안내',
          content: '02:00~06:00 시스템 점검이 진행됩니다.',
          startAt: DateTime(2026, 3, 6, 2, 0),
          expiresAt: DateTime(2026, 3, 6, 6, 0),
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [maintenanceServiceProvider.overrideWithValue(mock)],
          child: const MaterialApp(home: InitialDestinationGate()),
        ),
      );

      await tester.pump(); // didChangeDependencies + check() microtask
      await tester.pump(const Duration(milliseconds: 16));

      // M4 화면 + 관리자 제목/내용 동적 표시
      expect(find.byType(SystemMaintenanceScreen), findsOneWidget);
      expect(find.text('긴급 서버 점검 안내'), findsOneWidget);
      expect(find.text('02:00~06:00 시스템 점검이 진행됩니다.'), findsOneWidget);

      // 차단 모드 → "확인했어요" 버튼 없음(빠져나갈 경로 없음)
      expect(find.text('확인했어요'), findsNothing);

      verify(() => mock.check()).called(1);
    },
  );

  // 포그라운드 복귀 재게이트 검증 (2026-06-18).
  //
  // app.dart `_onAppResumed` 는 점검 활성 시 기존 단일 GoRouter 로
  // `go('/webview', extra:{'gateKey': UniqueKey()})` 하여 부팅 게이트를 새 key 로
  // 재진입시킨다. go_router 는 같은 location 의 MaterialPage 를 page key(경로 파생)로
  // 재사용하므로, State 재생성은 전적으로 **child 위젯 key(UniqueKey) 교체**에 의존한다.
  // 이 테스트는 그 핵심 메커니즘 — "같은 location 으로 새 gateKey 재진입 시 새 게이트
  // State 가 생성되어 MaintenanceService.check() 가 재실행되고 M4 가 유지된다" — 를
  // 자동 검증한다(정적 분석으로 못 잡는 page-reuse 경로 회귀 가드).
  testWidgets(
    '포그라운드 복귀 재게이트 — 새 gateKey 로 /webview 재진입 시 점검을 재검사하고 M4 를 유지한다',
    (tester) async {
      final mock = _MockMaintenanceService();
      var checkCount = 0;
      when(() => mock.check()).thenAnswer((_) async {
        checkCount++;
        return const MaintenanceStatus(
          isUnderMaintenance: true,
          title: '긴급 서버 점검 안내',
          content: '점검이 진행 중입니다.',
        );
      });

      // 프로덕션 app_router.dart `/webview` builder 의 게이트 분기를 미러링:
      //   extras 에 url 이 없으면 InitialDestinationGate(key: extras['gateKey']).
      final router = GoRouter(
        initialLocation: '/webview',
        routes: [
          GoRoute(
            path: '/webview',
            builder: (context, state) {
              final extras = state.extra as Map<String, dynamic>?;
              return InitialDestinationGate(key: extras?['gateKey'] as Key?);
            },
          ),
        ],
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [maintenanceServiceProvider.overrideWithValue(mock)],
          child: MaterialApp.router(routerConfig: router),
        ),
      );
      await tester.pump(); // didChangeDependencies + check() microtask
      await tester.pump(const Duration(milliseconds: 16));

      // 최초 진입(부팅 게이트, gateKey=null) → check #1 → M4 고정
      expect(find.byType(SystemMaintenanceScreen), findsOneWidget);
      expect(checkCount, 1);

      // 포그라운드 복귀 재게이트: 같은 location 을 새 UniqueKey 로 재진입
      router.go('/webview', extra: {'gateKey': UniqueKey()});
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 16));

      // 새 게이트 State 생성 → check() 재실행 → 여전히 M4 고정(진입 불가)
      expect(checkCount, 2);
      expect(find.byType(SystemMaintenanceScreen), findsOneWidget);

      // 한 번 더 재게이트 → 매번 새 State 로 check() 재실행됨을 확인
      router.go('/webview', extra: {'gateKey': UniqueKey()});
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 16));

      expect(checkCount, 3);
      expect(find.byType(SystemMaintenanceScreen), findsOneWidget);
    },
  );
}
