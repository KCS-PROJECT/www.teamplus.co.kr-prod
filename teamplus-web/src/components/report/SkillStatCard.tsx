'use client';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

interface SkillStatCardProps {
  icon: string;
  label: string;
  score: number;
  highlight?: string;
  /** ICETIMES flat 스타일 적용. 기본 false = 기존 카드 외형 그대로 (미전달 화면 영향 0). */
  iceTheme?: boolean;
}

export function SkillStatCard({
  icon,
  label,
  score,
  highlight,
  iceTheme = false,
}: SkillStatCardProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between p-3 rounded-lg',
        iceTheme
          ? // ICETIMES flat: hairline + 그림자 제거.
            'bg-it-surface dark:bg-it-ink-900 border border-it-line dark:border-it-ink-700'
          : 'bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 shadow-sm',
      )}
    >
      <div className="flex items-center gap-2">
        <div
          className={cn(
            'p-1.5 rounded',
            iceTheme
              ? 'bg-it-blue-50 dark:bg-it-blue-800/30 text-it-blue-500 dark:text-it-blue-300'
              : 'bg-blue-50 dark:bg-ice-500/20 text-ice-500',
          )}
        >
          <Icon name={icon} className="text-[18px]" />
        </div>
        <span
          className={cn(
            iceTheme ? 'text-sm font-bold text-it-ink-700 dark:text-it-ink-100' : 'text-sm font-medium text-wtext-2 dark:text-rink-100',
          )}
        >
          {label}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {highlight && (
          <span
            className={cn(
              'text-xs px-1.5 py-0.5 rounded font-medium',
              iceTheme
                ? 'text-it-blue-500 dark:text-it-blue-300 bg-it-blue-50 dark:bg-it-blue-800/30'
                : 'text-ice-500 bg-ice-500/10',
            )}
          >
            {highlight}
          </span>
        )}
        <span
          className={cn(
            iceTheme
              ? 'text-sm font-extrabold font-num tabular-nums text-it-blue-600 dark:text-it-blue-300'
              : 'text-sm font-bold text-wtext-1 dark:text-white',
          )}
        >
          {score}
        </span>
      </div>
    </div>
  );
}
