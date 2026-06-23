'use client';

import { useState, useCallback, useEffect } from 'react';
import { NavLink, useNavigation } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { BottomNav, parentNavItems } from '@/components/layout/BottomNav';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { usePageReady } from '@/hooks/usePageReady';
import { useDefaultUI } from '@/hooks/useNativeUI';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';
import { getTrainingColor } from '@/lib/calendar-colors';
import { WEEKDAY_HEADERS, weekColumnOf } from '@/lib/calendar-week';

// ── 타입 정의 ──

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
  time?: string;
  location?: string;
  startTime?: string;
  endTime?: string;
}

interface ClassScheduleItem {
  id: string;
  scheduledDate: string;
  isCancelled?: boolean;
}

interface ClassEvent {
  id: string;
  title: string;
  location: string;
  time: string;
  status: 'confirmed' | 'cancelled';
  trainingType: string;
  classId: string;
}

interface DayData {
  day: number;
  hasEvent: boolean;
  isToday?: boolean;
  isSelected?: boolean;
  isPast?: boolean;
}

// ── 유틸리티 ──

function unwrapData<T>(payload: unknown): T | null {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as ApiDataWrapper<T>).data ?? null;
  }
  return (payload as T) ?? null;
}

function formatTimeRange(startTime?: string, endTime?: string): string {
  if (!startTime || !endTime) return '';
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
  };
  return `${fmt(startTime)} - ${fmt(endTime)}`;
}

// 색상은 calendar-colors.ts의 getTrainingColor() 사용

const DAYS_OF_WEEK = WEEKDAY_HEADERS;

// ── 컴포넌트 ──

function EventCard({ event }: { event: ClassEvent }) {
  const statusConfig = {
    confirmed: { label: '예정', bgColor: 'bg-ice-500/10', textColor: 'text-ice-500' },
    cancelled: { label: '취소됨', bgColor: 'bg-red-500/10', textColor: 'text-red-600' },
  };
  const STATUS_FALLBACK = { label: '미정', bgColor: 'bg-wline-2 dark:bg-rink-700', textColor: 'text-wtext-2 dark:text-rink-100' };

  const config = statusConfig[event.status] ?? STATUS_FALLBACK;
  const trainingColor = getTrainingColor(event.trainingType);
  const dotColor = trainingColor.bg;

  return (
    <div className="bg-white dark:bg-rink-800 rounded-2xl border border-wline-2 dark:border-rink-700 p-4 shadow-sm hover:shadow-md transition-shadow motion-reduce:transition-none">
      <div className="flex justify-between items-start gap-3">
        <div className="flex-1">
          <div className="mb-2 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-w-pill ${dotColor}`} />
            <span
              className={`inline-flex px-2 py-0.5 rounded text-card-meta font-bold tracking-wider ${config.bgColor} ${config.textColor}`}
            >
              {config.label}
            </span>
          </div>
          <h4 className="text-card-emphasis font-bold mb-3 text-wtext-1 dark:text-white">
            {event.title}
          </h4>
          <div className="space-y-1.5">
            {event.location && (
              <div className="flex items-center text-wtext-3 dark:text-rink-300 text-card-body">
                <Icon name="location_on" className="text-[18px] mr-1.5" />
                <span>{event.location}</span>
              </div>
            )}
            {event.time && (
              <div className="flex items-center text-wtext-1 dark:text-rink-100 text-card-body font-semibold">
                <Icon name="schedule" className="text-ice-500 text-[18px] mr-1.5" />
                <span>{event.time}</span>
              </div>
            )}
          </div>
        </div>
        <div className="w-16 h-16 rounded-xl overflow-hidden bg-wline-2 dark:bg-rink-700 flex-shrink-0 flex items-center justify-center">
          <Icon name="sports_hockey" className="text-3xl text-wtext-3" />
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-wline-2 dark:border-rink-700 flex justify-end">
        <NavLink
          href={`/classes/${event.classId}`}
          className="text-card-body font-medium text-wtext-3 flex items-center gap-1 hover:text-ice-500 transition-colors motion-reduce:transition-none"
        >
          {'상세보기'}
          <Icon name="arrow_forward" className="text-[16px]" />
        </NavLink>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-wbg dark:bg-rink-800/50 rounded-2xl border-2 border-dashed border-wline dark:border-rink-700 py-10 flex flex-col items-center justify-center text-center px-6">
      <div className="w-14 h-14 bg-white dark:bg-rink-800 rounded-w-pill flex items-center justify-center shadow-sm mb-4">
        <Icon name="calendar_today" className="text-wtext-4 text-[32px]" />
      </div>
      <p className="text-wtext-3 dark:text-rink-300 font-medium text-card-body leading-relaxed">
        {MESSAGES.empty('수업 일정')}
      </p>
    </div>
  );
}

// ── 메인 페이지 ──

