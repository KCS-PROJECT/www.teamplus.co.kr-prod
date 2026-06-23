'use client';

import { useState, useCallback, useEffect, memo } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { RsvpSummaryCard } from '@/components/rsvp/RsvpSummaryCard';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import { api } from '@/services/api-client';
import type { RsvpScheduleInfo, RsvpSummary } from '@/types/rsvp';

// ─── Types ──────────────────────────────────────────
interface ScheduleWithRsvp {
  schedule: RsvpScheduleInfo;
  summary: RsvpSummary;
}

type FilterTab = 'upcoming' | 'past';

// ─── Weekly Trend Bar ────────────────────────────────
const WeeklyTrendBar = memo(function WeeklyTrendBar({ data }: { data: { day: string; rate: number }[] }) {
  const max = Math.max(...data.map(d => d.rate), 1);

  return (
    <div className="bg-white dark:bg-rink-800 rounded-xl border border-wline-2 dark:border-rink-700 p-4 mb-5">
      <h3 className="text-card-body font-bold text-wtext-1 dark:text-white mb-3">주간 RSVP 응답 추이</h3>
      <div className="flex items-end justify-between gap-2 h-24">
        {data.map((item) => (
          <div key={item.day} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-card-meta font-bold text-wtext-1 dark:text-white tabular-nums">{item.rate}%</span>
            <div className="w-full bg-wline-2 dark:bg-rink-700 rounded-t-md overflow-hidden" style={{ height: '60px' }}>
              <div
                className="w-full bg-ice-500 rounded-t-md transition-all duration-500"
                style={{ height: `${(item.rate / max) * 100}%`, marginTop: `${100 - (item.rate / max) * 100}%` }}
              />
            </div>
            <span className="text-card-meta text-wtext-3 dark:text-rink-300">{item.day}</span>
          </div>
        ))}
      </div>
    </div>
  );
});

