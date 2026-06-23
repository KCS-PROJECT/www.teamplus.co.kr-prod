'use client';

import { useState, useCallback, useEffect } from 'react';
import { api } from '@/services/api-client';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useToast } from '@/components/ui/Toast';
import { useNavigation } from '@/components/ui/NavLink';
import { RsvpResponseCard } from '@/components/rsvp/RsvpResponseCard';
import { RsvpSummaryCard } from '@/components/rsvp/RsvpSummaryCard';
import { CategoryChipsRow, type CategoryChipItem } from '@/components/shared/CategoryChipsRow';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import type { RsvpScheduleInfo, RsvpSummary, RsvpStatus } from '@/types/rsvp';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import dynamic from 'next/dynamic';
const GlobalMenu = dynamic(() => import('@/components/layout/GlobalMenu').then(mod => ({ default: mod.GlobalMenu })), { ssr: false });

// ─── Types ───────────────────────────────────────────

interface ChildRsvpData {
  childId: string;
  childName: string;
  pending: Array<{
    schedule: RsvpScheduleInfo;
    summary: RsvpSummary;
    myStatus: RsvpStatus;
  }>;
  responded: Array<{
    schedule: RsvpScheduleInfo;
    summary: RsvpSummary;
    myStatus: RsvpStatus;
  }>;
}

type RsvpFilter = 'ALL' | 'PENDING' | 'ATTENDING' | 'DECLINED';

const FILTER_TABS: { key: RsvpFilter; label: string; icon: string }[] = [
  { key: 'ALL',       label: '전체',   icon: 'list'            },
  { key: 'PENDING',   label: '미응답', icon: 'pending_actions' },
  { key: 'ATTENDING', label: '참석',   icon: 'check_circle'    },
  { key: 'DECLINED',  label: '불참',   icon: 'cancel'          },
];

// ─── Page Component ──────────────────────────────────

