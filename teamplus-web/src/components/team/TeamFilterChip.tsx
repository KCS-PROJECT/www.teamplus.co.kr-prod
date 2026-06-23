'use client';

/**
 * TeamFilterChip — 둥근 필터 칩 버튼
 *
 * 레퍼런스: 사용자 제공 HTML "팀 목록 🏀" Filter Chips 섹션
 * - 활성: bg-ice-500 text-white
 * - 비활성: bg-wline-2 text-wtext-2 hover:bg-wline
 */

import { cn } from '@/lib/utils';

interface TeamFilterChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
  /** role="tab" 속성 적용 여부 (탭 필터 용도) */
  asTab?: boolean;
}

export function TeamFilterChip({
  label,
  active,
  onClick,
  asTab = true,
}: TeamFilterChipProps) {
  return (
    <button
      type="button"
      role={asTab ? 'tab' : undefined}
      aria-selected={asTab ? active : undefined}
      aria-pressed={asTab ? undefined : active}
      onClick={onClick}
      className={cn(
        'flex h-9 shrink-0 items-center justify-center rounded-full px-5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40 focus-visible:ring-offset-2',
        active
          ? 'bg-ice-500 text-white'
          : 'bg-wline-2 text-wtext-2 hover:bg-wline dark:bg-rink-700 dark:text-rink-100 dark:hover:bg-rink-500',
      )}
    >
      {label}
    </button>
  );
}
