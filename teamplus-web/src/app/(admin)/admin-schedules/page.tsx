'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { usePageReady } from '@/hooks/usePageReady';
import { api } from '@/services/api-client';
import { WEEKDAY_HEADERS, weekColumnOf, colIsSaturday, colIsSunday } from '@/lib/calendar-week';

interface Schedule {
  id: string;
  className: string;
  time: string;
  period: string;
  location: string;
  duration: string;
  coach: string;
  coachImage: string;
  capacity: number;
  enrolled: number;
  status: 'scheduled' | 'full' | 'cancelled';
}

/** 백엔드 GET /classes 응답 항목 */
interface ClassResponse {
  id: string;
  className: string;
  instructorName?: string;
  capacity?: number;
  startTime?: string;
  endTime?: string;
  isActive?: boolean;
  _count?: { enrollments?: number };
  venue?: { name?: string } | null;
}

function mapClassToSchedule(c: ClassResponse): Schedule {
  const start = c.startTime ? new Date(c.startTime) : null;
  const end = c.endTime ? new Date(c.endTime) : null;
  const hour = start ? start.getHours() : 0;
  const mins = start ? String(start.getMinutes()).padStart(2, '0') : '00';
  const durationMin = start && end ? Math.round((end.getTime() - start.getTime()) / 60000) : 60;
  const enrolled = c._count?.enrollments ?? 0;
  const cap = c.capacity ?? 0;

  return {
    id: c.id,
    className: c.className ?? '수업',
    time: start ? `${hour}:${mins}` : '00:00',
    period: hour < 12 ? 'AM' : 'PM',
    location: '',
    duration: `${durationMin}분`,
    coach: c.instructorName ?? '',
    coachImage: '',
    capacity: cap,
    enrolled,
    status: c.isActive === false ? 'cancelled' : enrolled >= cap && cap > 0 ? 'full' : 'scheduled',
  };
}

type ViewMode = 'calendar' | 'list';

const VIEW_MODE_OPTIONS: ReadonlyArray<{ key: ViewMode; label: string; icon: string }> = [
  { key: 'calendar', label: '캘린더', icon: 'calendar_month' },
  { key: 'list', label: '리스트', icon: 'view_list' },
];

const DAY_LABELS = WEEKDAY_HEADERS;
const DAY_LABELS_FULL = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'] as const;

interface CalendarCell {
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSunday: boolean;
  isSaturday: boolean;
}

function buildCalendarCells(year: number, month: number): CalendarCell[] {
  const today = new Date();
  const todayY = today.getFullYear();
  const todayM = today.getMonth() + 1;
  const todayD = today.getDate();

  const firstDayOfWeek = weekColumnOf(new Date(year, month - 1, 1));
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysInPrevMonth = new Date(year, month - 1, 0).getDate();

  const cells: CalendarCell[] = [];

  // 이전 달 (빈 자리 채우기)
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    cells.push({ day: d, isCurrentMonth: false, isToday: false, isSunday: false, isSaturday: false });
  }

  // 현재 달
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    cells.push({
      day: d,
      isCurrentMonth: true,
      isToday: year === todayY && month === todayM && d === todayD,
      isSunday: dow === 0,
      isSaturday: dow === 6,
    });
  }

  // 다음 달 (6주 채우기)
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    cells.push({ day: d, isCurrentMonth: false, isToday: false, isSunday: false, isSaturday: false });
  }

  return cells;
}

