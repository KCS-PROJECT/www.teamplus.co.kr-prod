import 'dart:async';

import 'package:flutter/foundation.dart' show debugPrint;

import '../notification/push_notification_service.dart';
import '../webview/webview_cookie_sync.dart';
import 'token_storage.dart';

/// 로그아웃/세션 클리어 SoT (2026-07-28).
///
/// 토큰 삭제가 일어나는 모든 경로 — 브릿지 `auth.clearToken` · 네이티브 Drawer
/// 로그아웃 · 종료 확인(`AppExit.terminateWithSessionClear`) — 가 이 유틸을
/// 거친다. 개별 경로가 `clearAll()` 만 호출하면 WebView refresh 쿠키가 잔존해
/// 미들웨어가 stale 쿠키로 "세션 있음" 오판하고, FCM 디바이스 해제도 누락되는
/// 회귀가 재발하므로 반드시 이 함수를 사용한다.
class SessionCleaner {
  const SessionCleaner._();

  /// 세션을 완전히 클리어한다. 순서가 중요하다:
  ///
  ///  1) FCM 디바이스 서버 해제 — 인증 토큰이 유효한 동안에만 가능하므로 선행.
  ///  2) secure storage 전체 삭제 (authBundle 메모리 캐시 무효화 포함)
  ///  3) WebView refresh 쿠키 삭제 — 미들웨어 stale 세션 오판 방지
  ///  4) iOS 앱 아이콘 배지 클리어 (fire-and-forget)
  ///
  /// 각 단계는 독립 try/catch 라 한 단계 실패(오프라인·keystore 오류 등)가
  /// 다음 단계를 스킵시키지 않는다 — 로컬 로그아웃은 서버 도달 불가여도
  /// 반드시 완결되어야 한다.
  ///
  /// [stepTimeout] 이 주어지면 각 단계에 독립 타임아웃을 건다 — 앱 종료 직전
  /// 경로에서 platform channel hang 이 종료를 영영 막지 않도록.
  static Future<void> clearSession({Duration? stepTimeout}) async {
    Future<void> run(String label, Future<void> Function() step) async {
      try {
        var future = step();
        if (stepTimeout != null) {
          future = future.timeout(stepTimeout);
        }
        await future;
      } catch (e) {
        debugPrint('[SessionCleaner] $label 실패/타임아웃 — 무시하고 진행: $e');
      }
    }

    await run(
      'FCM 디바이스 해제',
      () => PushNotificationService().unregisterTokenFromServer(),
    );
    await run('secure storage 클리어', () => TokenStorage().clearAll());
    await run(
      'refresh 쿠키 삭제',
      () => WebViewCookieSync.syncRefreshToken(null),
    );
    unawaited(
      PushNotificationService().clearBadge().catchError((Object e) {
        debugPrint('[SessionCleaner] 배지 클리어 실패 — 무시: $e');
      }),
    );
  }
}
