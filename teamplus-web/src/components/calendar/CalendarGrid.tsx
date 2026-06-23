'use client';

import { useRef } from 'react';
import { Icon } from '@/components/ui/Icon';
import { CalendarDot, CalendarLegend } from '@/components/calendar/CalendarDot';
import { MESSAGES } from '@/lib/messages';
import { CLASS_CATEGORIES } from '@/lib/class-categories';
import { cn } from '@/lib/utils';
import { WEEKDAY_HEADERS, colIsSaturday, colIsSunday } from '@/lib/calendar-week';
import type { CalendarClass, CalendarDay } from '@/hooks/useCalendar';

// ────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────

const DAY_LABELS = WEEKDAY_HEADERS;

// 분류 SoT (lib/class-categories.ts) 참조 — 정규/오픈/대회 3종.
const TYPE_COLORS: Record<string, string> = {
  REGULAR: CLASS_CATEGORIES.regular.color.solidBg,
  OPEN: CLASS_CATEGORIES.open.color.solidBg,
  TOURNAMENT: CLASS_CATEGORIES.tournament.color.solidBg,
};

const TYPE_LABELS: Record<string, string> = {
  REGULAR: CLASS_CATEGORIES.regular.shortLabel,
  OPEN: CLASS_CATEGORIES.open.shortLabel,
  TOURNAMENT: CLASS_CATEGORIES.tournament.shortLabel,
};

// ────────────────────────────────────────────
// ClassDetail (선택 날짜 수업 상세)
// ────────────────────────────────────────────

