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
    // 칩색은 lib calendar-colors.ts 의미색 SoT 와 정합 (colorBar 와 일치):
    //   [ICETIMES flat 재작업 2026-06-24] SoT 정합 — 정규(REGULAR)=초록(emerald/success) ·
    //   레슨(LESSON)=파랑(it-blue) · 대회(GAME)=빨강(it-red).
    //   (이전: 정규=red 로 SoT 위반 → calendar-colors.ts §REGULAR(emerald) 기준으로 교정.)
    const chipClassName =
      event.type === 'REGULAR'
        ? 'bg-success-100 text-success-700 dark:bg-success-700/25 dark:text-success-500'
        : event.type === 'LESSON'
          ? 'bg-it-blue-50 text-it-blue-600 dark:bg-it-blue-500/20 dark:text-it-blue-300'
          : 'bg-it-red-50 text-it-red-600 dark:bg-it-red-500/20 dark:text-it-red-300';
    const chipLabel =
      event.type === 'REGULAR'
        ? MESSAGES.calendar.training
        : event.type === 'LESSON'
          ? MESSAGES.calendar.lesson
          : MESSAGES.calendar.tournament;
    return (
      <ScheduleRow
        iceTheme
        colorBar={{ bg: color.bg, darkBg: color.darkBg }}
        chip={{ label: chipLabel, className: chipClassName }}
        time={timeDisplay}
        title={event.title}
        location={event.venue}
      />
    );
  }, []);

  /* [ICETIMES flat 재작업 2026-06-24] 빈 상태 카드 박스(rounded-2xl border-dashed) 제거 →
     flat 면 위 아이콘+문구만. ScheduleRangeList 가 흰 섹션 안에서 렌더하므로 박스 불필요. */
  const emptyState = (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-w-pill bg-it-fill dark:bg-it-blue-900">
        <Icon
          name="calendar_today"
          className="text-2xl text-it-ink-400 dark:text-rink-300"
          aria-hidden="true"
        />
      </div>
      <p className="text-card-body font-medium text-it-ink-500 dark:text-rink-300">
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
        className="hide-scrollbar flex-1 overflow-y-auto bg-it-canvas dark:bg-puck !pb-8"
        role="main"
        aria-label={MESSAGES.calendar.title}
      >
        {/* [2026-06-18] 등록훈련 — 달력 위에 자녀별 등록완료 수업 카드(수업목록 카드 형태). */}
        <EnrolledTrainingSection iceTheme />

        {/* 월간 캘린더 — 선택 날짜 상세 섹션은 숨기고 하단 통합 리스트로 대체 */}
        <UnifiedCalendarGrid
          iceTheme
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
          iceTheme
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
      </main>
    </MobileContainer>
  );
}
