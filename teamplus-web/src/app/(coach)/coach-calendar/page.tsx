'use client';

import { useState, useCallback, useMemo, useEffect, useRef, useId } from 'react';
import nextDynamic from 'next/dynamic';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { SubmainAppBar } from '@/components/layout/SubmainAppBar';
import { Icon } from '@/components/ui/Icon';

const GlobalMenu = nextDynamic(
  () => import('@/components/layout/GlobalMenu').then((m) => ({ default: m.GlobalMenu })),
  { ssr: false },
);
import { CalendarDot, CalendarLegend } from '@/components/calendar/CalendarDot';
import { MESSAGES } from '@/lib/messages';
import { api } from '@/services/api-client';
import { cn } from '@/lib/utils';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { CLASS_CATEGORIES, classifyClass } from '@/lib/class-categories';
import { WEEKDAY_HEADERS, weekColumnOf, colIsSaturday, colIsSunday } from '@/lib/calendar-week';

interface CalendarClass {
  id: string;
  title: string;
  time: string;
  coach: string;
  location: string;
  type: string;
}

interface CalendarDay {
  date: number;
  dateKey: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  classes: CalendarClass[];
  trainingTypes: string[];
}

interface ApiDataWrapper<T> {
  success?: boolean;
  data?: T;
}

interface UserClub {
  id: string;
  clubName: string;
}

interface ClubClass {
  id: string;
  className: string;
  trainingType?: string | null;
  /** 분류 SoT — 외래키 기반 (regular/open 식별) */
  academyId?: string | null;
  teamId?: string | null;
  instructorName: string;
  startTime: string;
  endTime: string;
}

interface ClassSchedule {
  id: string;
  scheduledDate: string;
  isCancelled?: boolean;
}

const DAY_LABELS = WEEKDAY_HEADERS;
const DAY_FULL_LABELS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'] as const;

function unwrapData<T>(payload: unknown): T | null {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as ApiDataWrapper<T>).data ?? null;
  }
  return (payload as T) ?? null;
}

