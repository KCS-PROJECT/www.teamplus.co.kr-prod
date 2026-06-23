'use client';

import { cn } from '@/lib/utils';

/**
 * 매치 상태 타입.
 *
 * 백엔드 PickupMatch.status와 동기화:
 * - recruiting: 모집 중
 * - closing_soon: 마감 임박
 * - closed: 마감됨
 * - cancelled: 취소됨
 */
export type MatchStatus =
  | 'recruiting'
  | 'closing_soon'
  | 'closed'
  | 'cancelled';

interface MatchStatusBadgeProps {
  status: MatchStatus;
  /** 작은 크기(목록 카드) / 기본(상세 페이지) */
  size?: 'sm' | 'md';
  className?: string;
}

const CONFIG: Record<
  MatchStatus,
  { label: string; bg: string; text: string }
> = {
  recruiting: {
    label: '모집 중',
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    text: 'text-emerald-700 dark:text-emerald-300',
  },
  closing_soon: {
    label: '마감 임박',
    bg: 'bg-orange-100 dark:bg-orange-900/30',
    text: 'text-orange-700 dark:text-orange-300',
  },
  closed: {
    label: '마감됨',
    bg: 'bg-wline dark:bg-rink-700',
    text: 'text-wtext-2 dark:text-rink-100',
  },
  cancelled: {
    label: '취소됨',
    bg: 'bg-red-100 dark:bg-red-900/30',
    text: 'text-red-700 dark:text-red-300',
  },
};

/**
 * 매치 상태 배지.
 *
 * AI 스타일 금지(gradient/blur 없음).
 * WCAG AA 대비율 준수.
 */
export function MatchStatusBadge({
  status,
  size = 'md',
  className,
}: MatchStatusBadgeProps) {
  const config = CONFIG[status];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-bold tracking-wide',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs',
        config.bg,
        config.text,
        className
      )}
      role="status"
      aria-label={`매치 상태: ${config.label}`}
    >
      {config.label}
    </span>
  );
}
