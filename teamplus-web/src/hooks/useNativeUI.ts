'use client';

import { useEffect, useCallback, useRef, useMemo } from 'react';
import { isNativeApp } from '@/lib/environment';
import {
  ui,
  type UIConfig,
  type AppBarEventHandler,
  type AppBarEventType,
} from '@/services/native-bridge';
import { devLog, devWarn } from '@/lib/logger';

/**
 * 네이티브 UI 설정 옵션
 */
export interface NativeUIOptions extends UIConfig {
  /** 페이지 떠날 때 기본값으로 복원할지 여부 (기본: true) */
  restoreOnUnmount?: boolean;
  /**
   * 데이터 로딩 완료 여부
   * - true: 데이터 로딩 완료 → 스피너 숨김 + UI 설정 적용
   * - false: 데이터 로딩 중 → 스피너 유지
   * - undefined: 데이터 로딩 상태 무시 (기본 동작)
   */
  isDataLoaded?: boolean;

  // ============================================
  // AppBar 이벤트 핸들러
  // ============================================
  /** 뒤로가기 버튼 클릭 핸들러 */
  onBackPress?: () => void;
  /** 햄버거 메뉴 버튼 클릭 핸들러 */
  onMenuPress?: () => void;
  /** 새로고침 버튼 클릭 핸들러 */
  onRefreshPress?: () => void;
}

/**
 * 기본 UI 설정 (페이지 언마운트 시 복원용)
 */
const DEFAULT_UI_CONFIG: UIConfig = {
  showStatusBar: true,
  showAppBar: false,
  showBottomNav: true,
};

/**
 * 네이티브 UI 제어 Hook
 *
 * 페이지 진입 시 네이티브 UI (상태바, AppBar, BottomNav)를 설정하고,
 * 페이지 떠날 때 자동으로 기본값으로 복원합니다.
 *
 * @param options - UI 설정 옵션
 *
 * @example
 * ```tsx
 * // 전체화면 모드 (비디오 재생 페이지)
 * function VideoPlayerPage() {
 *   useNativeUI({
 *     showStatusBar: false,
 *     showAppBar: false,
 *     showBottomNav: false,
 *   });
 *
 *   return <VideoPlayer />;
 * }
 * ```
 *
 * @example
 * ```tsx
 * // 상세 페이지 (BottomNav 숨김, AppBar 표시)
 * function DetailPage() {
 *   useNativeUI({
 *     showBottomNav: false,
 *     showAppBar: true,
 *     appBarTitle: '상세 정보',
 *   });
 *
 *   return <DetailContent />;
 * }
 * ```
 *
 * @example
 * ```tsx
 * // 기본 페이지 (명시적으로 기본값 사용)
 * function HomePage() {
 *   useNativeUI({
 *     showStatusBar: true,
 *     showAppBar: false,
 *     showBottomNav: true,
 *   });
 *
 *   return <HomeContent />;
 * }
 * ```
 */
// 앱 전체에서 마지막으로 적용된 UI 설정을 기억 (중복 호출 방지용)
let lastAppliedConfig: string | null = null;
let isNativeLoadingStopScheduled = false;
let nativeLoadingStartedAt: number | null = null;

// [2026-05-13 이슈 D15/P2] 이중 헤더 (Web BackHeader + Flutter Native AppBar) 감지.
//   BackHeader/PageAppBar 가 forceNative=true (디폴트) 로 마운트되면 sentinel 등록.
//   같은 페이지에서 useNativeUI({ showAppBar: true }) 가 호출되면 dev-only console.warn.
//   props 시그니처는 변경하지 않으므로 모든 호출처에 무해.
//
// 사용:
//   PageAppBar.tsx 마운트 useEffect 에서 `registerWebAppBarMount()` 호출 (해당 PR 추가 예정)
//   해제는 cleanup 에서 `unregisterWebAppBarMount()`.
let webAppBarMountCount = 0;
export function registerWebAppBarMount(): () => void {
  if (typeof window === 'undefined') return () => {};
  webAppBarMountCount += 1;
  return () => {
    webAppBarMountCount = Math.max(0, webAppBarMountCount - 1);
  };
}
function hasWebAppBarMounted(): boolean {
  return webAppBarMountCount > 0;
}

