'use client';

import type { ReactNode } from 'react';
import {
  createContext,
  memo,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { LoadingPuck } from '@/components/ui/LoadingPuck';
// 풀스크린 로딩 시각 통일 (2026-05-07 v8) — 로그인/대시보드/페이지 전환 모든
// 케이스에서 LoadingPuck 사용. login/page.tsx 의 startLoading('fullscreen',
// '로그인 중입니다...') + (parent)/(coach)/(director)/(admin)/(student) 대시보드
// 자체 LoadingPuck 과 시각 통일 → BottomNav 탭 전환도 동일 시각 (사용자 요청).
import { ui, isNativeApp } from '@/services/native-bridge';
import { getCurrentUIConfig } from '@/hooks/useNativeUI';
import {
  getPendingLoadingDataRequestCount,
  subscribeLoadingDataRequests,
} from '@/services/loading-data-tracker';

/**
 * LoadingContext - TEAMPLUS 페이지 전환 로딩 관리
 *
 * 핵심 기능:
 * 1. 원형 스피너 화면 정중앙 표시
 * 2. 로딩 중 모든 클릭/터치 완전 차단
 * 3. 스크롤 방지
 *
 * Design 7 Principles Applied:
 * - NO backdrop-blur
 * - Solid background colors
 * - Human-made design feel
 *
 * 사용 방법:
 * 1. Layout에 <LoadingProvider> 추가
 * 2. 페이지에서 useLoading() 훅 사용
 *
 * @example
 * const { startLoading, stopLoading } = useLoading();
 *
 * // 전체 화면 로딩 (클릭 차단)
 * startLoading('fullscreen', '데이터 로딩 중...');
 *
 * // 작업 완료 후
 * stopLoading();
 */

type LoadingVariant = 'fullscreen' | 'navigation' | 'none';

interface LoadingContextType {
  isLoading: boolean;
  loadingVariant: LoadingVariant;
  loadingMessage: string;
  startLoading: (variant?: LoadingVariant, message?: string) => void;
  stopLoading: () => void;
  setLoadingMessage: (message: string) => void;
  /**
   * 다음 한 번의 fullscreen/navigation 로딩 호출을 무시.
   * BottomNav 탭 터치로 인한 페이지 전환 시 풀스크린 로더가
   * 보이지 않도록 BottomNav 에서 호출.
   */
  suppressNextLoad: () => void;
  /**
   * 페이지 데이터가 준비되었음을 알린다 (Phase 1 갭 차단 — 2026-05-08 v10).
   * handleRouteChange 가 MutationObserver/STABLE_WINDOW 로 OFF 하기 전에,
   * 페이지가 자체 fetch 완료를 명시 신호로 알리면 즉시 finish 사이클 진입
   * (단, MIN_SHOW_DURATION 보장은 그대로 유지).
   *
   * 사용 예:
   *   const { isLoading } = useDashboardData();
   *   usePageReady(!isLoading);  // 헬퍼 훅 — isLoading=false 첫 전환에서 호출
   *
   * 호출이 없어도 기존 MutationObserver/MAX_WAIT 폴백으로 OFF 보장됨.
   */
  signalPageReady: () => void;
}

const LoadingContext = createContext<LoadingContextType | null>(null);

interface LoadingProviderProps {
  children: ReactNode;
  defaultVariant?: LoadingVariant;
}

function afterNextPaint(callback: () => void): () => void {
  if (typeof window === 'undefined') {
    callback();
    return () => {};
  }

  // v16 (2026-05-09): 데이터 idle 이후에도 2 RAF 를 보장.
  // 첫 RAF 는 React commit/스타일 계산, 두 번째 RAF 는 실제 콘텐츠 paint 이후
  // 오버레이를 내리기 위한 여유 프레임이다. 1 RAF 에서는 이미지/카드 레이아웃이
  // 마지막 프레임에 들어오며 로더가 먼저 사라지는 깜박임이 관측됐다.
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

const ROUTE_LOADING_FALLBACK_SELECTOR =
  '[data-route-loading-fallback="true"]';

function hasActiveRouteLoadingFallback(): boolean {
  if (typeof document === 'undefined') return false;
  return document.querySelector(ROUTE_LOADING_FALLBACK_SELECTOR) !== null;
}

/**
 * 내부 컴포넌트: useSearchParams를 사용하여 라우트 변경 감지
 * Next.js 15에서 useSearchParams는 Suspense 경계 내에서 사용해야 함
 */
function RouteChangeHandler({ onRouteChange }: { onRouteChange: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // 라우트 변경 완료 시 로딩 해제
  useEffect(() => {
    onRouteChange();
  }, [pathname, searchParams, onRouteChange]);

  return null;
}

// 풀스크린 로더 OFF 시점 정책 (2026-05-08 v11):
//
//   (구 v9) MIN_SHOW_DURATION=2000ms + MAX_WAIT=8000ms 가 과도하게 길어
//           빠른 페이지에서도 강제 2초 대기, 느린 페이지에선 8초 stuck 인지 발생.
//           signalPageReady() 메커니즘은 데드코드(페이지 호출 0건).
//   (현 v16, 2026-05-09) 사용자 요구 반영 — 로더가 화면/데이터보다 먼저
//   닫히는 깜박임 차단:
//     1. MIN_SHOW_DURATION 300ms — 깜빡임 방지 최소값
//     2. DATA_CAPTURE_WINDOW 220ms + DATA_IDLE_WINDOW 160ms — 라우트 commit 후
//        시작되는 API 요청이 모두 idle 된 뒤 OFF
//     3. STABLE_WINDOW 140ms — DOM 안정 판단
//     4. afterNextPaint 2 RAF — 실제 콘텐츠 paint 이후 오버레이 제거
//     5. MAX_WAIT/startLoadingFailsafeRef 5000ms — 절대 페일세이프
//     6. usePageReady() 명시 신호는 페이지가 데이터 완료를 직접 알리는 fast-path
export function LoadingProvider({
  children,
  defaultVariant = 'navigation',
}: LoadingProviderProps) {
  const [isLoading, setIsLoading] = useState(false);
  // v16.1 (2026-05-16) — fade-out 단계 state. true 인 동안 PageTransitionLoader 가
  // opacity 0 으로 200ms transition 후 실제 unmount → jarring snap 방지.
  const [isHiding, setIsHiding] = useState(false);
  const [loadingVariant, setLoadingVariant] =
    useState<LoadingVariant>(defaultVariant);
  const [loadingMessage, setLoadingMessage] = useState('로딩 중...');
  const loadingStartTimeRef = useRef<number>(0);
  const minDurationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hideAfterPaintCancelRef = useRef<(() => void) | null>(null);
  // v16.1 — fade-out unmount timer
  const fadeOutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPopstateRef = useRef(false);
  // BottomNav 탭 터치로 인한 전환 시 다음 풀스크린/네비게이션 로딩을 1회 무시
  const suppressNextLoadRef = useRef(false);
  // 활성 로더 미러링 — useCallback closure 안에서 stale state 없이 동기 비교용
  const isLoadingRef = useRef(false);
  const loadingVariantRef = useRef<LoadingVariant>(defaultVariant);
  // 페이지 마운트 안정화 대기용 — handleRouteChange 가 즉시 OFF 하지 않고
  // 새 페이지 DOM 안정화 시점까지 기다림. dev 모드 첫 컴파일 갭 차단.
  const pageReadyObserverRef = useRef<MutationObserver | null>(null);
  const pageReadyStableTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pageReadyFailsafeRef = useRef<NodeJS.Timeout | null>(null);
  const dataCaptureTimerRef = useRef<NodeJS.Timeout | null>(null);
  const dataIdleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const dataUnsubscribeRef = useRef<(() => void) | null>(null);
  // 절대 페일세이프 (2026-05-08 v11) — startLoading() 호출 후 라우트 변경이
  // 발생하지 않거나 호출부가 stopLoading() 을 누락한 경우에도 MAX_WAIT 후 강제 OFF.
  // handleRouteChange 의 finish() 가 먼저 실행되면 cleanup 됨.
  const startLoadingFailsafeRef = useRef<NodeJS.Timeout | null>(null);
  // Phase 1 갭 차단 (2026-05-08 v10) — 페이지 자체 데이터 fetch 완료 시
  // signalPageReady() 가 호출되면 true. handleRouteChange.finish() 의 fast-path
  // 트리거. handleRouteChange 진입 시 false 리셋. finish 도달하면 다시 false.
  const pageReadySignaledRef = useRef(false);
  // v16 (2026-05-16) — 사이클 진입 전 들어온 signalPageReady() 도 보관 → 사이클
  // 시작 시점에 즉시 fast-path 발화. race condition (signal → routeChange 순서) 방지.
  // handleRouteChange 사이클 시작 시 한 번 소비(false 리셋)된다.
  const pendingExplicitReadyRef = useRef<boolean>(false);
  // finish() 가 보낼 fast-path 트리거 — handleRouteChange 사이클 안에서만 유효.
  // 호출되지 않은 사이클(loading 미작동)에서는 noop.
  const triggerPageReadyFinishRef = useRef<(() => void) | null>(null);

  const hideLoadingAfterNextPaint = useCallback(
    (options?: { syncNative?: boolean }) => {
      if (hideAfterPaintCancelRef.current) {
        hideAfterPaintCancelRef.current();
        hideAfterPaintCancelRef.current = null;
      }

      hideAfterPaintCancelRef.current = afterNextPaint(() => {
        // v18 (2026-05-22) — 사용자 직접 지시: fullsize 팝업 외 어떤 화면도 노출되어서는 안 됨.
        //   폰트 미로드 상태에서 LoadingPuck 이 unmount 되면 페이지 텍스트가 `?` 박스(tofu)로
        //   잠깐 노출되는 회귀 발생. document.fonts.ready 가 resolve 될 때까지 fade-out 전체
        //   (setIsHiding + setIsLoading) 진입 보류. FONTS_READY_TIMEOUT(1500ms) 안전망으로
        //   폰트 영구 실패 시에도 무한 대기 방지.
        const FADE_OUT_DURATION = 300; // ms — v16.2: fade-out 시간 확대로 더 부드러운 사라짐
        const FONTS_READY_TIMEOUT = 1500;

        const proceedFadeOut = () => {
          setIsHiding(true);
          if (fadeOutTimerRef.current) clearTimeout(fadeOutTimerRef.current);
          fadeOutTimerRef.current = setTimeout(() => {
            fadeOutTimerRef.current = null;
            setIsLoading(false);
            setIsHiding(false);
            isLoadingRef.current = false;
            isPopstateRef.current = false;
            // 절대 페일세이프 정리 (v11) — 로더가 OFF 되면 더 이상 페일세이프 불필요
            if (startLoadingFailsafeRef.current) {
              clearTimeout(startLoadingFailsafeRef.current);
              startLoadingFailsafeRef.current = null;
            }
            hideAfterPaintCancelRef.current = null;
            // 다음 startLoading 사이클이 false-positive 가드를 통과할 수 있도록 시작 시각 리셋
            loadingStartTimeRef.current = 0;

            // Native 앱의 라우트 전환 로딩은 페이지 useNativeUI(isDataLoaded)가
            // 데이터 준비 시점에 직접 종료한다. DOM 안정화만으로 종료하면 status bar가
            // 콘텐츠보다 먼저 노출될 수 있으므로 명시 stopLoading 호출에서만 동기화한다.
            if (isNativeApp() && options?.syncNative !== false) {
              ui.stopLoading().catch(() => {
                // 무시 - Native Bridge 실패해도 계속
              });
              // exitFullscreen — Flutter 측에서 UIConfig 강제 변경 없이 fullscreen 플래그만 해제.
              // (2026-05-12 수정 후) 페이지의 useNativeUI 가 적용한 showAppBar 가 유지됨.
              ui.exitFullscreen().catch(() => {});
              // useNativeUI 가 적용한 lastAppliedConfig 를 재적용 (이중 안전망)
              // startLoading enterFullscreen 으로 강제 변경된 UIConfig 를 페이지별 값으로 복원
              const currentConfig = getCurrentUIConfig();
              ui.setConfig(currentConfig).catch(() => {});
            }
          }, FADE_OUT_DURATION);
        };

        // v18.1 (2026-05-22) — document.fonts.ready 는 "폰트 로드 실패" 도 done 으로
        //   resolve 하므로 iOS WKWebView 에서 Pretendard OTF 9개 통째로 실패한 상태에서도
        //   바로 LoadingPuck 이 unmount → tofu(?) 페이지 노출되는 회귀 발생.
        //   대안: document.fonts.load('1em Pretendard') 명시 호출로 실제 폰트 패밀리 로드
        //   성공 여부를 검증. 성공 또는 FONTS_READY_TIMEOUT(1500ms) 후 fade-out.
        //   타임아웃 시점에도 fallback 체인 (Apple SD Gothic Neo) 으로 한글 글리프 보장됨.
        if (
          typeof document !== 'undefined' &&
          (document as Document & { fonts?: FontFaceSet }).fonts &&
          typeof (document as Document & { fonts: FontFaceSet }).fonts.load === 'function'
        ) {
          let settled = false;
          const fontsTimeout = setTimeout(() => {
            if (settled) return;
            settled = true;
            proceedFadeOut();
          }, FONTS_READY_TIMEOUT);
          const fontSet = (document as Document & { fonts: FontFaceSet }).fonts;
          // Pretendard Regular/Medium/Bold 3개 가중치를 우선 검증 (실사용 가중치).
          Promise.all([
            fontSet.load('400 1em Pretendard'),
            fontSet.load('500 1em Pretendard'),
            fontSet.load('700 1em Pretendard'),
          ])
            .then(() => {
              if (settled) return;
              settled = true;
              clearTimeout(fontsTimeout);
              proceedFadeOut();
            })
            .catch(() => {
              if (settled) return;
              settled = true;
              clearTimeout(fontsTimeout);
              proceedFadeOut();
            });
        } else {
          proceedFadeOut();
        }
      });
    },
    [],
  );

  // 페이지 안정화 대기 자원 정리 헬퍼 — handleRouteChange 와 unmount cleanup 에서 공용 사용
  const clearPageReadyWaiters = useCallback(() => {
    if (pageReadyObserverRef.current) {
      pageReadyObserverRef.current.disconnect();
      pageReadyObserverRef.current = null;
    }
    if (pageReadyStableTimerRef.current) {
      clearTimeout(pageReadyStableTimerRef.current);
      pageReadyStableTimerRef.current = null;
    }
    if (pageReadyFailsafeRef.current) {
      clearTimeout(pageReadyFailsafeRef.current);
      pageReadyFailsafeRef.current = null;
    }
    if (dataCaptureTimerRef.current) {
      clearTimeout(dataCaptureTimerRef.current);
      dataCaptureTimerRef.current = null;
    }
    if (dataIdleTimerRef.current) {
      clearTimeout(dataIdleTimerRef.current);
      dataIdleTimerRef.current = null;
    }
    if (dataUnsubscribeRef.current) {
      dataUnsubscribeRef.current();
      dataUnsubscribeRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (hideAfterPaintCancelRef.current) {
        hideAfterPaintCancelRef.current();
        hideAfterPaintCancelRef.current = null;
      }
      // 절대 페일세이프 unmount cleanup (v11)
      if (startLoadingFailsafeRef.current) {
        clearTimeout(startLoadingFailsafeRef.current);
        startLoadingFailsafeRef.current = null;
      }
      clearPageReadyWaiters();
    };
  }, [clearPageReadyWaiters]);

  // v17 (2026-05-09): startLoading 이후 pathname 이 일정 시간 바뀌지 않는다는
  // 이유만으로 로더를 닫던 타임아웃을 제거했다.
  //
  // Next App Router 는 느린 chunk/RSC/미들웨어 확인 중에는 이전 pathname 을 그대로
  // 유지할 수 있다. 이를 "취소된 네비게이션"으로 오판해 1.8초 후 로더를 내리면,
  // 실제 새 화면이 commit 되기 전 빈 route loading fallback 또는 이전 화면이 노출된다.
  // 동일 경로 클릭/가드 차단은 useNavigation/authGuard 단계에서 이미 걸러지고,
  // 진짜 누락 케이스는 startLoadingFailsafeRef(5초)가 담당한다.

  // pathname 변경 시 로딩 해제 (정상 네비게이션)
  //
  // 🚨 Native 앱: 라우트 변경 시 Web 로딩 상태만 해제
  //    → Native 스피너는 useNativeUI의 isDataLoaded를 통해 제어
  //    → 이렇게 해야 데이터 로딩 완료까지 스피너가 유지됨
  //
  // ⚡ dev 모드 첫 컴파일 갭 차단 (2026-04-30)
  //    Next.js dev 모드에서 router.replace 호출 즉시 pathname 은 변경되지만,
  //    새 페이지의 컴파일·마운트는 수백ms~수 초 늦게 일어난다. pathname 변경 시점에
  //    풀스크린 로더를 즉시 OFF 하면 그 갭에 페이지 자체 로더(LoadingPuck) 또는
  //    빈 슬레이트가 노출되어 "닫혔다 다시 로딩" 으로 인지된다(첫 진입에만 발생,
  //    두 번째부턴 컴파일 캐시되어 마운트가 즉시).
  //
  //    → MutationObserver 로 새 페이지 DOM 변화를 감시하고, STABLE_WINDOW 동안
  //      추가 변화가 없을 때(=마운트·첫 페인트 안정화) 비로소 OFF.
  //      페일세이프 MAX_WAIT 후엔 강제 OFF (실시간 알림 등 지속 변화 페이지 보호).
  //
  //    정상 케이스(prod/캐시됨)에서는 페이지가 즉시 들어와 변화가 거의 없으므로
  //    ~STABLE_WINDOW 후 OFF 되어 체감 차이 거의 없음.
  const handleRouteChange = useCallback(() => {
    // 라우트 변경 완료 시 suppress 플래그 클리어 (사용되지 않은 경우 누수 방지)
    suppressNextLoadRef.current = false;

    // 🛡️ False-positive 방어 — RouteChangeHandler 가 마운트 시점에도 1회 호출되며,
    //    이 시점은 startLoading 이 호출된 적 없는(loadingStartTimeRef === 0) 상태다.
    //    별도 처리 없이 doStopLoading 을 강제 호출하면 이후 startLoading 직후
    //    pathname 변화로 다시 들어오는 정상 호출과 섞여 race 가 발생한다.
    if (loadingStartTimeRef.current === 0) {
      return;
    }

    // 이전 타이머/observer 정리 — 직전 라우트 변경의 대기 사이클이 남아 있을 수 있음
    if (minDurationTimeoutRef.current) {
      clearTimeout(minDurationTimeoutRef.current);
      minDurationTimeoutRef.current = null;
    }
    if (startLoadingFailsafeRef.current) {
      clearTimeout(startLoadingFailsafeRef.current);
      startLoadingFailsafeRef.current = null;
    }
    clearPageReadyWaiters();
    // Phase 1 v10 — 새 사이클 시작이므로 페이지 ready 신호 리셋
    pageReadySignaledRef.current = false;

    // 🕒 v11 (2026-05-08) — 사용자 보고: "로딩바가 안 닫힌다" + "최소 시간 1초로 줄여줘"
    //    + "데이터 렌더링 완료될 때까지 보이도록".
    //
    //    원인: 이전 v9 의 MIN_SHOW_DURATION(2s) + MAX_WAIT(8s) 가 과도하게 길어
    //          빠른 페이지에서도 강제 2초 대기, 느린 페이지에선 8초 stuck 인지 발생.
    //          또한 signalPageReady() 메커니즘이 데드코드(페이지 호출 0건)였음.
    //
    //    해결 (v14, 2026-05-08 — 로그인 → 메인 진입 체감 더 빠르게):
    //      · STABLE_WINDOW: 150 → 100ms (DOM 안정 판단 더 빠르게)
    //      · MIN_SHOW_DURATION: 500 → 300ms (사용자 요구 "여전히 오래 돈다"
    //         — 0.3초만 보장하고 데이터 도착 즉시 OFF. 깜빡임 방지 최소값)
    //      · MAX_WAIT: 5000ms 유지 (타임아웃 정책)
    //
    //    풀스크린 로더가 z-[9999] 로 페이지 콘텐츠를 덮고 있고,
    //    페이지가 usePageReady(!isLoading) 호출 시 fast-path 로 즉시 finish 진입
    //    (단, MIN_SHOW_DURATION 보장은 그대로 유지).
    const STABLE_WINDOW = 140;
    const MAX_WAIT = 5000;
    const MIN_SHOW_DURATION = 300;
    // v18 (2026-05-20): DATA_CAPTURE_WINDOW 220→350. sub-component dynamic import /
    //   Suspense / conditional useQuery 가 mount 후 250~600ms 늦게 fetch 시작하는
    //   케이스를 capture 하기 위해 확장. 총 hide 지연 = MIN_SHOW_DURATION(300) +
    //   DATA_IDLE_WINDOW(160) 380ms → 460ms (+80ms, 인지 불가 범위).
    //   data-sync-1 Phase 4 분석: DATA_TRACKER_AUDIT_2026-05-20.md §3 참조.
    const DATA_CAPTURE_WINDOW = 350;
    const DATA_IDLE_WINDOW = 160;
    const dataSince = loadingStartTimeRef.current || Date.now();

    let finished = false;
    let domStable = false;
    let dataIdle = false;
    let dataCaptureClosed = false;
    // v16 — 사이클 진입 전 들어온 pending signal 도 fast-path 로 합산
    let explicitPageReady =
      pageReadySignaledRef.current || pendingExplicitReadyRef.current;
    pendingExplicitReadyRef.current = false;
    let routeFallbackGone = !hasActiveRouteLoadingFallback();

    const finish = () => {
      if (finished) return;
      finished = true;
      clearPageReadyWaiters();
      // 사이클 종료 — fast-path 트리거 등록 해제
      triggerPageReadyFinishRef.current = null;
      const elapsed = Date.now() - loadingStartTimeRef.current;
      const remain = MIN_SHOW_DURATION - elapsed;

      // v16.2 (2026-05-16) — finish 직전 추가 paint hold.
      // 사용자 추가 지시 #3: "여전히 화면이 그려지는 게 보이고 hide된다 → 셋팅 완료 후 hide".
      // (1) rAF × 3 (~50ms) commit→layout→paint 사이클 보장 — 깜빡임 1차 방어 (유지)
      // (2) + setTimeout — sub-component 자체 mount/paint 안정화 추가 hold
      //
      // [2026-05-30 perf · LD-01] STABILIZE 350 → 120ms 단축. ready 신호 자체가 이미
      //   useStableLayout(150ms) + useImagesReady + useFontsReady AND 합성 이후에만
      //   발화하므로(각 page.tsx usePageReady 호출부), finish() 의 STABILIZE 는
      //   layout 안정 대기를 두 번 하는 중복이었다. "완료 후 더 빨리 hide" 이므로
      //   §11 사용자 직접 지시(데이터+셋팅 완료 전 hide 금지)는 그대로 준수.
      //   rAF×3 + fade-out 300ms 는 깜빡임 방지로 유지(0 단축 비권장).
      //   정책 SoT: docs/Design/LOADING_TIMING_POLICY.md §10 #9 동반 갱신됨.
      const POST_READY_PAINT_HOLD_FRAMES = 3;
      const POST_READY_STABILIZE_MS = 120;

      const runHide = () => {
        if (typeof window === 'undefined' || typeof requestAnimationFrame === 'undefined') {
          hideLoadingAfterNextPaint({ syncNative: false });
          return;
        }
        let count = 0;
        const tick = () => {
          count += 1;
          if (count >= POST_READY_PAINT_HOLD_FRAMES) {
            // rAF 사이클 종료 후 추가 stabilize 시간 부여 → sub-component paint 보장
            setTimeout(() => {
              hideLoadingAfterNextPaint({ syncNative: false });
            }, POST_READY_STABILIZE_MS);
          } else {
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);
      };

      if (remain > 0) {
        // 최소 표시 시간 도달까지 대기 후 OFF (paint hold 적용)
        minDurationTimeoutRef.current = setTimeout(() => {
          minDurationTimeoutRef.current = null;
          runHide();
        }, remain);
      } else {
        runHide();
      }
    };

    // v18 (2026-05-20) — 이미지/폰트 ready 통합은 호출처 통합 패턴으로 처리.
    //   LoadingContext 내부에서 모든 라우트 전환에 무조건 이미지/폰트 대기하면
    //   가벼운 페이지(텍스트만)도 불필요한 hold 가 발생하므로 부작용이 크다.
    //   대신 페이지가 useImagesReady() / useFontsReady() 훅을 직접 호출하고
    //   usePageReady(!isLoading && !!data && imagesReady && fontsReady) 형태로
    //   ready 신호에 합산한다. explicitPageReady fast-path 가 이 경우 트리거된다.
    //
    //   예시:
    //     const imagesReady = useImagesReady([banners, recentNotices]);
    //     const fontsReady = useFontsReady();
    //     usePageReady(!isLoading && !!data && imagesReady && fontsReady);
    const maybeFinish = () => {
      if (finished) return;
      // Next App Router loading.tsx fallback 이 아직 DOM 에 있으면 실제 화면
      // segment 가 commit 되지 않은 상태다. 여기서 로더를 내리면 빈 배경만 보인다.
      if (!routeFallbackGone) return;
      // usePageReady() explicitPageReady 신호가 도착해야만 finish.
      // 모든 페이지(243/243)가 usePageReady 100% 커버리지이므로
      // 새 페이지 마운트 + 데이터 로드 완료 전에는 로더를 유지한다.
      // dev 모드 on-demand 컴파일 지연으로 새 페이지 미도착 상태에서
      // 로더가 닫히는 문제(이전 페이지 flash) 해소.
      // usePageReady 신호가 오지 않는 극단적 경우는 MAX_WAIT(5000ms) failsafe가 처리.
      if (explicitPageReady) {
        finish();
        return;
      }
    };

    // Phase 1 v16 — 페이지 ready 신호가 오면 DOM 추정 대신 명시 신호로 종료.
    triggerPageReadyFinishRef.current = () => {
      explicitPageReady = true;
      maybeFinish();
    };
    if (explicitPageReady) {
      maybeFinish();
    }
    if (finished) return;

    const armDataIdleTimer = () => {
      if (dataIdleTimerRef.current) {
        clearTimeout(dataIdleTimerRef.current);
        dataIdleTimerRef.current = null;
      }
      dataIdle = false;

      if (!dataCaptureClosed) return;

      const pendingCount = getPendingLoadingDataRequestCount({
        since: dataSince,
      });
      if (pendingCount > 0) return;

      dataIdleTimerRef.current = setTimeout(() => {
        dataIdleTimerRef.current = null;
        if (
          getPendingLoadingDataRequestCount({
            since: dataSince,
          }) === 0
        ) {
          dataIdle = true;
          maybeFinish();
        }
      }, DATA_IDLE_WINDOW);
    };

    dataUnsubscribeRef.current = subscribeLoadingDataRequests(() => {
      armDataIdleTimer();
    });
    dataCaptureTimerRef.current = setTimeout(() => {
      dataCaptureTimerRef.current = null;
      dataCaptureClosed = true;
      armDataIdleTimer();
    }, DATA_CAPTURE_WINDOW);

    // Cycle gating — 사이클 시작 후 1초가 지나면 추가 DOM 변화로
    //   armStableTimer() 가 호출되어도 더 이상 STABLE_WINDOW 만큼 지연시키지 않고
    //   즉시 stable 처리한다. 단, 이제 dataIdle 조건을 함께 보므로 데이터 fetch 중
    //   빈 화면이 먼저 노출되지 않는다.
    const cycleStartedAt = Date.now();
    const armStableTimer = () => {
      if (pageReadyStableTimerRef.current) {
        clearTimeout(pageReadyStableTimerRef.current);
      }
      const elapsed = Date.now() - cycleStartedAt;
      const window = elapsed > 1000 ? 0 : STABLE_WINDOW;
      pageReadyStableTimerRef.current = setTimeout(() => {
        pageReadyStableTimerRef.current = null;
        routeFallbackGone = !hasActiveRouteLoadingFallback();
        if (!routeFallbackGone) {
          domStable = false;
          return;
        }
        domStable = true;
        maybeFinish();
      }, window);
    };

    const finishAfterFallbackOrFailsafe = () => {
      if (finished) return;
      routeFallbackGone = !hasActiveRouteLoadingFallback();
      if (!routeFallbackGone) {
        // route loading fallback 이 살아 있으면 "stuck" 이 아니라 Next 가 아직
        // 화면 segment 를 준비 중인 상태다. 빈 fallback 노출 대신 로더를 유지하고
        // 제거 mutation 을 놓친 경우를 대비해 짧게 재확인한다.
        pageReadyFailsafeRef.current = setTimeout(
          finishAfterFallbackOrFailsafe,
          500,
        );
        return;
      }
      finish();
    };

    if (
      typeof window !== 'undefined' &&
      typeof MutationObserver !== 'undefined' &&
      typeof document !== 'undefined'
    ) {
      pageReadyObserverRef.current = new MutationObserver(() => {
        // 변화 감지 → 안정 타이머 재시작 (cycle gating 안에서만)
        routeFallbackGone = !hasActiveRouteLoadingFallback();
        domStable = false;
        armStableTimer();
      });
      pageReadyObserverRef.current.observe(document.body, {
        childList: true,
        subtree: true,
      });
      // 첫 변화가 없는 정상 케이스도 STABLE_WINDOW 후 stable 되도록 즉시 한 번 셋
      armStableTimer();
      // 페일세이프 — 페이지가 끊임없이 변화하거나 요청이 길어도 MAX_WAIT 후 OFF.
      // 단, Next route fallback 이 있으면 빈 화면 노출 방지를 위해 fallback 제거까지 유지.
      pageReadyFailsafeRef.current = setTimeout(
        finishAfterFallbackOrFailsafe,
        MAX_WAIT,
      );
    } else {
      // SSR / Observer 미지원 환경: DOM stable 은 즉시 충족, data idle 은 계속 대기
      routeFallbackGone = !hasActiveRouteLoadingFallback();
      domStable = true;
      maybeFinish();
      pageReadyFailsafeRef.current = setTimeout(
        finishAfterFallbackOrFailsafe,
        MAX_WAIT,
      );
    }
  }, [hideLoadingAfterNextPaint, clearPageReadyWaiters]);

  // 브라우저 뒤로가기/앞으로가기 버튼 클릭 시 스피너 표시
  useEffect(() => {
    const handlePopstate = () => {
      // popstate 이벤트 발생 시 상단 프로그레스 바 표시
      isPopstateRef.current = true;
      // 동기 ref 도 함께 갱신 — startLoading 중복 가드 / handleRouteChange minDuration 정합성 유지
      isLoadingRef.current = true;
      loadingVariantRef.current = 'navigation';
      loadingStartTimeRef.current = Date.now();
      setIsLoading(true);
      setLoadingVariant('navigation');
      // v18 (2026-05-22): 메시지 분기 제거 — LoadingPuck 은 텍스트를 표시하지
      //   않으므로 "이동 중....." / "로딩중" 단계 변화가 시각적으로 발생하지 않게
      //   message 갱신을 하지 않는다. 단일 fullsize 팝업 유지.
      // 🖥️ popstate 도 navigation 흐름과 동일하게 Native 풀스크린 진입.
      if (isNativeApp()) {
        ui.enterFullscreen().catch(() => {});
      }
    };

    window.addEventListener('popstate', handlePopstate);
    return () => {
      window.removeEventListener('popstate', handlePopstate);
    };
  }, []);

  const startLoading = useCallback(
    (variant: LoadingVariant = defaultVariant, message = '로딩 중...') => {
      // BottomNav 탭 터치로 진입한 경우, 첫 풀스크린/네비게이션 로딩 한 번을 무시
      if (
        suppressNextLoadRef.current &&
        (variant === 'fullscreen' || variant === 'navigation')
      ) {
        suppressNextLoadRef.current = false;
        return;
      }

      // 🛡️ 중복 호출 방어 — 이미 같은(또는 fullscreen↔navigation 호환) variant 로 활성 중이면
      //    loadingStartTimeRef 를 갱신하지 않는다. 그러지 않으면 handleRouteChange 의
      //    minDuration 비교가 매번 0 으로 리셋되어 로더가 늘어지거나 닫힘 타이밍이 어긋난다.
      //    메시지만 덮어써 호출부가 안내 문구를 갱신할 수 있게 한다.
      if (
        isLoadingRef.current &&
        (variant === loadingVariantRef.current ||
          (loadingVariantRef.current !== 'none' && variant !== 'none'))
      ) {
        if (message) setLoadingMessage(message);
        return;
      }

      // React 18+ 자동 배칭으로 동기적으로 상태 업데이트
      // 로딩 시작 시간 기록
      if (hideAfterPaintCancelRef.current) {
        hideAfterPaintCancelRef.current();
        hideAfterPaintCancelRef.current = null;
      }
      pageReadySignaledRef.current = false;
      triggerPageReadyFinishRef.current = null;
      loadingStartTimeRef.current = Date.now();
      isLoadingRef.current = true;
      loadingVariantRef.current = variant;
      setIsLoading(true);
      setLoadingVariant(variant);
      setLoadingMessage(message);

      // 절대 페일세이프 (v12, 2026-05-08) — 라우트 변경 없이 startLoading 호출되거나
      // 호출부가 stopLoading() 을 누락한 경우에도 5초 후 강제 OFF.
      // 사용자 요구: "타임아웃 5초까지만" — MAX_WAIT 와 동일 5000ms 로 통일하여
      // 어떤 경로로도 5초 이상 stuck 되지 않음을 보장.
      // handleRouteChange 의 finish()/MAX_WAIT 가 먼저 실행되면 cleanup 됨.
      if (startLoadingFailsafeRef.current) {
        clearTimeout(startLoadingFailsafeRef.current);
      }
      startLoadingFailsafeRef.current = setTimeout(() => {
        startLoadingFailsafeRef.current = null;
        if (isLoadingRef.current) {
          loadingStartTimeRef.current = 0;
          clearPageReadyWaiters();
          hideLoadingAfterNextPaint({ syncNative: true });
        }
      }, 5000);

      // Native 앱에서 FullScreen 로딩 시 Native 스피너 표시
      if (variant === 'fullscreen' && isNativeApp()) {
        ui.startLoading().catch(() => {
          // 무시 - Native Bridge 실패해도 Web 로딩은 계속
        });
      }

      // 🖥️ Native 풀스크린 진입 (2026-05-07 v7) — Web 풀스크린 로더가 떠 있는
      //    동안 Flutter native StatusBar/AppBar/BottomNav 를 모두 숨겨 사용자가
      //    "상단 appstatus 영역 / 하단 navi status 영역이 보인다" 는 보고를 해소.
      //    enterFullscreen 은 webview_bridge.dart 의 UIConfig(showStatusBar:false,
      //    showAppBar:false, showBottomNav:false) 를 한 번에 적용한다.
      //    navigation/fullscreen 두 variant 모두에 적용 — Web 풀스크린 로더가
      //    렌더되는 모든 케이스와 짝맞춤.
      if (
        (variant === 'navigation' || variant === 'fullscreen') &&
        isNativeApp()
      ) {
        ui.enterFullscreen().catch(() => {
          // 무시 - Native Bridge 실패해도 Web 풀스크린은 계속
        });
      }
    },
    [defaultVariant, clearPageReadyWaiters, hideLoadingAfterNextPaint],
  );

  const suppressNextLoad = useCallback(() => {
    suppressNextLoadRef.current = true;
  }, []);

  // Phase 1 갭 차단 (2026-05-08 v10) — 페이지 데이터 fetch 완료 시 호출.
  // 활성 사이클이 있으면 finish() fast-path, 없으면 다음 사이클 시작 시 즉시 finish.
  //
  // v16 (2026-05-16) — pendingExplicitReadyRef 추가로 race condition 방지.
  // signalPageReady() 가 handleRouteChange 사이클보다 먼저 들어와도 보관되고,
  // 사이클 시작 시점에서 explicitPageReady 로 즉시 합산되어 fast-path 발화한다.
  const signalPageReady = useCallback(() => {
    pageReadySignaledRef.current = true;
    pendingExplicitReadyRef.current = true;
    const trigger = triggerPageReadyFinishRef.current;
    if (trigger) {
      trigger();
    }
  }, []);

  const stopLoading = useCallback(() => {
    // 최소 시간 타이머 정리
    if (minDurationTimeoutRef.current) {
      clearTimeout(minDurationTimeoutRef.current);
      minDurationTimeoutRef.current = null;
    }
    // 절대 페일세이프 정리 (v11) — 정상 stopLoading 호출 시 페일세이프 불필요
    if (startLoadingFailsafeRef.current) {
      clearTimeout(startLoadingFailsafeRef.current);
      startLoadingFailsafeRef.current = null;
    }
    // 안정화 대기 사이클이 진행 중이면 함께 정리 (호출부가 명시적으로 OFF 를 원하는 경우)
    clearPageReadyWaiters();
    loadingStartTimeRef.current = 0;

    hideLoadingAfterNextPaint({ syncNative: true });
  }, [hideLoadingAfterNextPaint, clearPageReadyWaiters]);

  const updateLoadingMessage = useCallback((message: string) => {
    setLoadingMessage(message);
  }, []);

  return (
    <LoadingContext.Provider
      value={{
        isLoading,
        loadingVariant,
        loadingMessage,
        startLoading,
        stopLoading,
        setLoadingMessage: updateLoadingMessage,
        suppressNextLoad,
        signalPageReady,
      }}
    >
      {/* Suspense로 useSearchParams 감싸기 (Next.js 15 필수) */}
      <Suspense fallback={null}>
        <RouteChangeHandler onRouteChange={handleRouteChange} />
      </Suspense>

      {/* 메인 콘텐츠 */}
      {children}

      {/* Navigation Loading Bar 제거 — 상단 프로그레스 바 비활성화 */}

      {/* Full Screen Loader (화면 중앙 + 클릭 차단)
          ─── 렌더 조건 (2026-05-07 v6) ───────────────────────────────────────
          - 'navigation' (페이지 전환, BottomNav 탭 클릭 등): isNativeApp 무관
            하게 항상 Web 풀스크린 로더 표시. (구) `!isNativeApp()` 가드는
            Native(Flutter WebView)/iOS 시뮬레이터/Android 에뮬레이터 환경에서
            Flutter 자체 스피너에 위임하려는 의도였으나, navigation variant 는
            Flutter `ui.startLoading()` 을 호출하지 않아 어떤 로더도 표시되지
            않는 상태였다. 사용자 보고: "web만 보이고 네이티브/시뮬레이터/
            에뮬레이터에서는 안 나옴" → navigation 은 Web 측에서 통합 처리.
          - 'fullscreen' (결제 완료 등 명시적 작업): Native 환경에서는 Flutter
            `ui.startLoading()` 으로 위임 (기존 정책 유지) — Web 풀스크린은
            중복 표시 방지 위해 차단. */}
      {isLoading &&
        (loadingVariant === 'fullscreen' || loadingVariant === 'navigation') &&
        (loadingVariant === 'navigation' || !isNativeApp()) && (
          <PageTransitionLoader message={loadingMessage} isHiding={isHiding} />
        )}
    </LoadingContext.Provider>
  );
}

/**
 * PageTransitionLoader — 라우트 기반 로더 자동 분기
 *
 * Phase 2 SPEC §2.3 + LOADING_THEME_SPEC §S2 — 결제 컨텍스트 라우트 진입 시
 * LoadingRing(L2), 그 외 모든 페이지 전환은 LoadingPuck(L1).
 *
 * 결제 매칭 경로:
 * - `/payment*`, `/checkout*`, `/options`, `/select`, `/parent/credits` (기존)
 * - `/shop-checkout`, `/shop/cart`, `/cart` (쇼핑 결제 흐름 — 신규)
 * - `/matches/[id]/payment` (매치 참가 결제 — 신규)
 *
 * 메시지 우선순위:
 * - `loadingMessage` 가 명시적으로 전달된 경우 그대로 사용 (호출부 책임)
 * - 미지정 시 각 컴포넌트 기본 메시지("수업 정보를 불러오는 중" / "결제 처리 중") 적용
 */
function PageTransitionLoader({
  message,
  isHiding = false,
}: {
  message: string;
  isHiding?: boolean;
}) {
  // v18 (2026-05-22) — 단일 fullsize 팝업 정책 (사용자 직접 지시):
  //   "fullsize 팝업 하나만, 어떤 화면도 추가되어서는 안 됨".
  //   LoadingPuck 은 텍스트(title/message)를 렌더하지 않으므로 message prop 무시.
  //   문구 단계 변화("이동중 → 로딩중") 시각적으로 불가능.
  void message; // suppress unused — interface 호환만 유지

  return (
    <div
      className={isHiding ? 'opacity-0' : 'opacity-100'}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        transform: 'translate3d(0, 0, 0)',
        willChange: 'opacity',
        pointerEvents: isHiding ? 'none' : 'auto',
        // v16.1 (2026-05-16) — fade-out transition. 사용자 직접 지시:
        //   "셋팅 완료 후 hide". setIsHiding(true) → opacity 300ms → unmount.
        // v17 (2026-05-16) — fade-in 은 제거됐으나 fade-out transition 은 유지.
        //   첫 paint 에서는 opacity-100 으로 시작하므로 transition 이 발화하지 않고,
        //   isHiding 토글 시점에만 opacity 1 → 0 으로 300ms 부드럽게 사라짐.
        transition: 'opacity 300ms cubic-bezier(0.45, 0, 0.55, 1)',
      }}
    >
      <LoadingPuck />
    </div>
  );
}

/**
 * useLoading Hook
 * 로딩 상태를 관리하는 커스텀 훅
 *
 * @example
 * const { startLoading, stopLoading, isLoading } = useLoading();
 *
 * const handleClick = async () => {
 *   startLoading('fullscreen', '처리 중...');
 *   try {
 *     await someAsyncOperation();
 *   } finally {
 *     stopLoading();
 *   }
 * };
 */
export function useLoading() {
  const context = useContext(LoadingContext);
  if (!context) {
    throw new Error('useLoading must be used within a LoadingProvider');
  }
  return context;
}

/**
 * useAsyncAction Hook
 * 비동기 작업에 로딩 상태를 자동으로 적용하는 훅
 *
 * @example
 * const executeWithLoading = useAsyncAction();
 *
 * const handleSubmit = () => {
 *   executeWithLoading(async () => {
 *     await submitForm(data);
 *   }, '저장 중...');
 * };
 */
export function useAsyncAction() {
  const { startLoading, stopLoading } = useLoading();

  return useCallback(
    async <T,>(
      asyncFn: () => Promise<T>,
      message = '처리 중...',
      variant: LoadingVariant = 'fullscreen',
    ): Promise<T> => {
      startLoading(variant, message);
      try {
        return await asyncFn();
      } finally {
        stopLoading();
      }
    },
    [startLoading, stopLoading],
  );
}

/**
 * NavigationLoadingIndicator - 비활성화됨
 * 상단 프로그레스 바 제거 (2026-04-13)
 */
export const NavigationLoadingIndicator = memo(
  function NavigationLoadingIndicator() {
    return null;
  },
);

export default LoadingContext;
