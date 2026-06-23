/**
 * native-bridge UI 제어 모듈 — C-1 분리 2026-06-07
 */
import { getBridge, addMessageListener, callUIBridge } from "./native-bridge-core";
import type { UIConfig, DeviceInfo, AppBarEventHandler } from "./native-bridge-core";
import { computeScreenBreakpoint } from "./native-bridge-screens";
import { isFlutterBridgeAvailable, isNativeApp } from "@/lib/environment";
import { handleBridgeError } from "./bridge-error-handler";


// 🛡️ 풀스크린 lifecycle 자동 추적 (2026-05-08)
//
// BottomNav 탭 전환 시 LoadingContext 가 ui.enterFullscreen() 을 호출해 status
// bar 를 숨기지만, 페이지가 자체적으로 useNativeUI({ showStatusBar: true }) 를
// 호출하면 setConfig 가 status bar 를 다시 켜서 사용자가 LoadingPuck 위로
// 시계/Wi-Fi/배터리가 노출되는 보고를 받았다.
//
// 해결: native-bridge 에서 풀스크린 활성 상태를 추적하고, 활성 중에는 setConfig
// 의 showStatusBar 를 자동으로 false 로 override 한다. stopLoading 호출 시
// 자동 exitFullscreen 까지 트리거해 페이지 fetch 완료 시점에 status bar 가
// 자연스럽게 복원되는 lifecycle 을 native-bridge 단에서 일원화한다.
let _isFullscreenActive = false;
let _nativeLoadingStartedAt: number | null = null;
// [2026-05-09] 2000 → 300 단축. 사용자 보고: iOS 시뮬레이터에서 status bar 가
//   화면 렌딩 후 2-3초 후에야 노출되는 현상.
//   원인: ui.stopLoading() 이 NATIVE_LOADING_MIN_DURATION_MS 만큼 대기 후
//   exitFullscreen 을 발사하기 때문. LoadingContext.MIN_SHOW_DURATION(300ms) 과 정합.
const NATIVE_LOADING_MIN_DURATION_MS = 300;

// 🛡️ [appstatus-fix F1] 풀스크린 가드 실패안전 만료 타이머 (2026-06-18)
//
// `_isFullscreenActive` 가드는 stopLoading/exitFullscreen 이 호출되어야만 해제된다.
// 그러나 isDataLoaded 페이지의 fetch 실패/행 또는 stopLoading 누락 시 가드가 영구
// true 로 고착되어 모든 setConfig({showStatusBar:true}) 가 false 로 다운그레이드 →
// 상태바 영구 숨김(FM1)이 발생했다. LoadingContext MAX_WAIT(5000ms) 와 정합하는
// 실패안전 만료 타이머로, 정상 해제 신호가 어떤 이유로든 오지 않아도 가드가 자동
// 해제되도록 보장한다 → 가드는 절대 영구 고착될 수 없다.
const FULLSCREEN_GUARD_MAX_MS = 5000;
let _fullscreenGuardTimer: ReturnType<typeof setTimeout> | null = null;

function clearFullscreenGuardTimer(): void {
  if (_fullscreenGuardTimer !== null) {
    clearTimeout(_fullscreenGuardTimer);
    _fullscreenGuardTimer = null;
  }
}

/**
 * 풀스크린 가드를 활성화하고 실패안전 만료 타이머를 arm 한다.
 * 만료 시 `_isFullscreenActive` 를 자동 false 로 해제 → 가드가 영구 고착될 수 없다(FM1).
 * `exitFullscreen`/`stopLoading` 에서 `clearFullscreenGuardTimer()` 로 해제/리셋한다.
 */