// [2026-05-09] 2000 → 300 단축. 사용자 보고: iOS 시뮬레이터에서 status bar 가
//   화면 렌딩 후 2-3초 후에야 노출되는 현상.
//   원인: useNativeUI({ isDataLoaded }) 가 false→true 로 전환될 때 stopLoading 이
//   `NATIVE_LOADING_MIN_DURATION_MS - elapsed` 만큼 대기 후 ui.stopLoading 을 호출,
//   ui.stopLoading 내부에서 exitFullscreen 도 함께 발사되므로 status bar 복원이 지연.
//   LoadingContext.MIN_SHOW_DURATION(300ms) 과 정합. 깜빡임 방지 최소값만 보장.
const NATIVE_LOADING_MIN_DURATION_MS = 300;

// [appstatus-fix F3] isDataLoaded 가 이 시간 동안 false 면 UI 목적상 상태바를 복원한다.
//   ⚠️ 정정(reviewer-fe): 로더 실제 unmount 상한 ≈6832ms(MAX_WAIT 5000 +
//   FONTS_READY_TIMEOUT 1500 + 2RAF + FADE_OUT 300) 보다 크게 7000ms 로 잡아 로더가
//   완전히 사라진 뒤에만 force-show 하도록 보장(로더 위 조기 노출 방지). 데이터 의미는
//   변경하지 않으며 상태바 force-show 만 한다. (6000ms 는 로더 가시 구간이라 회귀였음)
const DATA_LOADED_FAILSAFE_MS = 7000;

// 부모 페이지가 사용 중인 안전한 기본 UI 상태 (drawer 등 일시적 풀스크린 모드의 복원 fallback)
const FALLBACK_RESTORE_CONFIG: UIConfig = {
  showStatusBar: true,
  showAppBar: false,
  showBottomNav: true,
};

/**
 * 마지막으로 적용된 UI 설정 스냅샷을 반환한다.
 * drawer/모달 등 일시적으로 풀스크린 모드로 진입했다가 복원할 때 사용.
 *
 * - 최초 호출 또는 페이지 전환 직후로 스냅샷이 없으면 안전한 기본값 반환.
 * - JSON 파싱 실패 시에도 기본값 반환 (방어적).
 */
export function getCurrentUIConfig(): UIConfig {
  if (!lastAppliedConfig) return { ...FALLBACK_RESTORE_CONFIG };
  try {
    const parsed = JSON.parse(lastAppliedConfig) as UIConfig;
    return { ...FALLBACK_RESTORE_CONFIG, ...parsed };
  } catch {
    return { ...FALLBACK_RESTORE_CONFIG };
  }
}

/**
 * 외부에서 ui.setConfig를 직접 호출했을 때 useNativeUI의 중복 방지 캐시를 함께 갱신한다.
 * (drawer 같은 명령형 호출을 했을 때 다음 useNativeUI 호출이 동일 설정을 다시 보내지 않도록 동기화)
 */
export function syncLastAppliedConfig(config: UIConfig): void {
  lastAppliedConfig = JSON.stringify(config);
}

function afterNextPaint(callback: () => void): () => void {
  if (typeof window === 'undefined') {
    callback();
    return () => {};
  }

  let raf1 = 0;
  let raf2 = 0;
  let cancelled = false;

  raf1 = window.requestAnimationFrame(() => {
    raf2 = window.requestAnimationFrame(() => {
      if (!cancelled) callback();
    });
  });

  return () => {
    cancelled = true;
    window.cancelAnimationFrame(raf1);
    if (raf2) window.cancelAnimationFrame(raf2);
  };
}

/**
 * 네이티브 UI 제어 Hook
 */
