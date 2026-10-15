'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Info, CheckCircle2, AlertCircle } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { classService } from '@/services/class.service';
import type { Class, ClassSchedule } from '@/types';

type MessageState = { type: 'success' | 'error'; text: string } | null;
type ViewMode = 'month' | 'week' | 'day';
type ScheduleState = 'upcoming' | 'completed' | 'cancelled';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

const toDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatMonthLabel = (date: Date): string => `${date.getFullYear()}년 ${date.getMonth() + 1}월`;

const getScheduleState = (schedule: ClassSchedule): ScheduleState => {
  if (schedule.isCancelled) return 'cancelled';
  return new Date(schedule.scheduledDate).getTime() < Date.now() ? 'completed' : 'upcoming';
};

const buildMonthGrid = (month: Date): Date[] => {
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const monthStartDay = monthStart.getDay();
  const firstCellDate = new Date(month.getFullYear(), month.getMonth(), 1 - monthStartDay);
  return Array.from({ length: 42 }, (_, index) => {
    return new Date(firstCellDate.getFullYear(), firstCellDate.getMonth(), firstCellDate.getDate() + index);
  });
};

export default function ClassSchedulesPage() {
  const params = useParams();
  const router = useRouter();
  const classId = String(params?.id || '');

  const [classInfo, setClassInfo] = useState<Class | null>(null);
  const [schedules, setSchedules] = useState<ClassSchedule[]>([]);
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<MessageState>(null);

  const loadScheduleData = useCallback(
    async (month: Date) => {
      if (!classId) {
        setIsLoading(false);
        return;
      }

      const monthStart = new Date(month.getFullYear(), month.getMonth(), 1, 0, 0, 0);
      const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59);

      setIsLoading(true);
      setMessage(null);

      try {
        const [classDetail, scheduleList] = await Promise.all([
          classService.getClass(classId),
          classService.getClassSchedules(classId, monthStart.toISOString(), monthEnd.toISOString()),
        ]);
        setClassInfo(classDetail);
        setSchedules(scheduleList);
      } catch (error) {
        const text = error instanceof Error ? error.message : '수업 일정을 불러오는 중 오류가 발생했습니다.';
        setMessage({ type: 'error', text });
        setSchedules([]);
      } finally {
        setIsLoading(false);
      }
    },
    [classId]
  );

  useEffect(() => {
    void loadScheduleData(currentMonth);
  }, [currentMonth, loadScheduleData]);

  const scheduleMap = useMemo(() => {
    const map = new Map<string, ClassSchedule[]>();
    schedules.forEach((schedule) => {
      const key = toDateKey(new Date(schedule.scheduledDate));
      const items = map.get(key) || [];
      items.push(schedule);
      map.set(key, items);
    });
    return map;
  }, [schedules]);

  const calendarDays = useMemo(() => buildMonthGrid(currentMonth), [currentMonth]);

  const monthlySummary = useMemo(() => {
    return schedules.reduce(
      (acc, schedule) => {
        const state = getScheduleState(schedule);
        if (state === 'upcoming') acc.upcoming += 1;
        if (state === 'completed') acc.completed += 1;
        if (state === 'cancelled') acc.cancelled += 1;
        return acc;
      },
      { upcoming: 0, completed: 0, cancelled: 0 }
    );
  }, [schedules]);

  if (isLoading) {
    return <LoadingSpinner message="수업 일정을 불러오는 중입니다..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${classInfo?.className || '수업'} 일정 관리`}
        subtitle="월별 일정을 확인할 수 있습니다. 일정 등록과 취소는 담당 감독·코치가 처리합니다."
        actions={[
          {
            label: '수업 상세',
            onClick: () => router.push(`/dashboard/classes/${classId}`),
            icon: ArrowLeft,
            variant: 'outline',
          },
          {
            label: '수업 목록',
            onClick: () => router.push('/dashboard/classes'),
            icon: CalendarDays,
            variant: 'secondary',
          },
        ]}
      />

      {/* 메시지 */}
      {message && (
        <div
          role="status"
          aria-live="polite"
          className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300'
              : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-900/20 dark:text-rose-300'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span className="flex-1">{message.text}</span>
        </div>
      )}

      {/* 뷰 모드 + 통계 */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="inline-flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800" role="tablist" aria-label="일정 보기 방식">
            {(['month', 'week', 'day'] as ViewMode[]).map((mode) => {
              const isActive = viewMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setViewMode(mode)}
                  className={`inline-flex min-h-[44px] items-center rounded-lg px-4 text-sm font-semibold transition-colors motion-reduce:transition-none ${
                    isActive
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {mode === 'month' ? '월별' : mode === 'week' ? '주별' : '일별'}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition-colors motion-reduce:transition-none hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              aria-label="이전 달"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <p className="min-w-[140px] text-center text-lg font-bold text-slate-900 dark:text-white">
              {formatMonthLabel(currentMonth)}
            </p>
            <button
              type="button"
              onClick={() => setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition-colors motion-reduce:transition-none hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              aria-label="다음 달"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* 월간 요약 */}
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 dark:border-slate-700">
          <SummaryItem label="예정" value={monthlySummary.upcoming} tone="primary" />
          <SummaryItem label="완료" value={monthlySummary.completed} tone="emerald" />
          <SummaryItem label="취소" value={monthlySummary.cancelled} tone="rose" />
        </div>
      </Card>


      {viewMode === 'week' ? (
        <WeekView
          currentMonth={currentMonth}
          scheduleMap={scheduleMap}
        />
      ) : viewMode === 'day' ? (
        <DayView
          currentMonth={currentMonth}
          schedules={schedules}
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-7 overflow-hidden rounded-2xl">
            {WEEKDAY_LABELS.map((weekday, idx) => (
              <div
                key={weekday}
                className={`border-b border-slate-200 bg-slate-50 py-3 text-center text-xs font-bold dark:border-slate-700 dark:bg-slate-900/50 ${
                  idx === 0 ? 'text-rose-500' : idx === 6 ? 'text-primary' : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {weekday}
              </div>
            ))}
            {calendarDays.map((day) => {
              const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
              const daySchedules = scheduleMap.get(toDateKey(day)) || [];
              const isToday = toDateKey(day) === toDateKey(new Date());
              const dayOfWeek = day.getDay();
              return (
                <div
                  key={`${day.toISOString()}-${isCurrentMonth ? 'current' : 'other'}`}
                  className={`min-h-[120px] border-b border-r border-slate-200 p-2 dark:border-slate-700 ${
                    isCurrentMonth ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/70 dark:bg-slate-900/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p
                      className={`text-xs font-bold ${
                        isToday
                          ? 'flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white'
                          : isCurrentMonth
                            ? dayOfWeek === 0
                              ? 'text-rose-500'
                              : dayOfWeek === 6
                                ? 'text-primary'
                                : 'text-slate-900 dark:text-slate-100'
                            : 'text-slate-400 dark:text-slate-600'
                      }`}
                    >
                      {day.getDate()}
                    </p>
                    {daySchedules.length > 0 && (
                      <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">{daySchedules.length}건</span>
                    )}
                  </div>

                  <div className="mt-2 space-y-1">
                    {daySchedules.slice(0, 3).map((schedule) => {
                      const scheduleDate = new Date(schedule.scheduledDate);
                      const state = getScheduleState(schedule);
                      return (
                        <div
                          key={schedule.id}
                          className={`w-full rounded-md px-2 py-1 text-left text-[11px] ${
                            state === 'cancelled'
                              ? 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300'
                              : state === 'completed'
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                                : 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-primary'
                          }`}
                        >
                          <p className="font-semibold tabular-nums">
                            {scheduleDate.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <p className="text-[10px] font-medium">
                            {state === 'cancelled' ? '⊗ 취소' : state === 'completed' ? '✓ 완료' : '○ 예정'}
                          </p>
                        </div>
                      );
                    })}
                    {daySchedules.length > 3 && (
                      <p className="pl-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                        +{daySchedules.length - 3}건 더
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* 안내 */}
      <Card className="border-slate-200 bg-slate-50/50 p-5 dark:border-slate-700 dark:bg-slate-900/30">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Info className="h-4 w-4 text-primary" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">일정 관리 안내</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              캘린더에서 일정별 예정·완료·취소 상태를 확인할 수 있습니다. 취소된 일정은 출석 처리 대상에서 제외됩니다.
            </p>
          </div>
        </div>
      </Card>

    </div>
  );
}

function SummaryItem({ label, value, tone }: { label: string; value: number; tone: 'primary' | 'emerald' | 'rose' }) {
  const toneClass = {
    primary: 'bg-primary/10 text-primary',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300',
  }[tone];

  return (
    <div className={`rounded-lg px-3 py-2.5 ${toneClass}`}>
      <p className="text-xs font-semibold opacity-90">{label}</p>
      <p className="mt-0.5 text-lg font-black tabular-nums">{value}건</p>
    </div>
  );
}

interface ViewProps {
  currentMonth: Date;
  scheduleMap: Map<string, ClassSchedule[]>;
}

interface DayViewProps {
  currentMonth: Date;
  schedules: ClassSchedule[];
}

/**
 * 주별 뷰 — 현재 월의 첫 주(7일)를 한 줄로 노출.
 * 각 날짜에 시간순으로 일정을 표시.
 */
function WeekView({ currentMonth, scheduleMap }: ViewProps) {
  const weekStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const weekStartDayOfWeek = weekStart.getDay();
  const weekFirstCell = new Date(
    weekStart.getFullYear(),
    weekStart.getMonth(),
    weekStart.getDate() - weekStartDayOfWeek,
  );
  const weekDays = Array.from({ length: 7 }, (_, idx) =>
    new Date(weekFirstCell.getFullYear(), weekFirstCell.getMonth(), weekFirstCell.getDate() + idx),
  );

  return (
    <Card className="overflow-hidden p-0">
      <div className="grid grid-cols-7 overflow-hidden rounded-2xl">
        {WEEKDAY_LABELS.map((weekday, idx) => (
          <div
            key={weekday}
            className={`border-b border-slate-200 bg-slate-50 py-3 text-center text-xs font-bold dark:border-slate-700 dark:bg-slate-900/50 ${
              idx === 0 ? 'text-rose-500' : idx === 6 ? 'text-primary' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {weekday}
          </div>
        ))}
        {weekDays.map((day) => {
          const isToday = toDateKey(day) === toDateKey(new Date());
          const daySchedules = (scheduleMap.get(toDateKey(day)) ?? []).slice().sort(
            (a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime(),
          );
          const dayOfWeek = day.getDay();
          return (
            <div
              key={day.toISOString()}
              className="min-h-[260px] border-b border-r border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800"
            >
              <div className="mb-2 flex items-center justify-between">
                <p
                  className={`text-sm font-bold ${
                    isToday
                      ? 'flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white'
                      : dayOfWeek === 0
                        ? 'text-rose-500'
                        : dayOfWeek === 6
                          ? 'text-primary'
                          : 'text-slate-900 dark:text-slate-100'
                  }`}
                >
                  {day.getDate()}
                </p>
                {daySchedules.length > 0 && (
                  <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                    {daySchedules.length}건
                  </span>
                )}
              </div>
              <div className="space-y-1.5">
                {daySchedules.map((schedule) => {
                  const scheduleDate = new Date(schedule.scheduledDate);
                  const state = getScheduleState(schedule);
                  return (
                    <div
                      key={schedule.id}
                      className={`w-full rounded-md px-2 py-1.5 text-left text-xs ${
                        state === 'cancelled'
                          ? 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300'
                          : state === 'completed'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                            : 'bg-primary/10 text-primary'
                      }`}
                    >
                      <p className="font-semibold tabular-nums">
                        {scheduleDate.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      <p className="text-[10px] font-medium">
                        {state === 'cancelled' ? '⊗ 취소' : state === 'completed' ? '✓ 완료' : '○ 예정'}
                      </p>
                    </div>
                  );
                })}
                {daySchedules.length === 0 && (
                  <p className="py-4 text-center text-[11px] text-slate-300 dark:text-slate-600">없음</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/**
 * 일별 뷰 — 일정이 있는 첫 번째 날짜(없으면 오늘) 의 시간순 일정을 큰 카드로 노출.
 */
function DayView({ currentMonth, schedules }: DayViewProps) {
  const today = new Date();
  const todayKey = toDateKey(today);
  const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
  const monthSchedules = schedules
    .filter((s) => {
      const t = new Date(s.scheduledDate).getTime();
      return t >= monthStart.getTime() && t <= monthEnd.getTime() + 24 * 60 * 60 * 1000;
    })
    .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());

  const targetSchedule =
    monthSchedules.find((s) => toDateKey(new Date(s.scheduledDate)) === todayKey)
    ?? monthSchedules.find((s) => new Date(s.scheduledDate).getTime() >= today.getTime())
    ?? monthSchedules[0];

  const targetDate = targetSchedule ? new Date(targetSchedule.scheduledDate) : today;
  const targetKey = toDateKey(targetDate);
  const daySchedules = monthSchedules.filter(
    (s) => toDateKey(new Date(s.scheduledDate)) === targetKey,
  );

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-900/50">
        <p className="text-sm font-bold text-slate-900 dark:text-white">
          {targetDate.toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long',
          })}
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          총 {daySchedules.length}건의 일정
        </p>
      </div>
      <div className="space-y-2 p-5">
        {daySchedules.length === 0 ? (
          <div className="py-8 text-center">
            <CalendarDays className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" aria-hidden="true" />
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              해당 날짜에 등록된 일정이 없습니다.
            </p>
          </div>
        ) : (
          daySchedules.map((schedule) => {
            const scheduleDate = new Date(schedule.scheduledDate);
            const state = getScheduleState(schedule);
            return (
              <div
                key={schedule.id}
                className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left ${
                  state === 'cancelled'
                    ? 'border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-900/20'
                    : state === 'completed'
                      ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-900/20'
                      : 'border-primary/30 bg-primary/5'
                }`}
              >
                <div>
                  <p className="text-base font-bold tabular-nums text-slate-900 dark:text-white">
                    {scheduleDate.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {state === 'cancelled' ? '취소된 일정' : state === 'completed' ? '완료된 일정' : '예정된 일정'}
                  </p>
                </div>
                {state === 'completed' && (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" aria-hidden="true" />
                )}
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
