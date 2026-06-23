'use client';

import { useEffect, useState } from 'react';

/**
 * useFontsReady — document.fonts.ready Promise 활용.
 *
 * SPEC §3.1 / LOADING_TIMING_POLICY v18 — Pretendard 폰트 swap 시 텍스트
 * 깜빡임. 풀스크린 로더가 hide 되기 전 폰트 로드 완료 보장.
 *
 * SSR/구형 브라우저 대응: document.fonts 미지원 환경에서는 즉시 true.
 * document.fonts.status === 'loaded' 인 경우 (캐시된 폰트) 초기값을 true 로
 * 시작하여 첫 paint 부터 ready 신호 합산이 가능.
 *
 * 동작 원리:
 *  1. SSR — typeof document === 'undefined' → 초기 true.
 *  2. 구형 브라우저 — 'fonts' 미지원 → 초기 true.
 *  3. 이미 로드된 캐시 폰트 — document.fonts.status === 'loaded' → 초기 true.
 *  4. 그 외 — 초기 false, document.fonts.ready Promise 해결 후 true.
 *  5. unmount 시 cancelled flag 로 stale setState 방지.
 *
 * @returns isReady — 모든 폰트 로드 완료 시 true
 *
 * @example
 *   const imagesReady = useImagesReady([banners]);
 *   const fontsReady = useFontsReady();
 *   usePageReady(!isLoading && imagesReady && fontsReady);
 */
export function useFontsReady(): boolean {
  const [ready, setReady] = useState<boolean>(() => {
    if (typeof document === 'undefined') return true;
    if (!('fonts' in document)) return true;
    const fonts = (document as Document & { fonts: FontFaceSet }).fonts;
    return fonts.status === 'loaded';
  });

  useEffect(() => {
    if (typeof document === 'undefined' || !('fonts' in document)) return;

    let cancelled = false;
    const fonts = (document as Document & { fonts: FontFaceSet }).fonts;

    // 이미 로드 완료된 경우 (캐시 환경) — 추가 대기 불필요
    if (fonts.status === 'loaded') {
      setReady(true);
      return;
    }

    fonts.ready
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        // 폰트 로드 실패해도 ready 신호 차단 금지 (graceful degradation)
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return ready;
}
