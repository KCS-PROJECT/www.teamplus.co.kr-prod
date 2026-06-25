'use client';

/**
 * VenueStatusBadge — 구장 운영 상태 배지
 * - 솔리드 컬러 + 일반 그림자 (AI slop 금지)
 * - 다크모드 대응
 * - [ICETIMES Phase 2] iceTheme variant — flat 상태색(SoT §4: 정상=초록·이상=red·중립=ink).
 */

import { MESSAGES } from '@/lib/messages';
import type { VenueStatus } from '@/types/venue';
import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<VenueStatus, string> = {
  active:
    'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  maintenance:
    'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  closed:
    'bg-wline text-wtext-2 dark:bg-rink-700 dark:text-rink-100',
};

// ICETIMES flat: 운영=정상(초록) · 점검=주의(it-red) · 휴장=중립(it-ink). 틴트 배경.
const ICE_STATUS_STYLES: Record<VenueStatus, string> = {
  active:
    'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-200',
  maintenance:
    'bg-it-red-50 text-it-red-500 dark:bg-it-red-500/15 dark:text-it-red-300',
  closed:
    'bg-it-fill text-it-ink-500 dark:bg-rink-700 dark:text-rink-100',
};

interface VenueStatusBadgeProps {
  status: VenueStatus;
  size?: 'sm' | 'md';
  className?: string;
  /**
   * [ICETIMES Phase 2] flat 테마. 기본 false = 기존 스타일 1:1 보존(회귀 0).
   *   true 시 상태색을 it-* 토큰(정상=초록·이상=it-red·중립=it-ink)으로 통일.
   */
  iceTheme?: boolean;
}

export function VenueStatusBadge({
  status,
  size = 'md',
  className,
  iceTheme = false,
}: VenueStatusBadgeProps) {
  const label = MESSAGES.venue.status[status];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-semibold',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs',
        (iceTheme ? ICE_STATUS_STYLES : STATUS_STYLES)[status],
        className,
      )}
      aria-label={`운영 상태: ${label}`}
    >
      {label}
    </span>
  );
}

export default VenueStatusBadge;
