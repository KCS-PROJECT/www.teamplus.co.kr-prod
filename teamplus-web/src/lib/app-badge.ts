/**
 * 앱 아이콘 배지 동기화 브릿지 (Flutter WebView 전용).
 *
 * iOS 앱 아이콘 배지는 FCM `aps.badge` 로 올라가지만, 내리는 경로는 네이티브
 * `notification.syncBadge`/`clearBadge` 브릿지 호출뿐이다. 웹이 알림을 읽어
 * 미읽음 카운트가 변할 때마다 이 헬퍼로 네이티브 배지를 맞춘다.
 *
 * 네이티브 핸들러: teamplus-app lib/core/webview/webview_bridge_handlers.dart
 *   `_handleNotificationRequestImpl` — 'syncBadge'(count 지정) / 'clearBadge'(0).
 *   Android 는 네이티브가 no-op(런처 의존) 이므로 호출해도 무해하다.
 *
 * 웹 브라우저(비 WebView) 환경에서는 조용히 무시된다.
 */

export async function syncAppBadge(count: number): Promise<void> {
  try {
    if (typeof window === 'undefined') return;
    const bridge = window.flutter_inappwebview;
    if (!bridge || typeof bridge.callHandler !== 'function') return;
    const safeCount = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
    await bridge.callHandler('notification', {
      action: 'syncBadge',
      count: safeCount,
    });
  } catch {
    // 브릿지 미연결/응답 실패 — 배지는 다음 동기화(푸시 aps.badge·앱 resume)에서 보정
  }
}

export async function clearAppBadge(): Promise<void> {
  try {
    if (typeof window === 'undefined') return;
    const bridge = window.flutter_inappwebview;
    if (!bridge || typeof bridge.callHandler !== 'function') return;
    await bridge.callHandler('notification', { action: 'clearBadge' });
  } catch {
    // 브릿지 미연결 — 무시
  }
}
