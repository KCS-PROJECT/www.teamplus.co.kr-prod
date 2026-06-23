'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils';

/**
 * ChildEmptyState - 아동 친화적 빈 상태 화면
 *
 * badges 페이지(뱃지 없음)와 같은 빈 상태에서 사용.
 * 큰 이모지 + 친근한 메시지 + 부가 설명 패턴.
 *
 * WCAG AAA: text-lg+ 사용, 쉬운 한국어
 */

interface ChildEmptyStateProps {
  /** 대형 이모지 */
  emoji: string;
  /** 메인 메시지 (쉬운 한국어) */
  message: string;
  /** 부가 설명 */
  description?: string;
  /** 추가 className */
  className?: string;
}

export const ChildEmptyState = memo(function ChildEmptyState({
  emoji,
  message,
  description,
  className = '',
}: ChildEmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center py-16 gap-3',
        className,
      )}
      role="status"
    >
      <span className="text-5xl" role="img" aria-hidden="true">
        {emoji}
      </span>
      <p className="text-card-section-child text-center">
        {message}
      </p>
      {description && (
        <p className="text-card-title-child font-normal text-center">
          {description}
        </p>
      )}
    </div>
  );
});
