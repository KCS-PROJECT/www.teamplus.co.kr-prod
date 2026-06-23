'use client';

/**
 * VenueStatusBadge — 구장 운영 상태 배지
 * - 솔리드 컬러 + 일반 그림자 (AI slop 금지)
 * - 다크모드 대응
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

interface VenueStatusBadgeProps {
  status: VenueStatus;
  size?: 'sm' | 'md';
  className?: string;
}

export function VenueStatusBadge({
  status,
  size = 'md',
  className,
}: VenueStatusBadgeProps) {
  const label = MESSAGES.venue.status[status];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-semibold',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs',
        STATUS_STYLES[status],
        className,
      )}
      aria-label={`운영 상태: ${label}`}
    >
      {label}
    </span>
  );
}

export default VenueStatusBadge;
