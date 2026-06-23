'use client';

import { useState, useEffect, useMemo } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { ChildEmptyState } from '@/components/child/ChildEmptyState';
import { Icon } from '@/components/ui/Icon';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { useIsNative } from '@/hooks/useIsNative';
import { apiRequest } from '@/services/api-client';
import { getWeekStart } from '@/lib/calendar-week';

// ── Types ──
interface ClassItem {
  id: string;
  title: string;
  time: string;
  location: string;
  coachName: string;
  dayLabel: string;
  scheduledAt: Date;
}

type TabKey = 'today' | 'tomorrow' | 'week';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'today', label: '오늘' },
  { key: 'tomorrow', label: '내일' },
  { key: 'week', label: '이번 주' },
];

const EMPTY_MESSAGES: Record<TabKey, { message: string; description: string }> = {
  today: {
    message: '오늘은 수업이 없어요!',
    description: '푸욱 쉬며 운동하고 오세요.',
  },
  tomorrow: {
    message: '내일은 수업이 없어요!',
    description: '수업이 등록되면 여기에 보여요.',
  },
  week: {
    message: '이번 주는 수업이 없어요!',
    description: '수업이 등록되면 여기에 보여요.',
  },
};

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

// ── Class Card ──
// WCAG AAA: min-h 120px 확보, 터치 시 scale/배경 피드백, 7:1 대비 텍스트, motion-reduce 지원
function ClassCard({ item, showDay }: { item: ClassItem; showDay: boolean }) {
  return (
    <div
      className="min-h-[120px] bg-white dark:bg-rink-800 rounded-2xl p-5 shadow-md border-2 border-wline-2 dark:border-rink-700 active:scale-[0.98] active:bg-ice-500/5 dark:active:bg-ice-500/10 transition-all duration-150 motion-reduce:transition-none motion-reduce:active:scale-100"
      role="group"
      aria-label={`${showDay ? item.dayLabel + '요일 ' : ''}${item.title} 수업, ${item.time}, ${item.location}, ${item.coachName} 코치`}
    >
      <div className="flex items-start gap-5">
        <div className="w-20 h-20 rounded-2xl bg-ice-500 flex flex-col items-center justify-center flex-shrink-0 shadow-md">
          {showDay ? (
            <>
              <span className="text-white text-w-title font-bold opacity-80">요일</span>
              <span className="text-white text-3xl font-black leading-none mt-0.5">{item.dayLabel}</span>
            </>
          ) : (
            <Icon name="sports_hockey" className="text-white text-4xl" aria-hidden="true" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-2xl font-black text-wtext-1 dark:text-white truncate tracking-tight">
            {item.title}
          </h3>
          <div className="flex items-center gap-2 mt-2">
            <Icon name="schedule" className="text-2xl text-ice-500 dark:text-blue-400" aria-hidden="true" />
            <span className="text-xl font-bold text-wtext-1 dark:text-white tabular-nums">
              {item.time}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Icon name="location_on" className="text-2xl text-ice-500 dark:text-blue-400" aria-hidden="true" />
            <span className="text-w-title font-bold text-wtext-2 dark:text-rink-100 truncate">
              {item.location}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Icon name="person" className="text-2xl text-ice-500 dark:text-blue-400" aria-hidden="true" />
            <span className="text-w-title font-bold text-wtext-2 dark:text-rink-100 truncate">
              {item.coachName}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ChildClassesPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('today');
  const [allClasses, setAllClasses] = useState<ClassItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const { isNative } = useIsNative();

  // [2026-05-13 이슈 D1.1 보강] pullToRefreshEnabled: false — CHILD 수업 목록 화면도
  //   4-7세 아동의 의도치 않은 새로고침 발화 차단 (hybrid-app-engineer Phase 3-D 신규 옵션).
  //   Web 측 usePullToRefresh 는 본 페이지에서 사용 안 함 — Native PTR 만 명시 차단.
  useNativeUI({
    showStatusBar: true,
    showAppBar: true,
    appBarTitle: '수업 목록',
    showBottomNav: true,
    showBackButton: true,
    pullToRefreshEnabled: false,
  });

  useEffect(() => {
    let isMounted = true;

    const fetchClasses = async () => {
      setIsLoading(true);
      try {
        const listRes = await apiRequest<Array<{ id: string; clubName: string; coachName: string }>>({
          method: 'GET',
          url: '/teams/my/list',
          retry: false,
        });

        if (!isMounted || !listRes.success || !listRes.data?.length) {
          if (isMounted) {
            setAllClasses([]);
            setIsLoading(false);
          }
          return;
        }

        const clubId = listRes.data[0].id;
        const coachName = listRes.data[0].coachName;

        const detailRes = await apiRequest<{
          schedules?: Array<{
            id: string;
            title?: string;
            scheduledAt?: string;
            scheduledDate?: string;
            location?: string;
          }>;
        }>({
          method: 'GET',
          url: `/teams/${clubId}`,
          retry: false,
        });

        if (!isMounted) return;

        const schedules = detailRes.data?.schedules ?? [];

        const mapped: ClassItem[] = schedules
          .map((s) => {
            const raw = s.scheduledAt ?? s.scheduledDate ?? '';
            const date = new Date(raw);
            if (isNaN(date.getTime())) return null;
            const hh = String(date.getHours()).padStart(2, '0');
            const mm = String(date.getMinutes()).padStart(2, '0');
            return {
              id: s.id,
              title: s.title ?? '수업',
              time: `${hh}:${mm}`,
              location: s.location ?? '미정',
              coachName: coachName ?? '코치',
              dayLabel: DAY_NAMES[date.getDay()],
              scheduledAt: date,
            };
          })
          .filter((c): c is ClassItem => c !== null)
          .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

        setAllClasses(mapped);
      } catch {
        if (isMounted) setAllClasses([]);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void fetchClasses();
    return () => { isMounted = false; };
  }, []);

  // 탭별 날짜 범위 필터 — 로컬 타임존 기준
  const filteredClasses = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
    const startOfDayAfter = new Date(startOfTomorrow);
    startOfDayAfter.setDate(startOfDayAfter.getDate() + 1);
    // 이번 주 = 이번 주 월요일 ~ 다음 주 월요일
    const startOfWeek = getWeekStart(startOfToday);
    const startOfNextWeek = new Date(startOfWeek);
    startOfNextWeek.setDate(startOfNextWeek.getDate() + 7);

    return allClasses.filter((c) => {
      const t = c.scheduledAt.getTime();
      if (activeTab === 'today') return t >= startOfToday.getTime() && t < startOfTomorrow.getTime();
      if (activeTab === 'tomorrow') return t >= startOfTomorrow.getTime() && t < startOfDayAfter.getTime();
      return t >= startOfWeek.getTime() && t < startOfNextWeek.getTime();
    });
  }, [allClasses, activeTab]);

  return (
    <MobileContainer hasBottomNav>
      {/* 웹 전용 공통 AppBar — 네이티브는 Flutter AppBar가 대신 표시 */}
      {/* WCAG AAA: toneVariant='kid' 가 h-16 (64px) + size-12 아이콘 + 22px 타이틀 자동 적용. */}
      {!isNative && (
        <PageAppBar
          title="수업 목록"
          toneVariant="kid"
          titleClassName="text-[22px] font-extrabold"
        />
      )}

      {/* Tab Bar — WCAG AAA: 72x72dp 터치타겟, 7:1 대비, motion-reduce */}
      {/* kid AppBar 높이 h-16(64px) 정렬 — 기존 top-14(56px) 시 4-8px 겹침 회귀 차단. */}
      <div
        className={`sticky ${isNative ? 'top-0' : 'top-16'} z-10 bg-wbg dark:bg-rink-900 px-5 py-3 border-b border-wline-2 dark:border-rink-800`}
      >
        <div className="flex gap-2" role="tablist" aria-label="수업 기간 필터">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 min-h-[72px] text-2xl font-black rounded-2xl transition-all duration-150 motion-reduce:transition-none active:scale-[0.97] motion-reduce:active:scale-100 active:brightness-95 tracking-tight ${
                activeTab === tab.key
                  ? 'bg-ice-500 text-white shadow-md'
                  : 'bg-white dark:bg-rink-800 text-wtext-2 dark:text-rink-100 border-2 border-wline dark:border-rink-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <main
        className="flex-1 px-5 pt-4 pb-32 flex flex-col gap-4 overflow-y-auto hide-scrollbar"
        role="tabpanel"
        aria-live="polite"
      >
        {isLoading ? null : filteredClasses.length === 0 ? (
          <ChildEmptyState
            emoji="🏒"
            message={EMPTY_MESSAGES[activeTab].message}
            description={EMPTY_MESSAGES[activeTab].description}
          />
        ) : (
          filteredClasses.map((item) => (
            <ClassCard key={item.id} item={item} showDay={activeTab === 'week'} />
          ))
        )}
      </main>
    </MobileContainer>
  );
}
