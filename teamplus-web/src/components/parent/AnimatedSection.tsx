'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface AnimatedSectionProps {
  children: ReactNode;
  /** 사용 안함 — backward compat 유지 */
  delay?: number;
  /** 추가 className */
  className?: string;
}

/**
 * 섹션 래퍼 — 진입(fade-in + slide-up) 애니메이션 제거 (즉시 렌더).
 *
 * 사용자 직접 지시 (2026-05-30): "메인화면 진입 시 카드가 하단에서 순차적으로 튀어
 *   오르는 느낌이 난다 — 그냥 바로 보여지도록, 쓸데없는 애니메이션 제거해줘."
 *   2026-05-16 `ui/AnimatedSection` no-op 전환과 동일 정책으로 통일한다.
 *
 * props(delay)는 호출부 호환을 위해 유지하되 무시한다.
 */
export function AnimatedSection({
  children,
  className = '',
}: AnimatedSectionProps) {
  return <div className={cn(className)}>{children}</div>;
}