// ─── Overview Stats ──────────────────────────────────
function OverviewStats({ schedules }: { schedules: ScheduleWithRsvp[] }) {
  const totalAttending = schedules.reduce((sum, s) => sum + s.summary.attending, 0);
  const totalDeclined = schedules.reduce((sum, s) => sum + s.summary.declined, 0);
  const totalNoResponse = schedules.reduce((sum, s) => sum + s.summary.noResponse, 0);
  const total = totalAttending + totalDeclined + totalNoResponse;
  const responseRate = total > 0 ? Math.round(((totalAttending + totalDeclined) / total) * 100) : 0;

  return (
    <div className="grid grid-cols-4 gap-2 mb-5" role="list" aria-label="RSVP 통계 요약">
      {[
        { label: '응답률', value: `${responseRate}%`, icon: 'analytics', color: 'text-ice-500' },
        { label: '참석', value: totalAttending, icon: 'check_circle', color: 'text-emerald-600 dark:text-emerald-400' },
        { label: '불참', value: totalDeclined, icon: 'cancel', color: 'text-red-600 dark:text-red-400' },
        { label: '미응답', value: totalNoResponse, icon: 'help', color: 'text-amber-600 dark:text-amber-400' },
      ].map(stat => (
        <div
          key={stat.label}
          role="listitem"
          className="bg-white dark:bg-rink-800 rounded-xl border border-wline-2 dark:border-rink-700 p-3 text-center flex flex-col items-center gap-1"
        >
          <Icon name={stat.icon} className={cn('text-xl', stat.color)} aria-hidden="true" />
          <p className="text-card-title font-extrabold text-wtext-1 dark:text-white tabular-nums">{stat.value}</p>
          <p className="text-card-meta text-wtext-3 dark:text-rink-300 font-medium">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────
export default function CoachRsvpPage() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<FilterTab>('upcoming');
  const [schedules, setSchedules] = useState<ScheduleWithRsvp[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  useNativeUI({
    showStatusBar: true,
    showAppBar: true,
    appBarTitle: 'RSVP 현황',
    showBottomNav: true,
    isDataLoaded: !isLoading,
  });

  const [weeklyData, setWeeklyData] = useState<{ day: string; rate: number }[]>([]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [rsvpRes, weeklyRes] = await Promise.all([
        api.get<{
          data?: ScheduleWithRsvp[];
          schedules?: ScheduleWithRsvp[];
        }>('/dashboard/coach', { params: { section: 'rsvp' } }),
        api.get<{
          data?: Array<{ day: string; rate: number }>;
          weekly?: Array<{ day: string; rate: number }>;
        }>('/dashboard/analytics/attendance', { params: { period: 'weekly' } }),
      ]);

      if (rsvpRes.success && rsvpRes.data) {
        const items = (rsvpRes.data as { data?: ScheduleWithRsvp[] }).data
          ?? (rsvpRes.data as { schedules?: ScheduleWithRsvp[] }).schedules
          ?? (Array.isArray(rsvpRes.data) ? rsvpRes.data : []);
        setSchedules(items as ScheduleWithRsvp[]);
      } else {
        setSchedules([]);
      }

      if (weeklyRes.success && weeklyRes.data) {
        const wData = (weeklyRes.data as { data?: Array<{ day: string; rate: number }> }).data
          ?? (weeklyRes.data as { weekly?: Array<{ day: string; rate: number }> }).weekly
          ?? (Array.isArray(weeklyRes.data) ? weeklyRes.data : []);
        setWeeklyData(wData as Array<{ day: string; rate: number }>);
      }
    } catch {
      setSchedules([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRemindNoResponse = useCallback(async (memberIds: string[]) => {
    try {
      await api.post('/notifications/remind', { memberIds });
      toast.success(`미응답자 ${memberIds.length}명에게 알림을 보냈습니다.`);
    } catch {
      toast.error(MESSAGES.error.general);
    }
  }, [toast]);


  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="RSVP 현황" />

      <main className="flex-1 overflow-y-auto hide-scrollbar px-5 py-4 pb-30">
        {/* 통계 요약 */}
        {!isLoading && <OverviewStats schedules={schedules} />}

        {/* 주간 추이 */}
        {!isLoading && weeklyData.length > 0 && <WeeklyTrendBar data={weeklyData} />}

        {/* 필터 탭 */}
        <div role="tablist" aria-label="RSVP 일정 필터" className="flex gap-1 mb-4 bg-wline-2 dark:bg-rink-800 rounded-lg p-1">
          {([
            { key: 'upcoming' as FilterTab, label: '다가오는 일정' },
            { key: 'past' as FilterTab, label: '지난 일정' },
          ]).map(tab => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={filter === tab.key}
              onClick={() => setFilter(tab.key)}
              className={cn(
                'flex-1 min-h-[36px] py-2 text-card-body font-semibold rounded-md transition-colors motion-reduce:transition-none',
                filter === tab.key
                  ? 'bg-white dark:bg-rink-700 text-wtext-1 dark:text-white shadow-sm'
                  : 'text-wtext-3 dark:text-rink-300 hover:text-wtext-2 dark:hover:text-rink-100'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* RSVP 카드 목록 */}
        <div className="flex flex-col gap-4" role="list" aria-label="RSVP 일정 목록">
          {isLoading ? null : schedules.length > 0 ? (
            schedules.map(item => (
              <div key={item.schedule.scheduleId} role="listitem">
                <RsvpSummaryCard
                  schedule={item.schedule}
                  summary={item.summary}
                  onRemindNoResponse={handleRemindNoResponse}
                />
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-14 h-14 rounded-2xl bg-wline-2 dark:bg-rink-700 flex items-center justify-center mb-3">
                <Icon name="event_available" className="text-3xl text-wtext-4 dark:text-rink-300" aria-hidden="true" />
              </div>
              <p className="text-card-body text-wtext-3 dark:text-rink-300 font-medium">
                {MESSAGES.empty('RSVP 일정')}
              </p>
            </div>
          )}
        </div>
      </main>
    </MobileContainer>
  );
}
