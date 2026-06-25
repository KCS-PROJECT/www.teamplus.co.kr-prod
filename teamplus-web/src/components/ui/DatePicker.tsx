'use client';

import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { cn } from '@/lib/utils';
import { weekColumnOf, colIsSaturday, colIsSunday } from '@/lib/calendar-week';
import { Icon } from './Icon';

/**
 * DatePicker Component - TEAMPLUS Design System
 * 수업 예약, 일정 선택 등에 사용
 * WCAG 2.1 AA 준수:
 * - 키보드 네비게이션 (Arrow keys, Page Up/Down, Home, End)
 * - ARIA 속성 (grid, gridcell)
 * - 최소 44px 터치 타겟
 * - 스크린 리더 지원
 */

interface DatePickerProps {
  value?: Date | null;
  onChange?: (date: Date | null) => void;
  minDate?: Date;
  maxDate?: Date;
  disabledDates?: Date[];
  placeholder?: string;
  label?: string;
  error?: string;
  required?: boolean;
  className?: string;
  locale?: 'ko' | 'en';
}

const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_KO = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

function isDateDisabled(
  date: Date,
  minDate?: Date,
  maxDate?: Date,
  disabledDates?: Date[]
): boolean {
  if (minDate && date < minDate) return true;
  if (maxDate && date > maxDate) return true;
  if (disabledDates?.some((d) => isSameDay(d, date))) return true;
  return false;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return weekColumnOf(new Date(year, month, 1));
}

