'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { SubmainAppBar } from '@/components/layout/SubmainAppBar';
import { Icon } from '@/components/ui/Icon';
import { useNavigation } from '@/components/ui/NavLink';
import { CalendarDot, CalendarLegend } from '@/components/calendar/CalendarDot';
import { ScheduleRow } from '@/components/calendar/ScheduleRow';
import { ScheduleRangeList } from '@/components/calendar/ScheduleRangeList';
import {
  useCalendar,
  type CalendarClass,
  type CalendarDay,
  getDateKey,
} from '@/hooks/useCalendar';
import {
  useScheduleRangeGroups,
  type ScheduleRangeKey,
} from '@/hooks/useScheduleRangeGroups';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import { getTrainingColor } from '@/lib/calendar-colors';
import { PATHS } from '@/lib/paths';
import { WEEKDAY_HEADERS, getWeekStart, colIsSaturday, colIsSunday } from '@/lib/calendar-week';

// ────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────

const DAY_LABELS = WEEKDAY_HEADERS;

// 수업 일정 카테고리 분기 — 정규/대회 클라이언트 필터.
//   - 'all' = 전체 (기본)
//   - 'regular' = 정규 수업 (REGULAR / regular)
//   - 'tournament' = 대회/매치 (TOURNAMENT / GAME / EVENT)
const CATEGORY_TABS = [
  { key: 'all', label: '전체', match: null as null | string[] },
  { key: 'regular', label: '정규수업', match: ['REGULAR', 'regular'] },
  { key: 'tournament', label: '대회', match: ['TOURNAMENT', 'GAME', 'EVENT', 'tournament'] },
] as const;

// 오픈클래스 감독(ACADEMY_DIRECTOR · /academy-schedules) 전용 카테고리.
//   학원/팀 독립 운영 — 데이터가 모두 OPEN 단일 type 이라 '전체' 단일.
//   `categoryTabs.length > 1` 조건부 렌더로 탭 UI 자체 숨김.
const ACADEMY_CATEGORY_TABS = [
  { key: 'all', label: '전체', match: null as null | string[] },
] as const;

type CategoryKey = (typeof CATEGORY_TABS)[number]['key'] | (typeof ACADEMY_CATEGORY_TABS)[number]['key'];

// ────────────────────────────────────────────
// Utilities
// ────────────────────────────────────────────

function getWeekRange(today: Date): { start: string; end: string } {
  // 주 시작 월요일 기준 — 월~일 7일 범위.
  const start = getWeekStart(today);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start: getDateKey(start), end: getDateKey(end) };
}

