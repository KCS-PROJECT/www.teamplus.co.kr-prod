'use client';

import { useState, useCallback, useEffect } from 'react';
import { api } from '@/services/api-client';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useToast } from '@/components/ui/Toast';
import { WaitlistStatus } from '@/components/waitlist/WaitlistStatus';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import type { WaitlistStatusInfo, WaitlistStatus as WaitlistStatusType } from '@/types/waitlist';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';

// ─── Types ───────────────────────────────────────────

interface ChildWaitlistData {
  childId: string;
  childName: string;
  items: Array<WaitlistStatusInfo & { id: string }>;
}

// ─── 대기 안내 데이터 ─────────────────────────────────
// [재디자인 v2 2026-05-17] Chapter-Index + Spotlight Rule 패턴.
//   · step: 순서 인덱스 (1·2·3) — 좌측 dotted track 과 동기화
//   · tone: 'default' | 'spotlight' — '24시간 룰'은 spotlight 로 시각 위계 차별화
//   · headline: 짧은 행위 동사형 제목 / detail: 자세한 본문 / accent: 카드 상단 eyebrow 키워드
const WAITLIST_GUIDE_ITEMS: Array<{
  step: string;
  icon: string;
  accent: string;
  headline: string;
  detail: string;
  tone: 'default' | 'spotlight';
}> = [
  {
    step: '01',
    icon: 'notifications_active',
    accent: '알림 발송',
    headline: '대기 순서대로 알려드려요',
    detail: '정원에 빈자리가 생기면 대기 순서에 맞춰 자동으로 알림을 보내드립니다.',
    tone: 'default',
  },
  {
    step: '02',
    icon: 'schedule',
    accent: '핵심 · 24시간 룰',
    headline: '24시간 내에 꼭 확인하세요',
    detail: '등록 가능 알림을 받은 뒤 24시간이 지나면 다음 대기자에게 기회가 넘어갑니다.',
    tone: 'spotlight',
  },
  {
    step: '03',
    icon: 'cancel',
    accent: '자유 취소',
    headline: '언제든 취소할 수 있어요',
    detail: '대기 등록은 부담 없이, 원할 때 바로 취소할 수 있습니다.',
    tone: 'default',
  },
];

// ─── Page Component ──────────────────────────────────

