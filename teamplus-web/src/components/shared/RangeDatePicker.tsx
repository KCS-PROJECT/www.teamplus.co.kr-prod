'use client';

/**
 * RangeDatePicker - TEAMPLUS Shared Component
 * 날짜 범위 선택기. 네이티브 date input 2개를 활용한 심플한 구현.
 * 사용 화면: /settlements (정산 필터), /payments-manage, /attendance-history
 */

import { useCallback } from 'react';
import { cn } from '@/lib/utils';

export interface RangeDatePickerProps {
  /** 시작 날짜 */
  startDate: Date | null;
  /** 종료 날짜 */
  endDate: Date | null;
  /** 날짜 범위 변경 핸들러 */
  onChange: (start: Date | null, end: Date | null) => void;
  /** 추가 className */
  className?: string;
}

/** Date → YYYY-MM-DD 문자열 */
function toDateString(date: Date | null): string {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** YYYY-MM-DD → Date | null */
function fromDateString(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

/**
 * 날짜 범위 선택기
 *
 * @example
 * ```tsx
 * <RangeDatePicker
 *   startDate={startDate}
 *   endDate={endDate}
 *   onChange={(s, e) => setDateRange({ start: s, end: e })}
 * />
 * ```
 */
export function RangeDatePicker({
  startDate,
  endDate,
  onChange,
  className,
}: RangeDatePickerProps) {
  const handleStartChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = fromDateString(e.target.value);
      // 시작이 종료보다 뒤면 종료를 시작과 동일하게 보정
      if (next && endDate && next > endDate) {
        onChange(next, next);
      } else {
        onChange(next, endDate);
      }
    },
    [endDate, onChange]
  );

  const handleEndChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = fromDateString(e.target.value);
      // 종료가 시작보다 앞이면 시작을 종료와 동일하게 보정
      if (next && startDate && next < startDate) {
        onChange(next, next);
      } else {
        onChange(startDate, next);
      }
    },
    [startDate, onChange]
  );

  const inputBase = cn(
    'h-10 w-full rounded-lg px-3 text-sm',
    'bg-white dark:bg-rink-800',
    'border border-wline dark:border-rink-700',
    'text-wtext-1 dark:text-white',
    'focus:outline-none focus:ring-2 focus:ring-ice-500/40 focus:border-ice-500',
    'transition-colors duration-150'
  );

  return (
    <fieldset
      className={cn('flex items-center gap-2', className)}
      aria-label="날짜 범위 선택"
    >
      <legend className="sr-only">날짜 범위 선택</legend>

      {/* 시작 날짜 */}
      <div className="flex-1 relative">
        <label htmlFor="range-start" className="sr-only">
          시작 날짜
        </label>
        <input
          id="range-start"
          type="date"
          value={toDateString(startDate)}
          max={toDateString(endDate)}
          onChange={handleStartChange}
          aria-label="시작 날짜"
          className={inputBase}
        />
      </div>

      {/* 구분자 */}
      <span
        className="shrink-0 text-sm text-wtext-3 dark:text-rink-300 select-none"
        aria-hidden="true"
      >
        ~
      </span>

      {/* 종료 날짜 */}
      <div className="flex-1 relative">
        <label htmlFor="range-end" className="sr-only">
          종료 날짜
        </label>
        <input
          id="range-end"
          type="date"
          value={toDateString(endDate)}
          min={toDateString(startDate)}
          onChange={handleEndChange}
          aria-label="종료 날짜"
          className={inputBase}
        />
      </div>
    </fieldset>
  );
}

export default RangeDatePicker;
