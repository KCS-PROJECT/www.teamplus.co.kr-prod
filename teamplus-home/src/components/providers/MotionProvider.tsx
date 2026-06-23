'use client';

import { MotionConfig } from 'framer-motion';

/**
 * 글로벌 motion provider
 * - reducedMotion="user" — prefers-reduced-motion: reduce 감지 시 모션 즉시 final state로 점프
 * - headless 캡쳐(`--force-prefers-reduced-motion`) 또는 OS 설정에서 모션 비활성
 * - 일반 사용자 브라우저에서는 정상 모션 작동
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
