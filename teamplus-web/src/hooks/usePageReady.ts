'use client';

import { useEffect, useRef } from 'react';
import { useLoading } from '@/contexts/LoadingContext';

/**
 * usePageReady — 페이지 데이터 fetch 완료 신호
 *
 * Phase 1 갭 차단 (2026-05-08 v10).
 * 풀스크린 LoadingPuck 이 OFF 되는 시점을 페이지 데이터 도착 시점에 정확히
 * 동기화한다. 호출이 없는 페이지는 기존 MutationObserver/MAX_WAIT 폴백으로
 * 계속 동작한다.
 *
 * 사용:
 *   const { isLoading, data } = useDashboardData();
 *   usePageReady(!isLoading && !!data);
 *
 * isReady 가 false → true 로 전환되는 첫 시점에 LoadingContext.signalPageReady()
 * 1회 호출. 이후 동일 마운트에서 재호출되지 않는다 (라우트가 바뀌면 새 마운트
 * 사이클이라 자동으로 재초기화).
 */
export function usePageReady(isReady: boolean): void {
  const { signalPageReady } = useLoading();
  const signaledRef = useRef(false);

  useEffect(() => {
    if (isReady && !signaledRef.current) {
      signaledRef.current = true;
      signalPageReady();
    }
  }, [isReady, signalPageReady]);
}
