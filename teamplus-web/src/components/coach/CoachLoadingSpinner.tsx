'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';

/**
 * CoachLoadingSpinner - 코치 페이지 공통 로딩 스피너
 *
 * 사용처: 모든 코치 페이지 데이터 로딩 시
 * 패턴: border-t-primary 회전 스피너 + 선택적 메시지
 *
 * 변형:
 * - size="sm": 작은 인라인 스피너 (w-4 h-4)
 * - size="md": 기본 스피너 (w-8 h-8)
 * - size="lg": 전체 화면 스피너 (w-10 h-10)
 */
export interface CoachLoadingSpinnerProps {
  /** 스피너 크기 */
  size?: 'sm' | 'md' | 'lg';
  /** 로딩 메시지 표시 여부 */
  showMessage?: boolean;
  /** 커스텀 메시지 (기본: MESSAGES.loading) */
  message?: string;
  /** 전체 영역 차지 여부 (flex-1 + 중앙 정렬) */
  fullArea?: boolean;
  /** 추가 className */
  className?: string;
}

const SIZE_MAP = {
  sm: 'w-4 h-4 border-2',
  md: 'w-8 h-8 border-2',
  lg: 'w-10 h-10 border-3',
} as const;

export const CoachLoadingSpinner = memo(function CoachLoadingSpinner({
  size = 'md',
  showMessage = false,
  message,
  fullArea = true,
  className,
}: CoachLoadingSpinnerProps) {
  const spinnerEl = (
    <div
      className={cn(
        SIZE_MAP[size],
        'border-wline dark:border-rink-700 border-t-primary rounded-full animate-spin'
      )}
      role="status"
      aria-label={message ?? MESSAGES.loading.waitMessage}
    />
  );

  if (!fullArea) {
    return (
      <div className={cn('flex items-center justify-center gap-2', className)}>
        {spinnerEl}
        {showMessage && (
          <span className="text-sm text-wtext-3 dark:text-rink-300">
            {message ?? MESSAGES.loading.waitMessage}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col items-center justify-center py-16 gap-3', className)}>
      {spinnerEl}
      {showMessage && (
        <p className="text-sm text-wtext-3 dark:text-rink-300">
          {message ?? MESSAGES.loading.waitMessage}
        </p>
      )}
    </div>
  );
});
