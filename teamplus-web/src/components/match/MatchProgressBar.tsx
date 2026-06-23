'use client';

import { cn } from '@/lib/utils';

interface MatchProgressBarProps {
  current: number;
  total: number;
  /** 추가 레이블 표시 여부 (예: "8자리 남았습니다") */
  showRemaining?: boolean;
  className?: string;
  tone?: 'primary' | 'muted';
}

/**
 * 매치 참가 인원 프로그레스 바.
 *
 * 0~100% 게이지 + 접근성(aria-valuenow 등).
 */
export function MatchProgressBar({
  current,
  total,
  showRemaining = false,
  className,
  tone = 'primary',
}: MatchProgressBarProps) {
  const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  const remaining = Math.max(0, total - current);

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-center justify-between text-xs font-medium">
        <span className={tone === 'primary' ? 'text-ice-500' : 'text-wtext-3 dark:text-rink-300'}>
          {current}명 참여
        </span>
        <span className="text-wtext-3 dark:text-rink-300">/ {total}명</span>
      </div>
      <div
        className="h-2 w-full rounded-full bg-wline-2 dark:bg-rink-700 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-label="매치 참가 인원"
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-300',
            tone === 'primary' ? 'bg-ice-500' : 'bg-wtext-4 dark:bg-wbg0'
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      {showRemaining && (
        <p className="text-right text-xs text-wtext-3 dark:text-rink-300">
          {remaining}자리 남았습니다
        </p>
      )}
    </div>
  );
}
