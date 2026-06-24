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
  iceTheme = false,
}: {
  types: string[];
  isSelected?: boolean;
  /** ICETIMES flat: 시안 4px dot. 기본 false = 기존 6px. */
  iceTheme?: boolean;
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
              'rounded-full shrink-0',
              // 시안 KitCalendar dot = 4px. iceTheme 시 4px, 아니면 기존 6px.
              iceTheme ? 'w-1 h-1' : 'w-1.5 h-1.5',
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

export function EventDetail({
  event,
  iceTheme = false,
}: {
  event: CalendarEvent;
  iceTheme?: boolean;
}) {
  const color = getCalendarEventColor(event.type);

  const timeDisplay =
    event.startTime && event.endTime
      ? `${event.startTime} - ${event.endTime}`
      : event.startTime
        ? event.startTime
        : null;

  // 칩 색은 calendar-colors SoT 정합 — 정규(REGULAR)=초록 · 레슨(LESSON)=파랑 · 대회(GAME)=빨강.
  //   EventDot 이 쓰는 getCalendarEventColor 와 동일 의미색을 soft 톤(bg-50/text-700)으로 매핑.
  const chipClassName =
    event.type === 'REGULAR'
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
      : event.type === 'LESSON'
        ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
        : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300';

  return (
    <div
      className={cn(
        'flex items-start gap-3 border-b py-3 last:border-b-0',
        iceTheme
          ? 'border-it-line dark:border-rink-700'
          : 'border-wline-2 dark:border-rink-700',
      )}
    >
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
              chipClassName,
            )}
          >
            {event.type === 'REGULAR'
              ? MESSAGES.calendar.training
              : event.type === 'LESSON'
                ? MESSAGES.calendar.lesson
                : MESSAGES.calendar.tournament}
          </span>
          {timeDisplay && (
            <span
              className={cn(
                'text-xs',
                iceTheme ? 'text-it-ink-500 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300',
              )}
            >
              {timeDisplay}
            </span>
          )}
        </div>
        <p
          className={cn(
            'truncate text-sm font-bold',
            iceTheme ? 'text-it-ink-800 dark:text-white' : 'text-wtext-1 dark:text-white',
          )}
        >
          {event.title}
        </p>
        <div
          className={cn(
            'mt-1 flex items-center gap-3 text-xs',
            iceTheme ? 'text-it-ink-500 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300',
          )}
        >
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

function UnifiedCalendarLegend({
  className,
  iceTheme = false,
}: {
  className?: string;
  iceTheme?: boolean;
}) {
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
          <span
            className={cn(
              'text-xs font-medium',
              iceTheme ? 'text-it-ink-600 dark:text-rink-300' : 'text-wtext-2 dark:text-rink-300',
            )}
          >
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
  /**
   * ICETIMES(하우머치) flat variant. 기본 false = 기존 동작.
   * true 일 때 캘린더 카드/상세 표면을 it-* 토큰으로 평탄화(그림자 제거, hairline),
   * 일자 셀 일=it-red · 토/선택/오늘=it-blue · 텍스트 it-ink 위계로 표시.
   * 일정 유형 dot/칩 색은 작업1 복원 의미색을 그대로 유지한다.
   */
  iceTheme?: boolean;
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
  iceTheme = false,
}: UnifiedCalendarGridProps) {
  // 첫 fetch 완료 추적 — 월 변경 시 그리드 unmount 방지(깜빡임 방지).
  // (2026-05-11) 이전 패턴 `{isLoading ? null : <grid>}` 는 fetch 마다 그리드를 unmount/remount.
  //   첫 로딩만 풀스크린 로더에 양보, 이후 월 변경은 transition-opacity 로 부드럽게 갱신.
  const hasLoadedOnceRef = useRef(false);
  if (!isLoading) hasLoadedOnceRef.current = true;

  return (
    <>
      {/* 캘린더 메인 카드 — 2026-05-16: /parent/ 페이지 카드 패턴(rounded-w-xl bg-wsurface
          border shadow-sh-1) 통일. 월 네비/요일/그리드/범례를 하나의 카드로 묶음.
          iceTheme: 카드 박스(rounded/border/mx/shadow)는 제거하되, 회색 캔버스 위에 캘린더가
          떠 보이지 않도록 흰 섹션 면(self-wrap: mt-2 bg-it-surface)으로 평탄화. 선택일/빈상태
          블록도 같은 흰 섹션 안에 들어오도록 아래 EventDetail 블록까지 이 wrapper 가 감싼다. */}
      <div
        className={cn(
          'overflow-hidden',
          iceTheme
            ? 'mt-2 bg-it-surface dark:bg-rink-800'
            : 'mx-4 mt-3 rounded-w-xl border bg-wsurface dark:bg-rink-800 border-wline dark:border-rink-700 shadow-sh-1',
        )}
      >
      {/* 월 이동 네비게이션 */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <button
          onClick={onPrevMonth}
          className={cn(
            'flex size-8 items-center justify-center rounded-full transition-colors active:brightness-95',
            iceTheme
              ? 'hover:bg-it-fill dark:hover:bg-rink-800'
              : 'hover:bg-wline-2 dark:hover:bg-rink-800',
          )}
          aria-label="이전 달"
        >
          <Icon
            name="chevron_left"
            className={cn('text-lg', iceTheme ? 'text-it-ink-600 dark:text-rink-100' : 'text-wtext-2 dark:text-rink-100')}
          />
        </button>

        <h2
          className={cn(
            'text-base font-bold',
            iceTheme ? 'text-it-ink-800 dark:text-white' : 'text-wtext-1 dark:text-white',
          )}
        >
          {monthLabel}
        </h2>

        <button
          onClick={onNextMonth}
          className={cn(
            'flex size-8 items-center justify-center rounded-full transition-colors active:brightness-95',
            iceTheme
              ? 'hover:bg-it-fill dark:hover:bg-rink-800'
              : 'hover:bg-wline-2 dark:hover:bg-rink-800',
          )}
          aria-label="다음 달"
        >
          <Icon
            name="chevron_right"
            className={cn('text-lg', iceTheme ? 'text-it-ink-600 dark:text-rink-100' : 'text-wtext-2 dark:text-rink-100')}
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
                  ? iceTheme ? 'text-it-red-500' : 'text-flame-500'
                  : colIsSaturday(index)
                    ? iceTheme ? 'text-it-blue-500' : 'text-ice-500'
                    : iceTheme ? 'text-it-ink-400 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300',
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
                    'flex h-[40px] flex-col items-center justify-center transition-colors',
                    // iceTheme(시안): 강조는 28×28 칩에만 — 셀 자체엔 라운드/배경 없음.
                    //   기본: 기존 셀 단위 강조(rounded-xl + 배경/ring) 1:1 유지.
                    iceTheme
                      ? day.isCurrentMonth
                        ? ''
                        : 'cursor-default opacity-30'
                      : cn(
                          'rounded-xl',
                          day.isCurrentMonth
                            ? 'hover:bg-wline-2 active:brightness-95 dark:hover:bg-rink-800'
                            : 'cursor-default opacity-30',
                          isSelected && 'bg-ice-500 text-white hover:bg-ice-700',
                          day.isToday && !isSelected && 'ring-2 ring-inset ring-ice-500',
                        ),
                  )}
                  aria-label={`${currentMonth + 1}월 ${day.date}일${day.isToday ? ' 오늘' : ''}${hasEvents ? ` ${MESSAGES.calendar.eventCount(day.events.length)}` : ''}`}
                  aria-selected={isSelected}
                  role="gridcell"
                >
                  <span
                    className={cn(
                      'tabular-nums leading-none',
                      // iceTheme(시안): 28×28 rounded-[8px] 칩 — 선택=it-blue 흰글자 · 오늘=inset ring it-blue-400 · 13.5px/700.
                      //   기본: 칩 없이 텍스트만(14px/600).
                      iceTheme
                        ? 'flex h-7 w-7 items-center justify-center rounded-[8px] text-[13.5px] font-bold transition-colors motion-reduce:transition-none'
                        : 'text-sm font-semibold',
                      isSelected
                        ? iceTheme
                          ? 'bg-it-blue-500 text-white'
                          : 'text-white'
                        : day.isCurrentMonth
                          ? colIsSunday(dayOfWeek)
                            ? iceTheme ? 'text-it-red-500' : 'text-flame-500'
                            : colIsSaturday(dayOfWeek)
                              ? iceTheme ? 'text-it-blue-500' : 'text-ice-500'
                              : iceTheme ? 'text-it-ink-800 dark:text-white' : 'text-wtext-1 dark:text-white'
                          : iceTheme ? 'text-it-ink-300 dark:text-rink-500' : 'text-wtext-4 dark:text-rink-500',
                      iceTheme && day.isToday && !isSelected && 'ring-2 ring-inset ring-it-blue-400',
                    )}
                  >
                    {day.date}
                  </span>

                  {/* 2026-05-16: EventDot 을 모든 셀에 항상 렌더 — 빈 일정도 동일 높이
                       reserve 하여 날짜 숫자 위치가 셀마다 시프트되지 않도록 보장.
                       이전/다음 달 (current month 아닌) 셀도 동일 placeholder 영역 차지. */}
                  <EventDot
                    iceTheme={iceTheme}
                    types={day.isCurrentMonth && hasEvents ? day.eventTypes : []}
                    isSelected={isSelected}
                  />

                </button>
              );
            })}
          </div>
        )}

        <UnifiedCalendarLegend
          iceTheme={iceTheme}
          className={cn(
            'mt-2.5 justify-center border-t py-2.5',
            iceTheme ? 'border-it-line dark:border-rink-700' : 'border-wline-2 dark:border-rink-700',
          )}
        />
      </div>
      </div>
      {/* /캘린더 메인 카드 */}

      {/* 선택 날짜 이벤트 상세 — 카드 외부에 별도 섹션.
          hideSelectedDetail=true 면 하단 기간 리스트가 별도로 그려지므로 숨김.
          iceTheme: 회색 캔버스 위에 뜨지 않도록 흰 섹션(mt-2 bg-it-surface + 좌우 패딩 px-4)으로 self-wrap.
          기본 테마는 기존 mx-4 mt-4(별도 카드 패턴) 1:1 유지. */}
      <div
        className={cn(
          iceTheme ? 'mt-2 bg-it-surface px-4 py-4 dark:bg-rink-800' : 'mx-4 mt-4',
          hideSelectedDetail && 'hidden',
        )}
      >
        {!hideSelectedDetail && selectedDateLabel && (
          <>
            <h3
              className={cn(
                'mb-3 flex items-center gap-2 text-base font-bold',
                iceTheme ? 'text-it-ink-800 dark:text-white' : 'text-wtext-1 dark:text-white',
              )}
            >
              <Icon
                name="event"
                className={cn('text-lg', iceTheme ? 'text-it-blue-500' : 'text-ice-500')}
                aria-hidden="true"
              />
              {selectedDateLabel.month}월 {selectedDateLabel.day}일 일정
            </h3>

            {selectedEvents.length > 0 ? (
              <div
                className={cn(
                  'px-4',
                  iceTheme
                    ? ''
                    : 'rounded-w-xl border border-wline dark:border-rink-700 bg-wsurface dark:bg-rink-800 shadow-sh-1',
                )}
              >
                {selectedEvents.map((event) => (
                  <EventDetail key={event.id} event={event} iceTheme={iceTheme} />
                ))}
              </div>
            ) : (
              <div
                className={cn(
                  'flex flex-col items-center gap-2 p-8',
                  iceTheme
                    ? ''
                    : 'rounded-w-xl border border-wline dark:border-rink-700 bg-wsurface dark:bg-rink-800 shadow-sh-1',
                )}
              >
                <div
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-full',
                    iceTheme ? 'bg-it-fill dark:bg-rink-700' : 'bg-wline-2 dark:bg-rink-700',
                  )}
                >
                  <Icon
                    name="event_busy"
                    className={cn('text-2xl', iceTheme ? 'text-it-ink-400 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300')}
                    aria-hidden="true"
                  />
                </div>
                <p
                  className={cn(
                    'text-sm',
                    iceTheme ? 'text-it-ink-500 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300',
                  )}
                >
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
