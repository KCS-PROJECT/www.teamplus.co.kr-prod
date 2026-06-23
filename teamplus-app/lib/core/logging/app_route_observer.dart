// AppRouteObserver — GoRouter 활동 추적 (v8.6 P4-4, 2026-05-20)
//
// 경로 변경(push/pop/replace)마다 AppLogger.activity()로 PAGE_VIEW 기록.
// 기존 ActivityRecordingRouteObserver와 통합 또는 추가 등록 가능.
import 'package:flutter/widgets.dart';

import 'app_logger.dart';

class AppLogRouteObserver extends NavigatorObserver {
  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    super.didPush(route, previousRoute);
    _track('PAGE_PUSH', route, previousRoute);
  }

  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) {
    super.didPop(route, previousRoute);
    _track('PAGE_POP', route, previousRoute);
  }

  @override
  void didReplace({Route<dynamic>? newRoute, Route<dynamic>? oldRoute}) {
    super.didReplace(newRoute: newRoute, oldRoute: oldRoute);
    _track('PAGE_REPLACE', newRoute, oldRoute);
  }

  @override
  void didRemove(Route<dynamic> route, Route<dynamic>? previousRoute) {
    super.didRemove(route, previousRoute);
    _track('PAGE_REMOVE', route, previousRoute);
  }

  void _track(String action, Route<dynamic>? route, Route<dynamic>? prev) {
    try {
      final name = route?.settings.name ?? route?.settings.toString() ?? 'unknown';
      final prevName = prev?.settings.name ?? prev?.settings.toString();
      AppLogger.instance.activity(
        '$action $name',
        context: {
          'action': action,
          'route': name,
          'previousRoute': prevName,
        },
      );
    } catch (_) {/* swallow */}
  }
}
