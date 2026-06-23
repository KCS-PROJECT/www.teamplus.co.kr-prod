'use client';

/**
 * useScreenMetrics — 화면 해상도 기반 전역 autolayout SoT 훅
 *
 * Native (Flutter WebView) 환경에서는 Flutter MediaQuery 의 logical pixels 값을,
 * Web 브라우저 환경에서는 `window.visualViewport` / `window.innerWidth` 값을 동일
 * 인터페이스로 노출합니다. `ClientProviders` 의 `subscribeToDeviceMetrics` 가 CSS
 * 변수를 주입하므로 컴포넌트는 본 훅으로 React 상태를 구독하기만 하면 됩니다.
 *
 * 주의:
 *   - 본 훅은 React 상태를 갱신하므로 `<MobileContainer>` 등 자주 리렌더되는 곳보다
 *     특정 컴포넌트(브레이크포인트 분기 분기 가드, 폼 키보드 가림 보정 등)에서 사용 권장.
 *     스타일은 가능한 CSS 변수(`var(--screen-width)`, `[data-screen-bp]`)로 처리하여
 *     리렌더 비용을 0 으로 유지하세요.
 *
 * @example
 * ```tsx
 * const { breakpoint, width, orientation, isNative } = useScreenMetrics();
 * if (breakpoint === 'xs') return <CompactLayout />;
 * return <DefaultLayout />;
 * ```
 *
 * @example CSS-only (권장)
 * ```css
 * .card {
 *   padding: 12px;
 * }
 * [data-screen-bp="xs"] .card { padding: 8px; }
 * [data-screen-bp="lg"] .card,
 * [data-screen-bp="xl"] .card { padding: 16px; }
 * ```
 */

import { useEffect, useState } from 'react';
import { isNativeApp } from '@/lib/environment';
import {
  computeScreenBreakpoint,
  type ScreenBreakpoint,
} from '@/services/native-bridge';

export interface ScreenMetrics {
  /** 논리 화면 폭 (CSS px) — Native MediaQuery 또는 visualViewport */
  width: number;
  /** 논리 화면 높이 (CSS px) */
  height: number;
  /** Device Pixel Ratio (e.g. 2, 3) */
  dpr: number;
  /** 화면 방향 */
  orientation: 'portrait' | 'landscape';
  /** Breakpoint (autolayout 분기) */
  breakpoint: ScreenBreakpoint;
  /** Flutter WebView 환경 여부 */
  isNative: boolean;
  /** 키보드 가림 (visualViewport 차이 추정 또는 Flutter viewInsets.bottom) */
  keyboardInsetBottom: number;
}

const SSR_FALLBACK: ScreenMetrics = {
  width: 360,
  height: 740,
  dpr: 1,
  orientation: 'portrait',
  breakpoint: 'sm',
  isNative: false,
  keyboardInsetBottom: 0,
};

function readMetricsFromDocument(): ScreenMetrics {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return SSR_FALLBACK;
  }
  const w = window.visualViewport?.width ?? window.innerWidth;
  const h = window.visualViewport?.height ?? window.innerHeight;
  const dpr = window.devicePixelRatio || 1;
  const orientation: 'portrait' | 'landscape' = w > h ? 'landscape' : 'portrait';
  const keyboardInsetBottom = Math.max(0, window.innerHeight - h);

  // CSS 변수에서 Native injected 값을 우선 시도
  const root = document.documentElement;
  const screenBp =
    (root.dataset.screenBp as ScreenBreakpoint | undefined) ??
    computeScreenBreakpoint(w);

  return {
    width: w,
    height: h,
    dpr,
    orientation,
    breakpoint: screenBp,
    isNative: isNativeApp(),
    keyboardInsetBottom,
  };
}

export function useScreenMetrics(): ScreenMetrics {
  const [metrics, setMetrics] = useState<ScreenMetrics>(SSR_FALLBACK);

  useEffect(() => {
    let pendingFrame = 0;
    const update = (): void => {
      if (pendingFrame) cancelAnimationFrame(pendingFrame);
      pendingFrame = requestAnimationFrame(() => {
        pendingFrame = 0;
        setMetrics(readMetricsFromDocument());
      });
    };

    update();

    window.addEventListener('resize', update, { passive: true });
    window.addEventListener('orientationchange', update, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', update, {
        passive: true,
      });
    }

    return () => {
      if (pendingFrame) cancelAnimationFrame(pendingFrame);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', update);
      }
    };
  }, []);

  return metrics;
}

/** 특정 breakpoint 이하인지 검사 — `useScreenMetrics().breakpoint <= 'sm'` 단축 헬퍼 */
export function useIsCompactScreen(): boolean {
  const { breakpoint } = useScreenMetrics();
  return breakpoint === 'xs' || breakpoint === 'sm';
}

export type { ScreenBreakpoint };