export default function RsvpPage() {
  const { back } = useNavigation();
  const { toast } = useToast();
  // [2차 사이클 / 2026-05-13] 이중 헤더 방지 — Web `<PageAppBar />` 단독 렌더.
  useNativeUI({ showStatusBar: true, showAppBar: false, showBottomNav: false });

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [childrenData, setChildrenData] = useState<ChildRsvpData[]>([]);
  const [selectedChildIndex, setSelectedChildIndex] = useState(0);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [localStatuses, setLocalStatuses] = useState<Record<string, RsvpStatus>>({});
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<RsvpFilter>('ALL');

  usePageReady(!isPageLoading);

  // 자녀별 RSVP 데이터 로드
  useEffect(() => {
    let cancelled = false;

    async function loadRsvpData() {
      setIsPageLoading(true);
      try {
        const childrenRes = await api.get<{ data?: Array<{ id: string; firstName: string; lastName: string }> }>('/children');
        if (!childrenRes.success || !childrenRes.data || cancelled) {
          setChildrenData([]);
          return;
        }

        const rawChildren = Array.isArray(childrenRes.data)
          ? childrenRes.data
          : (childrenRes.data as { data?: Array<{ id: string; firstName: string; lastName: string }> }).data ?? [];

        const rsvpList: ChildRsvpData[] = await Promise.all(
          rawChildren.map(async (child) => {
            try {
              const rsvpRes = await api.get<{
                pending?: Array<{ schedule: RsvpScheduleInfo; summary: RsvpSummary; myStatus: RsvpStatus }>;
                responded?: Array<{ schedule: RsvpScheduleInfo; summary: RsvpSummary; myStatus: RsvpStatus }>;
              }>(`/children/${child.id}/rsvp`);
              if (rsvpRes.success && rsvpRes.data) {
                return {
                  childId: child.id,
                  childName: `${child.lastName}${child.firstName}`,
                  pending: rsvpRes.data.pending ?? [],
                  responded: rsvpRes.data.responded ?? [],
                };
              }
            } catch { /* fallthrough */ }
            return {
              childId: child.id,
              childName: `${child.lastName}${child.firstName}`,
              pending: [],
              responded: [],
            };
          })
        );

        if (!cancelled) {
          setChildrenData(rsvpList);
        }
      } catch {
        if (!cancelled) setChildrenData([]);
      } finally {
        if (!cancelled) setIsPageLoading(false);
      }
    }

    loadRsvpData();
    return () => { cancelled = true; };
  }, []);

  const selectedChild = childrenData[selectedChildIndex];

  const handleRespond = useCallback(
    (scheduleId: string) =>
      async (status: 'ATTENDING' | 'DECLINED', reason?: string) => {
        setRespondingId(scheduleId);

        try {
          const childId = selectedChild?.childId;
          if (childId) {
            await api.post(`/children/${childId}/rsvp/${scheduleId}`, {
              status,
              ...(reason ? { reason } : {}),
            });
          }
          setLocalStatuses((prev) => ({ ...prev, [scheduleId]: status }));

          if (status === 'ATTENDING') {
            toast.success(MESSAGES.rsvp.attending);
          } else {
            toast.info(MESSAGES.rsvp.declined);
          }
        } catch {
          toast.error(MESSAGES.error.general);
        } finally {
          setRespondingId(null);
        }
      },
    [toast, selectedChild]
  );

  const getEffectiveStatus = (scheduleId: string, originalStatus: RsvpStatus): RsvpStatus => {
    return localStatuses[scheduleId] ?? originalStatus;
  };

  if (isPageLoading || !selectedChild) {
    return null;
  }

  // Split pending items into truly pending and newly responded
  const pendingItems = selectedChild.pending.filter(
    (item) => getEffectiveStatus(item.schedule.scheduleId, item.myStatus) === 'NO_RESPONSE'
  );
  const newlyRespondedItems = selectedChild.pending.filter(
    (item) => getEffectiveStatus(item.schedule.scheduleId, item.myStatus) !== 'NO_RESPONSE'
  );
  const respondedItems = [...newlyRespondedItems, ...selectedChild.responded];

  // 필터별 카운트
  const attendingCount = respondedItems.filter(
    (item) => getEffectiveStatus(item.schedule.scheduleId, item.myStatus) === 'ATTENDING'
  ).length;
  const declinedCount = respondedItems.filter(
    (item) => getEffectiveStatus(item.schedule.scheduleId, item.myStatus) === 'DECLINED'
  ).length;
  const filterCounts: Record<RsvpFilter, number> = {
    ALL: pendingItems.length + respondedItems.length,
    PENDING: pendingItems.length,
    ATTENDING: attendingCount,
    DECLINED: declinedCount,
  };

  // 필터에 따라 섹션 가시성 결정
  const showPending = activeFilter === 'ALL' || activeFilter === 'PENDING';
  const showResponded = activeFilter === 'ALL' || activeFilter === 'ATTENDING' || activeFilter === 'DECLINED';

  // 응답 완료 섹션 필터링
  const filteredRespondedItems = respondedItems.filter((item) => {
    if (activeFilter === 'ALL') return true;
    const status = getEffectiveStatus(item.schedule.scheduleId, item.myStatus);
    if (activeFilter === 'ATTENDING') return status === 'ATTENDING';
    if (activeFilter === 'DECLINED') return status === 'DECLINED';
    return false;
  });

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="RSVP 응답" forceNative />

      {/* Child Filter Tabs */}
      {childrenData.length > 1 && (
        <div className="px-4 pt-4">
          <div className="flex gap-2 p-1 bg-wline-2 dark:bg-rink-800 rounded-lg">
            {childrenData.map((child, index) => {
              const pendingCount = child.pending.filter(
                (item) => getEffectiveStatus(item.schedule.scheduleId, item.myStatus) === 'NO_RESPONSE'
              ).length;

              return (
                <button
                  key={child.childId}
                  type="button"
                  onClick={() => setSelectedChildIndex(index)}
                  aria-label={`${child.childName}${pendingCount > 0 ? ` 응답 대기 ${pendingCount}건` : ''}`}
                  aria-pressed={selectedChildIndex === index}
                  className={cn(
                    'flex-1 relative min-h-[48px] py-2.5 px-3 text-card-body font-semibold rounded-lg transition-all motion-reduce:transition-none',
                    selectedChildIndex === index
                      ? 'bg-white dark:bg-rink-700 shadow-sm text-wtext-1 dark:text-white'
                      : 'text-wtext-3 dark:text-rink-300 hover:text-wtext-2 dark:hover:text-rink-100'
                  )}
                >
                  {child.childName}
                  {pendingCount > 0 && (
                    <span
                      aria-hidden="true"
                      className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-w-pill bg-red-500 text-white text-card-meta font-bold px-1"
                    >
                      {pendingCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter Tabs — [W3.B 2026-05-18 / Task #1] 카테고리 잘림 회귀 수정.
          이전: 자체 `flex gap-1.5 overflow-x-auto hide-scrollbar` — 외부에서만 가로 스크롤을
                허용해도 내부 자식이 `min-w-max` 없이 늘어나므로 4개 칩이 좁은 화면에서 잘림.
          조치: `CategoryChipsRow` (SoT — 외부 overflow-x-auto + 내부 min-w-max 패턴) 로
                대체하여 가로 스크롤 잘림 0건. 외부 `paddingX="px-4"` 로 페이지 grid 정합. */}
      <CategoryChipsRow
        ariaLabel="RSVP 상태 필터"
        paddingX="px-4"
        activeKey={activeFilter}
        onChange={(key) => setActiveFilter(key as RsvpFilter)}
        chips={FILTER_TABS.map<CategoryChipItem>((tab) => ({
          key: tab.key,
          label: tab.label,
          icon: tab.icon,
          count: filterCounts[tab.key],
        }))}
      />

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-4 pt-4 pb-30 space-y-6">
        {/* Pending Section */}
        {showPending && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
              <Icon name="pending_actions" className="text-amber-600 text-card-emphasis" aria-hidden="true" />
            </div>
            <h2 className="text-card-emphasis font-bold text-wtext-1 dark:text-white">
              응답 대기
            </h2>
            {pendingItems.length > 0 && (
              <span className="ml-auto text-card-meta font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-w-pill tabular-nums">
                {pendingItems.length}건
              </span>
            )}
          </div>

          {pendingItems.length > 0 ? (
            <div className="space-y-3">
              {pendingItems.map((item) => (
                <RsvpResponseCard
                  key={item.schedule.scheduleId}
                  schedule={item.schedule}
                  summary={item.summary}
                  myStatus={getEffectiveStatus(item.schedule.scheduleId, item.myStatus)}
                  onRespond={handleRespond(item.schedule.scheduleId)}
                  loading={respondingId === item.schedule.scheduleId}
                />
              ))}
            </div>
          ) : (
            <div className="bg-white dark:bg-rink-800 rounded-xl p-8 border border-wline-2 dark:border-rink-700 flex flex-col items-center justify-center gap-2">
              <div className="w-12 h-12 rounded-w-pill bg-wline-2 dark:bg-rink-700 flex items-center justify-center">
                <Icon
                  name="check_circle"
                  className="text-2xl text-emerald-500 dark:text-emerald-400"
                  aria-hidden="true"
                />
              </div>
              <p className="text-card-body text-wtext-3 dark:text-rink-300 text-center">
                {MESSAGES.empty('대기 중인 RSVP')}
              </p>
            </div>
          )}
        </section>
        )}

        {/* Responded History Section */}
        {showResponded && filteredRespondedItems.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
                <Icon name="history" className="text-emerald-600 text-card-emphasis" aria-hidden="true" />
              </div>
              <h2 className="text-card-emphasis font-bold text-wtext-1 dark:text-white">
                응답 완료
              </h2>
              <span className="ml-auto text-card-meta font-medium text-wtext-3 dark:text-rink-300 tabular-nums">
                {filteredRespondedItems.length}건
              </span>
            </div>

            <div className="space-y-3">
              {filteredRespondedItems.map((item) => {
                const effectiveStatus = getEffectiveStatus(
                  item.schedule.scheduleId,
                  item.myStatus
                );

                return (
                  <div
                    key={item.schedule.scheduleId}
                    className="bg-white dark:bg-rink-800 rounded-xl p-4 shadow-sm border border-wline-2 dark:border-rink-700"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-card-body font-bold text-wtext-1 dark:text-white">
                        {item.schedule.title}
                      </h3>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 px-2 py-1 rounded-lg text-card-meta font-bold',
                          effectiveStatus === 'ATTENDING'
                            ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                            : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                        )}
                      >
                        <Icon
                          name={effectiveStatus === 'ATTENDING' ? 'check_circle' : 'cancel'}
                          className="text-[14px]"
                        />
                        {effectiveStatus === 'ATTENDING' ? '참석' : '불참'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-card-meta text-wtext-3 dark:text-rink-300">
                      <span className="flex items-center gap-1">
                        <Icon name="calendar_today" className="text-[12px]" />
                        {item.schedule.date}({item.schedule.dayOfWeek})
                      </span>
                      <span className="flex items-center gap-1">
                        <Icon name="schedule" className="text-[12px]" />
                        {item.schedule.startTime}~{item.schedule.endTime}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-2 pt-2 border-t border-wline-2 dark:border-rink-700 text-card-meta text-wtext-3 dark:text-rink-300">
                      <span>참석 {item.summary.attending}</span>
                      <span>불참 {item.summary.declined}</span>
                      <span>미응답 {item.summary.noResponse}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 필터 결과 없음 */}
        {activeFilter !== 'ALL' && filterCounts[activeFilter] === 0 && (
          <section className="bg-white dark:bg-rink-800 rounded-2xl p-10 border border-wline-2 dark:border-rink-700 flex flex-col items-center justify-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-wline-2 dark:bg-rink-700 flex items-center justify-center">
              <Icon name="filter_alt_off" className="text-2xl text-wtext-3 dark:text-rink-300" aria-hidden="true" />
            </div>
            <p className="text-card-body font-semibold text-wtext-2 dark:text-rink-100 text-center">
              해당 상태의 응답이 없습니다
            </p>
            <p className="text-card-meta text-wtext-3 dark:text-rink-300 text-center">
              다른 필터를 선택해 보세요
            </p>
          </section>
        )}
      </main>
      <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </MobileContainer>
  );
}
