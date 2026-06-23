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
  className = '',
}: ChildCardProps) {
  return (
    <div
      className={cn(
        'bg-white dark:bg-rink-800 rounded-2xl shadow-sm',
        'border border-wline-2 dark:border-rink-700',
        PADDING_STYLES[padding],
        className,
      )}
    >
      {children}
    </div>
  );
});
