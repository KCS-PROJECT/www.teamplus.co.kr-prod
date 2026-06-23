'use client';

import { cn } from '@/lib/utils';

interface AnimatedSectionProps {
  children: React.ReactNode;
  /** 사용 안함 — backward compat 유지 */
  delay?: number;
  /** 추가 className */
  className?: string;
  /** 사용 안함 — backward compat 유지 */
  translateY?: number;
  /** 사용 안함 — backward compat 유지 */
  duration?: number;
}

/**
 * 섹션 래퍼 — v17 anti-flicker (2026-05-16) 이후 애니메이션 제거.
 *
 * 사용자 직접 지시 (2026-05-16):
 *   "하단에서 올라오는 에니메이션이 있는데 그것 때문인지 몰라도 화면이 두번 그려져서
 *    그런지 깜박이 있어보여... 하단에서 올라오는 에니메이션 제거해줘"
 *
 * 변경 사항:
 *   - 기존 `translate-y-3 → translate-y-0` + `opacity 0 → 1` 슬라이드업 제거
 *   - useState/useEffect/setTimeout 제거 — SSR HTML 과 client hydration 동일
 *   - 모든 prop (delay/translateY/duration) 은 backward-compat 위해 유지하되 무시
 *
 * SoT: SPEC_ANTI_FLICKER.md §2.3
 */
export function AnimatedSection({
  children,
  className = '',
}: AnimatedSectionProps) {
  return <div className={cn(className)}>{children}</div>;
}
