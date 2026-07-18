/**
 * [v22 appstatus] spinner-native-chrome — 풀사이즈 스피너 네이티브 크롬 제어 단위 테스트.
 *
 * 사용자 직접 지시(2026-07-18): "appstatus 영역을 스피너 화면(fullsize 팝업)에서 숨김".
 * 스피너 컴포넌트 mount(acquire) 시 enterFullscreen + 스피너 body 색 setConfig 전송,
 * 마지막 unmount(release) 후 RESTORE_DELAY_MS 지연 뒤 exitFullscreen + 페이지 의도
 * config 복원이 결정적으로 일어남을 fake timer 로 검증한다.
 */

jest.mock("@/services/native-bridge", () => {
  const enterFullscreen = jest.fn(async () => true);
  const exitFullscreen = jest.fn(async () => true);
  const setConfig = jest.fn(
    async (config: Record<string, unknown>) => ({ applied: true, config }),
  );
  return {
    __esModule: true,
    ui: { enterFullscreen, exitFullscreen, setConfig },
    isNativeApp: jest.fn(() => true),
  };
});

jest.mock("@/hooks/useNativeUI", () => ({
  __esModule: true,
  getCurrentUIConfig: jest.fn(() => ({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  })),
}));

import {
  acquireSpinnerNativeChrome,
  sendSpinnerNativeChrome,
  __resetSpinnerNativeChromeForTest,
} from "@/services/spinner-native-chrome";
import { ui, isNativeApp } from "@/services/native-bridge";

const enterFullscreenSpy = ui.enterFullscreen as jest.Mock;
const exitFullscreenSpy = ui.exitFullscreen as jest.Mock;
const setConfigSpy = ui.setConfig as jest.Mock;
const isNativeAppMock = isNativeApp as jest.Mock;

const RESTORE_DELAY_MS = 150;

function lastSentConfig(): Record<string, unknown> | undefined {
  const calls = setConfigSpy.mock.calls;
  if (calls.length === 0) return undefined;
  return calls[calls.length - 1][0];
}

function setPath(pathname: string): void {
  window.history.pushState({}, "", pathname);
}

describe("[v22 appstatus] spinner-native-chrome", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    __resetSpinnerNativeChromeForTest();
    enterFullscreenSpy.mockClear();
    exitFullscreenSpy.mockClear();
    setConfigSpy.mockClear();
    isNativeAppMock.mockReturnValue(true);
    document.documentElement.classList.remove("dark");
    setPath("/classes-manage");
  });

  afterEach(() => {
    __resetSpinnerNativeChromeForTest();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("acquire: enterFullscreen + 스피너 body 색(라이트 #ffffff) showStatusBar:false 전송", () => {
    acquireSpinnerNativeChrome();
    expect(enterFullscreenSpy).toHaveBeenCalledTimes(1);
    expect(lastSentConfig()).toMatchObject({
      showStatusBar: false,
      scaffoldBackgroundColor: "#ffffff",
      statusBarColor: "#ffffff",
      navigationBarColor: "#ffffff",
      statusBarLight: false,
    });
  });

  it("acquire(다크 모드): 다크 body 색(#0a0d14) + statusBarLight:true 전송", () => {
    document.documentElement.classList.add("dark");
    acquireSpinnerNativeChrome();
    expect(lastSentConfig()).toMatchObject({
      showStatusBar: false,
      scaffoldBackgroundColor: "#0a0d14",
      statusBarLight: true,
    });
  });

  it("release: 마지막 해제 후 RESTORE_DELAY_MS 지연 뒤 exitFullscreen + 페이지 의도 config 복원", () => {
    const release = acquireSpinnerNativeChrome();
    setConfigSpy.mockClear();

    release();
    // 지연 전에는 복원하지 않는다 (스피너 교대 blink 방지)
    expect(exitFullscreenSpy).not.toHaveBeenCalled();

    jest.advanceTimersByTime(RESTORE_DELAY_MS);
    expect(exitFullscreenSpy).toHaveBeenCalledTimes(1);
    expect(lastSentConfig()).toMatchObject({ showStatusBar: true });
  });

  it("겹침(ref-count): 두 스피너 중 하나만 해제되면 복원하지 않는다", () => {
    const releaseA = acquireSpinnerNativeChrome();
    acquireSpinnerNativeChrome();

    releaseA();
    jest.advanceTimersByTime(RESTORE_DELAY_MS * 2);
    expect(exitFullscreenSpy).not.toHaveBeenCalled();
  });

  it("교대(back-to-back): 해제 직후 지연 안에 새 스피너가 mount 되면 복원이 취소된다", () => {
    const releaseA = acquireSpinnerNativeChrome();
    releaseA();

    jest.advanceTimersByTime(RESTORE_DELAY_MS - 50);
    acquireSpinnerNativeChrome(); // 예약된 복원 취소 + 숨김 재확정

    jest.advanceTimersByTime(RESTORE_DELAY_MS * 2);
    expect(exitFullscreenSpy).not.toHaveBeenCalled();
  });

  it("release 이중 호출은 count 를 한 번만 감소시킨다 (음수 방지)", () => {
    const releaseA = acquireSpinnerNativeChrome();
    acquireSpinnerNativeChrome(); // count=2

    releaseA();
    releaseA(); // 중복 호출 — 무시되어야 함 (count=1 유지)
    jest.advanceTimersByTime(RESTORE_DELAY_MS * 2);
    expect(exitFullscreenSpy).not.toHaveBeenCalled();
  });

  it("skip 경로(/splash): 관여하지 않는다 (전송·복원 0회)", () => {
    setPath("/splash");
    const release = acquireSpinnerNativeChrome();
    expect(enterFullscreenSpy).not.toHaveBeenCalled();
    expect(setConfigSpy).not.toHaveBeenCalled();

    release();
    jest.advanceTimersByTime(RESTORE_DELAY_MS * 2);
    expect(exitFullscreenSpy).not.toHaveBeenCalled();
  });

  it("비-native(웹 브라우저): no-op", () => {
    isNativeAppMock.mockReturnValue(false);
    const release = acquireSpinnerNativeChrome();
    sendSpinnerNativeChrome();
    release();
    jest.advanceTimersByTime(RESTORE_DELAY_MS * 2);
    expect(enterFullscreenSpy).not.toHaveBeenCalled();
    expect(setConfigSpy).not.toHaveBeenCalled();
    expect(exitFullscreenSpy).not.toHaveBeenCalled();
  });
});