export default function WaitlistPage() {
  const { toast } = useToast();
  // [2차 사이클 / 2026-05-13] 이중 헤더 방지 — Web `<PageAppBar />` 단독 렌더.
  useNativeUI({ showStatusBar: true, showAppBar: false, showBottomNav: false });

  const [childrenData, setChildrenData] = useState<ChildWaitlistData[]>([]);
  const [selectedChildIndex, setSelectedChildIndex] = useState(0);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [isPageLoading, setIsPageLoading] = useState(true);

  usePageReady(!isPageLoading);

  // 자녀별 대기 목록 로드
  useEffect(() => {
    let cancelled = false;

    async function loadWaitlist() {
      setIsPageLoading(true);
      try {
        // 1) 자녀 목록 + 내 전체 대기 목록 병렬 조회
        //    백엔드 경로는 GET /api/v1/waitlist/my 하나뿐 — childId 필드로 그룹핑한다.
        const [childrenRes, waitRes] = await Promise.all([
          api.get<{ data?: Array<{ id: string; firstName: string; lastName: string }> }>('/children'),
          api.get<{
            data?: Array<WaitlistStatusInfo & { id: string; childId?: string | null }>;
            items?: Array<WaitlistStatusInfo & { id: string; childId?: string | null }>;
          }>('/waitlist/my'),
        ]);

        if (cancelled) return;

        if (!childrenRes.success || !childrenRes.data) {
          setChildrenData([]);
          return;
        }

        const rawChildren = Array.isArray(childrenRes.data)
          ? childrenRes.data
          : (childrenRes.data as { data?: Array<{ id: string; firstName: string; lastName: string }> }).data ?? [];

        // 2) waitlist 응답에서 items 추출 (여러 형식 호환)
        const waitItems = waitRes.success && waitRes.data
          ? ((waitRes.data as { data?: Array<WaitlistStatusInfo & { id: string; childId?: string | null }> }).data
              ?? (waitRes.data as { items?: Array<WaitlistStatusInfo & { id: string; childId?: string | null }> }).items
              ?? (Array.isArray(waitRes.data) ? (waitRes.data as Array<WaitlistStatusInfo & { id: string; childId?: string | null }>) : []))
          : [];

        // 3) childId 기준 그룹핑
        const byChild = new Map<string, Array<WaitlistStatusInfo & { id: string }>>();
        for (const item of waitItems) {
          const key = item.childId ?? '__self__';
          if (!byChild.has(key)) byChild.set(key, []);
          byChild.get(key)!.push(item);
        }

        const waitlistList: ChildWaitlistData[] = rawChildren.map((child) => ({
          childId: child.id,
          childName: `${child.lastName}${child.firstName}`,
          items: byChild.get(child.id) ?? [],
        }));

        if (!cancelled) setChildrenData(waitlistList);
      } catch {
        if (!cancelled) setChildrenData([]);
      } finally {
        if (!cancelled) setIsPageLoading(false);
      }
    }

    loadWaitlist();
    return () => { cancelled = true; };
  }, []);

  const selectedChild = childrenData[selectedChildIndex];

  const handleCancel = useCallback(
    (itemId: string) => async () => {
      setLoadingId(itemId);
      try {
        // 백엔드 경로: DELETE /api/v1/waitlist/:id
        await api.delete(`/waitlist/${itemId}`);
        setRemovedIds((prev) => new Set(prev).add(itemId));
        toast.info(MESSAGES.waitlist.cancelled);
      } catch {
        toast.error(MESSAGES.error.general);
      } finally {
        setLoadingId(null);
      }
    },
    [toast]
  );

  const handleConfirm = useCallback(
    (itemId: string) => async () => {
      setLoadingId(itemId);
      try {
        const childId = selectedChild?.childId;
        if (childId) {
          await api.post(`/children/${childId}/waitlist/${itemId}/confirm`);
        }
        setRemovedIds((prev) => new Set(prev).add(itemId));
        toast.success(MESSAGES.waitlist.promoted);
      } catch {
        toast.error(MESSAGES.error.general);
      } finally {
        setLoadingId(null);
      }
    },
    [toast, selectedChild]
  );

  // 로딩 중
  if (isPageLoading) {
    return null;
  }

  // 로딩 완료 후 자녀가 없거나 대기 목록 조회 실패 — 빈 상태 렌더 (헤더는 유지해 뒤로가기 가능)
  if (!selectedChild) {
    return (
      <MobileContainer hasBottomNav>
        <PageAppBar title="대기 현황" forceNative />
        <main className="flex-1 flex flex-col items-center justify-center bg-it-canvas dark:bg-puck px-6 py-12 text-center gap-3">
          <div className="w-16 h-16 rounded-w-pill bg-it-fill dark:bg-rink-800 flex items-center justify-center">
            <Icon
              name="playlist_add_check"
              className="text-3xl text-it-ink-400 dark:text-rink-300"
              aria-hidden="true"
            />
          </div>
          <p className="text-card-body text-it-ink-500 dark:text-rink-300">
            {MESSAGES.dashboard.parentDashboard.noChildData}
          </p>
        </main>
      </MobileContainer>
    );
  }

  const activeItems = selectedChild.items.filter((item) => !removedIds.has(item.id));
  const waitingItems = activeItems.filter((item) => item.myStatus === 'WAITING');
  const promotedItems = activeItems.filter((item) => item.myStatus === 'PROMOTED');

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="대기 현황" forceNative />

      {/* Child Filter Tabs — [ICETIMES flat 2026-06-25] /report 자녀 세그먼트 패턴 정합.
          회색 캔버스 위 it-fill 세그먼트, active 흰 surface. 대기 배지는 it-blue. */}
      {childrenData.length > 1 && (
        <div className="bg-it-canvas dark:bg-puck px-4 pt-4">
          <div
            className="flex gap-2 p-1 bg-it-fill dark:bg-rink-800 rounded-lg"
            role="tablist"
            aria-label="자녀 선택"
          >
            {childrenData.map((child, index) => {
              const activeCount = child.items.filter((item) => !removedIds.has(item.id)).length;

              return (
                <button
                  key={child.childId}
                  type="button"
                  role="tab"
                  aria-selected={selectedChildIndex === index}
                  aria-label={`${child.childName}${activeCount > 0 ? ` 대기 ${activeCount}건` : ''}`}
                  onClick={() => setSelectedChildIndex(index)}
                  className={cn(
                    'flex-1 relative min-h-[44px] py-2.5 px-3 text-[14.5px] font-bold rounded-[9px] transition-all motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40',
                    selectedChildIndex === index
                      ? 'bg-it-surface dark:bg-rink-700 shadow-sh-1 text-it-ink-900 dark:text-white'
                      : 'text-it-ink-500 dark:text-rink-300 hover:text-it-ink-700 dark:hover:text-rink-100'
                  )}
                >
                  {child.childName}
                  {activeCount > 0 && (
                    <span
                      aria-hidden="true"
                      className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-w-pill bg-it-blue-500 text-white text-[10px] font-bold px-1 tabular-nums"
                    >
                      {activeCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Content
          [ICETIMES flat 재작업 2026-06-25] /report 와 동일 flat 언어 — main 은 회색 캔버스
          (bg-it-canvas dark:bg-puck), 콘텐츠 블록은 각자 mt-2 흰 섹션(또는 navy 히어로)으로
          쌓인다. 이전 px-4 space-y-6 + 카드 박스 → full-bleed flat 섹션 전환. 대기/승격 로직
          동결, 비주얼만. WaitlistStatus 는 iceTheme variant 로 카드 박스 → flat 타일 정합. */}
      <main className="flex-1 overflow-y-auto bg-it-canvas dark:bg-puck !pb-8">
        {/* 대기 요약 navy 히어로 (ROLLOUT §3 히어로 — 요약은 navy 밴드 full-bleed) */}
        {(waitingItems.length > 0 || promotedItems.length > 0) && (
          <section
            className="mt-2 bg-it-blue-800 dark:bg-it-blue-950 px-5 py-6"
            aria-label="대기 현황 요약"
          >
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-white/70">
                {selectedChild.childName} 자녀
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {/* 등록 가능 */}
              <div className="flex items-center gap-3">
                <div
                  className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center shrink-0"
                  aria-hidden="true"
                >
                  <Icon name="celebration" className="text-white text-xl" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-white/70">등록 가능</p>
                  <p className="text-2xl font-extrabold font-num text-white tabular-nums leading-tight">
                    {promotedItems.length}
                    <span className="text-card-body font-bold text-white/70 ml-0.5">건</span>
                  </p>
                </div>
              </div>
              {/* 대기 중 */}
              <div className="flex items-center gap-3">
                <div
                  className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center shrink-0"
                  aria-hidden="true"
                >
                  <Icon name="hourglass_top" className="text-white text-xl" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-white/70">대기 중</p>
                  <p className="text-2xl font-extrabold font-num text-white tabular-nums leading-tight">
                    {waitingItems.length}
                    <span className="text-card-body font-bold text-white/70 ml-0.5">건</span>
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Promoted (Action Required) Section — flat 흰 섹션 */}
        {promotedItems.length > 0 && (
          <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-4 sm:px-5 py-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-[9px] bg-it-blue-50 dark:bg-it-blue-500/15 flex items-center justify-center">
                <Icon name="celebration" className="text-it-blue-500 dark:text-it-blue-300 text-card-emphasis" aria-hidden="true" />
              </div>
              <h2 className="text-[15px] font-extrabold text-it-ink-900 dark:text-white">
                등록 가능
              </h2>
              <span className="ml-auto text-card-meta font-bold text-it-blue-600 dark:text-it-blue-300 bg-it-blue-50 dark:bg-it-blue-500/15 px-2 py-1 rounded-w-pill">
                {promotedItems.length}건
              </span>
            </div>

            <div className="space-y-3">
              {promotedItems.map((item) => (
                <WaitlistStatus
                  key={item.id}
                  info={item}
                  onConfirm={handleConfirm(item.id)}
                  onCancel={handleCancel(item.id)}
                  loading={loadingId === item.id}
                  iceTheme
                />
              ))}
            </div>
          </section>
        )}

        {/* Waiting Section — flat 흰 섹션 */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-4 sm:px-5 py-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-[9px] bg-it-blue-50 dark:bg-it-blue-500/15 flex items-center justify-center">
              <Icon name="hourglass_top" className="text-it-blue-500 dark:text-it-blue-300 text-card-emphasis" aria-hidden="true" />
            </div>
            <h2 className="text-[15px] font-extrabold text-it-ink-900 dark:text-white">
              대기 중
            </h2>
            {waitingItems.length > 0 && (
              <span className="ml-auto text-card-meta font-medium text-it-ink-500 dark:text-rink-300">
                {waitingItems.length}건
              </span>
            )}
          </div>

          {waitingItems.length > 0 ? (
            <div className="space-y-3">
              {waitingItems.map((item) => (
                <WaitlistStatus
                  key={item.id}
                  info={item}
                  onCancel={handleCancel(item.id)}
                  loading={loadingId === item.id}
                  iceTheme
                />
              ))}
            </div>
          ) : activeItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8">
              <div className="w-12 h-12 rounded-w-pill bg-it-fill dark:bg-rink-700 flex items-center justify-center">
                <Icon
                  name="playlist_add_check"
                  className="text-2xl text-it-ink-400 dark:text-rink-300"
                  aria-hidden="true"
                />
              </div>
              <p className="text-card-body text-it-ink-500 dark:text-rink-300 text-center">
                {MESSAGES.empty('대기 항목')}
              </p>
            </div>
          ) : null}
        </section>

        {/* Info Banner — 대기 안내
            [재디자인 v2 2026-05-17] Chapter-Index + Spotlight Rule 패턴.
              · 상단: eyebrow 키워드 + 한 줄 헤드라인 (헤더 박스 제거 → 본문에 직접 합류)
              · 좌측: 세로 dotted track + 인덱스 칩 (01·02·03) — 단계감 시각화
              · 중앙: 카드 형태 안내 (spotlight tone 은 ice-50 배경 + 좌측 ice-500 accent bar 로 24시간 룰 강조)
              · 하단: dotted 종료 + 취소 가능 chip 으로 시퀀스 종결감
              · WAITLIST_GUIDE_ITEMS 상수: step·tone·accent·headline·detail 5필드 */}
        <section
          className="mt-2 bg-it-surface dark:bg-it-blue-950 px-4 sm:px-5 py-5 overflow-hidden"
          aria-labelledby="waitlist-guide-title"
        >
          {/* Eyebrow + 헤드라인 — 박스 헤더 제거하고 본문에 직접 위치 */}
          <div className="flex items-center gap-2 mb-1">
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-w-pill bg-it-blue-50 dark:bg-it-blue-500/15 text-[10.5px] font-bold uppercase tracking-[0.08em] text-it-blue-600 dark:text-it-blue-300"
              aria-hidden="true"
            >
              <span className="w-1 h-1 rounded-full bg-it-blue-500" />
              Waitlist Guide
            </span>
          </div>
          <h3
            id="waitlist-guide-title"
            className="text-card-section font-extrabold text-it-ink-900 dark:text-white tracking-[-0.015em]"
          >
            대기 신청 전 꼭 확인해주세요
          </h3>
          <p className="mt-1 text-card-meta text-it-ink-500 dark:text-rink-300 leading-[1.55]">
            세 가지 핵심 규칙만 기억하면 됩니다.
          </p>

          {/* Chapter Index Track — 좌측 dotted line + 인덱스 칩, 우측 인셋 타일.
              [ICETIMES flat 2026-06-25] spotlight 강조는 ROLLOUT §3 "화면당 1개" red 강조
              규칙(24시간 룰)으로 it-red, 일반 단계는 it-fill 인셋. */}
          <ol className="relative mt-5 space-y-3">
            {/* 세로 dotted track — 좌측 26px 지점에 위치, 첫 칩 중심 ~ 마지막 칩 중심 */}
            <span
              aria-hidden="true"
              className="absolute left-[15px] top-6 bottom-6 w-px border-l border-dashed border-it-line-strong dark:border-it-blue-900"
            />
            {WAITLIST_GUIDE_ITEMS.map((row) => {
              const isSpotlight = row.tone === 'spotlight';
              return (
                <li key={row.step} className="relative flex gap-3.5 items-stretch">
                  {/* 인덱스 칩 — 단계 번호 (01·02·03), spotlight 는 it-red 채움 */}
                  <div className="shrink-0 relative z-10 flex justify-center w-[32px]">
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex items-center justify-center w-8 h-8 rounded-w-pill text-[11px] font-extrabold tabular-nums tracking-tight border transition-colors motion-reduce:transition-none',
                        isSpotlight
                          ? 'bg-it-red-500 border-it-red-500 text-white'
                          : 'bg-it-surface dark:bg-it-blue-950 border-it-line-strong dark:border-it-blue-900 text-it-ink-700 dark:text-rink-200'
                      )}
                    >
                      {row.step}
                    </span>
                  </div>

                  {/* 인셋 타일 — spotlight 는 it-red 소프트 배경 + 좌측 it-red accent bar */}
                  <div
                    className={cn(
                      'flex-1 min-w-0 relative rounded-w-lg transition-colors motion-reduce:transition-none',
                      isSpotlight
                        ? 'bg-it-red-500/8 dark:bg-it-red-500/12 border border-it-red-500/30 dark:border-it-red-500/40 pl-4 pr-3.5 py-3'
                        : 'bg-it-fill dark:bg-it-blue-900 px-3.5 py-3'
                    )}
                  >
                    {/* spotlight 좌측 accent bar */}
                    {isSpotlight && (
                      <span
                        aria-hidden="true"
                        className="absolute left-0 top-2 bottom-2 w-1 rounded-r-w-pill bg-it-red-500"
                      />
                    )}

                    {/* 헤더: 아이콘 + accent eyebrow */}
                    <div className="flex items-center gap-2 mb-1">
                      <Icon
                        name={row.icon}
                        className={cn(
                          'text-[18px]',
                          isSpotlight
                            ? 'text-it-red-500 dark:text-it-red-300'
                            : 'text-it-ink-500 dark:text-rink-300'
                        )}
                        aria-hidden="true"
                      />
                      <span
                        className={cn(
                          'text-[10.5px] font-bold uppercase tracking-[0.06em]',
                          isSpotlight
                            ? 'text-it-red-500 dark:text-it-red-300'
                            : 'text-it-ink-500 dark:text-rink-300'
                        )}
                      >
                        {row.accent}
                      </span>
                    </div>

                    {/* headline + detail */}
                    <p className="text-card-body font-bold text-it-ink-900 dark:text-white tracking-[-0.01em]">
                      {row.headline}
                    </p>
                    <p className="mt-1 text-card-meta text-it-ink-500 dark:text-rink-300 leading-[1.6]">
                      {row.detail}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>

          {/* Track 종결부 — 종료 점 + 도움 안내 한 줄 */}
          <div className="mt-4 pl-[12px] flex items-center gap-2">
            <span
              aria-hidden="true"
              className="w-[7px] h-[7px] rounded-full bg-it-line-strong dark:bg-it-blue-900 ring-2 ring-it-surface dark:ring-it-blue-950"
            />
            <p className="text-card-meta text-it-ink-500 dark:text-rink-300">
              궁금한 점은 클럽 운영진에게 문의해주세요.
            </p>
          </div>
        </section>
      </main>
    </MobileContainer>
  );
}
