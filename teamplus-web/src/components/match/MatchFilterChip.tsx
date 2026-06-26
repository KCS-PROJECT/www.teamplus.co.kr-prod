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
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 스타일 1:1 보존(타 화면 회귀 0).
   *   true 시 ICETIMES Chip 스펙(h36·14/700·border 1.5px·active=it-blue-500 / idle=it-surface).
   */
  iceTheme?: boolean;
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
  iceTheme = false,
}: MatchFilterChipProps) {
  // [ICETIMES] flat — ICETIMES Chip 스펙(border 1.5px·it-blue active·it-line-strong idle).
  if (iceTheme) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={cn(
          'group inline-flex h-9 shrink-0 items-center gap-1.5 rounded-w-pill pl-3.5 pr-3.5 text-card-body font-bold transition-colors motion-reduce:transition-none',
          active
            ? 'bg-it-blue-500 text-white border-[1.5px] border-it-blue-500'
            : 'bg-it-surface dark:bg-rink-800 border-[1.5px] border-it-line-strong dark:border-rink-700 text-it-ink-600 dark:text-it-ink-300 hover:bg-it-fill dark:hover:bg-rink-700'
        )}
      >
        {icon && (
          <Icon
            name={icon}
            className={cn(
              'text-[18px]',
              active ? 'text-white' : 'text-it-ink-400 dark:text-it-ink-300 group-hover:text-it-blue-500'
            )}
          />
        )}
        <span>{label}</span>
        {expandable && (
          <Icon
            name="expand_more"
            className={cn(
              'text-[18px]',
              active ? 'text-white' : 'text-it-ink-400 dark:text-it-ink-300'
            )}
          />
        )}
      </button>
    );
  }

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