export function useNativeUI(options: NativeUIOptions = {}): void {
  const {
    restoreOnUnmount = true,
    isDataLoaded,
    onBackPress,
    onMenuPress,
    onRefreshPress,
    ...uiConfigRaw
  } = options;

  // uiConfig를 문자열로 직렬화하여 안정적인 의존성으로 사용
  const uiConfigKey = useMemo(
    () => JSON.stringify(uiConfigRaw),
    [
      uiConfigRaw.showStatusBar,
      uiConfigRaw.statusBarLight,
      uiConfigRaw.statusBarColor,
      uiConfigRaw.navigationBarColor,
      uiConfigRaw.scaffoldBackgroundColor,
      uiConfigRaw.showScrim,
      uiConfigRaw.scrimColor,
      uiConfigRaw.showAppBar,
      uiConfigRaw.appBarTitle,
      uiConfigRaw.appBarColor,
      uiConfigRaw.showBackButton,
      uiConfigRaw.showMenuButton,
      uiConfigRaw.menuButtonPosition,
      uiConfigRaw.showRefreshButton,
      uiConfigRaw.showBottomNav,
      // PullToRefresh (2026-05-13 — 이슈 D15)
      uiConfigRaw.pullToRefreshEnabled,
    ],
  );

  const uiConfig = useMemo(() => uiConfigRaw, [uiConfigKey]);

  const isApplied = useRef(false);
  const previousConfig = useRef<UIConfig | null>(null);
  const stopLoadingCancelRef = useRef<(() => void) | null>(null);
  const eventHandlerRef = useRef<{
    onBackPress?: () => void;
    onMenuPress?: () => void;
    onRefreshPress?: () => void;
  }>({});
  // applyConfig (useCallback, stale closure) 안에서 최신 isDataLoaded 참조용 ref.
  // status bar override 결정에 사용 — fetch 중에는 항상 false 로 강제.
  const isDataLoadedRef = useRef<boolean | undefined>(isDataLoaded);
  useEffect(() => {
    isDataLoadedRef.current = isDataLoaded;
  }, [isDataLoaded]);

  // [2026-05-13 이슈 D15/P2] 이중 헤더 감지 — dev-only 경고.
  //   Web BackHeader/PageAppBar 가 마운트된 상태에서 페이지가
  //   useNativeUI({ showAppBar: true }) 를 호출하면 Flutter Native AppBar 와
  //   Web AppBar 가 동시에 그려져 "상단바 2개" 증상이 발생한다.
  //   호출처 props 는 그대로 두고 개발자에게만 알린다 (런타임 동작 변경 없음).
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    if (uiConfigRaw.showAppBar !== true) return;
    if (!hasWebAppBarMounted()) return;
    // eslint-disable-next-line no-console
    console.warn(
      '[useNativeUI] 이중 헤더 감지: <BackHeader/PageAppBar/> 마운트 + ' +
        'useNativeUI({ showAppBar: true }) 가 동시 호출되었습니다.\n' +
        '→ 한쪽만 사용하세요. 보통 페이지가 Web BackHeader 를 렌더하면 ' +
        'useNativeUI 는 showAppBar:false (기본값) 로 두면 됩니다.\n' +
        '(이슈 D15 / P2 — SPEC_TEAM5_HOTFIX.md §2 참조)',
    );
  }, [uiConfigKey]);

  // [2026-05-13 parent-common-designer 보강] 헤더 누락 감지 — dev-only 경고.
  //   Native 환경에서 useNativeUI({ showAppBar: false }) 가 호출되는데 Web
  //   BackHeader/PageAppBar 도 마운트되지 않으면 "상단바 없음" 증상이 발생한다.
  //   (의도적 풀스크린: splash/onboarding/auth/payment-complete 등은 예외)
  //   200ms 지연 후 단 1회 평가 — 페이지 마운트 직후 BackHeader 가 렌더되는 동안
  //   false positive 를 피한다.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    if (typeof window === 'undefined') return;
    // showAppBar 가 명시적 false 인 경우만 검사. undefined 는 의도 미상 — 검사 제외.
    if (uiConfigRaw.showAppBar !== false) return;
    if (!isNativeApp()) return;
    const timeoutId = window.setTimeout(() => {
      if (hasWebAppBarMounted()) return;
      // 풀스크린 의도 페이지 화이트리스트 — pathname 기반.
      const pathname = window.location.pathname;
      const fullscreenIntentPatterns = [
        /^\/splash/,
        /^\/onboarding/,
        /^\/login/,
        /^\/signup/,
        /^\/find-/,
        /^\/password-reset-complete/,
        /^\/complete\b/,
        /^\/attendance-success\b/,
        /^\/qr-/,
        /^\/checkout\b/,
      ];
      if (fullscreenIntentPatterns.some((re) => re.test(pathname))) return;
      // eslint-disable-next-line no-console
      console.warn(
        '[useNativeUI] 헤더 누락 가능성: Native 환경 + ' +
          'useNativeUI({ showAppBar: false }) + Web <BackHeader/PageAppBar/> 미마운트.\n' +
          `→ 현재 경로(${pathname}) 에서 상단바가 표시되지 않을 수 있습니다.\n` +
          '→ 풀스크린 의도 페이지가 아니면 <BackHeader/PageAppBar/> 를 렌더하거나 ' +
          'useNativeUI({ showAppBar: true }) 로 Flutter Native AppBar 활성화 필요.\n' +
          '(이슈 D15 보강 — Phase 3-C parent-common-designer)',
      );
    }, 200);
    return () => window.clearTimeout(timeoutId);
  }, [uiConfigKey]);

  // UI 설정 적용 (최적화 버전)
  const applyConfig = useCallback(async (config: UIConfig) => {
    if (!isNativeApp()) return;

    // 🛡️ isDataLoaded=false 동안 showStatusBar 를 false 로 강제 override.
    //   페이지의 useNativeUI({ showStatusBar: true }) 가 명시되어도, 데이터 fetch
    //   완료 전에는 status bar 가 켜지지 않도록 race condition 차단.
    //   (이전 hideStatusBar 단일 호출은 다른 setConfig 가 즉시 덮어 씌울 수 있어 부족)
    const safeConfig: UIConfig =
      isDataLoadedRef.current === false
        ? { ...config, showStatusBar: false }
        : config;

    // [appstatus-fix F3 / FM3] 전역 스냅샷에는 **페이지가 의도한 config** 를 기록한다.
    //   (가드 override 된 showStatusBar:false 가 아니라 원본 config)
    //   lastAppliedConfig 는 LoadingContext 복원(getCurrentUIConfig → ui.setConfig,
    //   LoadingContext.tsx:248-249)의 입력이므로, override 값(false)을 기록하면 로딩
    //   종료 후 복원 단계에서 showStatusBar:false 가 재단언되어 상태바가 영구 숨김으로
    //   굳는다(FM3). native 전송은 safeConfig(로딩 중 깨끗한 화면 유지), 스냅샷 기록은
    //   config(페이지 의도)로 분리한다.
    // LoadingContext/ui.startLoading 같은 외부 브릿지 호출이 네이티브 UI를
    // 직접 바꾸므로, 캐시만 보고 setConfig를 스킵하면 AppBar가 false 상태에
    // 갇힐 수 있다. 페이지 진입 설정은 항상 재전송한다.
    const configKey = JSON.stringify(config);

    try {
      const result = await ui.setConfig(safeConfig);
      if (result.applied) {
        isApplied.current = true;
        lastAppliedConfig = configKey; // 전역 상태 = 페이지 의도(FM3 방지)
        if (process.env.NODE_ENV === 'development') {
          devLog(
            '[useNativeUI] UI 설정 적용됨:',
            JSON.stringify(config, null, 2),
          );
        }
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        devWarn('[useNativeUI] UI 설정 적용 실패:', error);
      }
    }
  }, []);

  // 스피너 중단 (중복 방지)
  const stopLoading = useCallback(async () => {
    if (!isNativeApp() || isNativeLoadingStopScheduled) return;

    isNativeLoadingStopScheduled = true;
    const startedAt = nativeLoadingStartedAt ?? Date.now();
    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(0, NATIVE_LOADING_MIN_DURATION_MS - elapsed);

    const stopAfterPaint = () => {
      stopLoadingCancelRef.current = afterNextPaint(async () => {
        try {
          await ui.stopLoading();
          nativeLoadingStartedAt = null;
          if (process.env.NODE_ENV === 'development') {
            devLog('[useNativeUI] 네이티브 스피너 중단');
          }
        } catch {
          // 다음 isDataLoaded=true 신호에서 재시도할 수 있도록 scheduled flag만 해제한다.
        } finally {
          isNativeLoadingStopScheduled = false;
          stopLoadingCancelRef.current = null;
        }
      });
    };

    if (remaining > 0) {
      const timeoutId = setTimeout(stopAfterPaint, remaining);
      stopLoadingCancelRef.current = () => clearTimeout(timeoutId);
    } else {
      stopAfterPaint();
    }
  }, []);

  useEffect(() => {
    return () => {
      if (stopLoadingCancelRef.current) {
        stopLoadingCancelRef.current();
        stopLoadingCancelRef.current = null;
        isNativeLoadingStopScheduled = false;
      }
    };
  }, []);

  // 데이터 로딩 완료 시 처리
  useEffect(() => {
    if (!isNativeApp() || isDataLoaded === undefined) return;

    if (isDataLoaded) {
      stopLoading();

      const hasConfig = Object.keys(uiConfig).length > 0;
      if (hasConfig) {
        applyConfig(uiConfig);

        // ⚠️ Race condition 차단 안전망 (2026-05-12)
        //
        // isDataLoaded 미사용 페이지 useEffect(line 336-374) 의 400ms/800ms 재적용
        // 패턴을 isDataLoaded 사용 페이지(31개 — classes-manage, dashboard, mypage
        // 등 전 역할 페이지) 에도 동일 적용. 이전엔 isDataLoaded=true 전환 시
        // applyConfig 단발 호출만 수행 → Flutter 측 stopLoading 내부의 비동기
        // 부수효과(exitFullscreen, setTimeout 등) 와 setConfig 호출이 race 되어
        // status bar / AppBar 가 복원되지 않는 사용자 보고("appstatus 영역이 안
        // 나옴", 모든 디바이스 iOS/Android 시뮬·실기기) 다발. 400ms + 800ms 두
        // 시점에 재적용하여 최종 UI 설정이 마지막에 반드시 반영되도록 보장.
        //
        // 비용: ui.setConfig 2 회 추가 RPC (변경 없으면 Flutter 측 idempotent).
        const safetyTimers = [
          setTimeout(() => applyConfig(uiConfig), 400),
          setTimeout(() => applyConfig(uiConfig), 800),
        ];
        return () => {
          safetyTimers.forEach(clearTimeout);
        };
      }
    } else {
      if (stopLoadingCancelRef.current) {
        stopLoadingCancelRef.current();
        stopLoadingCancelRef.current = null;
      }
      isNativeLoadingStopScheduled = false;
      nativeLoadingStartedAt ??= Date.now();

      // 🛡️ isDataLoaded=false (데이터 fetch 중) — status bar 강제 숨김.
      //   BottomNav 탭 전환 시 LoadingProvider 가 ui.enterFullscreen() 으로 status
      //   bar 를 숨기지만, 페이지 마운트 → InAppWebView onLoadStop 또는 Flutter
      //   side 의 다른 이벤트로 status bar 가 복원되어 사용자가 빈 페이지 + status
      //   bar 보임 현상을 보고. fetch 완료 (isDataLoaded=true) 까지 명시적 숨김.
      //
      // [2026-05-14] `ui.startLoading()` 호출 제거 — Flutter 측 풀스크린 파란색
      //   오버레이(`_buildLoadingScreen` · `AppColors.primary #1E40AF`)가 Web
      //   `<LoadingPuck>`(회색/검정 풀스크린) 직후에 한 번 더 깜빡이는 "이중 로더"
      //   UX 회귀를 차단. LoadingContext 의 navigation variant 가 이미 풀스크린
      //   LoadingPuck 을 표시하므로 native 파란 오버레이는 중복이다. status bar
      //   숨김 의도는 `ui.enterFullscreen()` + `ui.hideStatusBar()` 가 그대로
      //   담당하여 시각적 유지 동일.
      ui.enterFullscreen().catch(() => {
        // 무시 — Native Bridge 미가용(웹 브라우저) 환경에선 no-op
      });
      ui.hideStatusBar().catch(() => {
        // 무시 — Native Bridge 미가용(웹 브라우저) 환경에선 no-op
      });

      // 🛡️ [appstatus-fix F3] isDataLoaded 실패안전.
      //   fetch 가 끝내 완료되지 않으면(요청 행/실패 등 isDataLoaded 가 영영 false)
      //   상태바 복원 신호(stopLoading/applyConfig)가 발생하지 않아 상태바가 영구
      //   숨김으로 고착된다(FM1 의 isDataLoaded 변종). DATA_LOADED_FAILSAFE_MS 후
      //   **UI 목적상**으로만 상태바를 force-show 한다. 데이터 의미(isDataLoaded)는
      //   변경하지 않으며 native 상태바만 복원한다. 7000ms 는 로더 실제 unmount
      //   상한(≈6832ms) 이후라 로더 위 조기 노출이 아니다. isDataLoaded=true 전환
      //   또는 언마운트 시 cleanup 에서 타이머를 clear 한다.
      const dataLoadedFailsafe = setTimeout(() => {
        ui.forceShowStatusBar().catch(() => {
          // 무시 — Native Bridge 미가용(웹 브라우저) 환경에선 no-op
        });
      }, DATA_LOADED_FAILSAFE_MS);
      return () => clearTimeout(dataLoadedFailsafe);
    }
  }, [isDataLoaded, uiConfig, applyConfig, stopLoading]);

  // 초기 마운트 및 설정 변경 시 처리
  useEffect(() => {
    if (isDataLoaded !== undefined) return;

    // 명시적 데이터 로딩 상태가 없으면 즉시 스피너 중단 시도
    stopLoading();

    const hasConfig = Object.keys(uiConfig).length > 0;
    const safetyTimers: ReturnType<typeof setTimeout>[] = [];

    if (hasConfig) {
      applyConfig(uiConfig);

      // ⚠️ Race condition 차단 안전망 (2026-05-12)
      //
      // Flutter 측 startLoading/enterFullscreen 핸들러가 페이지 전환 중
      // showAppBar:false 를 강제 적용하고, 페이지 fetch 완료 후 stopLoading 의
      // 비동기 부수효과(exitFullscreen, setTimeout 등) 가 useNativeUI 의 setConfig
      // 호출과 race condition 을 일으켜 AppBar/StatusBar 가 누락되는 사용자 보고
      // 다발. NATIVE_LOADING_MIN_DURATION_MS(300ms) + buffer 후 한 번 더 적용하여
      // 페이지의 최종 UI 설정이 항상 마지막에 적용되도록 보장.
      //
      // 비용: ui.setConfig 1 회 추가 RPC. 변경 없으면 Flutter 측에서 동일 설정으로
      // 처리되어 시각적 깜빡임 0.
      safetyTimers.push(
        setTimeout(() => {
          applyConfig(uiConfig);
        }, 400),
        setTimeout(() => {
          applyConfig(uiConfig);
        }, 800),
      );
    }

    return () => {
      // 페이지 전환 시 캐시 유지 — 다음 페이지가 다른 config 보낼 때만 자연 덮어쓰기
      // (기존엔 lastAppliedConfig=null 초기화로 매 전환마다 동일 설정도 재전송되어 RPC 중복 발생)
      safetyTimers.forEach(clearTimeout);
    };
  }, [uiConfig, restoreOnUnmount, applyConfig, stopLoading, isDataLoaded]);

  // AppBar 이벤트 핸들러 등록
  useEffect(() => {
    if (!isNativeApp()) return;

    // 핸들러 참조 업데이트
    eventHandlerRef.current = { onBackPress, onMenuPress, onRefreshPress };

    // 이벤트 핸들러 등록
    const handleAppBarEvent: AppBarEventHandler = (
      eventType: AppBarEventType,
    ) => {
      if (process.env.NODE_ENV === 'development') {
        devLog('[useNativeUI] AppBar 이벤트:', eventType);
      }

      switch (eventType) {
        case 'back':
          eventHandlerRef.current.onBackPress?.();
          break;
        case 'menu':
          eventHandlerRef.current.onMenuPress?.();
          break;
        case 'refresh':
          eventHandlerRef.current.onRefreshPress?.();
          break;
      }
    };

    // 핸들러가 하나라도 있으면 등록.
    // 2026-04-22 (SPEC_NATIVE_BRIDGE_REFACTOR · P2-1): `ui.onAppBarEvent` 가
    // unsubscribe 반환하도록 변경되어 effect cleanup 에서 해제 가능해짐.
    // 여러 화면이 동시에 등록할 때 stomp 방지 + unmount 시 stale handler 방지.
    if (!(onBackPress || onMenuPress || onRefreshPress)) {
      return undefined;
    }
    const unsubscribe = ui.onAppBarEvent(handleAppBarEvent);
    return () => {
      unsubscribe();
    };
  }, [onBackPress, onMenuPress, onRefreshPress]);
}

