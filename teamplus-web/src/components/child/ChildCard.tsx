'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils';

/**
 * ChildCard - 아동 전용 카드 래퍼
 *
 * child 대시보드와 서브페이지에서 반복되는
 * bg-white rounded-2xl p-6 shadow-sm border 패턴을 통합.
 *
 * 솔리드 배경만 사용 (그라디언트/블러 금지)
 */

interface ChildCardProps {
  /** 자식 요소 */
  children: React.ReactNode;
  /** 패딩 크기 */
  padding?: 'sm' | 'md' | 'lg';
  /**
   * ICETIMES flat 스타일 적용. 기본 false = 기존 카드 외형 그대로 (미전달 화면 영향 0).
   * 아동 WCAG(72×72dp·7:1·18px+)는 패딩/타이포로 보장되므로 색만 it-* 근사로 교체한다.
   */
  iceTheme?: boolean;
  /** 추가 className */
  className?: string;
}

const PADDING_STYLES = {
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
};

export const ChildCard = memo(function ChildCard({
  children,
  padding = 'lg',
  iceTheme = false,
  className = '',
}: ChildCardProps) {
  return (
    <div
      className={cn(
        iceTheme
          ? // ICETIMES flat: 그림자 제거 + it-* 표면/경계 (대비 7:1 유지).
            'bg-it-surface dark:bg-it-ink-900 rounded-2xl border border-it-line dark:border-it-ink-700'
          : 'bg-white dark:bg-rink-800 rounded-2xl shadow-sm border border-wline-2 dark:border-rink-700',
        PADDING_STYLES[padding],
        className,
      )}
    >
      {children}
    </div>
  );
});