function armFullscreenGuard(): void {
  _isFullscreenActive = true;
  clearFullscreenGuardTimer();
  if (typeof window === "undefined") return;
  _fullscreenGuardTimer = setTimeout(() => {
    _isFullscreenActive = false;
    _fullscreenGuardTimer = null;
  }, FULLSCREEN_GUARD_MAX_MS);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * UI 제어 기능 (상태바, AppBar, BottomNav)
 *
 * @example
 * await ui.enterFullscreen();
 * await ui.hideBottomNav();
 * await ui.setConfig({ showAppBar: true, appBarTitle: '상세' });
 */
export const ui = {
  async setConfig(
    config: UIConfig,
  ): Promise<{ applied: boolean; config: UIConfig }> {
    // 🛡️ 풀스크린 활성 중이면 showStatusBar 를 false 로 강제 override.
    //   페이지의 useNativeUI({ showStatusBar: true }) 호출에서도 fetch 완료 전
    //   (= LoadingContext 가 stopLoading 호출 전) 에는 status bar 가 켜지지 않도록 보장.
    const safeConfig: UIConfig = _isFullscreenActive
      ? { ...config, showStatusBar: false }
      : config;

    try {
      const bridge = getBridge();
      return await bridge.ui.setConfig(safeConfig);
    } catch (error) {
      handleBridgeError(
        "ui",
        {
          code: "UI_CONFIG_ERROR",
          message: error instanceof Error ? error.message : String(error),
        },
        { operation: "setConfig", config: safeConfig },
      );
      return { applied: false, config: safeConfig };
    }
  },

  showStatusBar: () =>
    callUIBridge("showStatusBar", "UI_STATUSBAR_ERROR", (r) => r.showStatusBar),
  hideStatusBar: () =>
    callUIBridge(
      "hideStatusBar",
      "UI_STATUSBAR_ERROR",
      (r) => !r.showStatusBar,
    ),
  showAppBar: (title?: string) =>
    callUIBridge("showAppBar", "UI_APPBAR_ERROR", (r) => r.showAppBar, title),
  hideAppBar: () =>
    callUIBridge("hideAppBar", "UI_APPBAR_ERROR", (r) => !r.showAppBar),
  showBottomNav: () =>
    callUIBridge("showBottomNav", "UI_BOTTOMNAV_ERROR", (r) => r.showBottomNav),
  hideBottomNav: () =>
    callUIBridge(
      "hideBottomNav",
      "UI_BOTTOMNAV_ERROR",
      (r) => !r.showBottomNav,
    ),
  enterFullscreen: async () => {
    // 동기적 flag set + 실패안전 타이머 arm (F1) — 후속 setConfig 호출이 즉시
    // override 적용되며, 정상 해제 신호 누락 시에도 FULLSCREEN_GUARD_MAX_MS 후 자동 해제.
    armFullscreenGuard();
    return callUIBridge(
      "enterFullscreen",
      "UI_FULLSCREEN_ERROR",
      (r) => r.fullscreen,
    );
  },
  exitFullscreen: async () => {
    // 실패안전 타이머 clear + 가드 해제 (F1).
    clearFullscreenGuardTimer();
    _isFullscreenActive = false;
    return callUIBridge(
      "exitFullscreen",
      "UI_FULLSCREEN_ERROR",
      (r) => !r.fullscreen,
    );
  },

  /**
   * 🛡️ [appstatus-fix F1] 가드를 무시하고 상태바를 강제 표시한다 (2026-06-18).
   *
   * `_isFullscreenActive` 가드와 실패안전 타이머를 즉시 해제한 뒤
   * `setConfig({ showStatusBar: true })` 를 native 로 전송한다. 가드가 이미 false 가
   * 되었으므로 setConfig 의 자동 다운그레이드(line 49-51)를 거치지 않고 그대로 적용된다.
   * AppStatusController(F2) · useNativeUI isDataLoaded 실패안전(F3)이 사용해, 느린
   * 로딩으로 show 가 영구히 삼켜지는 경로(FM2)를 차단한다.
   *
   * ⚠️ 호출 시점 주의: 이 함수는 가드를 우회하므로 **활성 로더 위로 상태바를 노출**시킬
   *   수 있다. 반드시 **로더 실제 unmount 상한(≈6832ms = MAX_WAIT 5000 +
   *   FONTS_READY_TIMEOUT 1500 + 2RAF + FADE_OUT 300) 이후** 시점에서만 호출해야 한다
   *   (호출처 AppStatusController·useNativeUI 가 7000ms tick 으로 시점 보장). 정당한 풀스크린 페이지
   *   (갤러리 뷰어·force-update)는 `lib/app-status.ts` 의 skip 목록으로 컨트롤러
   *   force-show 자체가 제외된다(F4).
   *
   * @returns setConfig 결과 ({ applied, config })
   */
  async forceShowStatusBar(): Promise<{
    applied: boolean;
    config: UIConfig;
  }> {
    clearFullscreenGuardTimer();
    _isFullscreenActive = false;
    return this.setConfig({ showStatusBar: true });
  },

  /**
   * WebView 첫 paint 완료 신호 — Flutter native_splash hide 트리거.
   *
   * SPEC: claudedocs/SPEC_LOADER_IMPECCABLE_2026-05-20.md §3.4
   * Flutter contract: `webview_bridge.dart` `_handleUIRequest` 의
   *   `case 'signalFirstPaint'` → `removeNativeSplashOnce(trigger: 'web-signal')`.
   * 응답: `{ success: true, data: { splashRemoved: true } }`.
   *
   * - 구 Flutter 빌드(signalFirstPaint 미구현)에서는 unknown action 에러 응답.
   *   호출부는 catch 후 silent — main.dart 의 5초 failsafe 가 splash 를 처리한다.
   * - `bridge.ui` JS 래퍼가 아직 메서드를 노출하지 않으므로 `flutter_inappwebview.
   *   callHandler` 직접 호출 패턴(auth.requireLogin 과 동일)으로 구현.
   * - 2 RAF 후 호출이 권장 — ClientProviders mount 시점에 처리.
   *
   * @returns splashRemoved=true 면 true, 그 외 false (실패도 false — main.dart
   *   failsafe 가 처리하므로 throw 하지 않음)
   */
  signalFirstPaint: async (): Promise<boolean> => {
    try {
      if (
        typeof window === "undefined" ||
        typeof window.flutter_inappwebview?.callHandler !== "function"
      ) {
        return false;
      }
      const result = (await window.flutter_inappwebview!.callHandler("ui", {
        action: "signalFirstPaint",
      })) as { success?: boolean; data?: { splashRemoved?: boolean } } | null;
      return Boolean(result?.data?.splashRemoved);
    } catch (error) {
      // 구 빌드 호환 — error 발생해도 main.dart 5초 failsafe 가 splash 를 hide
      handleBridgeError(
        "ui",
        {
          code: "UI_SIGNAL_FIRST_PAINT_ERROR",
          message: error instanceof Error ? error.message : String(error),
        },
        { operation: "signalFirstPaint" },
      );
      return false;
    }
  },

  startLoading: () => {
    _nativeLoadingStartedAt ??= Date.now();
    // [appstatus-fix F1] 로딩 시작 = 상태바 숨김 의도(native startLoading 핸들러가
    //   showStatusBar:false 적용)와 정합하도록 web 가드도 활성화 + 실패안전 타이머 arm.
    //   stopLoading 누락 시에도 FULLSCREEN_GUARD_MAX_MS 후 자동 해제(FM1).
    armFullscreenGuard();
    return callUIBridge("startLoading", "UI_LOADING_ERROR", (r) => r.loading);
  },

  /**
   * Native InAppWebView Pull-to-Refresh 활성/비활성 직접 제어 (2026-05-13 — 이슈 D15).
   *
   * @param enabled `true` → 강제 활성화, `false` → 강제 비활성화
   * @returns 적용된 enabled 값 (boolean)
   *
   * @example
   * ```ts
   * // 페이지 mount 시 자체 새로고침 UX 와 충돌 방지
   * useEffect(() => {
   *   ui.setPullToRefresh(false);
   * }, []);
   * ```
   *
   * @remarks
   * `useNativeUI({ pullToRefreshEnabled })` 와 동일한 효과 — useNativeUI 를 거치지 않고
   * 명령형으로 즉시 적용하고 싶을 때 사용. native 미가용(웹 브라우저) 환경에서는
   * `false` 반환 후 no-op.
   */
  setPullToRefresh: (enabled: boolean) =>
    callUIBridge(
      "setPullToRefresh",
      "UI_PULL_TO_REFRESH_ERROR",
      (r) => r.enabled,
      enabled,
    ),
  stopLoading: async () => {
    // 자동 풀스크린 종료 — useNativeUI(isDataLoaded=true) → stopLoading 한 번
    // 호출만으로 status bar 가 자연스럽게 복원되도록 lifecycle 일원화.
    //
    // 동기적 flag 먼저 clear → 직후 호출되는 applyConfig(uiConfig) 의 setConfig
    // 가 정상적인 showStatusBar:true 를 native 에 전달.
    const wasFullscreen = _isFullscreenActive;
    // [appstatus-fix F1] 정상 종료 — 실패안전 타이머 clear + 가드 해제.
    clearFullscreenGuardTimer();
    _isFullscreenActive = false;

    if (_nativeLoadingStartedAt !== null) {
      const elapsed = Date.now() - _nativeLoadingStartedAt;
      const remaining = Math.max(0, NATIVE_LOADING_MIN_DURATION_MS - elapsed);
      if (remaining > 0) {
        await wait(remaining);
      }
    }

    if (typeof window !== "undefined" && window.performance?.mark) {
      window.performance.mark("teamplus.web_app_ready");
    }

    const result = callUIBridge(
      "stopLoading",
      "UI_LOADING_ERROR",
      (r) => !r.loading,
    );
    _nativeLoadingStartedAt = null;

    if (wasFullscreen) {
      // exitFullscreen 도 같이 발사 (fire-and-forget) — Flutter 측 UIConfig 의
      // showStatusBar:true 등 풀스크린 해제 후 기본값 복원.
      callUIBridge(
        "exitFullscreen",
        "UI_FULLSCREEN_ERROR",
        (r) => !r.fullscreen,
      ).catch(() => {});
    }

    return result;
  },

  onConfigChange(handler: (config: UIConfig) => void): void {
    try {
      const bridge = getBridge();
      bridge.ui.onConfigChange(handler);
    } catch (error) {
      handleBridgeError(
        "ui",
        {
          code: "UI_LISTENER_ERROR",
          message: error instanceof Error ? error.message : String(error),
        },
        { operation: "onConfigChange" },
      );
    }
  },

  /**
   * 디바이스 metrics 변경 push 리스너 (2026-05-09 신규).
   *
   * Flutter `WidgetsBindingObserver.didChangeMetrics` 콜백이 트리거 →
   * `sendDeviceMetricsToWeb` → `window.flutterBridge.onMessage` →
   * dispatcher → 본 listener.
   *
   * `subscribeToDeviceMetrics` 가 내부적으로 본 메서드를 호출하므로 컴포넌트는
   * 직접 호출할 필요 없음.
   *
   * @returns unsubscribe 함수
   */
  onDeviceMetricsChange(handler: (info: DeviceInfo) => void): () => void {
    if (typeof window === "undefined") return () => {};
    return addMessageListener((messageJson) => {
      try {
        const message = JSON.parse(messageJson);
        if (
          message?.type === "ui" &&
          message?.data?.action === "deviceMetricsChanged" &&
          message?.data?.info
        ) {
          handler(message.data.info as DeviceInfo);
        }
      } catch {
        // ignore parse errors — 다른 listener 가 처리
      }
    });
  },

  /**
   * AppBar 버튼 이벤트 리스너 등록.
   *
   * 2026-04-22 (SPEC_NATIVE_BRIDGE_REFACTOR · P2-1): 반환 타입을
   * `void` → `() => void` (unsubscribe) 로 변경. 여러 화면이 동시에 리스너를 등록해도
   * 마지막 등록만 살아남던 전역 단일 핸들러 stomp 문제를 호출측에서 방어 가능.
   * React effect cleanup 에서 반환값을 호출해 누수 방지.
   *
   * @example
   * useEffect(() => {
   *   const unsub = ui.onAppBarEvent((eventType) => {
   *     if (eventType === 'back') router.back();
   *   });
   *   return () => unsub();
   * }, []);
   */
  onAppBarEvent(handler: AppBarEventHandler): () => void {
    const noop = () => {
      /* native bridge 미탑재 또는 에러 시 안전한 no-op unsubscribe */
    };
    try {
      const bridge = getBridge();
      bridge.ui.onAppBarEvent(handler);
      // Native 측 Bridge 는 currently unsubscribe API 미제공 — noop 반환.
      // 향후 Native 가 `offAppBarEvent(handler)` 지원 시 이 위치에서 호출.
      return noop;
    } catch (error) {
      handleBridgeError(
        "ui",
        {
          code: "UI_LISTENER_ERROR",
          message: error instanceof Error ? error.message : String(error),
        },
        { operation: "onAppBarEvent" },
      );
      return noop;
    }
  },

  // ─── Sprint 5: 공유 / 앱 버전 / 푸시 권한 ───
  // native 핸들러가 아직 미탑재된 Flutter 앱을 위해 존재 여부를 먼저 체크한다.

  /**
   * 네이티브 공유 시트 열기.
   * - Flutter 앱이 `ui.share`를 구현했을 때만 호출된다.
   * - 미구현이면 `available: false` 반환 → 웹 폴백 사용.
   */
  async share(payload: {
    title?: string;
    text?: string;
    url?: string;
  }): Promise<{ available: boolean; shared: boolean }> {
    try {
      const bridge = getBridge();
      if (typeof bridge.ui.share !== "function") {
        return { available: false, shared: false };
      }
      const result = await bridge.ui.share(payload);
      return { available: true, shared: !!result?.shared };
    } catch (error) {
      handleBridgeError(
        "ui",
        {
          code: "UI_SHARE_ERROR",
          message: error instanceof Error ? error.message : String(error),
        },
        { operation: "share", payload },
      );
      return { available: false, shared: false };
    }
  },

  /**
   * 네이티브 앱 버전 조회.
   * - native 미구현이면 null 반환 → 웹은 env 변수를 쓴다.
   */
  async getAppVersion(): Promise<{
    version: string;
    build?: string;
    platform: "ios" | "android";
  } | null> {
    try {
      const bridge = getBridge();
      if (typeof bridge.ui.getAppVersion !== "function") {
        return null;
      }
      return await bridge.ui.getAppVersion();
    } catch (error) {
      handleBridgeError(
        "ui",
        {
          code: "UI_GET_APP_VERSION_ERROR",
          message: error instanceof Error ? error.message : String(error),
        },
        { operation: "getAppVersion" },
      );
      return null;
    }
  },

  /**
   * 푸시 알림 권한 요청.
   * - native 미구현이면 `{ available: false, granted: false }` 반환.
   */
  async requestNotificationPermission(): Promise<{
    available: boolean;
    granted: boolean;
  }> {
    try {
      const bridge = getBridge();
      if (typeof bridge.ui.requestNotificationPermission !== "function") {
        return { available: false, granted: false };
      }
      const result = await bridge.ui.requestNotificationPermission();
      return { available: true, granted: !!result?.granted };
    } catch (error) {
      handleBridgeError(
        "ui",
        {
          code: "UI_NOTIFICATION_PERMISSION_ERROR",
          message: error instanceof Error ? error.message : String(error),
        },
        { operation: "requestNotificationPermission" },
      );
      return { available: false, granted: false };
    }
  },

  /**
   * 디바이스 해상도/Safe Area 조회 (2026-05-08 신규).
   *
   * Android WebView 에서 `env(safe-area-inset-bottom)` 이 0px 로 평가되어
   * BottomNav 가 navigation/indicator 영역을 침범하는 문제 해결용. Flutter
   * `MediaQuery.padding` 값을 logical pixels(CSS px) 로 반환.
   *
   * - native 미구현 (브라우저 환경) 이면 null 반환 → 호출부는 `env(safe-area-inset-*)` 폴백.
   * - 회전·키보드 등 변화 시 재호출 권장 (자동 푸시 미지원, on-demand polling).
   *
   * @example
   * const info = await ui.getDeviceInfo();
   * if (info) {
   *   document.documentElement.style.setProperty(
   *     '--safe-area-inset-bottom',
   *     `${info.safeArea.bottom}px`,
   *   );
   * }
   */
  async getDeviceInfo(): Promise<DeviceInfo | null> {
    try {
      if (typeof window === "undefined") return null;
      // 웹 브라우저(비 WebView) 환경에선 Flutter 브릿지 미존재가 '정상'이다.
      // getBridge() 는 이 경우 throw 하므로, 사전 가드로 조용히 null 반환하여
      // bridge-error 로그(UI_GET_DEVICE_INFO_ERROR)가 찍히지 않게 한다.
      // 호출부(applyDeviceInsetsToCss)는 null 시 env(safe-area-inset-*) 로 폴백.
      if (!isFlutterBridgeAvailable()) return null;
      const bridge = getBridge();
      if (typeof bridge.ui.getDeviceInfo !== "function") {
        return null;
      }
      const info = await bridge.ui.getDeviceInfo();
      return info ?? null;
    } catch (error) {
      handleBridgeError(
        "ui",
        {
          code: "UI_GET_DEVICE_INFO_ERROR",
          message: error instanceof Error ? error.message : String(error),
        },
        { operation: "getDeviceInfo" },
      );
      return null;
    }
  },

  /**
   * 디바이스 Safe Area 값을 CSS 변수로 주입 (2026-05-08 신규).
   *
   * `--safe-area-inset-{top|bottom|left|right}` CSS 변수를 `<html>` 에 설정하여
   * 전역 스타일·컴포넌트가 정확한 navigation/indicator 영역 padding 을 적용하도록 함.
   * Android WebView 에서 `env(safe-area-inset-bottom)` 이 0px 로 평가되는 문제 해결.
   *
   * - native 미구현 (브라우저 환경) 이면 no-op → 기본 `env()` fallback 유지.
   * - 단일 호출만으로 충분 (앱 마운트 시점 1회). 회전 시 재호출 가능.
   *
   * @returns 적용된 DeviceInfo 또는 null (native 미구현)
   *
   * @example
   * // ClientProviders 마운트 시 1회 호출
   * useEffect(() => { ui.applyDeviceInsetsToCss(); }, []);
   */
  async applyDeviceInsetsToCss(): Promise<DeviceInfo | null> {
    const info = await this.getDeviceInfo();
    if (!info || typeof document === "undefined") return info;

    // Android fallback (2026-05-08 v2) — Bridge 가 정상 작동하지만 일부 Android
    // 디바이스/Flutter 환경 (gesture navigation 모드 등) 에서 viewPadding.bottom 이
    // 매우 작거나 0px 로 보고되어 BottomNav 가 system indicator 영역으로 잘리는
    // 회귀가 보고됨. 안전 minimum 24px 보장 → 잘림 차단.
    // (iOS 다이나믹 아일랜드/홈 인디케이터는 padding.bottom ~34px 정상 보고하므로
    //  fallback 불필요).
    // Flutter WebViewScreen already reserves the top status-bar area outside
    // the WebView using MediaQuery.viewPadding.top. If the Web layer also
    // applies the native top inset, iOS content jumps down when this async
    // bridge response arrives after first paint.
    const safeTop = 0;
    const ANDROID_MIN_BOTTOM_INSET = 24;
    let safeBottom = info.safeArea.bottom;
    if (info.platform === "android" && safeBottom < ANDROID_MIN_BOTTOM_INSET) {
      safeBottom = ANDROID_MIN_BOTTOM_INSET;
    }

    const root = document.documentElement;
    root.style.setProperty("--safe-area-inset-top", `${safeTop}px`);
    root.style.setProperty("--safe-area-inset-bottom", `${safeBottom}px`);
    root.style.setProperty("--safe-area-inset-left", `${info.safeArea.left}px`);
    root.style.setProperty(
      "--safe-area-inset-right",
      `${info.safeArea.right}px`,
    );
    // 화면 크기·DPR·플랫폼 정보 → CSS 변수 (전역 autolayout SoT, 2026-05-09 v2).
    //   sub-page 와 컴포넌트는 var(--screen-width-px) / var(--device-orientation)
    //   등을 참조하여 디바이스 단위 자동 적응 레이아웃 구현.
    root.style.setProperty("--screen-width", `${info.screen.width}px`);
    root.style.setProperty("--screen-height", `${info.screen.height}px`);
    // unitless 변수 (calc/min/max 식 안에서 산술용도)
    root.style.setProperty("--screen-width-px", String(info.screen.width));
    root.style.setProperty("--screen-height-px", String(info.screen.height));
    root.style.setProperty(
      "--viewport-width",
      `${info.screen.width - info.viewInsets.left - info.viewInsets.right}px`,
    );
    root.style.setProperty(
      "--viewport-height",
      `${info.screen.height - info.viewInsets.top - info.viewInsets.bottom}px`,
    );
    root.style.setProperty(
      "--device-pixel-ratio",
      String(info.devicePixelRatio),
    );
    root.style.setProperty("--device-orientation", `"${info.orientation}"`);
    root.style.setProperty("--device-platform", `"${info.platform}"`);
    // 키보드 등 가변 inset (visualViewport 폴백과 정합)
    root.style.setProperty(
      "--keyboard-inset-bottom",
      `${info.viewInsets.bottom}px`,
    );
    root.dataset.nativePlatform = info.platform;
    root.dataset.orientation = info.orientation;
    // Breakpoint 데이터 속성 — CSS attribute selector 로 분기 가능
    //   [data-screen-bp="xs"] · [data-screen-bp="sm"] · ...
    root.dataset.screenBp = computeScreenBreakpoint(info.screen.width);
    return {
      ...info,
      safeArea: { ...info.safeArea, top: safeTop, bottom: safeBottom },
    };
  },

  /**
   * 화면 metrics 자동 동기화 구독 (2026-05-09 신규).
   *
   * Native 환경: Flutter `didChangeMetrics` push event 를 listen 하여 `applyDeviceInsetsToCss` 재호출.
   * Web 환경: `window.resize` + `orientationchange` + `visualViewport.resize` 를 listen 하여
   *   브라우저에서도 동일한 CSS 변수가 갱신되도록 폴백 — Flutter 미설치 환경(웹 직접 접근,
   *   Admin Desktop)도 동일 autolayout 변수 사용 가능.
   *
   * 호출처: `ClientProviders.tsx` 의 SetupNativeIntegration 1회 마운트.
   *
   * @returns unsubscribe 함수 (effect cleanup 에서 호출)
   *
   * @example
   * useEffect(() => {
   *   const unsub = ui.subscribeToDeviceMetrics();
   *   return () => unsub();
   * }, []);
   */
  subscribeToDeviceMetrics(): () => void {
    if (typeof window === "undefined") return () => {};

    let disposed = false;
    let pendingFrame = 0;

    const apply = (): void => {
      if (disposed) return;
      if (pendingFrame) cancelAnimationFrame(pendingFrame);
      pendingFrame = requestAnimationFrame(() => {
        pendingFrame = 0;
        if (isNativeApp()) {
          // Native: Flutter MediaQuery 기반 (정확)
          this.applyDeviceInsetsToCss().catch(() => {});
        } else {
          // Web fallback: visualViewport / window 기반
          applyWebViewportToCss();
        }
      });
    };

    // 초기 1회 적용
    apply();

    // Native: Flutter 가 push 하는 deviceMetricsChanged 이벤트 listen.
    //   `onDeviceMetricsChange` 는 dispatcher 기반이므로 bridge 미주입 환경(웹 브라우저)
    //   에서도 안전하게 noop unsubscribe 를 반환 → try/catch 불필요.
    const unsubscribeNative = this.onDeviceMetricsChange(() => apply());

    // Web fallback 이벤트 리스너 (Native 환경에서도 보조)
    // eslint-disable-next-line no-restricted-syntax -- deviceMetrics SoT 구현체(단일 진입점)라 직접 window 접근 정당
    window.addEventListener("resize", apply, { passive: true });
    // eslint-disable-next-line no-restricted-syntax -- deviceMetrics SoT 구현체(단일 진입점)라 직접 window 접근 정당
    window.addEventListener("orientationchange", apply, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", apply, {
        passive: true,
      });
    }

    return () => {
      disposed = true;
      if (pendingFrame) cancelAnimationFrame(pendingFrame);
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", apply);
      }
      unsubscribeNative();
    };
  },

  /**
   * 키보드 표시/숨김 변화 구독 (2026-05-09 신규 · SPEC_LOGIN_KEYBOARD).
   *
   * `subscribeToDeviceMetrics` 가 이미 단일 진입점으로 `--keyboard-inset-bottom`
   * CSS 변수를 갱신하지만, 폼 컴포넌트가 키보드 표시/숨김 시점에만 반응하고 싶을 때
   * (예: 활성 input scrollIntoView, BottomNav 임시 숨김 트리거) 본 헬퍼를 사용한다.
   *
   * 동작:
   *   - Native 환경: `onDeviceMetricsChange` listener 가 `info.viewInsets.bottom` 의
   *     0 → 양수 / 양수 → 0 전환을 감지하여 `visible` / `hidden` event 호출.
   *   - Web fallback (브라우저): `window.visualViewport.resize` listener 가
   *     `window.innerHeight - visualViewport.height` 차이로 동일 판정.
   *
   * 재구독 책임: 호출측 (React effect cleanup) — 본 함수는 unsubscribe 반환.
   *
   * @param handler - `{ visible, height }` 콜백
   * @returns unsubscribe 함수
   *
   * @example
   * useEffect(() => {
   *   const unsub = ui.onKeyboardChange(({ visible, height }) => {
   *     if (visible) {
   *       document.activeElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
   *     }
   *   });
   *   return () => unsub();
   * }, []);
   */
  onKeyboardChange(
    handler: (event: { visible: boolean; height: number }) => void,
  ): () => void {
    if (typeof window === "undefined") return () => {};

    // 키보드 임계값 — viewInsets.bottom < 80px 는 system gesture indicator 등
    // 영구 inset 으로 간주하지 않고 키보드로 판정. iOS Safari 의 toolbar 변화 대비.
    const KEYBOARD_THRESHOLD_PX = 80;
    let lastVisible = false;

    const evaluate = (rawHeight: number): void => {
      const visible = rawHeight > KEYBOARD_THRESHOLD_PX;
      // 같은 상태 반복 호출 방지 (height 변화는 visible 일 때만 forward)
      if (visible !== lastVisible || (visible && rawHeight !== 0)) {
        lastVisible = visible;
        try {
          handler({ visible, height: visible ? rawHeight : 0 });
        } catch {
          // handler 내부 에러는 다른 listener 영향 차단
        }
      }
    };

    // Native push (Flutter MediaQuery 기반 — 정확)
    const unsubscribeNative = this.onDeviceMetricsChange((info) => {
      evaluate(info.viewInsets?.bottom ?? 0);
    });

    // Web fallback — visualViewport 기반
    let pendingFrame = 0;
    const handleViewportChange = (): void => {
      if (pendingFrame) cancelAnimationFrame(pendingFrame);
      pendingFrame = requestAnimationFrame(() => {
        pendingFrame = 0;
        // eslint-disable-next-line no-restricted-syntax -- deviceMetrics SoT 구현체(키보드 inset 산출)라 직접 window 접근 정당
        const visualH = window.visualViewport?.height ?? window.innerHeight;
        // eslint-disable-next-line no-restricted-syntax -- deviceMetrics SoT 구현체(키보드 inset 산출)라 직접 window 접근 정당
        const diff = Math.max(0, window.innerHeight - visualH);
        evaluate(diff);
      });
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleViewportChange, {
        passive: true,
      });
      window.visualViewport.addEventListener("scroll", handleViewportChange, {
        passive: true,
      });
    } else {
      // visualViewport 미지원 (구형 Android) → resize 이벤트 폴백
      // eslint-disable-next-line no-restricted-syntax -- deviceMetrics SoT 구현체(단일 진입점)라 직접 window 접근 정당
      window.addEventListener("resize", handleViewportChange, {
        passive: true,
      });
    }

    return () => {
      if (pendingFrame) cancelAnimationFrame(pendingFrame);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener(
          "resize",
          handleViewportChange,
        );
        window.visualViewport.removeEventListener(
          "scroll",
          handleViewportChange,
        );
      } else {
        window.removeEventListener("resize", handleViewportChange);
      }
      unsubscribeNative();
    };
  },
};