export default function SchedulesPage() {
  const now = new Date();
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState(now.getDate());
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadSchedules = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get<{ data: ClassResponse[] } | ClassResponse[]>('/classes');
      const raw = res.data;
      const list = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
      setSchedules(list.map(mapClassToSchedule));
    } catch {
      setSchedules([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSchedules();
  }, [loadSchedules]);

  usePageReady(!isLoading);

  const calendarCells = useMemo(() => buildCalendarCells(year, month), [year, month]);

  const goToPrevMonth = useCallback(() => {
    setMonth((m) => {
      if (m === 1) { setYear((y) => y - 1); return 12; }
      return m - 1;
    });
  }, []);

  const goToNextMonth = useCallback(() => {
    setMonth((m) => {
      if (m === 12) { setYear((y) => y + 1); return 1; }
      return m + 1;
    });
  }, []);

  const goToToday = useCallback(() => {
    const t = new Date();
    setYear(t.getFullYear());
    setMonth(t.getMonth() + 1);
    setSelectedDate(t.getDate());
  }, []);

  const selectedDow = useMemo(() => {
    const d = new Date(year, month - 1, selectedDate);
    return DAY_LABELS_FULL[d.getDay()];
  }, [year, month, selectedDate]);

  const getStatusBadge = (status: Schedule['status']) => {
    switch (status) {
      case 'scheduled':
        return { text: '수업 예정', className: 'bg-blue-50 dark:bg-blue-900/30 text-ice-500 dark:text-blue-300' };
      case 'full':
        return { text: '정원 임박', className: 'bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' };
      case 'cancelled':
        return { text: '취소됨', className: 'bg-wline dark:bg-rink-700 text-wtext-2 dark:text-rink-300' };
    }
  };

  return (
    <MobileContainer hasBottomNav>
      <div className="relative min-h-screen-safe w-full max-w-md mx-auto bg-white dark:bg-rink-900 flex flex-col shadow-md">
        {/* AppBar */}
        <PageAppBar title="수업 일정" />

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto pb-32 relative bg-wbg dark:bg-rink-900">

          {/* ── View Mode Toggle ── */}
          <div className="bg-white dark:bg-rink-800 px-4 pt-4 pb-3 border-b border-wline-2 dark:border-rink-700">
            <div
              className="flex p-1 bg-wline-2 dark:bg-rink-700 rounded-xl"
              role="tablist"
              aria-label="일정 보기 방식"
            >
              {VIEW_MODE_OPTIONS.map((opt) => {
                const isActive = viewMode === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setViewMode(opt.key)}
                    className={`flex-1 min-h-[44px] flex items-center justify-center gap-1.5 rounded-lg text-card-body transition-colors motion-reduce:transition-none active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 ${
                      isActive
                        ? 'bg-white dark:bg-rink-800 text-ice-500 dark:text-blue-300 shadow-sm font-bold'
                        : 'text-wtext-3 dark:text-rink-300 font-semibold hover:text-wtext-2 dark:hover:text-rink-100'
                    }`}
                  >
                    <Icon name={opt.icon} className="text-[18px]" aria-hidden="true" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── 달력 영역 ── */}
          {viewMode === 'calendar' && (
          <div className="bg-white dark:bg-rink-800 px-4 pt-4 pb-5 border-b border-wline-2 dark:border-rink-700">

            {/* 월 네비게이션 */}
            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={goToPrevMonth}
                className="flex items-center justify-center size-11 rounded-w-pill hover:bg-wline-2 dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500"
                aria-label="이전 달"
              >
                <Icon name="chevron_left" className="text-[20px] text-wtext-2 dark:text-rink-100" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={goToToday}
                className="flex items-center gap-1.5 min-h-[44px] px-3 py-1.5 rounded-lg hover:bg-wbg dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500"
                aria-label="오늘로 이동"
              >
                <span className="text-card-title font-bold text-wtext-1 dark:text-white tracking-tight">
                  {year}년 {month}월
                </span>
              </button>
              <button
                type="button"
                onClick={goToNextMonth}
                className="flex items-center justify-center size-11 rounded-w-pill hover:bg-wline-2 dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500"
                aria-label="다음 달"
              >
                <Icon name="chevron_right" className="text-[20px] text-wtext-2 dark:text-rink-100" aria-hidden="true" />
              </button>
            </div>

            {/* 요일 헤더 */}
            <div className="grid grid-cols-7 mb-1">
              {DAY_LABELS.map((label, i) => (
                <div
                  key={label}
                  className={`text-center text-card-meta font-bold py-1.5 ${
                    colIsSunday(i) ? 'text-red-400' : colIsSaturday(i) ? 'text-blue-400' : 'text-wtext-3 dark:text-rink-300'
                  }`}
                >
                  {label}
                </div>
              ))}
            </div>

            {/* 날짜 그리드 */}
            <div className="grid grid-cols-7">
              {calendarCells.map((cell, idx) => {
                const isSelected = cell.isCurrentMonth && cell.day === selectedDate;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => cell.isCurrentMonth && setSelectedDate(cell.day)}
                    disabled={!cell.isCurrentMonth}
                    className={`relative flex flex-col items-center justify-center h-11 rounded-xl transition-all ${
                      !cell.isCurrentMonth
                        ? 'text-wtext-4 dark:text-rink-500 cursor-default'
                        : isSelected
                          ? 'bg-ice-500 text-white'
                          : cell.isToday
                            ? 'ring-2 ring-ice-500 ring-inset text-ice-500 dark:text-blue-400 font-bold'
                            : 'hover:bg-wline-2 dark:hover:bg-rink-700'
                    }`}
                  >
                    <span className={`text-card-body leading-none ${
                      isSelected
                        ? 'font-bold'
                        : cell.isToday
                          ? 'font-bold'
                          : cell.isSunday
                            ? 'text-red-400 font-medium'
                            : cell.isSaturday
                              ? 'text-blue-400 font-medium'
                              : 'font-medium text-wtext-1 dark:text-rink-100'
                    }`}>
                      {cell.day}
                    </span>
                    {cell.isToday && !isSelected && (
                      <span className="absolute bottom-1 w-1 h-1 rounded-w-pill bg-ice-500" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          )}

          {/* ── 선택된 날짜 일정 헤더 ── */}
          <div className="px-4 pt-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-card-title font-bold text-wtext-1 dark:text-white">
                {viewMode === 'list'
                  ? '전체 일정'
                  : `${month}월 ${selectedDate}일 (${selectedDow.charAt(0)})`}
              </h2>
              <span className="text-card-body font-semibold text-wtext-3 dark:text-rink-300 tabular-nums">
                {schedules.filter((s) => s.status !== 'cancelled').length}개 수업
              </span>
            </div>

            {/* Empty state */}
            {schedules.length === 0 && (
              <div className="rounded-2xl border border-dashed border-wline dark:border-rink-700 bg-white dark:bg-rink-800 p-10 text-center">
                <Icon
                  name="event_busy"
                  className="text-[40px] text-wtext-3 dark:text-rink-300"
                  aria-hidden="true"
                />
                <p className="mt-3 text-card-body font-bold text-wtext-2 dark:text-rink-100">
                  예정된 수업이 없습니다
                </p>
                <p className="mt-1 text-card-meta text-wtext-3 dark:text-rink-300">
                  우측 하단 버튼으로 새 수업을 추가하세요.
                </p>
              </div>
            )}

            {/* Timeline */}
            <div className="relative flex flex-col gap-4">
              {/* Vertical Line */}
              {schedules.length > 0 && (
                <div className="absolute left-[59px] top-2 bottom-0 w-px bg-wline dark:bg-rink-700 h-full" aria-hidden="true" />
              )}

              {schedules.map((schedule) => {
                const statusBadge = getStatusBadge(schedule.status);
                const isCancelled = schedule.status === 'cancelled';

                return (
                  <div key={schedule.id} className="flex group">
                    {/* Time */}
                    <div className="w-14 flex-none flex flex-col items-end pr-3 pt-1">
                      <span className={`text-card-body font-bold leading-none ${isCancelled ? 'text-wtext-3' : 'text-wtext-1 dark:text-white'}`}>
                        {schedule.time}
                      </span>
                      <span className={`text-card-meta font-medium ${isCancelled ? 'text-wtext-3' : 'text-wtext-3 dark:text-rink-300'}`}>
                        {schedule.period}
                      </span>
                    </div>

                    <div className="flex-1 relative pb-4">
                      {/* Dot on line */}
                      <div className={`absolute -left-[6px] top-1.5 w-3 h-3 rounded-w-pill border-2 bg-white dark:bg-rink-900 z-10 ${
                        isCancelled ? 'border-wline' : schedule.status === 'full' ? 'border-orange-400' : 'border-ice-500'
                      }`} />

                      {/* Card */}
                      <div className={`ml-4 rounded-xl p-4 transition-transform cursor-pointer ${
                        isCancelled
                          ? 'bg-wbg dark:bg-rink-800/50 border border-dashed border-wline dark:border-rink-700 opacity-70'
                          : 'bg-white dark:bg-rink-800 shadow-sm border border-wline-2 dark:border-rink-700 active:brightness-95'
                      }`}>
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-card-meta font-medium mb-1 ${statusBadge.className}`}>
                              {statusBadge.text}
                            </span>
                            <h3 className={`text-card-emphasis font-bold ${isCancelled ? 'text-wtext-3 line-through' : 'text-wtext-1 dark:text-white'}`}>
                              {schedule.className}
                            </h3>
                          </div>
                          {!isCancelled && (
                            <button
                              type="button"
                              aria-label={`${schedule.className} 관리 메뉴`}
                              className="size-11 -mt-1 -mr-1 rounded-w-pill flex items-center justify-center text-wtext-3 hover:text-ice-500 hover:bg-wline-2 dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500"
                            >
                              <Icon name="more_horiz" className="text-[20px]" aria-hidden="true" />
                            </button>
                          )}
                        </div>

                        {isCancelled ? (
                          <div className="flex items-center text-card-body text-wtext-3 dark:text-rink-300">
                            <Icon name="info" className="text-[16px] mr-1" aria-hidden="true" />
                            강사 사정으로 휴강
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center text-card-body text-wtext-3 dark:text-rink-300 mb-3 flex-wrap gap-y-1">
                              {schedule.location && (
                                <>
                                  <Icon name="location_on" className="text-[16px] mr-1" aria-hidden="true" />
                                  <span>{schedule.location}</span>
                                  <span className="mx-2 text-wtext-4 dark:text-rink-500" aria-hidden="true">|</span>
                                </>
                              )}
                              <Icon name="schedule" className="text-[16px] mr-1" aria-hidden="true" />
                              <span className="tabular-nums">{schedule.duration}</span>
                            </div>

                            <div className="flex items-center justify-between mt-3 pt-3 border-t border-wline-2 dark:border-rink-700 gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                {schedule.coachImage ? (
                                  <div
                                    className="size-6 rounded-w-pill bg-cover bg-center border border-wline dark:border-rink-700 shrink-0"
                                    style={{ backgroundImage: `url(${schedule.coachImage})` }}
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <div className="size-6 rounded-w-pill bg-wline-2 dark:bg-rink-700 border border-wline dark:border-rink-700 flex items-center justify-center shrink-0">
                                    <Icon name="person" className="text-[14px] text-wtext-3" aria-hidden="true" />
                                  </div>
                                )}
                                <span className="text-card-meta font-semibold text-wtext-1 dark:text-white truncate">
                                  {schedule.coach || '담당 코치 미지정'}
                                </span>
                              </div>
                              <div
                                className={`flex items-center gap-1 text-card-meta font-bold px-2 py-1 rounded-md tabular-nums shrink-0 ${
                                  schedule.status === 'full'
                                    ? 'text-orange-600 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-300'
                                    : 'text-ice-500 bg-ice-500/10 dark:bg-ice-500/20 dark:text-blue-300'
                                }`}
                              >
                                <Icon name="group" className="text-[14px]" aria-hidden="true" />
                                {schedule.enrolled}/{schedule.capacity}명
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="h-24" />
        </main>

        {/* Floating Action Button */}
        <button
          type="button"
          aria-label="수업 일정 추가"
          className="absolute right-4 w-14 h-14 bg-ice-500 hover:bg-ice-700 rounded-w-pill shadow-md flex items-center justify-center text-white z-30 active:brightness-95 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
          style={{
            bottom: 'calc(6rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))',
          }}
        >
          <Icon name="add" className="text-[28px]" aria-hidden="true" />
        </button>

      </div>
    </MobileContainer>
  );
}
