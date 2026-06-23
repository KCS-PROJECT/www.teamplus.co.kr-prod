'use client';

/**
 * MonthNavigator - TEAMPLUS Shared Component
 * 월 네비게이터. 좌우 화살표로 월을 이동하며 "2026년 3월" 형식으로 표시.
 * 사용 화면: /settlements (정산), /attendance (출석), /parent-calendar, /coach-calendar
 */

import { useCallback } from 'react';
import { cn } from '@/lib/utils';

export interface MonthNavigatorProps {
  /** 연도 */
  year: number;
  /** 월 (1~12) */
  month: number;
  /** 연/월 변경 핸들러 */
  onChange: (year: number, month: number) => void;
  /** 추가 className */
  className?: string;
}

/**
 * 월 네비게이터
 *
 * @example
 * ```tsx
 * <MonthNavigator
 *   year={2026}
 *   month={3}
 *   onChange={(y, m) => setFilter({ year: y, month: m })}
 * />
 * ```
 */
export function MonthNavigator({
  year,
  month,
  onChange,
  className,
}: MonthNavigatorProps) {
  const handlePrev = useCallback(() => {
    if (month === 1) {
      onChange(year - 1, 12);
    } else {
      onChange(year, month - 1);
    }
  }, [year, month, onChange]);

  const handleNext = useCallback(() => {
    if (month === 12) {
      onChange(year + 1, 1);
    } else {
      onChange(year, month + 1);
    }
  }, [year, month, onChange]);

  return (
    <nav
      aria-label="월 네비게이션"
      className={cn(
        'flex items-center justify-between',
        'px-4 py-3',
        className
      )}
    >
      {/* 이전 월 */}
      <button
        type="button"
        onClick={handlePrev}
        aria-label="이전 월"
        className={cn(
          'w-10 h-10 rounded-lg',
          'flex items-center justify-center',
          'text-wtext-2 dark:text-rink-100',
          'hover:bg-wline-2 dark:hover:bg-rink-700',
          'active:brightness-95 transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-ice-500/40'
        )}
      >
        <span className="material-symbols-outlined text-xl" aria-hidden="true">
          chevron_left
        </span>
      </button>

      {/* 연월 표시 */}
      <span className="text-[15px] font-bold text-wtext-1 dark:text-white select-none">
        {year}년 {month}월
      </span>

      {/* 다음 월 */}
      <button
        type="button"
        onClick={handleNext}
        aria-label="다음 월"
        className={cn(
          'w-10 h-10 rounded-lg',
          'flex items-center justify-center',
          'text-wtext-2 dark:text-rink-100',
          'hover:bg-wline-2 dark:hover:bg-rink-700',
          'active:brightness-95 transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-ice-500/40'
        )}
      >
        <span className="material-symbols-outlined text-xl" aria-hidden="true">
          chevron_right
        </span>
      </button>
    </nav>
  );
}

export default MonthNavigator;