/**
 * 전체화면 모드 Hook
 *
 * 비디오 재생, 갤러리 등 전체화면이 필요한 페이지에서 사용합니다.
 *
 * @example
 * ```tsx
 * function VideoPage() {
 *   useFullscreen();
 *   return <VideoPlayer />;
 * }
 * ```
 */
export function useFullscreen(): void {
  useNativeUI({
    showStatusBar: false,
    showAppBar: false,
    showBottomNav: false,
  });
}

/**
 * BottomNav 숨김 Hook
 *
 * 상세 페이지, 폼 입력 페이지 등에서 사용합니다.
 *
 * @param appBarTitle - AppBar 타이틀 (선택, 제공하면 AppBar 표시)
 *
 * @example
 * ```tsx
 * function DetailPage() {
 *   useHideBottomNav('상품 상세');
 *   return <ProductDetail />;
 * }
 * ```
 */
export function useHideBottomNav(appBarTitle?: string): void {
  useNativeUI({
    showBottomNav: false,
    showAppBar: !!appBarTitle,
    appBarTitle,
  });
}

/**
 * AppBar 표시 Hook
 *
 * 네이티브 AppBar가 필요한 페이지에서 사용합니다.
 *
 * @param title - AppBar 타이틀
 * @param hideBottomNav - BottomNav 숨김 여부 (기본: false)
 *
 * @example
 * ```tsx
 * function SettingsPage() {
 *   useShowAppBar('설정');
 *   return <SettingsContent />;
 * }
 * ```
 */
