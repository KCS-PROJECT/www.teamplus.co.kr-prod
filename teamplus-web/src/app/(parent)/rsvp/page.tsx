'use client';

import { useState, useCallback, useEffect } from 'react';
import { api } from '@/services/api-client';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useToast } from '@/components/ui/Toast';
import { useNavigation } from '@/components/ui/NavLink';
import { RsvpResponseCard } from '@/components/rsvp/RsvpResponseCard';
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

      {/* Child Filter Tabs — [ICETIMES flat 2026-06-25] /report 자녀 세그먼트 패턴 정합.
          회색 캔버스 위 it-fill 세그먼트, active 흰 surface. 미응답 배지는 it-red. */}
      {childrenData.length > 1 && (
        <div className="bg-it-canvas dark:bg-puck px-4 pt-4" role="tablist" aria-label="자녀 선택">
          <div className="flex gap-2 p-1 bg-it-fill dark:bg-rink-800 rounded-lg">
            {childrenData.map((child, index) => {
              const pendingCount = child.pending.filter(
                (item) => getEffectiveStatus(item.schedule.scheduleId, item.myStatus) === 'NO_RESPONSE'
              ).length;

              return (
                <button
                  key={child.childId}
                  type="button"
                  role="tab"
                  onClick={() => setSelectedChildIndex(index)}
                  aria-label={`${child.childName}${pendingCount > 0 ? ` 응답 대기 ${pendingCount}건` : ''}`}
                  aria-selected={selectedChildIndex === index}
                  className={cn(
                    'flex-1 relative min-h-[44px] py-2.5 px-3 text-[14.5px] font-bold rounded-[9px] transition-all motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40',
                    selectedChildIndex === index
                      ? 'bg-it-surface dark:bg-rink-700 shadow-sh-1 text-it-ink-900 dark:text-white'
                      : 'text-it-ink-500 dark:text-rink-300 hover:text-it-ink-700 dark:hover:text-rink-100'
                  )}
                >
                  {child.childName}
                  {pendingCount > 0 && (
                    <span
                      aria-hidden="true"
                      className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-w-pill bg-it-red-500 text-white text-card-meta font-bold px-1 tabular-nums"
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

      {/* Filter Tabs — [ICETIMES flat 2026-06-25] /report 리포트 탭 패턴 정합.
          회색 캔버스 위 가로 스크롤 탭, active it-blue fill. CategoryChipsRow(공유 SoT) 는
          가로 스크롤 잘림 차단 패턴(외부 overflow-x-auto + 내부 min-w-max) 을 page-local 로
          1:1 재현하여 회귀 0 (4개 칩 좁은 화면 잘림 없음). */}
      <div className="bg-it-canvas dark:bg-puck px-4 pt-3 pb-1" role="tablist" aria-label="RSVP 상태 필터">
        <div className="flex gap-1 overflow-x-auto hide-scrollbar">
          <div className="flex min-w-max gap-1">
            {FILTER_TABS.map((tab) => {
              const count = filterCounts[tab.key];
              const isActive = activeFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveFilter(tab.key)}
                  className={cn(
                    'flex items-center gap-[5px] min-h-[40px] px-[13px] text-[13.5px] font-bold rounded-[10px] whitespace-nowrap transition-all motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40',
                    isActive
                      ? 'bg-it-blue-500 text-white'
                      : 'text-it-ink-500 dark:text-rink-300 hover:bg-it-fill dark:hover:bg-rink-800'
                  )}
                >
                  <Icon name={tab.icon} className="text-[16px]" aria-hidden="true" />
                  {tab.label}
                  {count > 0 && (
                    <span
                      className={cn(
                        'inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold tabular-nums',
                        isActive ? 'bg-white/20 text-white' : 'bg-it-fill dark:bg-rink-700 text-it-ink-700 dark:text-rink-200'
                      )}
                      aria-label={`${count}건`}
                    >
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content
          [ICETIMES flat 재작업 2026-06-25] /report 와 동일 flat 언어 — main 은 회색 캔버스
          (bg-it-canvas dark:bg-puck), 콘텐츠 블록은 각자 mt-2 흰 섹션으로 쌓인다. 이전
          px-4 space-y-6 + 카드 박스 → full-bleed flat 섹션 전환. RSVP 응답/로컬상태 로직 동결,
          비주얼만. RsvpResponseCard 는 iceTheme variant 로 카드 박스 → flat 타일 정합. */}
      <main className="flex-1 overflow-y-auto bg-it-canvas dark:bg-puck !pb-8">
        {/* Pending Section — flat 흰 섹션 */}
        {showPending && (
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-4 sm:px-5 py-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-[9px] bg-it-blue-50 dark:bg-it-blue-500/15 flex items-center justify-center">
              <Icon name="pending_actions" className="text-it-blue-500 dark:text-it-blue-300 text-card-emphasis" aria-hidden="true" />
            </div>
            <h2 className="text-[15px] font-extrabold text-it-ink-900 dark:text-white">
              응답 대기
            </h2>
            {pendingItems.length > 0 && (
              <span className="ml-auto text-card-meta font-bold text-it-red-500 dark:text-it-red-300 bg-it-red-500/10 dark:bg-it-red-500/15 px-2 py-1 rounded-w-pill tabular-nums">
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
                  iceTheme
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-8">
              <div className="w-12 h-12 rounded-w-pill bg-it-fill dark:bg-rink-700 flex items-center justify-center">
                <Icon
                  name="check_circle"
                  className="text-2xl text-success"
                  aria-hidden="true"
                />
              </div>
              <p className="text-card-body text-it-ink-500 dark:text-rink-300 text-center">
                {MESSAGES.empty('대기 중인 RSVP')}
              </p>
            </div>
          )}
        </section>
        )}

        {/* Responded History Section — flat 흰 섹션, 항목은 hairline 행 */}
        {showResponded && filteredRespondedItems.length > 0 && (
          <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-4 sm:px-5 py-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-[9px] bg-it-blue-50 dark:bg-it-blue-500/15 flex items-center justify-center">
                <Icon name="history" className="text-it-blue-500 dark:text-it-blue-300 text-card-emphasis" aria-hidden="true" />
              </div>
              <h2 className="text-[15px] font-extrabold text-it-ink-900 dark:text-white">
                응답 완료
              </h2>
              <span className="ml-auto text-card-meta font-medium text-it-ink-500 dark:text-rink-300 tabular-nums">
                {filteredRespondedItems.length}건
              </span>
            </div>

            <div>
              {filteredRespondedItems.map((item) => {
                const effectiveStatus = getEffectiveStatus(
                  item.schedule.scheduleId,
                  item.myStatus
                );

                return (
                  <div
                    key={item.schedule.scheduleId}
                    className="py-3 border-b border-it-line dark:border-it-blue-900 last:border-0"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-card-body font-bold text-it-ink-900 dark:text-white">
                        {item.schedule.title}
                      </h3>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 px-2 py-1 rounded-lg text-card-meta font-bold',
                          effectiveStatus === 'ATTENDING'
                            ? 'bg-it-blue-50 dark:bg-it-blue-500/15 text-it-blue-600 dark:text-it-blue-300'
                            : 'bg-it-red-500/10 dark:bg-it-red-500/15 text-it-red-500 dark:text-it-red-300'
                        )}
                      >
                        <Icon
                          name={effectiveStatus === 'ATTENDING' ? 'check_circle' : 'cancel'}
                          className="text-[14px]"
                        />
                        {effectiveStatus === 'ATTENDING' ? '참석' : '불참'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-card-meta text-it-ink-500 dark:text-rink-300">
                      <span className="flex items-center gap-1">
                        <Icon name="calendar_today" className="text-[12px]" />
                        {item.schedule.date}({item.schedule.dayOfWeek})
                      </span>
                      <span className="flex items-center gap-1">
                        <Icon name="schedule" className="text-[12px]" />
                        {item.schedule.startTime}~{item.schedule.endTime}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-2 pt-2 border-t border-it-line dark:border-it-blue-900 text-card-meta text-it-ink-500 dark:text-rink-300">
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

        {/* 필터 결과 없음 — flat 흰 섹션 */}
        {activeFilter !== 'ALL' && filterCounts[activeFilter] === 0 && (
          <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-4 sm:px-5 py-10 flex flex-col items-center justify-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-it-fill dark:bg-rink-700 flex items-center justify-center">
              <Icon name="filter_alt_off" className="text-2xl text-it-ink-400 dark:text-rink-300" aria-hidden="true" />
            </div>
            <p className="text-card-body font-semibold text-it-ink-700 dark:text-rink-100 text-center">
              해당 상태의 응답이 없습니다
            </p>
            <p className="text-card-meta text-it-ink-500 dark:text-rink-300 text-center">
              다른 필터를 선택해 보세요
            </p>
          </section>
        )}
      </main>
      <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </MobileContainer>
  );
}
