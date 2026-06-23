'use client';

import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { useScreenMetrics } from '@/hooks/useScreenMetrics';
import { NavLink } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useToast } from '@/components/ui/Toast';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import type { OverseasTrip, TripStatus } from '@/types/overseas-trip';

// ─── Constants ──────────────────────────────────────

const STATUS_BADGE: Record<TripStatus, { className: string; label: string }> = {
  draft:     { className: 'bg-wline-2 text-wtext-1 dark:bg-rink-700 dark:text-wtext-4', label: MESSAGES.overseasTrip.status.draft },
  open:      { className: 'bg-mint-100 text-mint-500 dark:bg-mint-500/15 dark:text-mint-500', label: MESSAGES.overseasTrip.status.open },
  closed:    { className: 'bg-sun-100 text-sun-500 dark:bg-sun-500/15 dark:text-sun-500', label: MESSAGES.overseasTrip.status.closed },
  ongoing:   { className: 'bg-blue-100 text-ice-500 dark:bg-ice-500/15 dark:text-ice-500', label: MESSAGES.overseasTrip.status.ongoing },
  completed: { className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400', label: MESSAGES.overseasTrip.status.completed },
  cancelled: { className: 'bg-red-100 text-flame-500 dark:bg-flame-500/15 dark:text-flame-500', label: MESSAGES.overseasTrip.status.cancelled },
};

type TabType = 'upcoming' | 'ongoing' | 'past';

// ─── Helpers ────────────────────────────────────────

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString('ko-KR', {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function formatCurrency(amount: string | number | null | undefined): string {
  const value = Number(amount ?? 0);
  if (!value) return '-';
  return `${new Intl.NumberFormat('ko-KR').format(value)}원`;
}

function getDDay(dateStr: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const diff = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'D-Day';
  if (diff > 0) return `D-${diff}`;
  return `D+${Math.abs(diff)}`;
}

function filterByTab(trips: OverseasTrip[], tab: TabType): OverseasTrip[] {
  switch (tab) {
    case 'upcoming':
      return trips.filter(
        (t) => t.status === 'draft' || t.status === 'open' || t.status === 'closed'
      );
    case 'ongoing':
      return trips.filter((t) => t.status === 'ongoing');
    case 'past':
      return trips.filter(
        (t) => t.status === 'completed' || t.status === 'cancelled'
      );
    default:
      return trips;
  }
}

// ─── Component ──────────────────────────────────────

export default function DirectorOverseasTripsPage() {
  // 인증/권한 체크는 (director)/layout.tsx 에서 단 한 번 수행됨 (중복 호출 금지)
  useNativeUI({ showStatusBar: true, showAppBar: false });
  const { toast } = useToast();

  const [trips, setTrips] = useState<OverseasTrip[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [activeTab, setActiveTab] = useState<TabType>('upcoming');

  // ─── 탭 슬라이딩 인디케이터 ──────────────────────
  const tabsNavRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Record<TabType, HTMLButtonElement | null>>({
    upcoming: null,
    ongoing: null,
    past: null,
  });
  const [tabIndicator, setTabIndicator] = useState<{ left: number; width: number }>({ left: 0, width: 0 });

  const updateTabIndicator = useCallback(() => {
    const btn = tabRefs.current[activeTab];
    const nav = tabsNavRef.current;
    if (!btn || !nav) return;
    const navRect = nav.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    setTabIndicator({ left: btnRect.left - navRect.left, width: btnRect.width });
  }, [activeTab]);

  const loadTrips = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get<OverseasTrip[]>('/overseas-trips');
      if (res.success && res.data) {
        setTrips(Array.isArray(res.data) ? res.data : []);
      } else {
        setTrips([]);
      }
    } catch {
      toast.error(MESSAGES.error.general);
      setTrips([]);
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadTrips();
  }, [loadTrips]);

  const filteredTrips = filterByTab(trips, activeTab);

  const tabs: { key: TabType; label: string }[] = [
    { key: 'upcoming', label: '예정' },
    { key: 'ongoing', label: '진행중' },
    { key: 'past', label: '완료' },
  ];

  const tabCounts = {
    upcoming: trips.filter((t) => t.status === 'draft' || t.status === 'open' || t.status === 'closed').length,
    ongoing: trips.filter((t) => t.status === 'ongoing').length,
    past: trips.filter((t) => t.status === 'completed' || t.status === 'cancelled').length,
  };

  // 화면 폭 변경(회전·키보드·접힘 포함) 시 인디케이터 재측정 — SoT 단일 구독자
  // (2026-05-11) window.addEventListener('resize') 제거 — useScreenMetrics 사용
  const { width: screenWidth } = useScreenMetrics();

  useLayoutEffect(() => {
    updateTabIndicator();
  }, [updateTabIndicator, tabCounts.upcoming, tabCounts.ongoing, tabCounts.past, screenWidth]);

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title={MESSAGES.overseasTrip.listTitle} forceNative />

      <main className="flex-1 overflow-y-auto hide-scrollbar pb-6" role="main" aria-label="해외 원정 목록">
        {/* 통계 요약 — 히어로 */}
        <section className="px-4 pt-4" aria-label="원정 현황 요약">
          <div className="rounded-w-lg border border-wline-2 bg-white p-5 shadow-sh-1 dark:border-rink-700 dark:bg-rink-800">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-w-md bg-ice-50 dark:bg-ice-500/15">
                <Icon
                  name="flight_takeoff"
                  className="text-card-title text-ice-500 dark:text-ice-500"
                  aria-hidden="true"
                />
              </div>
              <div>
                <h2 className="text-card-body font-bold text-wtext-1 dark:text-white">
                  해외 원정 현황
                </h2>
                <p className="text-card-meta text-wtext-3 dark:text-wtext-4">
                  전체 {trips.length}건의 원정을 관리합니다
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-w-md bg-wbg dark:bg-puck/40 p-3">
                <p className="text-card-meta font-medium text-wtext-3 dark:text-wtext-4">
                  전체
                </p>
                <p className="mt-0.5 text-xl font-extrabold text-wtext-1 tabular-nums dark:text-white">
                  {trips.length}
                </p>
              </div>
              <div className="rounded-w-md bg-mint-100 dark:bg-mint-500/15 p-3">
                <p className="text-card-meta font-medium text-mint-500 dark:text-mint-500">
                  {MESSAGES.overseasTrip.status.open}
                </p>
                <p className="mt-0.5 text-xl font-extrabold text-mint-500 tabular-nums dark:text-emerald-300">
                  {trips.filter((t) => t.status === 'open').length}
                </p>
              </div>
              <div className="rounded-w-md bg-ice-50 dark:bg-ice-500/15 p-3">
                <p className="text-card-meta font-medium text-ice-500 dark:text-ice-500">
                  {MESSAGES.overseasTrip.status.ongoing}
                </p>
                <p className="mt-0.5 text-xl font-extrabold text-ice-500 tabular-nums dark:text-ice-500">
                  {trips.filter((t) => t.status === 'ongoing').length}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 필터 탭 — sticky pill 스타일 + 슬라이딩 인디케이터 */}
        <section
          className="sticky top-14 z-10 bg-wbg dark:bg-puck px-4 pb-2 pt-4"
          aria-label="원정 상태 필터"
        >
          <div
            ref={tabsNavRef}
            role="tablist"
            aria-label="원정 상태 필터"
            className="relative flex gap-1.5 rounded-w-md bg-wsurface dark:bg-rink-800 border border-wline-2 dark:border-rink-700 p-1"
          >
            {/* 슬라이딩 primary 배경 */}
            <span
              aria-hidden="true"
              className="absolute top-1 bottom-1 rounded-lg bg-ice-500 shadow-sh-1 transition-[left,width] duration-300 ease-out motion-reduce:transition-none"
              style={{
                left: `${tabIndicator.left}px`,
                width: `${tabIndicator.width}px`,
                opacity: tabIndicator.width > 0 ? 1 : 0,
              }}
            />

            {tabs.map((tab) => {
              const count = tabCounts[tab.key];
              const isActive = activeTab === tab.key;
              return (
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  key={tab.key}
                  ref={(el) => {
                    tabRefs.current[tab.key] = el;
                  }}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    'relative z-[1] flex-1 min-h-[40px] rounded-lg py-2 text-card-meta font-bold transition-colors duration-200 motion-reduce:transition-none inline-flex items-center justify-center gap-1',
                    isActive
                      ? 'text-white'
                      : 'text-wtext-2 dark:text-wtext-4 hover:text-wtext-1 dark:hover:text-white',
                  )}
                >
                  {tab.label}
                  <span
                    className={cn(
                      'tabular-nums',
                      isActive
                        ? 'text-white/90'
                        : 'text-wtext-3 dark:text-wtext-4',
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 목록 */}
        <section className="px-4 pt-3 pb-6" aria-label="원정 목록">
          {isLoading ? null : filteredTrips.length === 0 ? (
            <div role="status" className="flex flex-col items-center py-14 px-6 text-center">
              <Icon
                name="flight"
                className="mb-3 text-5xl text-wtext-3 dark:text-wtext-4"
                aria-hidden="true"
              />
              <p className="text-card-body font-semibold text-wtext-2 dark:text-wtext-4">
                {MESSAGES.overseasTrip.noTrips}
              </p>
              <p className="mt-1.5 max-w-[240px] text-card-meta leading-relaxed text-wtext-3 dark:text-wtext-4">
                {activeTab === 'upcoming'
                  ? '우측 하단 버튼으로 새로운 원정을 등록해보세요.'
                  : activeTab === 'ongoing'
                  ? '현재 진행 중인 원정이 없습니다.'
                  : '완료된 원정이 없습니다.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTrips.map((trip) => {
                const dday =
                  trip.status === 'open' || trip.status === 'closed'
                    ? getDDay(trip.startDate)
                    : null;
                const participantCount = trip._count?.registrations ?? 0;
                const fillPct =
                  trip.maxParticipants > 0
                    ? Math.round((participantCount / trip.maxParticipants) * 100)
                    : 0;
                const isFull = fillPct >= 100;

                return (
                  <NavLink
                    key={trip.id}
                    href={`/director-overseas-trips/${trip.id}`}
                    className="block rounded-w-md border border-wline-2 bg-white p-4 shadow-sh-1 transition-colors motion-reduce:transition-none hover:border-ice-500/30 hover:bg-ice-50/30 dark:border-rink-700 dark:bg-rink-800 dark:hover:border-ice-500/40 dark:hover:bg-blue-900/10"
                    aria-label={`${trip.title} 원정 상세 보기`}
                  >
                    {/* 상단: 상태 + D-day */}
                    <div className="mb-2 flex items-center justify-between">
                      <span
                        className={`inline-flex shrink-0 items-center rounded-w-pill px-2 py-0.5 text-card-meta font-bold ${
                          STATUS_BADGE[trip.status]?.className ?? ''
                        }`}
                      >
                        {STATUS_BADGE[trip.status]?.label ?? trip.status}
                      </span>
                      {dday && (
                        <span className="shrink-0 rounded-md bg-ice-500 px-2 py-0.5 text-card-meta font-extrabold text-white tabular-nums">
                          {dday}
                        </span>
                      )}
                    </div>

                    {/* 제목 */}
                    <h3 className="truncate text-card-title font-bold text-wtext-1 dark:text-white leading-snug">
                      {trip.title}
                    </h3>

                    {/* 위치 + 기간 */}
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center gap-1.5 text-card-meta text-wtext-2 dark:text-wtext-4">
                        <Icon
                          name="location_on"
                          className="text-card-body text-wtext-3"
                          aria-hidden="true"
                        />
                        <span>
                          {trip.country} {trip.city}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-card-meta text-wtext-2 dark:text-wtext-4 tabular-nums">
                        <Icon
                          name="calendar_today"
                          className="text-card-body text-wtext-3"
                          aria-hidden="true"
                        />
                        <span>
                          {formatDate(trip.startDate)} ~ {formatDate(trip.endDate)}
                        </span>
                      </div>
                    </div>

                    {/* 참가자 진행률 */}
                    <div className="mt-3 pt-3 border-t border-wline-2 dark:border-rink-700">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="inline-flex items-center gap-1 text-card-meta font-semibold text-wtext-3 dark:text-wtext-4">
                          <Icon name="group" className="text-card-meta" aria-hidden="true" />
                          참가자
                        </span>
                        <span className="text-card-meta font-bold tabular-nums text-wtext-1 dark:text-white">
                          {participantCount}
                          <span className="text-wtext-3 dark:text-wtext-4 font-medium">
                            /{trip.maxParticipants}명
                          </span>
                        </span>
                      </div>
                      <div className="h-1.5 rounded-w-pill bg-wline-2 dark:bg-rink-700 overflow-hidden">
                        <div
                          className={`h-full rounded-w-pill transition-all motion-reduce:transition-none duration-500 ${
                            isFull ? 'bg-sun-500' : 'bg-ice-500'
                          }`}
                          style={{ width: `${Math.min(fillPct, 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* 하단 부가 정보 */}
                    {(trip.estimatedCost || trip.team?.name) && (
                      <div className="mt-3 flex items-center justify-between gap-2 text-card-meta text-wtext-3 dark:text-wtext-4">
                        {trip.team?.name && (
                          <span className="flex items-center gap-1 truncate">
                            <Icon
                              name="sports_hockey"
                              className="text-card-meta"
                              aria-hidden="true"
                            />
                            <span className="truncate">{trip.team.name}</span>
                          </span>
                        )}
                        {trip.estimatedCost && (
                          <span className="flex items-center gap-1 shrink-0">
                            <Icon name="payments" className="text-card-meta" aria-hidden="true" />
                            <span className="font-semibold tabular-nums text-wtext-1 dark:text-white">
                              {formatCurrency(trip.estimatedCost)}
                            </span>
                          </span>
                        )}
                      </div>
                    )}
                  </NavLink>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* FAB — 신규 원정 등록 */}
      <NavLink
        href="/director-overseas-trips/create"
        aria-label="신규 원정 등록하기"
        className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-5 z-30 flex h-14 w-14 items-center justify-center rounded-w-pill bg-ice-500 hover:bg-ice-600 text-white shadow-sh-1 hover:shadow-sh-2 active:brightness-95 transition-all motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-puck"
      >
        <Icon name="add" className="text-2xl" aria-hidden="true" />
      </NavLink>
    </MobileContainer>
  );
}
