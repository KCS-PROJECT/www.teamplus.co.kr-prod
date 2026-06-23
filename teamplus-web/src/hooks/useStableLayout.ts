'use client';

/**
 * useStableLayout — v16.3 Loading Stable Paint SoT
 *
 * 메인 화면 sub-component 전체 paint 완료 여부를 명시적으로 감지하는 훅.
 * ResizeObserver 로 target element 의 contentRect 변화를 추적하여,
 * 마지막 변화 후 `stableMs`(기본 400ms) 동안 변화 없을 때 `isStable=true` 반환.
 *
 * **목적**: usePageReady 와 합성하여, 데이터 fetch 완료 + 화면 셋팅 완료 후에도
 * sub-component (BannerCarousel, ChildrenSwipeCards, ClassCalendarSection 등) 의
 * mount/paint 가 모두 stable 한 상태에서만 풀스크린 로더를 hide 한다.
 *
 * **근거**:
 * - SPEC: `docs/Planning/SPEC_LOADING_STABLE_PAINT.md` §2.1 (v16.3)
 * - 정책: `docs/Design/LOADING_TIMING_POLICY.md` v16.3
 * - 사용자 직접 지시 (2026-05-16): "메인 화면 sub-component 전체 paint 완료 후 hide"
 *
 * **폴백 정책**:
 * - SSR 환경 (`typeof window === 'undefined'`): `setTimeout(stableMs)` 후 즉시 stable=true
 * - ResizeObserver 미지원 환경: 동일하게 `setTimeout(stableMs)` 폴백
 * - `enabled=false`: `setTimeout(stableMs)` 후 stable=true (훅 우회용)
 *
 * @example
 * ```tsx
 * const mainRef = useRef<HTMLElement>(null);
 * const isLayoutStable = useStableLayout(mainRef, { stableMs: 400 });
 *
 * usePageReady(
 *   !isChildrenLoading && teams !== null && calendarReady && isLayoutStable
 * );
 *
 * return (
 *   <main ref={mainRef}>
 *     <BannerCarousel />
 *     <ChildrenSwipeCards />
 *     <ClassCalendarSection />
 *   </main>
 * );
 * ```
 */
import { useEffect, useRef, useState, type RefObject } from 'react';

export interface UseStableLayoutOptions {
  /**
   * 훅 활성화 여부. `false` 일 경우 `stableMs` 후 즉시 stable=true 로 fallback.
   * @default true
   */
  enabled?: boolean;
  /**
   * 마지막 layout 변화 후 stable 로 판정하기까지의 대기 시간 (ms).
   * 너무 짧으면 sub-component mount 이전 false-positive, 너무 길면 로더 잔존.
   * @default 400
   */
  stableMs?: number;
  /**
   * 컴포넌트 mount 직후 첫 안정화 타이머 시작까지의 지연 (ms).
   * React commit + paint 1회 보장을 위한 buffer.
   * @default 50
   */
  initialDelayMs?: number;
}

/**
 * Target element 의 layout 안정화 여부를 반환하는 hook.
 *
 * @param targetRef - 안정화를 감지할 root element 의 ref (보통 `<main>`)
 * @param options - {@link UseStableLayoutOptions}
 * @returns `isStable` — 마지막 ResizeObserver callback 이후 `stableMs` 가 경과했는가
 */
export function useStableLayout(
  targetRef: RefObject<HTMLElement | null>,
  options?: UseStableLayoutOptions,
): boolean {
  const { enabled = true, stableMs = 400, initialDelayMs = 50 } = options ?? {};
  const [isStable, setIsStable] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // SSR 가드: window/ResizeObserver 미지원 또는 enabled=false → setTimeout 폴백
    if (
      !enabled ||
      typeof window === 'undefined' ||
      typeof ResizeObserver === 'undefined'
    ) {
      const fallbackTimer = setTimeout(() => setIsStable(true), stableMs);
      return () => clearTimeout(fallbackTimer);
    }

    const target = targetRef.current;
    if (!target) {
      // ref 미연결 시에도 stable=false 잠금 방지를 위해 setTimeout 폴백
      const noTargetTimer = setTimeout(() => setIsStable(true), stableMs);
      return () => clearTimeout(noTargetTimer);
    }

    const reset = () => {
      setIsStable(false);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setIsStable(true);
      }, stableMs);
    };

    const observer = new ResizeObserver(() => reset());
    observer.observe(target);

    // 초기 진입: initialDelayMs 후 첫 안정화 타이머 시작
    const initTimer = setTimeout(reset, initialDelayMs);

    return () => {
      observer.disconnect();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      clearTimeout(initTimer);
    };
  }, [enabled, stableMs, initialDelayMs, targetRef]);

  return isStable;
}
