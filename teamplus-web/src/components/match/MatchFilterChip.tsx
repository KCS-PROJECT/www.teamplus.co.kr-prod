'use client';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

interface MatchFilterChipProps {
  active: boolean;
  icon?: string;
  label: string;
  onClick: () => void;
  /** 확장 가능 표시(드롭다운) */
  expandable?: boolean;
}

/**
 * 매치 목록 상단 필터 칩 (날짜/레벨/장소).
 *
 * 활성 상태일 때 primary 컬러, 비활성일 때 흰 배경 + 테두리.
 */
export function MatchFilterChip({
  active,
  icon,
  label,
  onClick,
  expandable = true,
}: MatchFilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'group inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full pl-3 pr-3 text-sm font-medium transition-colors motion-reduce:transition-none',
        active
          ? 'bg-ice-500 text-white'
          : 'bg-white dark:bg-rink-800 border border-wline dark:border-rink-700 text-wtext-2 dark:text-rink-100 hover:border-ice-500/60'
      )}
    >
      {icon && (
        <Icon
          name={icon}
          className={cn(
            'text-[18px]',
            active ? 'text-white' : 'text-wtext-3 dark:text-rink-300 group-hover:text-ice-500'
          )}
        />
      )}
      <span>{label}</span>
      {expandable && (
        <Icon
          name="expand_more"
          className={cn(
            'text-[18px]',
            active ? 'text-white' : 'text-wtext-3 dark:text-rink-300'
          )}
        />
      )}
    </button>
  );
}
