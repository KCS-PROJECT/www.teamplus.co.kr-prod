'use client';

import { cn } from '@/lib/utils';

export type MatchPosition = 'FW' | 'MF' | 'DF' | 'GK';

interface MatchPositionChipProps {
  position: MatchPosition | string;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

const COLORS: Record<MatchPosition, { bg: string; text: string; label: string }> = {
  FW: {
    bg: 'bg-red-100 dark:bg-red-900/30',
    text: 'text-red-700 dark:text-red-400',
    label: '포워드',
  },
  MF: {
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-700 dark:text-green-400',
    label: '미드필더',
  },
  DF: {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-ice-500 dark:text-blue-300',
    label: '디펜스',
  },
  GK: {
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-700 dark:text-amber-400',
    label: '골리',
  },
};

const FALLBACK = {
  bg: 'bg-wline-2 dark:bg-rink-700',
  text: 'text-wtext-2 dark:text-rink-100',
  label: '미정',
};

function isKnownPosition(value: string): value is MatchPosition {
  return value === 'FW' || value === 'MF' || value === 'DF' || value === 'GK';
}

/**
 * 포지션 라벨 칩 (FW/MF/DF/GK).
 *
 * 알려진 포지션은 의미 색상, 그 외는 중립 회색.
 */
export function MatchPositionChip({
  position,
  size = 'sm',
  className,
}: MatchPositionChipProps) {
  const theme = isKnownPosition(position) ? COLORS[position] : FALLBACK;
  const sizeClass =
    size === 'xs'
      ? 'px-1.5 py-0.5 text-[10px]'
      : size === 'sm'
        ? 'px-2 py-0.5 text-[11px]'
        : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded font-bold uppercase tracking-wide',
        sizeClass,
        theme.bg,
        theme.text,
        className
      )}
      aria-label={`포지션 ${position || '미정'} (${theme.label})`}
    >
      {position || '미정'}
    </span>
  );
}