export function useShowAppBar(title: string, hideBottomNav = false): void {
  useNativeUI({
    showAppBar: true,
    appBarTitle: title,
    showBottomNav: !hideBottomNav,
  });
}

/**
 * 상태바 숨김 Hook
 *
 * 몰입형 콘텐츠 페이지에서 사용합니다.
 *
 * @example
 * ```tsx
 * function GalleryPage() {
 *   useHideStatusBar();
 *   return <ImageGallery />;
 * }
 * ```
 */
export function useHideStatusBar(): void {
  useNativeUI({
    showStatusBar: false,
  });
}

/**
 * 기본 페이지 UI 프리셋 Hook (홈, 목록 등)
 * - 상태바: 표시
 * - AppBar: 숨김
 * - BottomNav: 표시
 */
export function useDefaultUI(): void {
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });
}

/**
 * 상세 페이지 UI 프리셋 Hook
 * - 상태바: 표시
 * - AppBar: 표시
 * - BottomNav: 숨김
 */
export function useDetailUI(title: string): void {
  useNativeUI({
    showStatusBar: true,
    showAppBar: true,
    appBarTitle: title,
    showBottomNav: false,
  });
}

/**
 * 전체화면 UI 프리셋 Hook
 * - 상태바: 숨김
 * - AppBar: 숨김
 * - BottomNav: 숨김
 */
