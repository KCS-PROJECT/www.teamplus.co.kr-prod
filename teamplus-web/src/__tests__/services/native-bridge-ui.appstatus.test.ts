/**
 * [appstatus-fix] native-bridge-ui 풀스크린 가드 lifecycle 통합 테스트.
 *
 * 네이티브 상태바(AppStatus) 영구 숨김 회귀의 핵심 실패모드가 코드 동작상 제거됐음을
 * fake timer 로 결정적으로 증명한다. 상태바는 web 이 `setConfig({showStatusBar:true})`
 * 를 native 로 전송해야만 켜지므로, "bridge.ui.setConfig 가 받은 showStatusBar 값"을
 * 관찰하면 가드 동작을 직접 검증할 수 있다.
 *
 *  - FM1: `_isFullscreenActive` 가드는 정상 해제 신호 없이도 FULLSCREEN_GUARD_MAX_MS(5s)
 *         후 자동 해제되어, 이후 setConfig({showStatusBar:true}) 가 native 로 통과된다.
 *  - FM2: `forceShowStatusBar()` 는 가드가 활성이어도 우회하여 showStatusBar:true 를 전송한다.
 *  - 가드 정상 동작: 활성 중 setConfig({showStatusBar:true}) 는 false 로 다운그레이드된다.
 *  - exitFullscreen/stopLoading 은 가드를 즉시 해제한다.
 */

// 네이티브 환경으로 강제 (isNativeApp() → true) — 나머지 환경 유틸은 실제 구현 유지.
jest.mock("@/lib/environment", () => ({
  ...jest.requireActual("@/lib/environment"),
  isNativeApp: () => true,
  isFlutterBridgeAvailable: () => true,
}));

// native-bridge-core 모킹 — bridge.ui.setConfig 가 받은 config 를 그대로 기록.
jest.mock("@/services/native-bridge-core", () => {
  const setConfig = jest.fn(async (config: { showStatusBar?: boolean }) => ({
    applied: true,
    config,
  }));
  return {
    __esModule: true,
    getBridge: () => ({ ui: { setConfig } }),
    callUIBridge: jest.fn(async () => ({})),
    addMessageListener: jest.fn(),
    __setConfigSpy: setConfig,
  };
});

import { ui } from "@/services/native-bridge-ui";
import * as core from "@/services/native-bridge-core";

const setConfigSpy = (core as unknown as {
  __setConfigSpy: jest.Mock<Promise<unknown>, [{ showStatusBar?: boolean }]>;
}).__setConfigSpy;

/** setConfigSpy 마지막 호출이 받은 showStatusBar 값. */
function lastSentShowStatusBar(): boolean | undefined {
  const calls = setConfigSpy.mock.calls;
  if (calls.length === 0) return undefined;
  return calls[calls.length - 1][0].showStatusBar;
}

describe("[appstatus-fix] native-bridge-ui 풀스크린 가드 lifecycle", () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    setConfigSpy.mockClear();
    // 가드 상태 초기화 (모듈 전역 _isFullscreenActive=false 보장)
    await ui.exitFullscreen();
    setConfigSpy.mockClear();
  });

  afterEach(async () => {
    await ui.exitFullscreen();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("가드 비활성: setConfig({showStatusBar:true}) 가 그대로 native 로 전송된다", async () => {
    await ui.setConfig({ showStatusBar: true });
    expect(lastSentShowStatusBar()).toBe(true);
  });

  it("가드 활성(enterFullscreen): setConfig({showStatusBar:true}) 가 false 로 다운그레이드된다", async () => {
    await ui.enterFullscreen();
    await ui.setConfig({ showStatusBar: true });
    expect(lastSentShowStatusBar()).toBe(false); // 가드 정상 동작 (로더 위 노출 차단)
  });

  it("FM2: forceShowStatusBar() 는 가드가 활성이어도 showStatusBar:true 를 전송한다(가드 우회)", async () => {
    await ui.enterFullscreen(); // 가드 활성
    await ui.forceShowStatusBar(); // 우회 강제 표시
    expect(lastSentShowStatusBar()).toBe(true);

    // 우회 직후엔 가드도 해제되어 일반 setConfig 도 통과해야 한다.
    setConfigSpy.mockClear();
    await ui.setConfig({ showStatusBar: true });
    expect(lastSentShowStatusBar()).toBe(true);
  });

  it("FM1: 정상 해제 신호 없이도 FULLSCREEN_GUARD_MAX_MS(5s) 후 가드가 자동 해제된다", async () => {
    await ui.enterFullscreen(); // 가드 활성, 5s 실패안전 타이머 arm

    // 4.9s 시점: 아직 가드 활성 → 다운그레이드 유지
    jest.advanceTimersByTime(4900);
    await ui.setConfig({ showStatusBar: true });
    expect(lastSentShowStatusBar()).toBe(false);

    // 5s 경과: 실패안전 만료 → 가드 자동 해제 → 이후 true 통과 (상태바 복원)
    jest.advanceTimersByTime(200); // 누적 5100ms
    setConfigSpy.mockClear();
    await ui.setConfig({ showStatusBar: true });
    expect(lastSentShowStatusBar()).toBe(true);
  });

  it("FM1(startLoading 변종): startLoading 도 가드를 arm 하고 5s 후 자동 해제된다", async () => {
    ui.startLoading(); // 로딩 시작 = 가드 활성
    await ui.setConfig({ showStatusBar: true });
    expect(lastSentShowStatusBar()).toBe(false); // 로딩 중 다운그레이드

    jest.advanceTimersByTime(5100); // 실패안전 만료
    setConfigSpy.mockClear();
    await ui.setConfig({ showStatusBar: true });
    expect(lastSentShowStatusBar()).toBe(true); // 자동 해제 후 복원
  });

  it("exitFullscreen 은 가드를 즉시 해제한다", async () => {
    await ui.enterFullscreen();
    await ui.exitFullscreen();
    await ui.setConfig({ showStatusBar: true });
    expect(lastSentShowStatusBar()).toBe(true);
  });
});