// ─── Web fallback metrics → CSS 변수 ────────────────────────────────
//   Native 미탑재 환경(웹 브라우저, 데스크탑 Admin)에서도 동일 autolayout
//   CSS 변수를 사용할 수 있도록 보장.
function applyWebViewportToCss(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  // eslint-disable-next-line no-restricted-syntax -- web fallback metrics SoT 산출부라 직접 window 접근 정당
  const w = window.visualViewport?.width ?? window.innerWidth;
  // eslint-disable-next-line no-restricted-syntax -- web fallback metrics SoT 산출부라 직접 window 접근 정당
  const h = window.visualViewport?.height ?? window.innerHeight;
  const dpr = window.devicePixelRatio || 1;
  const orientation: "portrait" | "landscape" =
    w > h ? "landscape" : "portrait";

  root.style.setProperty("--screen-width", `${w}px`);
  root.style.setProperty("--screen-height", `${h}px`);
  root.style.setProperty("--screen-width-px", String(w));
  root.style.setProperty("--screen-height-px", String(h));
  root.style.setProperty("--viewport-width", `${w}px`);
  root.style.setProperty("--viewport-height", `${h}px`);
  root.style.setProperty("--device-pixel-ratio", String(dpr));
  root.style.setProperty("--device-orientation", `"${orientation}"`);
  // Keyboard 가림 (visualViewport 차이) 추정
  // eslint-disable-next-line no-restricted-syntax -- web fallback metrics SoT 산출부라 직접 window 접근 정당
  const keyboardBottom = Math.max(0, window.innerHeight - h);
  root.style.setProperty("--keyboard-inset-bottom", `${keyboardBottom}px`);
  root.dataset.orientation = orientation;
  root.dataset.screenBp = computeScreenBreakpoint(w);
}