export function DatePicker({
  value,
  onChange,
  minDate,
  maxDate,
  disabledDates,
  placeholder = '날짜 선택',
  label,
  error,
  required,
  className,
  locale = 'ko',
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(() => value || new Date());
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLButtonElement>(null);

  const weekdays = locale === 'ko' ? WEEKDAYS_KO : WEEKDAYS_EN;
  const months = locale === 'ko' ? MONTHS_KO : MONTHS_EN;

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDayOfMonth = getFirstDayOfMonth(year, month);
  const today = new Date();

  // Click outside handler
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Escape key handler
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
        inputRef.current?.focus();
      }
    }

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  const goToPreviousMonth = useCallback(() => {
    setCurrentMonth(new Date(year, month - 1, 1));
  }, [year, month]);

  const goToNextMonth = useCallback(() => {
    setCurrentMonth(new Date(year, month + 1, 1));
  }, [year, month]);

  const selectDate = useCallback(
    (day: number) => {
      const newDate = new Date(year, month, day);
      if (!isDateDisabled(newDate, minDate, maxDate, disabledDates)) {
        onChange?.(newDate);
        setIsOpen(false);
        inputRef.current?.focus();
      }
    },
    [year, month, minDate, maxDate, disabledDates, onChange]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent, day: number) => {
      let newDay = day;
      let newMonth = month;
      let newYear = year;

      switch (event.key) {
        case 'ArrowLeft':
          newDay = day - 1;
          if (newDay < 1) {
            newMonth = month - 1;
            if (newMonth < 0) {
              newMonth = 11;
              newYear = year - 1;
            }
            newDay = getDaysInMonth(newYear, newMonth);
          }
          event.preventDefault();
          break;
        case 'ArrowRight':
          newDay = day + 1;
          if (newDay > daysInMonth) {
            newMonth = month + 1;
            if (newMonth > 11) {
              newMonth = 0;
              newYear = year + 1;
            }
            newDay = 1;
          }
          event.preventDefault();
          break;
        case 'ArrowUp':
          newDay = day - 7;
          if (newDay < 1) {
            newMonth = month - 1;
            if (newMonth < 0) {
              newMonth = 11;
              newYear = year - 1;
            }
            newDay = getDaysInMonth(newYear, newMonth) + newDay;
          }
          event.preventDefault();
          break;
        case 'ArrowDown':
          newDay = day + 7;
          if (newDay > daysInMonth) {
            newMonth = month + 1;
            if (newMonth > 11) {
              newMonth = 0;
              newYear = year + 1;
            }
            newDay = newDay - daysInMonth;
          }
          event.preventDefault();
          break;
        case 'Enter':
        case ' ':
          selectDate(day);
          event.preventDefault();
          return;
        case 'PageUp':
          if (event.shiftKey) {
            newYear = year - 1;
          } else {
            newMonth = month - 1;
            if (newMonth < 0) {
              newMonth = 11;
              newYear = year - 1;
            }
          }
          event.preventDefault();
          break;
        case 'PageDown':
          if (event.shiftKey) {
            newYear = year + 1;
          } else {
            newMonth = month + 1;
            if (newMonth > 11) {
              newMonth = 0;
              newYear = year + 1;
            }
          }
          event.preventDefault();
          break;
        case 'Home':
          newDay = 1;
          event.preventDefault();
          break;
        case 'End':
          newDay = daysInMonth;
          event.preventDefault();
          break;
        default:
          return;
      }

      setCurrentMonth(new Date(newYear, newMonth, 1));
      // Focus the new day after state update
      setTimeout(() => {
        const dayButton = containerRef.current?.querySelector(
          `[data-day="${newDay}"]`
        ) as HTMLButtonElement;
        dayButton?.focus();
      }, 0);
    },
    [month, year, daysInMonth, selectDate]
  );

  const formatDate = (date: Date): string => {
    if (locale === 'ko') {
      return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
    }
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Generate calendar grid
  const days: (number | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(null);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    days.push(day);
  }

  // useId()는 서버/클라이언트 간 일관된 ID를 생성하여 hydration 불일치 방지
  const fieldId = useId();

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      {label && (
        <label
          htmlFor={fieldId}
          className="block text-sm font-semibold text-wtext-2 dark:text-rink-100 mb-2"
        >
          {label}
          {required && <span className="text-error ml-1" aria-hidden="true">*</span>}
        </label>
      )}

      {/* Trigger Button */}
      <button
        ref={inputRef}
        id={fieldId}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={value ? `선택된 날짜: ${formatDate(value)}` : placeholder}
        className={cn(
          // WCAG 2.1: 최소 44px 터치 타겟
          'w-full h-12 min-h-[48px] px-4 flex items-center justify-between',
          'bg-white dark:bg-rink-800',
          'border rounded-lg',
          'text-left text-[15px]',
          'focus:outline-none focus:ring-2 focus:ring-ice-500/20 focus-visible-disabled',
          'transition-all duration-200',
          error
            ? 'border-error focus:border-error'
            : 'border-wline dark:border-rink-700 focus:border-ice-500',
          !value && 'text-wtext-3'
        )}
      >
        <span>{value ? formatDate(value) : placeholder}</span>
        <Icon name="calendar_today" className="text-wtext-3" />
      </button>

      {/* Error Message */}
      {error && (
        <p className="mt-2 text-sm text-error flex items-center gap-1" role="alert">
          <Icon name="error" className="text-[16px]" aria-hidden="true" />
          {error}
        </p>
      )}

      {/* Calendar Dropdown */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="날짜 선택"
          className={cn(
            'absolute z-50 mt-2 p-4',
            'bg-white dark:bg-rink-800',
            'border border-wline dark:border-rink-700',
            'rounded-xl shadow-md',
            'min-w-[300px]'
          )}
        >
          {/* Header with Month/Year Navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={goToPreviousMonth}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-wline-2 dark:hover:bg-rink-700 transition-colors"
              aria-label="이전 달"
            >
              <Icon name="chevron_left" />
            </button>
            <h2 className="text-base font-semibold text-wtext-1 dark:text-white">
              {year}년 {months[month]}
            </h2>
            <button
              type="button"
              onClick={goToNextMonth}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-wline-2 dark:hover:bg-rink-700 transition-colors"
              aria-label="다음 달"
            >
              <Icon name="chevron_right" />
            </button>
          </div>

          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-1 mb-2" role="row">
            {weekdays.map((day, index) => (
              <div
                key={day}
                role="columnheader"
                className={cn(
                  'text-center text-xs font-medium py-2',
                  colIsSunday(index) && 'text-red-500',
                  colIsSaturday(index) && 'text-blue-500',
                  !colIsSunday(index) && !colIsSaturday(index) && 'text-wtext-3 dark:text-rink-300'
                )}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1" role="grid" aria-label={`${year}년 ${months[month]} 달력`}>
            {days.map((day, index) => {
              if (day === null) {
                return <div key={`empty-${index}`} className="p-2" />;
              }

              const date = new Date(year, month, day);
              const isSelected = value ? isSameDay(date, value) : false;
              const isToday = isSameDay(date, today);
              const isDisabled = isDateDisabled(date, minDate, maxDate, disabledDates);
              const dayOfWeek = date.getDay();
              const isSunday = dayOfWeek === 0;
              const isSaturday = dayOfWeek === 6;

              return (
                <button
                  key={day}
                  type="button"
                  role="gridcell"
                  data-day={day}
                  tabIndex={isSelected || (day === 1 && !value) ? 0 : -1}
                  disabled={isDisabled}
                  onClick={() => selectDate(day)}
                  onKeyDown={(e) => handleKeyDown(e, day)}
                  aria-selected={isSelected}
                  aria-label={`${month + 1}월 ${day}일${isToday ? ', 오늘' : ''}${isSelected ? ', 선택됨' : ''}`}
                  className={cn(
                    // WCAG 2.1: 최소 44px 터치 타겟
                    'w-10 h-10 flex items-center justify-center rounded-full',
                    'text-sm font-medium transition-all',
                    'focus:outline-none focus:ring-2 focus:ring-ice-500/50',
                    isSelected && 'bg-ice-500 text-white',
                    !isSelected && isToday && 'bg-ice-500/10 text-ice-500 font-bold',
                    !isSelected && !isToday && isSunday && 'text-red-500',
                    !isSelected && !isToday && isSaturday && 'text-blue-500',
                    !isSelected && !isToday && !isSunday && !isSaturday && 'text-wtext-2 dark:text-rink-100',
                    !isSelected && !isDisabled && 'hover:bg-wline-2 dark:hover:bg-rink-700',
                    isDisabled && 'text-wtext-4 dark:text-rink-500 cursor-not-allowed'
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Today Button */}
          <div className="mt-4 pt-4 border-t border-wline dark:border-rink-700">
            <button
              type="button"
              onClick={() => {
                setCurrentMonth(today);
                selectDate(today.getDate());
              }}
              className="w-full h-10 text-sm font-medium text-ice-500 hover:bg-ice-500/5 rounded-lg transition-colors"
            >
              오늘로 이동
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
