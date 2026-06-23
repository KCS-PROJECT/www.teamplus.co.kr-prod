'use client';

import { useRef } from 'react';
import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import { getCalendarEventColor, CALENDAR_EVENT_LEGEND } from '@/lib/calendar-colors';
import { WEEKDAY_HEADERS, colIsSaturday, colIsSunday } from '@/lib/calendar-week';
import type { CalendarEvent, UnifiedCalendarDay } from '@/hooks/useUnifiedCalendar';

// ────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────

const DAY_LABELS = WEEKDAY_HEADERS;

// ────────────────────────────────────────────
// EventDot - 이벤트 타입 색상 점
// ────────────────────────────────────────────

function EventDot({
  types,
  isSelected,
}: {
  types: string[];
  isSelected?: boolean;
}) {
  // 2026-05-16: 일정 유무와 상관없이 항상 동일 높이(h-3 ≈ 12px) reserve.
  //   → 숫자 위치가 셀마다 시프트되지 않도록 보장. types.length === 0 일 때도
  //   빈 placeholder 영역만 차지하여 button 의 flex-col justify-center 가 균일하게 동작.
  const uniqueTypes = [...new Set(types)];
  const displayTypes = uniqueTypes.slice(0, 3);
  const overflow = uniqueTypes.length - 3;

  return (
    <div
      className="flex items-center justify-center gap-0.5 mt-1 h-3"
      aria-hidden={types.length === 0}
    >
      {displayTypes.map((type) => {
        const color = getCalendarEventColor(type);
        return (
          <span
            key={type}
            className={cn(
              'w-1.5 h-1.5 rounded-full shrink-0',
              color.bg,
              color.darkBg,
              isSelected && 'opacity-80',
            )}
            aria-label={color.label}
          />
        );
      })}
      {overflow > 0 && (
        <span className="text-card-meta text-wtext-3 dark:text-rink-300 font-bold leading-none">
          +{overflow}
        </span>
      )}
    </div>
  );
}

// ────────────────────────────────────────────
// EventDetail - 선택 날짜 이벤트 상세
// ────────────────────────────────────────────

