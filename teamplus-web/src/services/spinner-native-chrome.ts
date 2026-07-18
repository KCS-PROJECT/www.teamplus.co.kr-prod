/**
 * spinner-native-chrome — 풀사이즈 스피너 표면의 네이티브 크롬(appstatus) 제어 SoT
 *
 * v22 (2026-07-18) 사용자 직접 지시: "appstatus 영역을 스피너 화면(fullsize 팝업)에서
 * 보이지 않게 숨김". v21(LoadingContext.enterNativeSpinnerChrome)은 LoadingContext 가
 * 띄우는 전환 로더(navigation/popstate/fullscreen variant)만 커버해, LoadingContext 를
 * 거치지 않는 풀사이즈 스피너 표면 — 페이지/레이아웃 자체 LoadingPuck(WebView 콜드 부트
 * 인증 체크 · suppressNextLoad 탭 전환 직후 자체 로더), ClientProviders Suspense
 * fallback(PageLoader→FullScreenLoader), 결제 LoadingRing — 에서는 appstatus(시계·배터리
 * 상태바 스트립)가 그대로 노출되는 갭이 남았다. 본 모듈은 스피너 **컴포넌트 자체**의
 * mount/unmount 에 연결되어 모든 풀사이즈 스피너 표면에서 숨김·복원을 일원화한다.
 *
 * 동작:
 *  - acquire: ref-count 증가 + (native 앱 한정) `enterFullscreen` + 스피너 body 색
 *    setConfig 전송. enterFullscreen 은 native-bridge-ui 의 `_isFullscreenActive` 가드를
 *    arm 하므로 스피너 표시 중 유입되는 setConfig({showStatusBar:true}) 는 자동
 *    다운그레이드된다(F1 가드 재사용).
 *  - release(acquire 반환 함수): ref-count 감소, 0 이 되면 RESTORE_DELAY_MS 지연 후
 *    `exitFullscreen` + `getCurrentUIConfig()`(페이지 의도) 복원. 지연은 스피너 교대
 *    (전환 로더 unmount ↔ 페이지 자체 로더 mount)가 순간적으로 count 0 을 관통하며
 *    상태바가 blink 하는 현상을 막는다. 재-acquire 시 예약된 복원은 취소된다.
 *  - skip 정책 경로(splash/onboarding/force-update/갤러리 풀뷰어 — app-status.ts SoT)
 *    에서는 관여하지 않는다(네이티브 splash·페이지 자체 useFullscreen 제어 보존).
 *
 * LoadingContext 와의 관계:
 *  - LoadingContext 는 클릭 시점(startLoading)에 본 모듈의 `sendSpinnerNativeChrome` 을
 *    즉시 호출(렌더 1프레임 대기 없이 최대한 빠른 숨김)하고, 로더 종료 시 자체 복원
 *    (stopLoading + exitFullscreen + 페이지 config)을 수행한다. 그 위에 렌더된
 *    LoadingPuck 의 acquire/release 는 동일 값 재전송이라 idempotent — 충돌 없음.
 */
import { ui, isNativeApp } from "./native-bridge";
import { getCurrentUIConfig } from "@/hooks/useNativeUI";
import { resolveAppStatusVisibility } from "@/lib/app-status";

export interface SpinnerChromeColors {
  /** 라이트 모드 스피너 body 색 (기본 #ffffff = LoadingPuck/FullScreenLoader bg-white) */
  light: string;
  /** 다크 모드 스피너 body 색 (기본 #0a0d14 = bg-puck) */
  dark: string;
}

const DEFAULT_COLORS: SpinnerChromeColors = {
  light: "#ffffff",
  dark: "#0a0d14",
};

/** 스피너 교대(unmount↔mount) 시 상태바 blink 방지용 복원 지연 */
const RESTORE_DELAY_MS = 150;

let activeCount = 0;
let restoreTimer: ReturnType<typeof setTimeout> | null = null;

function cancelScheduledRestore(): void {
  if (restoreTimer !== null) {
    clearTimeout(restoreTimer);
    restoreTimer = null;
  }
}

function isSkipPath(): boolean {
  if (typeof window === "undefined") return true;
  return resolveAppStatusVisibility(window.location.pathname) === "skip";
}

/**
 * 스피너 네이티브 크롬 전송 — appstatus 숨김 + 잔여 safe-area 스트립을 스피너 body 색으로
 * 통일. v21 LoadingContext.enterNativeSpinnerChrome 의 전송부를 SoT 로 추출한 것.
 * raw ui.setConfig 는 lastAppliedConfig 를 건드리지 않으므로 복원 시
 * getCurrentUIConfig() 가 페이지 의도로 돌아간다.
 */
export function sendSpinnerNativeChrome(
  colors: SpinnerChromeColors = DEFAULT_COLORS,
): void {
  if (!isNativeApp()) return;
  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");
  const bg = isDark ? colors.dark : colors.light;
  ui.enterFullscreen().catch(() => {});
  ui.setConfig({
    showStatusBar: false,
    scaffoldBackgroundColor: bg,
    statusBarColor: bg,
    navigationBarColor: bg,
    statusBarLight: isDark,
  }).catch(() => {});
}

function restoreNativeChrome(): void {
  // exitFullscreen — Flutter fullscreen 플래그 + web `_isFullscreenActive` 가드 해제.
  ui.exitFullscreen().catch(() => {});
  // 복원 시점의 경로가 skip 정책이면 config 재단언은 하지 않는다
  // (페이지 자체 useFullscreen/네이티브 splash 의도 보존 — 가드 해제만 수행).
  if (isSkipPath()) return;
  ui.setConfig(getCurrentUIConfig()).catch(() => {});
}

/**
 * 풀사이즈 스피너 표시 시작 — appstatus 숨김. 반환 함수를 unmount cleanup 에서 호출한다.
 *
 * @example
 * useEffect(() => acquireSpinnerNativeChrome(), []);
 */
export function acquireSpinnerNativeChrome(
  colors: SpinnerChromeColors = DEFAULT_COLORS,
): () => void {
  const noop = () => {};
  if (!isNativeApp()) return noop;
  // mount 시점이 skip 경로면 관여하지 않는다. release 는 acquire 성공 여부를 클로저로
  // 기억하므로 mount/unmount 사이 경로가 바뀌어도 count 는 항상 대칭이다.
  if (isSkipPath()) return noop;

  cancelScheduledRestore();
  activeCount += 1;
  // count 1→2 겹침에서도 재전송 — idempotent 하고, 가드 만료(5s) 등으로 상태바가
  // 중간에 복원된 극단 케이스에서도 최신 스피너가 다시 숨김을 확정한다.
  sendSpinnerNativeChrome(colors);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeCount = Math.max(0, activeCount - 1);
    if (activeCount > 0) return;
    cancelScheduledRestore();
    restoreTimer = setTimeout(() => {
      restoreTimer = null;
      if (activeCount > 0) return;
      restoreNativeChrome();
    }, RESTORE_DELAY_MS);
  };
}

/** 테스트 전용 — 모듈 전역 상태 초기화 */
export function __resetSpinnerNativeChromeForTest(): void {
  cancelScheduledRestore();
  activeCount = 0;
}