function ClassDetail({ cls }: { cls: CalendarClass }) {
  return (
    <div className="flex items-start gap-3 border-b border-wline-2 py-3 last:border-b-0 dark:border-rink-700">
      <div className={cn('h-full min-h-[48px] w-1 shrink-0 rounded-full', TYPE_COLORS[cls.type] ?? 'bg-wtext-4')} />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="rounded-full bg-wline-2 px-2 py-0.5 text-xs font-semibold text-wtext-2 dark:bg-rink-700 dark:text-rink-100">
            {TYPE_LABELS[cls.type] ?? cls.type}
          </span>
          <span className="text-xs text-wtext-3 dark:text-rink-300">{cls.time}</span>
        </div>
        <p className="truncate text-sm font-bold text-wtext-1 dark:text-white">{cls.title}</p>
        <div className="mt-1 flex items-center gap-3 text-xs text-wtext-3 dark:text-rink-300">
          {cls.coach && (
            <span className="flex items-center gap-1">
              <Icon name="person" className="text-[14px]" aria-hidden="true" />
              {cls.coach}
            </span>
          )}
          {cls.location && (
            <span className="flex items-center gap-1">
              <Icon name="location_on" className="text-[14px]" aria-hidden="true" />
              {cls.location}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────
// CalendarGrid Props
// ────────────────────────────────────────────

interface CalendarGridProps {
  /** 42셀 캘린더 데이터 */
  calendarGrid: CalendarDay[];
  /** 현재 월 (0-based) */
  currentMonth: number;
  /** 월 표시 레이블 (예: "2026년 4월") */
  monthLabel: string;
  /** 선택된 날짜 키 (YYYY-MM-DD) */
  selectedDateKey: string | null;
  /** 날짜 선택 핸들러 */
  onDateSelect: (dateKey: string) => void;
  /** 선택된 날짜의 수업 목록 */
  selectedClasses: CalendarClass[];
  /** 선택된 날짜 레이블 */
  selectedDateLabel: { month: number; day: number } | null;
  /** 이전 달 이동 */
  onPrevMonth: () => void;
  /** 다음 달 이동 */
  onNextMonth: () => void;
  /** 오늘로 이동 */
  onGoToToday: () => void;
  /** 로딩 상태 */
  isLoading: boolean;
  /** 에러 메시지 */
  errorMessage: string | null;
}

// ────────────────────────────────────────────
// CalendarGrid Component
// ────────────────────────────────────────────

export function CalendarGrid({
  calendarGrid,
  currentMonth,
  monthLabel,
  selectedDateKey,
  onDateSelect,
  selectedClasses,
  selectedDateLabel,
  onPrevMonth,
  onNextMonth,
  onGoToToday,
  isLoading,
  errorMessage,
}: CalendarGridProps) {
  // 첫 fetch 완료 추적 — 월 변경 시 그리드 unmount 방지(깜빡임 방지).
  // (2026-05-11) 이전 패턴 `{isLoading ? null : <grid>}` 제거.
  //   첫 로딩만 풀스크린 로더에 양보, 이후 월 변경은 transition-opacity 로 부드럽게 갱신.
  const hasLoadedOnceRef = useRef(false);
  if (!isLoading) hasLoadedOnceRef.current = true;

  return (
    <>
      {/* 월 이동 네비게이션 */}
      <div className="flex items-center justify-between px-5 py-4">
        <button
          onClick={onPrevMonth}
          className="flex size-10 items-center justify-center rounded-full transition-colors hover:bg-wline-2 active:brightness-95 dark:hover:bg-rink-800"
          aria-label="이전 달"
        >
          <Icon name="chevron_left" className="text-xl text-wtext-2 dark:text-rink-100" />
        </button>

        <h2 className="text-lg font-bold text-wtext-1 dark:text-white">{monthLabel}</h2>

        <button
          onClick={onNextMonth}
          className="flex size-10 items-center justify-center rounded-full transition-colors hover:bg-wline-2 active:brightness-95 dark:hover:bg-rink-800"
          aria-label="다음 달"
        >
          <Icon name="chevron_right" className="text-xl text-wtext-2 dark:text-rink-100" />
        </button>
      </div>

      {/* 캘린더 그리드 */}
      <div className="px-5">
        {errorMessage && (
          <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            {errorMessage}
          </div>
        )}

        {/* 요일 헤더 */}
        <div className="mb-2 grid grid-cols-7" role="row">
          {DAY_LABELS.map((day, index) => (
            <div
              key={day}
              className={cn(
                'py-1 text-center text-xs font-semibold',
                colIsSunday(index)
                  ? 'text-red-500 dark:text-red-400'
                  : colIsSaturday(index)
                    ? 'text-blue-500 dark:text-blue-400'
                    : 'text-wtext-3 dark:text-rink-300'
              )}
              role="columnheader"
            >
              {day}
            </div>
          ))}
        </div>

        {/* 날짜 셀 — (2026-05-11) stale-while-revalidate 패턴
            첫 fetch 전에만 null, 이후 월 변경 시 그리드 mount 유지 + transition-opacity 로 부드러운 갱신 */}
        {!hasLoadedOnceRef.current && isLoading ? null : (
          <div
            className={cn(
              'grid grid-cols-7 gap-y-1 transition-opacity duration-200 motion-reduce:transition-none transform-gpu',
              isLoading && 'opacity-60',
            )}
            style={{ willChange: 'opacity', contain: 'layout style' }}
            role="grid"
            aria-label={monthLabel}
            aria-busy={isLoading}
          >
            {calendarGrid.map((day, index) => {
              const isSelected = day.isCurrentMonth && day.dateKey === selectedDateKey;
              const hasClasses = day.trainingTypes.length > 0;
              const dayOfWeek = index % 7;

              return (
                <button
                  key={`cell-${index}`}
                  onClick={() => day.isCurrentMonth && onDateSelect(day.dateKey)}
                  disabled={!day.isCurrentMonth}
                  className={cn(
                    'flex min-h-[52px] flex-col items-center justify-center rounded-xl py-1.5 transition-colors',
                    day.isCurrentMonth
                      ? 'hover:bg-wline-2 active:brightness-95 dark:hover:bg-rink-800'
                      : 'cursor-default opacity-30',
                    isSelected && 'bg-ice-500 text-white hover:bg-ice-700',
                    day.isToday && !isSelected && 'ring-2 ring-inset ring-ice-500'
                  )}
                  aria-label={`${currentMonth + 1}월 ${day.date}일${day.isToday ? ' 오늘' : ''}${hasClasses ? ` 수업 ${day.classes.length}개` : ''}`}
                  aria-selected={isSelected}
                  role="gridcell"
                >
                  <span
                    className={cn(
                      'tabular-nums text-sm font-semibold leading-none',
                      isSelected
                        ? 'text-white'
                        : day.isCurrentMonth
                          ? colIsSunday(dayOfWeek)
                            ? 'text-red-500 dark:text-red-400'
                            : colIsSaturday(dayOfWeek)
                              ? 'text-blue-500 dark:text-blue-400'
                              : 'text-wtext-1 dark:text-white'
                          : 'text-wtext-4 dark:text-rink-500'
                    )}
                  >
                    {day.date}
                  </span>

                  {/* 2026-05-16: CalendarDot 을 모든 셀에 항상 렌더 — 빈 일정도 동일 높이
                       reserve 하여 날짜 숫자 위치 일관성 보장. */}
                  <CalendarDot
                    types={day.isCurrentMonth && hasClasses ? day.trainingTypes : []}
                    size="sm"
                    className={cn('mt-1', isSelected && '[&_span]:bg-white/80')}
                  />
                </button>
              );
            })}
          </div>
        )}

        <CalendarLegend className="mt-4 justify-center border-t border-wline-2 py-3 dark:border-rink-700" />
      </div>

      {/* 선택 날짜 수업 상세 */}
      <div className="px-5 py-4">
        {selectedDateLabel && (
          <>
            <h3 className="mb-3 flex items-center gap-2 text-base font-bold text-wtext-1 dark:text-white">
              <Icon name="event" className="text-lg text-ice-500" aria-hidden="true" />
              {selectedDateLabel.month}월 {selectedDateLabel.day}일 수업
            </h3>

            {selectedClasses.length > 0 ? (
              <div className="rounded-xl border border-wline-2 bg-white px-4 shadow-sm dark:border-rink-700 dark:bg-rink-800">
                {selectedClasses.map((cls) => (
                  <ClassDetail key={cls.id} cls={cls} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-wline-2 bg-white p-8 shadow-sm dark:border-rink-700 dark:bg-rink-800">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-wline-2 dark:bg-rink-700">
                  <Icon name="event_busy" className="text-2xl text-wtext-3 dark:text-rink-300" aria-hidden="true" />
                </div>
                <p className="text-sm text-wtext-3 dark:text-rink-300">{MESSAGES.dashboard.noSchedule}</p>
              </div>
            )}
          </>
        )}
      </div>

      <div className="h-8" aria-hidden="true" />
    </>
  );
}