export function EventDetail({ event }: { event: CalendarEvent }) {
  const color = getCalendarEventColor(event.type);

  const timeDisplay =
    event.startTime && event.endTime
      ? `${event.startTime} - ${event.endTime}`
      : event.startTime
        ? event.startTime
        : null;

  return (
    <div className="flex items-start gap-3 border-b border-wline-2 py-3 last:border-b-0 dark:border-rink-700">
      <div
        className={cn(
          'h-full min-h-[48px] w-1 shrink-0 rounded-full',
          color.bg,
          color.darkBg,
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-semibold',
              event.type === 'REGULAR'
                ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                : event.type === 'LESSON'
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                  : 'bg-blue-50 text-ice-500 dark:bg-blue-900/30 dark:text-blue-300',
            )}
          >
            {event.type === 'REGULAR'
              ? MESSAGES.calendar.training
              : event.type === 'LESSON'
                ? MESSAGES.calendar.lesson
                : MESSAGES.calendar.tournament}
          </span>
          {timeDisplay && (
            <span className="text-xs text-wtext-3 dark:text-rink-300">
              {timeDisplay}
            </span>
          )}
        </div>
        <p className="truncate text-sm font-bold text-wtext-1 dark:text-white">
          {event.title}
        </p>
        <div className="mt-1 flex items-center gap-3 text-xs text-wtext-3 dark:text-rink-300">
          {event.venue && (
            <span className="flex items-center gap-1">
              <Icon
                name="location_on"
                className="text-[14px]"
                aria-hidden="true"
              />
              {event.venue}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────
// UnifiedCalendarLegend - 통합 캘린더 범례
// ────────────────────────────────────────────

function UnifiedCalendarLegend({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)}>
      {CALENDAR_EVENT_LEGEND.map((item) => (
        <div key={item.key} className="flex items-center gap-1.5">
          <span
            className={cn(
              'w-2.5 h-2.5 rounded-full shrink-0',
              item.bg,
              item.darkBg,
            )}
          />
          <span className="text-xs text-wtext-2 dark:text-rink-300 font-medium">
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────
// UnifiedCalendarGrid Props
// ────────────────────────────────────────────

interface UnifiedCalendarGridProps {
  calendarGrid: UnifiedCalendarDay[];
  currentMonth: number;
  monthLabel: string;
  selectedDateKey: string | null;
  onDateSelect: (dateKey: string) => void;
  selectedEvents: CalendarEvent[];
  selectedDateLabel: { month: number; day: number } | null;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onGoToToday: () => void;
  isLoading: boolean;
  errorMessage: string | null;
  /**
   * 선택 날짜 1일치 "이벤트 상세" 섹션 숨김 여부.
   * 기본 false (학생 캘린더 동작 유지). parent-calendar 처럼 하단에
   * 기간(주/달) 통합 리스트를 별도로 그리는 경우 true 로 중복 노출 차단.
   */
  hideSelectedDetail?: boolean;
}

// ────────────────────────────────────────────
// UnifiedCalendarGrid Component
// ────────────────────────────────────────────

export function UnifiedCalendarGrid({
  calendarGrid,
  currentMonth,
  monthLabel,
  selectedDateKey,
  onDateSelect,
  selectedEvents,
  selectedDateLabel,
  onPrevMonth,
  onNextMonth,
  onGoToToday,
  isLoading,
  errorMessage,
  hideSelectedDetail = false,
}: UnifiedCalendarGridProps) {
  // 첫 fetch 완료 추적 — 월 변경 시 그리드 unmount 방지(깜빡임 방지).
  // (2026-05-11) 이전 패턴 `{isLoading ? null : <grid>}` 는 fetch 마다 그리드를 unmount/remount.
  //   첫 로딩만 풀스크린 로더에 양보, 이후 월 변경은 transition-opacity 로 부드럽게 갱신.
  const hasLoadedOnceRef = useRef(false);
  if (!isLoading) hasLoadedOnceRef.current = true;

  return (
    <>
      {/* 캘린더 메인 카드 — 2026-05-16: /parent/ 페이지 카드 패턴(rounded-w-xl bg-wsurface
          border shadow-sh-1) 통일. 월 네비/요일/그리드/범례를 하나의 카드로 묶음. */}
      <div className="mx-4 mt-3 rounded-w-xl bg-wsurface dark:bg-rink-800 border border-wline dark:border-rink-700 shadow-sh-1 overflow-hidden">
      {/* 월 이동 네비게이션 */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <button
          onClick={onPrevMonth}
          className="flex size-8 items-center justify-center rounded-full transition-colors hover:bg-wline-2 active:brightness-95 dark:hover:bg-rink-800"
          aria-label="이전 달"
        >
          <Icon
            name="chevron_left"
            className="text-lg text-wtext-2 dark:text-rink-100"
          />
        </button>

        <h2 className="text-base font-bold text-wtext-1 dark:text-white">
          {monthLabel}
        </h2>

        <button
          onClick={onNextMonth}
          className="flex size-8 items-center justify-center rounded-full transition-colors hover:bg-wline-2 active:brightness-95 dark:hover:bg-rink-800"
          aria-label="다음 달"
        >
          <Icon
            name="chevron_right"
            className="text-lg text-wtext-2 dark:text-rink-100"
          />
        </button>
      </div>

      {/* 캘린더 그리드 */}
      <div className="px-3">
        {errorMessage && (
          <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            {errorMessage}
          </div>
        )}

        {/* 요일 헤더 */}
        <div className="mb-1 grid grid-cols-7" role="row">
          {DAY_LABELS.map((day, index) => (
            <div
              key={day}
              className={cn(
                'py-1 text-center text-xs font-semibold',
                colIsSunday(index)
                  ? 'text-flame-500'
                  : colIsSaturday(index)
                    ? 'text-ice-500'
                    : 'text-wtext-3 dark:text-rink-300',
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
              'grid grid-cols-7 gap-y-0.5 transition-opacity duration-200 motion-reduce:transition-none transform-gpu',
              isLoading && 'opacity-60',
            )}
            style={{ willChange: 'opacity', contain: 'layout style' }}
            role="grid"
            aria-label={monthLabel}
            aria-busy={isLoading}
          >
            {calendarGrid.map((day, index) => {
              const isSelected =
                day.isCurrentMonth && day.dateKey === selectedDateKey;
              const hasEvents = day.eventTypes.length > 0;
              const dayOfWeek = index % 7;

              return (
                <button
                  key={`cell-${index}`}
                  onClick={() =>
                    day.isCurrentMonth && onDateSelect(day.dateKey)
                  }
                  disabled={!day.isCurrentMonth}
                  className={cn(
                    'flex h-[40px] flex-col items-center justify-center rounded-xl transition-colors',
                    day.isCurrentMonth
                      ? 'hover:bg-wline-2 active:brightness-95 dark:hover:bg-rink-800'
                      : 'cursor-default opacity-30',
                    isSelected &&
                      'bg-ice-500 text-white hover:bg-ice-700',
                    day.isToday &&
                      !isSelected &&
                      'ring-2 ring-inset ring-ice-500',
                  )}
                  aria-label={`${currentMonth + 1}월 ${day.date}일${day.isToday ? ' 오늘' : ''}${hasEvents ? ` ${MESSAGES.calendar.eventCount(day.events.length)}` : ''}`}
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
                            ? 'text-flame-500'
                            : colIsSaturday(dayOfWeek)
                              ? 'text-ice-500'
                              : 'text-wtext-1 dark:text-white'
                          : 'text-wtext-4 dark:text-rink-500',
                    )}
                  >
                    {day.date}
                  </span>

                  {/* 2026-05-16: EventDot 을 모든 셀에 항상 렌더 — 빈 일정도 동일 높이
                       reserve 하여 날짜 숫자 위치가 셀마다 시프트되지 않도록 보장.
                       이전/다음 달 (current month 아닌) 셀도 동일 placeholder 영역 차지. */}
                  <EventDot
                    types={day.isCurrentMonth && hasEvents ? day.eventTypes : []}
                    isSelected={isSelected}
                  />

                </button>
              );
            })}
          </div>
        )}

        <UnifiedCalendarLegend className="mt-2.5 justify-center border-t border-wline-2 py-2.5 dark:border-rink-700" />
      </div>
      </div>
      {/* /캘린더 메인 카드 */}

      {/* 선택 날짜 이벤트 상세 — 카드 외부에 별도 섹션.
          hideSelectedDetail=true 면 하단 기간 리스트가 별도로 그려지므로 숨김. */}
      <div className={cn('mx-4 mt-4', hideSelectedDetail && 'hidden')}>
        {!hideSelectedDetail && selectedDateLabel && (
          <>
            <h3 className="mb-3 flex items-center gap-2 text-base font-bold text-wtext-1 dark:text-white">
              <Icon
                name="event"
                className="text-lg text-ice-500"
                aria-hidden="true"
              />
              {selectedDateLabel.month}월 {selectedDateLabel.day}일 일정
            </h3>

            {selectedEvents.length > 0 ? (
              <div className="rounded-w-xl border border-wline dark:border-rink-700 bg-wsurface dark:bg-rink-800 px-4 shadow-sh-1">
                {selectedEvents.map((event) => (
                  <EventDetail key={event.id} event={event} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 rounded-w-xl border border-wline dark:border-rink-700 bg-wsurface dark:bg-rink-800 p-8 shadow-sh-1">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-wline-2 dark:bg-rink-700">
                  <Icon
                    name="event_busy"
                    className="text-2xl text-wtext-3 dark:text-rink-300"
                    aria-hidden="true"
                  />
                </div>
                <p className="text-sm text-wtext-3 dark:text-rink-300">
                  {MESSAGES.calendar.noEvents}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      <div className="h-2" aria-hidden="true" />
    </>
  );
}