// ─── 화면 breakpoint 분류 (전역 SoT) ────────────────────────────────
//   xs:  ≤  359  (구형 안드로이드 작은 폰)
//   sm:  ≤  413  (iPhone Mini / 일반 안드로이드)
//   md:  ≤  479  (iPhone Pro Max / Galaxy Plus)
//   lg:  ≤  767  (Foldable, large phone landscape)
//   xl:  >= 768  (Tablet / Desktop)

// ============================================
// 테마 동기화 (Web ↔ Native)
// ============================================

export type ThemeMode = "light" | "dark" | "system";

// ─── 테마 동기화 모듈 (C-1 2026-06-07) ───

/**
 * 테마 관련 기능
 *
 * Web에서 테마 변경 시 Flutter 앱의 Material 3 테마를 동기화합니다.
 * - Web → Native: setTheme()로 Flutter themeMode 변경
 * - Native → Web: Flutter가 evaluateJavascript로 WebView 테마 업데이트
 *
 * @example
 * await theme.setTheme('dark');   // Flutter 앱도 다크모드로 전환
 * const mode = await theme.getTheme(); // 현재 Native 테마 조회
 */
export const theme = {
  /**
   * Native Flutter 앱의 테마 모드 변경
   * @param mode - 'light' | 'dark' | 'system'
   */
  async setTheme(mode: ThemeMode): Promise<boolean> {
    try {
      // 2026-04-22 (P2-3): SSR 체크 순서 보수화. window 부재 환경에서 안전하게 fallthrough.
      if (
        typeof window === "undefined" ||
        typeof window.flutter_inappwebview?.callHandler !== "function"
      ) {
        return false;
      }

      const result = await window.flutter_inappwebview.callHandler("theme", {
        action: "setTheme",
        mode,
      });

      const response = result as {
        success?: boolean;
        data?: { applied?: boolean };
      } | null;
      return response?.data?.applied ?? response?.success ?? false;
    } catch (error) {
      handleBridgeError(
        "ui",
        {
          code: "THEME_CHANGE_ERROR",
          message: error instanceof Error ? error.message : String(error),
        },
        { operation: "setTheme", mode },
      );
      return false;
    }
  },

  /**
   * Native Flutter 앱의 현재 테마 모드 조회
   */
  async getTheme(): Promise<ThemeMode> {
    try {
      // 2026-04-22 (P2-3): SSR 체크 순서 보수화.
      if (
        typeof window === "undefined" ||
        typeof window.flutter_inappwebview?.callHandler !== "function"
      ) {
        return "system";
      }

      const result = await window.flutter_inappwebview.callHandler("theme", {
        action: "getTheme",
      });

      const response = result as { data?: { mode?: string } } | null;
      const mode = response?.data?.mode;
      if (mode === "light" || mode === "dark" || mode === "system") {
        return mode;
      }
      return "system";
    } catch {
      return "system";
    }
  },
};
