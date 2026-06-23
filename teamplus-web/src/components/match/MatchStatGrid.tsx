'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface MatchStat {
  label: string;
  value: ReactNode;
  /** 값 색상 하이라이트 (예: 남은 자리 강조) */
  accent?: boolean;
}

interface MatchStatGridProps {
  stats: MatchStat[];
  className?: string;
}

/**
 * 매치 통계 그리드 (참가비 / 인원 / 레벨 등).
 *
 * 카드 내부 그리드 — 최소 2열, 3열까지 자동 반응형.
 */
export function MatchStatGrid({ stats, className }: MatchStatGridProps) {
  return (
    <dl
      className={cn(
        'grid grid-cols-3 gap-2',
        className
      )}
    >
      {stats.map((stat) => (
        <div key={stat.label} className="flex flex-col items-center justify-center py-3">
          <dt className="text-xs text-wtext-3 dark:text-rink-300 mb-1">{stat.label}</dt>
          <dd
            className={cn(
              'text-sm font-bold text-center',
              stat.accent
                ? 'text-ice-500 dark:text-blue-300'
                : 'text-wtext-1 dark:text-white'
            )}
          >
            {stat.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
