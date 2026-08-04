'use client';

import { useEffect } from 'react';
import { MotionConfig } from 'framer-motion';

/**
 * 글로벌 motion provider
 * - reducedMotion="user" — prefers-reduced-motion: reduce 감지 시 모션 즉시 final state로 점프
 * - headless 캡쳐(`--force-prefers-reduced-motion`) 또는 OS 설정에서 모션 비활성
 * - 일반 사용자 브라우저에서는 정상 모션 작동
 * - 마운트 시 <html>.tp-hydrated 부착 — globals.css 의 하이드레이션 안전망(강제 리빌) 해제 신호.
 *   JS 가 늦게 도착하는 환경에서 framer-motion 초기 숨김 요소가 빈 화면으로 남는 것을 막는다.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add('tp-hydrated');
  }, []);

  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
