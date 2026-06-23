'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils';

/**
 * ChildProgressBar - 아동 친화적 진행률 바
 *
 * 큰 높이(h-5), 둥근 모서리, 부드러운 트랜지션.
 * stickers 페이지(스티커 수집률)와 checklist 페이지(준비물 체크)에서 공통 사용.
 *
 * WCAG AAA: 충분한 색상 대비, aria-valuenow/valuemin/valuemax 적용
 */

type ChildProgressBarVariant = 'primary' | 'amber' | 'green';

const BAR_STYLES: Record<ChildProgressBarVariant, string> = {
  primary: 'bg-ice-500',
  amber: 'bg-amber-500',
  green: 'bg-green-500',
};

interface ChildProgressBarProps {
  /** 진행률 (0-100) */
  value: number;
  /** 색상 변형 */
  variant?: ChildProgressBarVariant;
  /** 바 높이 (기본 h-5) */
  height?: string;
  /** 라벨 텍스트 (좌측) */
  label?: string;
  /** 카운트 텍스트 (우측, 예: '3 / 6') */
  count?: string;
  /** 하단 설명 텍스트 */
  description?: string;
  /** 추가 className */
  className?: string;
  /** 접근성 라벨 */
  'aria-label'?: string;
}

export const ChildProgressBar = memo(function ChildProgressBar({
  value,
  variant = 'primary',
  height = 'h-5',
  label,
  count,
  description,
  className = '',
  'aria-label': ariaLabel = '진행률',
}: ChildProgressBarProps) {
  const clampedValue = Math.max(0, Math.min(100, value));

  return (
    <div className={cn('w-full', className)}>
      {(label || count) && (
        <div className="flex justify-between items-end mb-2">
          {label && (
            <h2 className="text-card-section-child">
              {label}
            </h2>
          )}
          {count && (
            // [WCAG AAA Task #4] text-card-emphasis-child(15-16) → text-card-title-child(17-18px+).
            <span className="text-card-title-child font-bold !text-ice-500 dark:!text-blue-400">
              {count}
            </span>
          )}
        </div>
      )}
      <div
        className={cn(
          height,
          'w-full bg-wline dark:bg-rink-700 rounded-full overflow-hidden p-1',
        )}
        role="progressbar"
        aria-valuenow={clampedValue}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={ariaLabel}
      >
        <div
          className={cn(
            'h-full rounded-full transition-all duration-700 ease-out',
            BAR_STYLES[variant],
          )}
          style={{ width: `${clampedValue}%` }}
        />
      </div>
      {description && (
        // [WCAG AAA Task #4] text-card-body-child(14-15) → text-card-title-child(17-18px+).
        <p className="mt-2 text-card-title-child font-medium">
          {description}
        </p>
      )}
    </div>
  );
});