export function useFullscreenUI(): void {
  useNativeUI({
    showStatusBar: false,
    showAppBar: false,
    showBottomNav: false,
  });
}

/**
 * 모달형 페이지 UI 프리셋 Hook
 * - 상태바: 표시
 * - AppBar: 표시
 * - BottomNav: 숨김
 */
export function useModalUI(title: string): void {
  useNativeUI({
    showStatusBar: true,
    showAppBar: true,
    appBarTitle: title,
    showBottomNav: false,
  });
}

/**
 * 인증 페이지 UI 프리셋 Hook (로그인 등)
 * - 상태바: 표시 (2026-06-15 사용자 직접 지시 — 인증 화면도 AppStatus 표시로 통일.
 *   상단 안전영역(노치/inset)은 APP 이 viewPadding.top 으로 상태바 가시성과 무관하게
 *   항상 예약하므로 splash→로그인 전환 깜빡임이 없다. 노출 정책 SoT: @/lib/app-status.)
 * - AppBar: 숨김
 * - BottomNav: 숨김
 */
export function useAuthUI(): void {
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
  });
}

/**
 * 뒤로가기 버튼이 있는 상세 페이지 UI 프리셋 Hook
 * - 상태바: 표시
 * - AppBar: 표시 (뒤로가기 버튼 포함)
 * - BottomNav: 숨김
 *
 * @param title - AppBar 타이틀
 * @param onBack - 뒤로가기 버튼 클릭 핸들러
 */
