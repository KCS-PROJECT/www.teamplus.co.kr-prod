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
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 스타일 1:1 보존(타 화면 회귀 0).
   *   true 시 화살표/라벨 색만 it-* 치환(레이아웃·이동 로직 동결).
   */
  iceTheme?: boolean;
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
  iceTheme = false,
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

  // 화살표 버튼 — color만 it-* 치환. false 경로 1:1 유지.
  const arrowBtnCls = iceTheme
    ? cn(
        'w-10 h-10 rounded-w-md',
        'flex items-center justify-center',
        'text-it-ink-600 dark:text-rink-100',
        'hover:bg-it-fill dark:hover:bg-rink-700',
        'active:brightness-95 transition-colors motion-reduce:transition-none',
        'focus:outline-none focus:ring-2 focus:ring-it-blue-500/40',
      )
    : cn(
        'w-10 h-10 rounded-lg',
        'flex items-center justify-center',
        'text-wtext-2 dark:text-rink-100',
        'hover:bg-wline-2 dark:hover:bg-rink-700',
        'active:brightness-95 transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-ice-500/40',
      );

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
        className={arrowBtnCls}
      >
        <span className="material-symbols-outlined text-xl" aria-hidden="true">
          chevron_left
        </span>
      </button>

      {/* 연월 표시 */}
      <span
        className={cn(
          'text-[15px] font-bold select-none',
          iceTheme ? 'text-it-ink-800 dark:text-white' : 'text-wtext-1 dark:text-white',
        )}
      >
        {year}년 {month}월
      </span>

      {/* 다음 월 */}
      <button
        type="button"
        onClick={handleNext}
        aria-label="다음 월"
        className={arrowBtnCls}
      >
        <span className="material-symbols-outlined text-xl" aria-hidden="true">
          chevron_right
        </span>
      </button>
    </nav>
  );
}

export default MonthNavigator;
