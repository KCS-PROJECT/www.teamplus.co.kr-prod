'use client';

import { cn } from '@/lib/utils';

interface MatchProgressBarProps {
  current: number;
  total: number;
  /** 추가 레이블 표시 여부 (예: "8자리 남았습니다") */
  showRemaining?: boolean;
  className?: string;
  tone?: 'primary' | 'muted';
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 스타일 1:1 보존(타 화면 회귀 0).
   *   true 시 it-* 토큰(it-blue fill). navy 히어로 위에 놓이는 경우 `onNavy` 로 라벨 대비 보정.
   */
  iceTheme?: boolean;
  /** [ICETIMES] navy 히어로 밴드 위에 표시될 때 라벨/트랙 대비 보정 (iceTheme=true 일 때만 의미) */
  onNavy?: boolean;
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
  iceTheme = false,
  onNavy = false,
}: MatchProgressBarProps) {
  const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  const remaining = Math.max(0, total - current);

  // [ICETIMES] flat — it-* 토큰. navy 위(onNavy)에서는 흰/반투명 톤으로 대비 확보.
  if (iceTheme) {
    const currentLabelClass = onNavy
      ? 'text-white'
      : tone === 'primary'
        ? 'text-it-blue-600 dark:text-it-blue-300'
        : 'text-it-ink-500 dark:text-it-ink-300';
    const totalLabelClass = onNavy
      ? 'text-white/70'
      : 'text-it-ink-500 dark:text-it-ink-300';
    const trackClass = onNavy
      ? 'bg-white/20'
      : 'bg-it-line dark:bg-rink-700';
    const fillClass = onNavy
      ? 'bg-white'
      : tone === 'primary'
        ? 'bg-it-blue-500'
        : 'bg-it-ink-300 dark:bg-it-ink-500';
    const remainingClass = onNavy
      ? 'text-white/70'
      : 'text-it-ink-500 dark:text-it-ink-300';

    return (
      <div className={cn('flex flex-col gap-1.5', className)}>
        <div className="flex items-center justify-between text-[12px] font-medium font-num tabular-nums">
          <span className={currentLabelClass}>{current}명 참여</span>
          <span className={totalLabelClass}>/ {total}명</span>
        </div>
        <div
          className={cn('h-2 w-full rounded-w-pill overflow-hidden', trackClass)}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={current}
          aria-label="매치 참가 인원"
        >
          <div
            className={cn('h-full rounded-w-pill transition-[width] duration-300 motion-reduce:transition-none', fillClass)}
            style={{ width: `${percent}%` }}
          />
        </div>
        {showRemaining && (
          <p className={cn('text-right text-[12px] font-num tabular-nums', remainingClass)}>
            {remaining}자리 남았습니다
          </p>
        )}
      </div>
    );
  }

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
