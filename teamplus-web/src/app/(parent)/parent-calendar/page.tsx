'use client';

import { useCallback, useMemo, useState } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { SubmainAppBar } from '@/components/layout/SubmainAppBar';
import { Icon } from '@/components/ui/Icon';
import { UnifiedCalendarGrid } from '@/components/calendar/UnifiedCalendarGrid';
import { ScheduleRow } from '@/components/calendar/ScheduleRow';
import { ScheduleRangeList } from '@/components/calendar/ScheduleRangeList';
import { EnrolledTrainingSection } from '@/components/calendar/EnrolledTrainingSection';
import {
  useUnifiedCalendar,
  type CalendarEvent,
  type UnifiedCalendarDay,
} from '@/hooks/useUnifiedCalendar';
import {
  useScheduleRangeGroups,
  type ScheduleRangeKey,
} from '@/hooks/useScheduleRangeGroups';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { useSelectedChild } from '@/contexts/SelectedChildContext';
import { getCalendarEventColor } from '@/lib/calendar-colors';
import { MESSAGES } from '@/lib/messages';

// ────────────────────────────────────────────
// Utilities
// ────────────────────────────────────────────

function pad2(value: number): string {
  return `${value}`.padStart(2, '0');
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function getWeekRange(today: Date): { start: string; end: string } {
  const dayOfWeek = today.getDay();
  const start = new Date(today);
  start.setDate(today.getDate() - dayOfWeek);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start: toDateKey(start), end: toDateKey(end) };
}

function formatShortDate(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00`);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

// ────────────────────────────────────────────
// Page
// ────────────────────────────────────────────

export default function ParentCalendarPage() {
  const { selectedChildId } = useSelectedChild();
  const calendar = useUnifiedCalendar({
    defaultSelectToday: false,
    childId: selectedChildId,
  });

  usePageReady(!calendar.isLoading);

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });

  const [rangeKey, setRangeKey] = useState<ScheduleRangeKey>('week');

  const { today, todayKey, calendarGrid, selectedDateKey } = calendar;

  const weekRange = useMemo(() => getWeekRange(today), [today]);
  const weekRangeLabel = useMemo(
    () => `${formatShortDate(weekRange.start)} ~ ${formatShortDate(weekRange.end)}`,
    [weekRange.start, weekRange.end],
  );

  const cellByKey = useMemo(() => {
    const map = new Map<string, UnifiedCalendarDay>();
    calendarGrid.forEach((day) => map.set(day.dateKey, day));
    return map;
  }, [calendarGrid]);

  const getItems = useCallback(
    (dateKey: string) => cellByKey.get(dateKey)?.events ?? [],
    [cellByKey],
  );

  const groups = useScheduleRangeGroups<CalendarEvent>({
    cells: calendarGrid,
    getItems,
    rangeKey,
    weekStart: weekRange.start,
    selectedDateKey,
  });

  const handleRangeChange = useCallback((key: ScheduleRangeKey) => {
    setRangeKey((prev) => (prev === key ? prev : key));
  }, []);

  const renderRow = useCallback((event: CalendarEvent) => {
    const color = getCalendarEventColor(event.type);
    const timeDisplay =
      event.startTime && event.endTime
        ? `${event.startTime} - ${event.endTime}`
        : event.startTime ?? null;
    const chipClassName =
      event.type === 'REGULAR'
        ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
        : event.type === 'LESSON'
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
          : 'bg-blue-50 text-ice-500 dark:bg-blue-900/30 dark:text-blue-300';
    const chipLabel =
      event.type === 'REGULAR'
        ? MESSAGES.calendar.training
        : event.type === 'LESSON'
          ? MESSAGES.calendar.lesson
          : MESSAGES.calendar.tournament;
    return (
      <ScheduleRow
        colorBar={{ bg: color.bg, darkBg: color.darkBg }}
        chip={{ label: chipLabel, className: chipClassName }}
        time={timeDisplay}
        title={event.title}
        location={event.venue}
      />
    );
  }, []);

  const emptyState = (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-wline bg-white p-8 text-center dark:border-rink-700 dark:bg-rink-800/40">
      <div className="mb-3 flex size-12 items-center justify-center rounded-w-pill bg-wline-2 dark:bg-rink-700">
        <Icon
          name="calendar_today"
          className="text-2xl text-wtext-3 dark:text-rink-300"
          aria-hidden="true"
        />
      </div>
      <p className="text-card-body font-medium text-wtext-3 dark:text-rink-300">
        {MESSAGES.calendar.noEvents}
      </p>
    </div>
  );

  // 데이터 fetch 완료 전까지 LoadingContext (풀스크린) 유지 — usePageReady 가 signaling.
  if (calendar.isLoading && (!calendarGrid || calendarGrid.length === 0)) {
    return null;
  }

  return (
    <MobileContainer hasBottomNav>
      <SubmainAppBar title={MESSAGES.calendar.title} />

      <main
        className="hide-scrollbar flex-1 overflow-y-auto bg-wbg dark:bg-rink-900"
        role="main"
        aria-label={MESSAGES.calendar.title}
      >
        {/* [2026-06-18] 등록훈련 — 달력 위에 자녀별 등록완료 수업 카드(수업목록 카드 형태). */}
        <EnrolledTrainingSection />

        {/* 월간 캘린더 — 선택 날짜 상세 섹션은 숨기고 하단 통합 리스트로 대체 */}
        <UnifiedCalendarGrid
          calendarGrid={calendarGrid}
          currentMonth={calendar.currentMonth}
          monthLabel={calendar.monthLabel}
          selectedDateKey={selectedDateKey}
          onDateSelect={calendar.setSelectedDateKey}
          selectedEvents={calendar.selectedEvents}
          selectedDateLabel={calendar.selectedDateLabel}
          onPrevMonth={calendar.goToPrevMonth}
          onNextMonth={calendar.goToNextMonth}
          onGoToToday={calendar.goToToday}
          isLoading={calendar.isLoading}
          errorMessage={calendar.errorMessage}
          hideSelectedDetail
        />

        <ScheduleRangeList<CalendarEvent>
          rangeKey={rangeKey}
          onRangeChange={handleRangeChange}
          groups={groups}
          todayKey={todayKey}
          headerTitle={{ week: '이번 주 일정', month: '이번 달 일정' }}
          weekRangeLabel={weekRangeLabel}
          showWeekRangeChip={!selectedDateKey}
          renderRow={renderRow}
          getRowKey={(event) => event.id}
          emptyState={emptyState}
          emptyDayMessage={MESSAGES.calendar.noEvents}
        />

        {/* BottomNav 여백 */}
        <div className="h-4" aria-hidden="true" />
      </main>
    </MobileContainer>
  );
}