function getDateKey(value: Date | string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTimeRange(startTime: string, endTime: string) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

/**
 * [2026-05-08] className 휴리스틱 제거. 외래키(`academyId`) 기반 명확한 분류.
 * 분류 SoT: lib/class-categories.ts. (Phase 4-B 에서 Tournament 머지 예정)
 */
function inferTrainingType(item: { academyId?: string | null }): 'REGULAR' | 'OPEN' {
  return classifyClass(item) === 'open' ? 'OPEN' : 'REGULAR';
}

function buildCalendarGrid(year: number, month: number, today: Date): CalendarDay[] {
  const firstDay = new Date(year, month, 1);
  const firstDayOfWeek = weekColumnOf(firstDay);
  const gridStart = new Date(year, month, 1 - firstDayOfWeek);
  const days: CalendarDay[] = [];

  for (let index = 0; index < 42; index += 1) {
    const current = new Date(gridStart);
    current.setDate(gridStart.getDate() + index);
    days.push({
      date: current.getDate(),
      dateKey: getDateKey(current),
      isCurrentMonth: current.getMonth() === month,
      isToday: getDateKey(current) === getDateKey(today),
      classes: [],
      trainingTypes: [],
    });
  }
  return days;
}

function ClassDetail({ cls }: { cls: CalendarClass }) {
  // 색상·라벨 SoT — lib/class-categories.ts 참조.
  const typeColors: Record<string, string> = {
    REGULAR: CLASS_CATEGORIES.regular.color.solidBg,
    OPEN: CLASS_CATEGORIES.open.color.solidBg,
    TOURNAMENT: CLASS_CATEGORIES.tournament.color.solidBg,
  };
  const typeLabels: Record<string, string> = {
    REGULAR: CLASS_CATEGORIES.regular.shortLabel,
    OPEN: CLASS_CATEGORIES.open.shortLabel,
    TOURNAMENT: CLASS_CATEGORIES.tournament.shortLabel,
  };

  return (
    <div className="flex items-start gap-3 py-3">
      <div className={cn('h-full min-h-[48px] w-1 shrink-0 rounded-w-pill', typeColors[cls.type] ?? 'bg-it-ink-300')} />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="rounded-w-pill bg-it-fill px-2 py-0.5 text-card-meta font-semibold text-it-ink-600 dark:bg-rink-700 dark:text-rink-100">
            {typeLabels[cls.type] ?? cls.type}
          </span>
          <span className="text-card-meta text-it-ink-500 dark:text-rink-300">{cls.time}</span>
        </div>
        <p className="truncate text-card-body font-bold text-it-ink-800 dark:text-white">{cls.title}</p>
        <div className="mt-1 flex items-center gap-3 text-card-meta text-it-ink-500 dark:text-rink-300">
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

export default function CoachCalendarPage() {
  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => getDateKey(today), [today]);
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(todayKey);
  const liveRegionId = useId();
  const [classesMap, setClassesMap] = useState<Record<string, CalendarClass[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  // 첫 캘린더 fetch 완료 추적 — 월 변경 시 그리드 unmount 방지(깜빡임 방지).
  const hasLoadedCalendarOnceRef = useRef(false);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  // 첫 fetch 완료 후 ref 갱신 (이후 월 변경 시 그리드 mount 유지)
  if (!isLoading) hasLoadedCalendarOnceRef.current = true;
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });

  const fetchCalendarData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    const monthStart = new Date(currentYear, currentMonth, 1);
    const monthEnd = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);

    // 코치는 managed/list 사용, 실패 시 my/list 폴백
    let clubs: UserClub[] | null = null;
    const managedRes = await api.get<UserClub[] | ApiDataWrapper<UserClub[]>>('/teams/managed/list', { retry: false });
    if (managedRes.success) {
      clubs = unwrapData<UserClub[]>(managedRes.data);
    }
    if (!clubs || clubs.length === 0) {
      const myRes = await api.get<UserClub[] | ApiDataWrapper<UserClub[]>>('/teams/my/list', { retry: false });
      if (myRes.success) {
        clubs = unwrapData<UserClub[]>(myRes.data);
      }
    }

    if (!Array.isArray(clubs) || clubs.length === 0) {
      setClassesMap({});
      if (!managedRes.success) {
        setErrorMessage(managedRes.error?.message || MESSAGES.error.general);
      }
      setIsLoading(false);
      return;
    }

    const classResults = await Promise.all(
      clubs.map(async (club) => {
        const response = await api.get<ClubClass[] | ApiDataWrapper<ClubClass[]>>(`/teams/${club.id}/classes`, { retry: false });
        const classes = response.success ? unwrapData<ClubClass[]>(response.data) : [];
        return Array.isArray(classes)
          ? classes.map((cls) => ({ ...cls, clubId: club.id, clubName: club.clubName }))
          : [];
      })
    );

    const allClasses = classResults.flat();
    if (allClasses.length === 0) {
      setClassesMap({});
      setIsLoading(false);
      return;
    }

    const scheduleResults = await Promise.all(
      allClasses.map(async (cls) => {
        const response = await api.get<ClassSchedule[] | ApiDataWrapper<ClassSchedule[]>>(
          `/teams/${cls.clubId}/classes/${cls.id}/schedules`,
          { params: { startDate: monthStart.toISOString(), endDate: monthEnd.toISOString() }, retry: false }
        );
        return { cls, schedules: response.success ? unwrapData<ClassSchedule[]>(response.data) ?? [] : [] };
      })
    );

    const nextMap: Record<string, CalendarClass[]> = {};
    scheduleResults.forEach(({ cls, schedules }) => {
      if (!Array.isArray(schedules)) return;
      schedules.forEach((schedule) => {
        if (schedule.isCancelled) return;
        const dateKey = getDateKey(schedule.scheduledDate);
        const mappedClass: CalendarClass = {
          id: schedule.id,
          title: cls.className,
          time: formatTimeRange(cls.startTime, cls.endTime),
          coach: cls.instructorName,
          location: cls.clubName,
          type: inferTrainingType(cls),
        };
        if (!nextMap[dateKey]) nextMap[dateKey] = [];
        nextMap[dateKey].push(mappedClass);
      });
    });

    // RULE-C03: in-place sort 회피 — 스프레드 복사 후 재할당
    Object.keys(nextMap).forEach((key) => {
      nextMap[key] = [...nextMap[key]].sort((left, right) =>
        left.time.localeCompare(right.time),
      );
    });

    setClassesMap(nextMap);
    setIsLoading(false);
  }, [currentMonth, currentYear]);

  useEffect(() => {
    fetchCalendarData();
  }, [fetchCalendarData]);

  const calendarGrid = useMemo(() => {
    const grid = buildCalendarGrid(currentYear, currentMonth, today);
    return grid.map((day) => {
      const classes = classesMap[day.dateKey] ?? [];
      return { ...day, classes, trainingTypes: classes.map((item) => item.type) };
    });
  }, [classesMap, currentMonth, currentYear, today]);

  const selectedClasses = useMemo(() => {
    if (!selectedDateKey) return [];
    return classesMap[selectedDateKey] ?? [];
  }, [classesMap, selectedDateKey]);

  const selectedDateLabel = useMemo(() => {
    if (!selectedDateKey) return null;
    const date = new Date(selectedDateKey);
    return { month: date.getMonth() + 1, day: date.getDate() };
  }, [selectedDateKey]);

  const goToPrevMonth = useCallback(() => {
    setCurrentMonth((prev) => {
      if (prev === 0) { setCurrentYear((year) => year - 1); return 11; }
      return prev - 1;
    });
    setSelectedDateKey(null);
  }, []);

  const goToNextMonth = useCallback(() => {
    setCurrentMonth((prev) => {
      if (prev === 11) { setCurrentYear((year) => year + 1); return 0; }
      return prev + 1;
    });
    setSelectedDateKey(null);
  }, []);

  const goToToday = useCallback(() => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
    setSelectedDateKey(todayKey);
  }, [today, todayKey]);

  const monthLabel = `${currentYear}년 ${currentMonth + 1}월`;

  return (
    <MobileContainer hasBottomNav>
      <SubmainAppBar title="일정 관리" />

      <main className="hide-scrollbar flex-1 overflow-y-auto bg-it-canvas dark:bg-rink-900" role="main" aria-label="일정 관리">
        {/* 월별 캘린더 — flat 흰 섹션 (카드 박스·그림자 제거). director-schedules 패턴과 동일. */}
        <section className="bg-it-surface px-5 pb-3 pt-3.5 dark:bg-rink-800" aria-label="월간 캘린더">
        <div className="flex items-center justify-center gap-6 pb-3.5 pt-1">
          <button type="button" onClick={goToPrevMonth} className="flex h-7 w-7 items-center justify-center bg-transparent transition-colors motion-reduce:transition-none active:brightness-95" aria-label="이전 달">
            <Icon name="chevron_left" className="text-card-body text-it-ink-500 dark:text-rink-100" aria-hidden="true" />
          </button>
          <h2 className="text-card-title font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white">{monthLabel}</h2>
          <button type="button" onClick={goToNextMonth} className="flex h-7 w-7 items-center justify-center bg-transparent transition-colors motion-reduce:transition-none active:brightness-95" aria-label="다음 달">
            <Icon name="chevron_right" className="text-card-body text-it-ink-500 dark:text-rink-100" aria-hidden="true" />
          </button>
        </div>

        <div>
          {errorMessage && (
            <div className="mb-4 rounded-w-md border border-it-red-100 bg-it-red-50 px-4 py-3 text-card-body text-it-red-700 dark:border-it-red-500/40 dark:bg-it-red-500/15 dark:text-it-red-300">
              {errorMessage}
            </div>
          )}

          <div className="mb-1 grid grid-cols-7 px-1" role="row">
            {DAY_LABELS.map((day, index) => (
              <div
                key={day}
                className={cn(
                  'py-1 text-center text-card-meta font-semibold',
                  colIsSunday(index) ? 'text-it-red-500' : colIsSaturday(index) ? 'text-it-blue-500' : 'text-it-ink-400 dark:text-rink-300'
                )}
                role="columnheader"
                aria-label={DAY_FULL_LABELS[index]}
              >
                <span aria-hidden="true">{day}</span>
              </div>
            ))}
          </div>

          {/* 날짜 셀 — (2026-05-11) stale-while-revalidate 패턴
              첫 fetch 전에만 null, 이후 월 변경 시 그리드 mount 유지 + transition-opacity 로 부드러운 갱신 */}
          {!hasLoadedCalendarOnceRef.current && isLoading ? null : (
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

                const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
                  if (!day.isCurrentMonth) return;
                  let nextIndex: number | null = null;
                  if (e.key === 'ArrowLeft') nextIndex = index - 1;
                  else if (e.key === 'ArrowRight') nextIndex = index + 1;
                  else if (e.key === 'ArrowUp') nextIndex = index - 7;
                  else if (e.key === 'ArrowDown') nextIndex = index + 7;
                  else if (e.key === 'Home') nextIndex = index - dayOfWeek;
                  else if (e.key === 'End') nextIndex = index + (6 - dayOfWeek);
                  if (nextIndex === null) return;
                  e.preventDefault();
                  if (nextIndex < 0 || nextIndex >= calendarGrid.length) return;
                  const targetCell = calendarGrid[nextIndex];
                  if (!targetCell?.isCurrentMonth) return;
                  setSelectedDateKey(targetCell.dateKey);
                  // 다음 셀로 포커스 이동
                  const grid = (e.currentTarget.parentElement as HTMLElement | null);
                  const buttons = grid?.querySelectorAll<HTMLButtonElement>('button[role="gridcell"]');
                  buttons?.[nextIndex]?.focus();
                };

                return (
                  <button type="button"
                    key={`cell-${index}`}
                    onClick={() => day.isCurrentMonth && setSelectedDateKey(day.dateKey)}
                    onKeyDown={handleKeyDown}
                    disabled={!day.isCurrentMonth}
                    tabIndex={isSelected ? 0 : (day.isCurrentMonth && !selectedDateKey && day.isToday ? 0 : -1)}
                    className={cn(
                      // director-schedules 패턴: 40px 셀 안에 28×28 날짜 칩. 선택/오늘 강조는 칩에만.
                      'relative flex h-10 flex-col items-center justify-center gap-[2px] rounded-w-md transition-colors duration-150 motion-reduce:transition-none',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-it-surface dark:focus-visible:ring-offset-rink-800',
                      day.isCurrentMonth ? '' : 'cursor-default opacity-30'
                    )}
                    aria-label={`${currentYear}년 ${currentMonth + 1}월 ${day.date}일 ${DAY_FULL_LABELS[dayOfWeek]}${day.isToday ? ', 오늘' : ''}${hasClasses ? `, 수업 ${day.classes.length}건` : ', 수업 없음'}`}
                    aria-selected={isSelected}
                    aria-current={day.isToday ? 'date' : undefined}
                    aria-disabled={!day.isCurrentMonth}
                    role="gridcell"
                  >
                    {/* 28×28 rounded-[8px] 날짜 칩 — 선택=it-blue 흰글자 · 오늘=inset ring 2px it-blue-400 */}
                    <span
                      className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-[8px] text-[13.5px] font-bold leading-none tabular-nums transition-colors motion-reduce:transition-none',
                        isSelected
                          ? 'bg-it-blue-500 text-white'
                          : day.isCurrentMonth
                            ? colIsSunday(dayOfWeek) ? 'text-it-red-500' : colIsSaturday(dayOfWeek) ? 'text-it-blue-500' : 'text-it-ink-800 dark:text-white'
                            : 'text-it-ink-300 dark:text-rink-500',
                        day.isToday && !isSelected && 'ring-2 ring-inset ring-it-blue-400'
                      )}
                    >
                      {day.date}
                    </span>
                    {/* 2026-05-16: CalendarDot 항상 렌더 — 빈 일정도 reserve (날짜 정렬 일관성). */}
                    <div className="flex h-1 items-center justify-center gap-[2px]">
                      {day.isCurrentMonth && hasClasses && (
                        <CalendarDot iceTheme types={day.trainingTypes} size="sm" tone={isSelected ? 'selected' : 'default'} />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <CalendarLegend
            className="mt-2.5 justify-center gap-3.5 border-t border-it-line pt-2.5 text-card-meta dark:border-rink-700"
            variant="team-only"
            iceTheme
          />
        </div>
        </section>

        {/* 선택일 수업 — full-bleed flat 섹션 (카드 박스 제거 → hairline 행). */}
        <section
          className="mt-2 bg-it-surface px-5 py-4 dark:bg-rink-800"
          aria-labelledby={`${liveRegionId}-heading`}
        >
          {selectedDateLabel && (
            <>
              <h3
                id={`${liveRegionId}-heading`}
                className="mb-1 flex items-center gap-2 text-card-emphasis font-bold text-it-ink-800 dark:text-white"
              >
                <Icon name="event" className="text-card-title text-it-blue-500" aria-hidden="true" />
                {selectedDateLabel.month}월 {selectedDateLabel.day}일 수업
              </h3>
              {/* 스크린리더 공지 — 날짜 선택 시 수업 개수 자동 안내 */}
              <p className="sr-only" aria-live="polite" aria-atomic="true">
                {selectedDateLabel.month}월 {selectedDateLabel.day}일 수업{' '}
                {selectedClasses.length > 0 ? `${selectedClasses.length}건` : '없음'}
              </p>
              {selectedClasses.length > 0 ? (
                <ul
                  className="list-none divide-y divide-it-line dark:divide-rink-700"
                  role="list"
                  aria-label={`${selectedDateLabel.month}월 ${selectedDateLabel.day}일 수업 목록`}
                >
                  {selectedClasses.map((cls) => (
                    <li key={cls.id} role="listitem">
                      <ClassDetail cls={cls} />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex flex-col items-center gap-2 py-8" role="status">
                  <div className="flex h-12 w-12 items-center justify-center rounded-w-pill bg-it-fill dark:bg-rink-700">
                    <Icon name="event_busy" className="text-2xl text-it-ink-400 dark:text-rink-300" aria-hidden="true" />
                  </div>
                  <p className="text-card-body text-it-ink-500 dark:text-rink-300">{MESSAGES.dashboard.noSchedule}</p>
                </div>
              )}
            </>
          )}
        </section>

        <div className="h-4" aria-hidden="true" />
      </main>
    </MobileContainer>
  );
}