export function useDetailWithBackUI(title: string, onBack: () => void): void {
  useNativeUI({
    showStatusBar: true,
    showAppBar: true,
    appBarTitle: title,
    showBottomNav: false,
    showBackButton: true,
    showMenuButton: false,
    showRefreshButton: false,
    onBackPress: onBack,
  });
}

/**
 * 메뉴 버튼이 있는 페이지 UI 프리셋 Hook
 * - 상태바: 표시
 * - AppBar: 표시 (햄버거 메뉴 버튼 포함)
 * - BottomNav: 표시
 *
 * @param title - AppBar 타이틀
 * @param onMenu - 햄버거 메뉴 버튼 클릭 핸들러
 * @param position - 메뉴 버튼 위치 ('left': 왼쪽, 'right': 오른쪽, 기본: 'left')
 */
export function useMenuUI(
  title: string,
  onMenu: () => void,
  position: 'left' | 'right' = 'left',
): void {
  useNativeUI({
    showStatusBar: true,
    showAppBar: true,
    appBarTitle: title,
    showBottomNav: true,
    showBackButton: false,
    showMenuButton: true,
    menuButtonPosition: position,
    showRefreshButton: false,
    onMenuPress: onMenu,
  });
}

/**
 * 새로고침 버튼이 있는 페이지 UI 프리셋 Hook
 * - 상태바: 표시
 * - AppBar: 표시 (새로고침 버튼 포함)
 * - BottomNav: 표시
 *
 * @param title - AppBar 타이틀
 * @param onRefresh - 새로고침 버튼 클릭 핸들러
 */
export function useRefreshableUI(title: string, onRefresh: () => void): void {
  useNativeUI({
    showStatusBar: true,
    showAppBar: true,
    appBarTitle: title,
    showBottomNav: true,
    showBackButton: false,
    showMenuButton: false,
    showRefreshButton: true,
    onRefreshPress: onRefresh,
  });
}

// 타입 re-export
export type {
  UIConfig,
  AppBarEventHandler,
  AppBarEventType,
} from '@/services/native-bridge';

export default useNativeUI;