function formatShortDate(dateKey: string): string {
  const date = new Date(dateKey);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

// ────────────────────────────────────────────
// Empty State
// ────────────────────────────────────────────

function EmptyScheduleCard({ dateLabel }: { dateLabel?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-wline bg-white p-8 text-center dark:border-rink-700 dark:bg-rink-800/40">
      <div className="mb-3 flex size-12 items-center justify-center rounded-w-pill bg-wline-2 dark:bg-rink-700">
        <Icon
          name="calendar_today"
          className="text-2xl text-wtext-3 dark:text-rink-300"
          aria-hidden="true"
        />
      </div>
      <p className="text-card-body font-medium text-wtext-3 dark:text-rink-300">
        {dateLabel ? `${dateLabel}에 ` : ''}
        {MESSAGES.dashboard.noSchedule}
      </p>
    </div>
  );
}

// ────────────────────────────────────────────
// Main Page
// ────────────────────────────────────────────

export default function DirectorSchedulesPage() {
  const { navigate } = useNavigation();
  // 학원 감독 모드 분기 — /academy-schedules 진입 시 활성화.
  //   학원/팀은 독립 운영이므로 팀 데이터(정규) 노출 차단 + 카테고리 탭 교체.
  const pathname = usePathname();
  const isAcademyMode = pathname?.startsWith('/academy-schedules') ?? false;
  const categoryTabs = isAcademyMode ? ACADEMY_CATEGORY_TABS : CATEGORY_TABS;

  const [rangeKey, setRangeKey] = useState<ScheduleRangeKey>('week');
  const [categoryKey, setCategoryKey] = useState<CategoryKey>('all');
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

  const {
    today,
    todayKey,
    currentMonth,
    monthLabel,
    calendarGrid,
    isLoading: isCalendarLoading,
    errorMessage,
    goToPrevMonth,
    goToNextMonth,
  } = useCalendar({
    // 학원 감독은 팀 데이터 제외 — academy-only 전략으로 /academies/my/list 만 호출.
    clubFetchStrategy: isAcademyMode ? 'academy-only' : 'managed-with-fallback',
  });

  // 첫 캘린더 fetch 완료 추적 — 월 변경 시 페이지 unmount 방지(깜빡임 방지).
  const hasLoadedCalendarOnceRef = useRef(false);

  usePageReady(!isCalendarLoading);

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
    isDataLoaded: !isCalendarLoading,
  });

  const weekRange = useMemo(() => getWeekRange(today), [today]);

  const weekRangeLabel = useMemo(
    () => `${formatShortDate(weekRange.start)} ~ ${formatShortDate(weekRange.end)}`,
    [weekRange.start, weekRange.end],
  );

  // 선택된 카테고리에 매칭되는 type 집합. 'all' 이면 null → 필터 미적용.
  const categoryMatch = useMemo<readonly string[] | null>(() => {
    const tab = categoryTabs.find((c) => c.key === categoryKey);
    return tab?.match ?? null;
  }, [categoryKey, categoryTabs]);

  /** 카테고리 필터 적용 — match 가 null 이면 원본 그대로 반환. */
  const applyCategory = useCallback(
    (list: CalendarClass[]): CalendarClass[] => {
      if (!categoryMatch) return list;
      return list.filter((cls) => categoryMatch.includes(cls.type as string));
    },
    [categoryMatch],
  );

  const cellByKey = useMemo(() => {
    const map = new Map<string, CalendarDay>();
    calendarGrid.forEach((day) => map.set(day.dateKey, day));
    return map;
  }, [calendarGrid]);

  const getItems = useCallback(
    (dateKey: string) => applyCategory(cellByKey.get(dateKey)?.classes ?? []),
    [cellByKey, applyCategory],
  );

  const groups = useScheduleRangeGroups<CalendarClass>({
    cells: calendarGrid,
    getItems,
    rangeKey,
    weekStart: weekRange.start,
    selectedDateKey,
  });

  const handleRangeChange = useCallback((key: ScheduleRangeKey) => {
    // 탭 전환만으로 월 점프 금지 — 사용자가 보던 월 컨텍스트 유지(goToToday 호출 안 함).
    setRangeKey((prev) => (prev === key ? prev : key));
  }, []);

  const handleDateSelect = useCallback((dateKey: string) => {
    setSelectedDateKey((prev) => (prev === dateKey ? null : dateKey));
  }, []);

  const renderRow = useCallback(
    (cls: CalendarClass) => {
      const color = getTrainingColor(cls.type);
      // 종류 칩 배경 = color/18% tint (캘린더 dot 색상과 일치).
      const tintBg =
        color.bg === 'bg-blue-500'
          ? 'bg-blue-500/[0.18] dark:bg-blue-500/20'
          : color.bg === 'bg-emerald-500'
            ? 'bg-emerald-500/[0.18] dark:bg-emerald-500/20'
            : color.bg === 'bg-red-500'
              ? 'bg-red-500/[0.18] dark:bg-red-500/20'
              : color.bg === 'bg-amber-500'
                ? 'bg-amber-500/[0.18] dark:bg-amber-500/20'
                : color.bg === 'bg-orange-500'
                  ? 'bg-orange-500/[0.18] dark:bg-orange-500/20'
                  : 'bg-violet-500/[0.18] dark:bg-violet-500/20';

      // 대회/매치 일정 클릭 → 대회 및 경기 목록. 일반 수업은 classId 있으면 상세.
      const normalizedType = String(cls.type ?? '').toLowerCase();
      const isTournamentLike =
        normalizedType === 'tournament' ||
        normalizedType === 'game' ||
        normalizedType === 'event';
      const detailHref = isTournamentLike
        ? PATHS.director.tournament
        : cls.classId
          ? `/classes/${cls.classId}`
          : null;

      return (
        <ScheduleRow
          colorBar={{ bg: color.bg, darkBg: color.darkBg }}
          chip={{ label: color.label, className: cn(color.text, tintBg) }}
          time={cls.time}
          title={cls.title}
          location={cls.location}
          detail={
            detailHref
              ? {
                  label: isTournamentLike ? '대회 및 경기 목록' : '상세보기',
                  onClick: () => navigate(detailHref),
                  ariaLabel: `${cls.title} ${isTournamentLike ? '대회 및 경기 목록 보기' : '상세보기'}`,
                }
              : null
          }
        />
      );
    },
    [navigate],
  );

  // 카테고리 필터 칩 — 정규/대회. 학원 감독은 단일 '전체' 라 숨김.
  const categorySlot =
    categoryTabs.length > 1 ? (
      <section className="px-5 pt-3" aria-label="카테고리 필터">
        <div
          role="tablist"
          aria-label="카테고리 선택"
          className="flex gap-1.5 overflow-x-auto hide-scrollbar"
        >
          {categoryTabs.map((tab) => {
            const isActive = categoryKey === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setCategoryKey(tab.key)}
                className={cn(
                  'inline-flex h-[30px] shrink-0 items-center rounded-w-pill border px-3.5 text-card-meta font-extrabold tracking-[-0.01em] transition-colors motion-reduce:transition-none',
                  isActive
                    ? 'border-ice-500 bg-ice-500 text-white'
                    : 'border-wline bg-white text-wtext-2 hover:border-wline-2 dark:border-rink-700 dark:bg-rink-800 dark:text-rink-100',
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </section>
    ) : null;

  // 깜빡임 방지 — 첫 fetch 완료 후에는 페이지 mount 유지.
  if (!hasLoadedCalendarOnceRef.current && isCalendarLoading) {
    return null;
  }
  if (!isCalendarLoading) {
    hasLoadedCalendarOnceRef.current = true;
  }

  return (
    <MobileContainer hasBottomNav>
      <SubmainAppBar title="수업 일정" />

      <main
        className="hide-scrollbar flex-1 overflow-y-auto bg-wbg dark:bg-rink-900"
        role="main"
        aria-label="전체 일정"
      >
        {/* 월별 캘린더 — 외곽 카드 (radius 18 + border + shadow) */}
        <section className="px-5 pt-3" aria-label="월간 캘린더">
          <div className="rounded-[18px] border border-wline bg-white px-3 pb-3 pt-3.5 shadow-[0_4px_14px_rgba(20,24,38,0.04)] dark:border-rink-700 dark:bg-rink-800">
            {/* 월 네비게이션 */}
            <div className="flex items-center justify-center gap-6 pb-3.5 pt-1">
              <button
                type="button"
                onClick={goToPrevMonth}
                className="flex h-7 w-7 items-center justify-center bg-transparent transition-colors motion-reduce:transition-none active:brightness-95"
                aria-label="이전 달"
              >
                <Icon
                  name="chevron_left"
                  className="text-card-body text-wtext-2 dark:text-rink-100"
                  aria-hidden="true"
                />
              </button>
              <h2 className="text-card-title font-extrabold tracking-[-0.02em] text-wtext-1 dark:text-white">
                {monthLabel}
              </h2>
              <button
                type="button"
                onClick={goToNextMonth}
                className="flex h-7 w-7 items-center justify-center bg-transparent transition-colors motion-reduce:transition-none active:brightness-95"
                aria-label="다음 달"
              >
                <Icon
                  name="chevron_right"
                  className="text-card-body text-wtext-2 dark:text-rink-100"
                  aria-hidden="true"
                />
              </button>
            </div>

            {errorMessage && (
              <div className="mb-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-card-body text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
                {errorMessage}
              </div>
            )}

            {/* 요일 헤더 — 일=flame-500 / 토=ice-500 / 평일=wtext-3 */}
            <div className="mb-1 grid grid-cols-7 px-1" role="row">
              {DAY_LABELS.map((day, index) => (
                <div
                  key={day}
                  className={cn(
                    'py-1 text-center text-card-meta font-semibold',
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

            {/* 날짜 셀 그리드 — 38px 셀 + 셀 단위 선택/오늘 강조 */}
            <div
              className={cn(
                'grid grid-cols-7 gap-y-0.5 px-1 transition-opacity duration-200 motion-reduce:transition-none transform-gpu',
                isCalendarLoading && 'opacity-60',
              )}
              style={{ willChange: 'opacity', contain: 'layout style' }}
              role="grid"
              aria-label={monthLabel}
              aria-busy={isCalendarLoading}
            >
              {calendarGrid.map((day, index) => {
                const hasClasses = day.trainingTypes.length > 0;
                const dayOfWeek = index % 7;
                const isSelected = selectedDateKey === day.dateKey;

                return (
                  <button
                    key={`cell-${index}`}
                    type="button"
                    onClick={() => day.isCurrentMonth && handleDateSelect(day.dateKey)}
                    disabled={!day.isCurrentMonth}
                    className={cn(
                      'relative flex h-[38px] flex-col items-center justify-center gap-[2px] rounded-w-md transition-colors duration-150 motion-reduce:transition-none',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-1 focus-visible:ring-offset-wsurface dark:focus-visible:ring-offset-rink-800',
                      day.isCurrentMonth
                        ? 'hover:bg-wline-2 dark:hover:bg-rink-700'
                        : 'cursor-default opacity-30',
                      isSelected && 'bg-ice-500 hover:bg-ice-600',
                      day.isToday && !isSelected && 'ring-2 ring-inset ring-ice-500',
                    )}
                    role="gridcell"
                    aria-current={day.isToday ? 'date' : undefined}
                    aria-selected={isSelected}
                    aria-label={`${currentMonth + 1}월 ${day.date}일${
                      day.isToday ? ' 오늘' : ''
                    }${hasClasses ? ` 수업 ${day.classes.length}개` : ''}`}
                  >
                    <span
                      className={cn(
                        'text-card-meta font-semibold leading-none tabular-nums',
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
                    <div className="flex h-1 items-center justify-center gap-[2px]">
                      {hasClasses && day.isCurrentMonth && (
                        <CalendarDot
                          types={day.trainingTypes}
                          size="sm"
                          tone={isSelected ? 'selected' : 'default'}
                        />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* 범례 */}
            <CalendarLegend
              className="mt-2.5 justify-center gap-3.5 border-t border-wline pt-2.5 text-card-meta dark:border-rink-700"
              variant={isAcademyMode ? 'academy' : 'team-only'}
            />
          </div>
        </section>

        {/* 기간 탭 + 카테고리 + B-1 통합 리스트 — 공통 컴포넌트 */}
        <ScheduleRangeList<CalendarClass>
          rangeKey={rangeKey}
          onRangeChange={handleRangeChange}
          groups={groups}
          todayKey={todayKey}
          headerTitle={{ week: '이번 주 수업', month: '이번 달 수업' }}
          weekRangeLabel={weekRangeLabel}
          categorySlot={categorySlot}
          renderRow={renderRow}
          getRowKey={(cls) => cls.id}
          emptyState={<EmptyScheduleCard />}
          emptyDayMessage={MESSAGES.dashboard.noSchedule}
        />

        {/* BottomNav 여백 */}
        <div className="h-4" aria-hidden="true" />
      </main>
    </MobileContainer>
  );
}