export default function ClassCalendarPage() {
  const { back } = useNavigation();
  const now = new Date();
  const [selectedDate, setSelectedDate] = useState(now.getDate());
  const [currentMonth, setCurrentMonth] = useState({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });
  const [viewType, setViewType] = useState<'week' | 'month' | 'all'>('month');

  // 데이터 상태
  const [clubId, setClubId] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClubClass[]>([]);
  const [eventsByDay, setEventsByDay] = useState<Record<number, ClassEvent[]>>({});
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  useDefaultUI();

  // 1. 팀 조회
  useEffect(() => {
    const fetchClub = async () => {
      try {
        const res = await api.get<UserClub[] | ApiDataWrapper<UserClub[]>>('/teams/my/list', { retry: false });
        if (res.success) {
          const clubs = unwrapData<UserClub[]>(res.data);
          if (Array.isArray(clubs) && clubs.length > 0) {
            setClubId(clubs[0].id);
          }
        }
      } catch {
        // 팀 없는 사용자
      }
    };
    fetchClub();
  }, []);

  // 2. 팀 수업 목록 조회
  useEffect(() => {
    if (!clubId) return;
    const fetchClasses = async () => {
      try {
        const res = await api.get<ClubClass[] | ApiDataWrapper<ClubClass[]>>(`/teams/${clubId}/classes`, { retry: false });
        if (res.success) {
          const data = unwrapData<ClubClass[]>(res.data);
          setClasses(Array.isArray(data) ? data : []);
        }
      } catch {
        setClasses([]);
      }
    };
    fetchClasses();
  }, [clubId]);

  // 3. 월별 수업 일정 조회
  useEffect(() => {
    if (!clubId || classes.length === 0) {
      setIsLoading(false);
      return;
    }

    const fetchSchedules = async () => {
      setIsLoading(true);
      try {
        const monthStart = new Date(currentMonth.year, currentMonth.month - 1, 1);
        const monthEnd = new Date(currentMonth.year, currentMonth.month, 0, 23, 59, 59, 999);

        const results = await Promise.all(
          classes.map(async (cls) => {
            try {
              const res = await api.get<ClassScheduleItem[] | ApiDataWrapper<ClassScheduleItem[]>>(
                `/teams/${clubId}/classes/${cls.id}/schedules`,
                {
                  params: {
                    startDate: monthStart.toISOString(),
                    endDate: monthEnd.toISOString(),
                  },
                  retry: false,
                },
              );
              const schedules = res.success ? unwrapData<ClassScheduleItem[]>(res.data) ?? [] : [];
              return { cls, schedules: Array.isArray(schedules) ? schedules : [] };
            } catch {
              return { cls, schedules: [] as ClassScheduleItem[] };
            }
          }),
        );

        const nextEvents: Record<number, ClassEvent[]> = {};

        for (const { cls, schedules } of results) {
          for (const schedule of schedules) {
            const date = new Date(schedule.scheduledDate);
            const day = date.getDate();

            if (!nextEvents[day]) nextEvents[day] = [];
            nextEvents[day].push({
              id: schedule.id,
              title: cls.className,
              location: cls.location ?? '',
              time: cls.time ?? formatTimeRange(cls.startTime, cls.endTime),
              status: schedule.isCancelled ? 'cancelled' : 'confirmed',
              trainingType: cls.trainingType || 'REGULAR_CLASS',
              classId: cls.id,
            });
          }
        }

        setEventsByDay(nextEvents);
      } catch {
        setEventsByDay({});
      } finally {
        setIsLoading(false);
      }
    };

    fetchSchedules();
  }, [clubId, classes, currentMonth]);

  // 캘린더 일자 생성
  const generateCalendarDays = (): (DayData | null)[] => {
    const firstDayOfMonth = weekColumnOf(new Date(currentMonth.year, currentMonth.month - 1, 1));
    const daysInMonth = new Date(currentMonth.year, currentMonth.month, 0).getDate();
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === currentMonth.year && today.getMonth() + 1 === currentMonth.month;

    const days: (DayData | null)[] = [];

    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(null);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(currentMonth.year, currentMonth.month - 1, day);
      days.push({
        day,
        hasEvent: !!eventsByDay[day],
        isToday: isCurrentMonth && day === today.getDate(),
        isSelected: day === selectedDate,
        isPast: dateObj < new Date(today.getFullYear(), today.getMonth(), today.getDate()),
      });
    }

    return days;
  };

  const calendarDays = generateCalendarDays();
  const selectedEvents = eventsByDay[selectedDate] || [];

  const prevMonth = () => {
    setCurrentMonth((prev) => {
      if (prev.month === 1) return { year: prev.year - 1, month: 12 };
      return { ...prev, month: prev.month - 1 };
    });
    setSelectedDate(1);
  };

  const nextMonth = () => {
    setCurrentMonth((prev) => {
      if (prev.month === 12) return { year: prev.year + 1, month: 1 };
      return { ...prev, month: prev.month + 1 };
    });
    setSelectedDate(1);
  };

  return (
    <MobileContainer hasBottomNav={false}>
      <PageAppBar title="수업 일정" />

      <main className="flex-1 overflow-y-auto pb-30">
        {/* Calendar Section */}
        <section className="bg-white dark:bg-rink-900 px-4 pt-6 pb-4">
          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-6 px-2">
            <button
              onClick={prevMonth}
              className="w-8 h-8 flex items-center justify-center rounded-w-pill hover:bg-wline-2 dark:hover:bg-rink-800"
            >
              <Icon name="chevron_left" className="text-wtext-3" />
            </button>
            <h2 className="text-card-title font-bold text-wtext-1 dark:text-white">
              {currentMonth.year}년 {currentMonth.month}월
            </h2>
            <button
              onClick={nextMonth}
              className="w-8 h-8 flex items-center justify-center rounded-w-pill hover:bg-wline-2 dark:hover:bg-rink-800"
            >
              <Icon name="chevron_right" className="text-wtext-3" />
            </button>
          </div>

          {/* Days of Week Header */}
          <div className="grid grid-cols-7 mb-2">
            {DAYS_OF_WEEK.map((day) => (
              <div
                key={day}
                className="text-center text-card-meta font-semibold text-wtext-3 uppercase py-2"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-y-1">
            {calendarDays.map((dayData, index) => (
              <div key={index} className="h-12">
                {dayData && (
                  <button
                    onClick={() => setSelectedDate(dayData.day)}
                    className="w-full h-full flex flex-col items-center justify-center relative"
                  >
                    {dayData.isSelected ? (
                      <div className="w-8 h-8 flex items-center justify-center rounded-w-pill bg-ice-500 text-white text-card-body font-bold shadow-sm">
                        {dayData.day}
                      </div>
                    ) : (
                      <span
                        className={`text-card-body font-medium ${
                          dayData.isToday
                            ? 'text-ice-500 font-bold'
                            : dayData.isPast
                              ? 'text-wtext-4 dark:text-rink-500'
                              : 'text-wtext-1 dark:text-white'
                        }`}
                      >
                        {dayData.day}
                      </span>
                    )}
                    {dayData.hasEvent && !dayData.isSelected && (
                      <span className="absolute bottom-1.5 w-1 h-1 bg-ice-500 rounded-w-pill" />
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Handle */}
          <div className="mt-4 flex justify-center">
            <div className="w-10 h-1 bg-wline dark:bg-rink-700 rounded-w-pill" />
          </div>
        </section>

        {/* Filter Tabs */}
        <div className="px-4 py-4 sticky top-14 z-40 bg-white dark:bg-rink-900">
          <div className="flex p-1 bg-wline-2 dark:bg-rink-800 rounded-xl">
            <button
              onClick={() => setViewType('week')}
              className={`flex-1 py-1.5 text-card-body rounded-lg transition-all motion-reduce:transition-none ${
                viewType === 'week'
                  ? 'font-bold text-ice-500 bg-white dark:bg-rink-700 shadow-sm'
                  : 'font-medium text-wtext-3'
              }`}
            >
              이번 주
            </button>
            <button
              onClick={() => setViewType('month')}
              className={`flex-1 py-1.5 text-card-body rounded-lg transition-all motion-reduce:transition-none ${
                viewType === 'month'
                  ? 'font-bold text-ice-500 bg-white dark:bg-rink-700 shadow-sm'
                  : 'font-medium text-wtext-3'
              }`}
            >
              이번 달
            </button>
            <button
              onClick={() => setViewType('all')}
              className={`flex-1 py-1.5 text-card-body rounded-lg transition-all motion-reduce:transition-none ${
                viewType === 'all'
                  ? 'font-bold text-ice-500 bg-white dark:bg-rink-700 shadow-sm'
                  : 'font-medium text-wtext-3'
              }`}
            >
              전체
            </button>
          </div>
        </div>

        {/* Events List */}
        <div className="px-4 space-y-4">
          {/* Selected Date Header */}
          <div className="flex items-center gap-2 pt-2">
            <h3 className="text-card-title font-bold text-wtext-1 dark:text-white">
              {currentMonth.month}월 {selectedDate}일
            </h3>
            {(() => {
              const today = new Date();
              const isToday =
                today.getFullYear() === currentMonth.year &&
                today.getMonth() + 1 === currentMonth.month &&
                today.getDate() === selectedDate;
              return isToday ? (
                <span className="px-2 py-0.5 rounded-w-pill bg-ice-500/10 text-ice-500 text-card-meta font-bold">
                  오늘
                </span>
              ) : null;
            })()}
          </div>

          {/* Events */}
          {isLoading ? null : selectedEvents.length > 0 ? (
            selectedEvents.map((event) => <EventCard key={event.id} event={event} />)
          ) : (
            <EmptyState />
          )}
        </div>
      </main>

      {/* Bottom Navigation */}
      <BottomNav items={parentNavItems} />
    </MobileContainer>
  );
}
