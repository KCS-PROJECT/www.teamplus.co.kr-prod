'use client';

/**
 * TeamStatGrid — 팀 Quick Stats (창단일 · 홈 아레나 등)
 *
 * 레퍼런스: 사용자 제공 HTML "팀 상세 정보" Quick Stats Grid 섹션
 * - 2-column 그리드 (작은 화면), 셀 단위 아이콘 + 레이블 + 값
 */

import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';

export interface TeamStatCellProps {
  icon?: string;
  label: string;
  value: string;
  /** 긴 값 말줄임 허용 여부 (기본 true) */
  truncate?: boolean;
}

export function TeamStatCell({
  icon,
  label,
  value,
  truncate = true,
}: TeamStatCellProps) {
  return (
    <div className="rounded-2xl border border-wline-2 bg-white p-4 shadow-card dark:border-rink-700 dark:bg-rink-800">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-wtext-3 dark:text-rink-300">
        {icon && (
          <Icon name={icon} className="text-[14px]" aria-hidden="true" />
        )}
        <span>{label}</span>
      </div>
      <p
        className={cn(
          'text-card-title text-wtext-1 dark:text-white',
          truncate && 'truncate',
        )}
      >
        {value}
      </p>
    </div>
  );
}

interface TeamStatGridProps {
  /** 표시할 셀 (2~4개 권장, grid-cols-2 기준) */
  children: ReactNode;
  /** aria-label (기본: 팀 요약 정보) */
  label?: string;
}

export function TeamStatGrid({ children, label }: TeamStatGridProps) {
  return (
    <section aria-label={label ?? MESSAGES.team.ariaQuickStatsRegion}>
      <dl className="grid grid-cols-2 gap-3">{children}</dl>
    </section>
  );
}
