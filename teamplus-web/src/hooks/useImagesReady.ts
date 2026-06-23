'use client';

import type { DependencyList } from 'react';
import { useEffect, useState } from 'react';

/**
 * useImagesReady — 페이지 내 IMG 요소 모두 decode() 완료 대기.
 *
 * SPEC §3.1 / LOADING_TIMING_POLICY v18 — 풀스크린 로더가 데이터 도착 후에도
 * 큰 히어로/배너 이미지가 아직 로드 중이면 hide 직후 깜빡임 발생. 페이지가
 * usePageReady() 에 imagesReady 를 합산하여 이미지 로드 완료까지 대기.
 *
 * deps 가 변경되면 (예: API 응답 도착 후 새 이미지 URL 도입) ready 가 false
 * 로 리셋되고 다시 decode() 대기 후 true.
 *
 * 동작 원리:
 *  1. SSR/document 미지원 환경에서는 즉시 true (graceful degradation).
 *  2. requestAnimationFrame × 2 후 IMG 수집 — deps 변경 직후 새 IMG 가 아직
 *     DOM 에 마운트되지 않은 경우(다음 paint cycle) 까지 기다림.
 *  3. img.complete && img.naturalHeight > 0 인 경우 이미 decoded 상태로 간주.
 *  4. 그 외에는 img.decode() Promise 대기. decode() 가 실패해도 (404 등)
 *     ready 신호를 막지 않도록 catch → undefined.
 *  5. unmount/deps 재실행 시 cancelled flag 로 stale setState 방지.
 *
 * @param deps 이미지 URL이 변경되는 의존성 배열 (예: [banners, recentNotices])
 * @returns isReady — 모든 IMG decode 완료 시 true
 *
 * @example
 *   const imagesReady = useImagesReady([banners, recentNotices]);
 *   const fontsReady = useFontsReady();
 *   usePageReady(!isLoading && imagesReady && fontsReady);
 */
export function useImagesReady(deps: DependencyList = []): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof document === 'undefined') {
      setReady(true);
      return;
    }

    let cancelled = false;
    let raf2Id = 0;
    setReady(false);

    // 다음 paint 후 IMG 수집 (deps 변경으로 인한 새 IMG 마운트 대기 — 2 RAF)
    const raf1Id = window.requestAnimationFrame(() => {
      raf2Id = window.requestAnimationFrame(() => {
        if (cancelled) return;

        const imgs = Array.from(document.querySelectorAll('img'));
        if (imgs.length === 0) {
          setReady(true);
          return;
        }

        Promise.all(
          imgs.map((img) => {
            if (img.complete && img.naturalHeight > 0) {
              return Promise.resolve();
            }
            // decode() 실패는 ready 신호를 막지 않음 (404 이미지 등)
            return img.decode().catch(() => undefined);
          }),
        ).then(() => {
          if (!cancelled) setReady(true);
        });
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf1Id);
      if (raf2Id) window.cancelAnimationFrame(raf2Id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ready;
}
