'use client';

import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { useScreenMetrics } from '@/hooks/useScreenMetrics';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { NavLink } from '@/components/ui/NavLink';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { cn } from '@/lib/utils';

// ─── Types ──────────────────────────────────────────
interface PaymentSummary {
  totalRevenue: number;
  unpaid: number;
  pendingSettlement: number;
  completedCount: number;
  unpaidCount: number;
}

interface TeamPayment {
  id: string;
  teamName: string;
  totalMembers: number;
  paidMembers: number;
  unpaidMembers: number;
  totalAmount: number;
  paidAmount: number;
  feeType: 'MONTHLY_FIXED' | 'PER_SESSION';
  billingTiming: 'PREPAID' | 'POSTPAID';
}

interface UnpaidMember {
  id: string;
  name: string;
  teamName: string;
  amount: number;
  dueDate: string;
  overdueDays: number;
}

type TabType = 'overview' | 'teams' | 'unpaid';

// [삭제 2026-04-29] FALLBACK_SUMMARY / FALLBACK_TEAMS / FALLBACK_UNPAID — 사용자 요청으로 mock 제거

// ─── Helpers ────────────────────────────────────────
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ko-KR').format(amount);
}

// stagger 진입 (DESIGN §6.5 — interval 40ms / cap 280ms)
function staggerDelay(i: number): string {
  return `${Math.min(i * 40, 280)}ms`;
}

// ─── Main Component ──────────────────────────────────
export default function DirectorPaymentsPage() {
  const showWebUI = true; // 웹 UI 항상 사용 (네이티브 AppBar/BottomNav 제거됨)
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // ─── 탭 슬라이딩 인디케이터 ──────────────────────
  const tabsNavRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Record<TabType, HTMLButtonElement | null>>({
    overview: null,
    teams: null,
    unpaid: null,
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
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [teams, setTeams] = useState<TeamPayment[]>([]);
  const [unpaidMembers, setUnpaidMembers] = useState<UnpaidMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    appBarTitle: '결제 현황',
    showBottomNav: true,
    showBackButton: true,
  });

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      // [수정 2026-04-29] mock fallback 제거 — 실제 API 미구현 시 빈 상태.
      setSummary({ totalRevenue: 0, unpaid: 0, pendingSettlement: 0, completedCount: 0, unpaidCount: 0 });
      setTeams([]);
      setUnpaidMembers([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 화면 폭 변경(회전·키보드·접힘 포함) 시 인디케이터 재측정 — SoT 단일 구독자
  // (2026-05-11) window.addEventListener('resize') 제거 — useScreenMetrics 사용
  const { width: screenWidth } = useScreenMetrics();

  // [추가 2026-05-15 V04 J-2] 단일 팀(teams.length <= 1) 환경에서 "팀별 결제" 탭은
  //   의미가 없으므로 노출하지 않는다. activeTab 이 'teams' 상태였다면 'overview' 로 복귀.
  const showTeamsTab = teams.length > 1;
  useEffect(() => {
    if (!showTeamsTab && activeTab === 'teams') {
      setActiveTab('overview');
    }
  }, [showTeamsTab, activeTab]);

  // activeTab 또는 탭 라벨(미수금 count) 또는 화면 폭 변경 시 인디케이터 재측정
  // [수정 2026-05-15 V04 J-2] 'teams' 탭이 mount/unmount 될 때도 indicator 재측정
  //   (탭 개수 변화 → 각 탭 너비 변화).
  useLayoutEffect(() => {
    updateTabIndicator();
  }, [updateTabIndicator, summary?.unpaidCount, screenWidth, showTeamsTab]);

  if (isLoading || !summary) return null;

  // [수정 2026-05-15 V04 J-2] showTeamsTab=false 면 '팀별 결제' 탭 제외.
  const tabs: { key: TabType; label: string }[] = [
    { key: 'overview', label: '전체 현황' },
    ...(showTeamsTab ? [{ key: 'teams' as TabType, label: '팀별 결제' }] : []),
    { key: 'unpaid', label: `미수금 (${summary.unpaidCount})` },
  ];

  const hasUnpaid = summary.unpaid > 0;
  const hasUnpaidMembers = summary.unpaidCount > 0;

  return (
    <MobileContainer hasBottomNav={showWebUI}>
      {showWebUI && <PageAppBar title="결제 관리" forceNative />}

      <main className="flex-1 overflow-y-auto hide-scrollbar" role="main" aria-label="감독 결제 관리">
        {/* ── 결제 요약 — 밝은 흰 카드 Hero (타이포·라인·그림자로 위계) ──────── */}
        <div className="px-5 pt-5 pb-4">
          <section className="animate-fade-in rounded-w-xl border border-wline-2 bg-wsurface p-6 shadow-sh-2 motion-reduce:animate-none dark:border-rink-700 dark:bg-rink-800">
            {/* 상단 라벨 + 월 칩 */}
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-wtext-3 dark:text-wtext-4">
                결제 요약
              </p>
              <span className="rounded-w-pill bg-wline-2 px-2.5 py-1 text-card-meta font-semibold text-wtext-2 dark:bg-rink-700 dark:text-wtext-4">
                {new Date().getMonth() + 1}월
              </span>
            </div>

            {/* 총 수입 — 단일 히어로 숫자 */}
            <div className="mt-5">
              <p className="text-card-meta text-wtext-3 dark:text-wtext-4">총 수입</p>
              <p className="mt-1 text-[34px] font-extrabold leading-none tracking-tight text-wtext-1 tabular-nums dark:text-white">
                {formatCurrency(summary.totalRevenue)}
                <span className="ml-1 text-w-body font-semibold text-wtext-3 dark:text-wtext-4">원</span>
              </p>
            </div>

            {/* 미수금 / 정산 예정 — 정의형 2열 (컬러 박스 없이 라인 구분) */}
            <div className="mt-6 grid grid-cols-2 gap-4 border-t border-wline-2 pt-5 dark:border-rink-700">
              <div>
                <p className="text-card-meta text-wtext-3 dark:text-wtext-4">미수금</p>
                <p
                  className={cn(
                    'mt-1 text-w-title font-bold tabular-nums',
                    hasUnpaid ? 'text-flame-500' : 'text-wtext-1 dark:text-white',
                  )}
                >
                  {formatCurrency(summary.unpaid)}
                  <span className="ml-0.5 text-card-meta font-medium text-wtext-3 dark:text-wtext-4">원</span>
                </p>
              </div>
              <div>
                <p className="text-card-meta text-wtext-3 dark:text-wtext-4">정산 예정</p>
                <p className="mt-1 text-w-title font-bold text-wtext-1 tabular-nums dark:text-white">
                  {formatCurrency(summary.pendingSettlement)}
                  <span className="ml-0.5 text-card-meta font-medium text-wtext-3 dark:text-wtext-4">원</span>
                </p>
              </div>
            </div>

            {/* 결제 완료 / 미납 — 닷 제거, 숫자 위계로 */}
            <div className="mt-5 flex items-center gap-6 border-t border-wline-2 pt-4 text-card-meta dark:border-rink-700">
              <span className="text-wtext-3 dark:text-wtext-4">
                결제 완료{' '}
                <strong className="font-bold text-wtext-1 tabular-nums dark:text-white">{summary.completedCount}명</strong>
              </span>
              <span className={hasUnpaidMembers ? 'text-flame-500' : 'text-wtext-3 dark:text-wtext-4'}>
                미납{' '}
                <strong className={cn('font-bold tabular-nums', !hasUnpaidMembers && 'text-wtext-1 dark:text-white')}>
                  {summary.unpaidCount}명
                </strong>
              </span>
            </div>
          </section>
        </div>

        {/* ── 크레딧 관리 진입 카드 ──────────────────────────────────────── */}
        <div className="px-5 pb-5">
          <NavLink
            href="/director-credits"
            className="group flex items-center gap-3 rounded-w-md border border-wline-2 bg-wsurface p-4 shadow-sh-1 transition-colors motion-reduce:transition-none hover:border-ice-500/40 hover:bg-ice-50/50 active:brightness-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/30 dark:border-rink-700 dark:bg-rink-800 dark:hover:border-ice-500/40 dark:hover:bg-rink-700"
            aria-label="크레딧 관리 페이지로 이동"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-w-md bg-ice-50 dark:bg-ice-500/15">
              <Icon name="account_balance_wallet" className="text-[20px] text-ice-500" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-card-title text-wtext-1 dark:text-white">크레딧 관리</p>
              <p className="mt-0.5 text-card-meta text-wtext-3 dark:text-wtext-4">
                회원별 잔액 · 충전 · 차감 내역
              </p>
            </div>
            <Icon
              name="chevron_right"
              className="shrink-0 text-wtext-3 transition-transform motion-reduce:transition-none group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </NavLink>
        </div>

        {/* ── 탭 — 슬라이딩 인디케이터 ──────────────────────────────────── */}
        <div className="px-5 mb-4">
          <div
            ref={tabsNavRef}
            role="tablist"
            aria-label="결제 현황 필터"
            className="relative flex rounded-w-md bg-wline-2 p-1 dark:bg-rink-800"
          >
            {/* 슬라이딩 흰색 배경 (활성 탭 추적) */}
            <span
              aria-hidden="true"
              className="absolute top-1 bottom-1 rounded-w-sm bg-wsurface shadow-sh-1 transition-[left,width] duration-300 ease-out motion-reduce:transition-none dark:bg-rink-700"
              style={{
                left: `${tabIndicator.left}px`,
                width: `${tabIndicator.width}px`,
                opacity: tabIndicator.width > 0 ? 1 : 0,
              }}
            />

            {tabs.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`director-payments-panel-${tab.key}`}
                  id={`director-payments-tab-${tab.key}`}
                  key={tab.key}
                  ref={(el) => {
                    tabRefs.current[tab.key] = el;
                  }}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    'relative z-[1] flex-1 rounded-w-sm py-2.5 text-card-title transition-colors duration-200 motion-reduce:transition-none',
                    isActive
                      ? 'text-ice-500'
                      : 'text-wtext-3 hover:text-wtext-1 dark:text-wtext-4 dark:hover:text-white',
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── 탭 컨텐츠 ─────────────────────────────────────────────────── */}
        <div className="px-5 pb-30 space-y-3">
          {activeTab === 'overview' && (
            <div
              role="tabpanel"
              id="director-payments-panel-overview"
              aria-labelledby="director-payments-tab-overview"
              className="space-y-3"
            >
              {/* 결제 유형별 현황 — 단일 ice 액센트 */}
              <section className="rounded-w-lg border border-wline-2 bg-wsurface p-5 shadow-sh-1 dark:border-rink-700 dark:bg-rink-800">
                <h3 className="text-card-section mb-4">결제 유형별 현황</h3>
                <div className="space-y-4">
                  <PaymentTypeBar
                    label="정기권 (선결제)"
                    count={teams.filter((t) => t.feeType === 'MONTHLY_FIXED').reduce((a, t) => a + t.paidMembers, 0)}
                    total={teams.filter((t) => t.feeType === 'MONTHLY_FIXED').reduce((a, t) => a + t.totalMembers, 0)}
                  />
                  <PaymentTypeBar
                    label="횟수제 (후결제)"
                    count={teams.filter((t) => t.feeType === 'PER_SESSION').reduce((a, t) => a + t.paidMembers, 0)}
                    total={teams.filter((t) => t.feeType === 'PER_SESSION').reduce((a, t) => a + t.totalMembers, 0)}
                    muted
                  />
                </div>
              </section>

              {/* 최근 정산 내역 — mock 제거, 실데이터 기준 빈 상태 */}
              <section className="rounded-w-lg border border-wline-2 bg-wsurface p-5 shadow-sh-1 dark:border-rink-700 dark:bg-rink-800">
                <h3 className="text-card-section">최근 정산 내역</h3>
                <p className="mt-1 text-card-meta text-wtext-3 dark:text-wtext-4">
                  정산이 완료되면 이곳에 표시됩니다.
                </p>
              </section>
            </div>
          )}

          {activeTab === 'teams' && (
            <div
              role="tabpanel"
              id="director-payments-panel-teams"
              aria-labelledby="director-payments-tab-teams"
              className="space-y-3"
            >
              {teams.map((team, i) => (
                <TeamPaymentCard key={team.id} team={team} index={i} />
              ))}
            </div>
          )}

          {activeTab === 'unpaid' && (
            <div
              role="tabpanel"
              id="director-payments-panel-unpaid"
              aria-labelledby="director-payments-tab-unpaid"
              className="space-y-3"
            >
              {unpaidMembers.length > 0 ? (
                unpaidMembers.map((member, i) => (
                  <UnpaidMemberCard key={member.id} member={member} index={i} />
                ))
              ) : (
                <div
                  className="flex flex-col items-center gap-2.5 rounded-w-lg border border-wline-2 bg-wsurface p-8 dark:border-rink-700 dark:bg-rink-800"
                  role="status"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-w-pill bg-mint-100 dark:bg-mint-500/15">
                    <Icon name="check_circle" className="text-2xl text-mint-500" aria-hidden="true" />
                  </div>
                  <p className="text-card-body text-wtext-2 dark:text-wtext-4">미수금이 없습니다.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </MobileContainer>
  );
}

// ─── Sub Components ──────────────────────────────────
function PaymentTypeBar({
  label,
  count,
  total,
  muted = false,
}: {
  label: string;
  count: number;
  total: number;
  muted?: boolean;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-card-body font-medium text-wtext-2 dark:text-wtext-4">{label}</span>
        <span className="text-card-meta font-bold text-wtext-1 tabular-nums dark:text-white">
          {count}/{total}명 · {pct}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} ${pct}퍼센트`}
        className="h-1.5 overflow-hidden rounded-w-pill bg-wline-2 dark:bg-rink-700"
      >
        <div
          className={cn(
            'h-full rounded-w-pill transition-all duration-700 motion-reduce:transition-none',
            muted ? 'bg-ice-500/40' : 'bg-ice-500',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function TeamPaymentCard({ team, index = 0 }: { team: TeamPayment; index?: number }) {
  const pct = team.totalMembers > 0 ? Math.round((team.paidMembers / team.totalMembers) * 100) : 0;
  const feeLabel = team.feeType === 'MONTHLY_FIXED' ? '정기권' : '횟수제';
  const timingLabel = team.billingTiming === 'PREPAID' ? '선결제' : '후결제';
  const isComplete = pct === 100;

  return (
    <article
      className="animate-slide-up rounded-w-lg border border-wline-2 bg-wsurface p-5 shadow-sh-1 motion-reduce:animate-none dark:border-rink-700 dark:bg-rink-800"
      style={{ animationDelay: staggerDelay(index) }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-card-title text-wtext-1 truncate dark:text-white">{team.teamName}</h3>
          {/* 칩 → muted 텍스트 한 줄 (가운뎃점 구분) */}
          <p className="mt-0.5 text-card-meta text-wtext-3 dark:text-wtext-4">
            {feeLabel} · {timingLabel}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-card-emphasis font-bold text-wtext-1 tabular-nums dark:text-white">
            {formatCurrency(team.paidAmount)}
            <span className="ml-0.5 text-card-meta font-medium text-wtext-3">원</span>
          </p>
          <p className="text-card-meta text-wtext-3 tabular-nums dark:text-wtext-4">
            / {formatCurrency(team.totalAmount)}원
          </p>
        </div>
      </div>

      {/* 진행률 바 */}
      <div className="mt-4 mb-1.5 flex items-center justify-between">
        <span className="text-card-meta font-semibold text-wtext-3 dark:text-wtext-4">납부율</span>
        <span
          className={cn(
            'text-card-meta font-bold tabular-nums',
            isComplete ? 'text-mint-500' : 'text-ice-500',
          )}
        >
          {team.paidMembers}
          <span className="font-medium text-wtext-3 dark:text-wtext-4">/{team.totalMembers}명</span>
          <span className="ml-1.5">{pct}%</span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${team.teamName} 납부율 ${pct}퍼센트`}
        className="h-1.5 overflow-hidden rounded-w-pill bg-wline-2 dark:bg-rink-700"
      >
        <div
          className={cn(
            'h-full rounded-w-pill transition-all duration-500 motion-reduce:transition-none',
            isComplete ? 'bg-mint-500' : 'bg-ice-500',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* 미납 — 컬러 박스 제거, 위험색 텍스트 + 작은 아이콘 */}
      {team.unpaidMembers > 0 && (
        <p className="mt-3 inline-flex items-center gap-1 text-card-meta font-semibold text-flame-500">
          <Icon name="error" className="text-[14px]" aria-hidden="true" />
          미납 {team.unpaidMembers}명
        </p>
      )}
    </article>
  );
}

function UnpaidMemberCard({ member, index = 0 }: { member: UnpaidMember; index?: number }) {
  return (
    <article
      className="animate-slide-up rounded-w-lg border border-wline-2 bg-wsurface p-4 shadow-sh-1 motion-reduce:animate-none dark:border-rink-700 dark:bg-rink-800"
      style={{ animationDelay: staggerDelay(index) }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-w-pill bg-flame-100 dark:bg-flame-500/15">
            <Icon name="person" className="text-xl text-flame-500" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-card-title text-wtext-1 truncate dark:text-white">{member.name}</h4>
            <p className="text-card-meta text-wtext-3 truncate dark:text-wtext-4">{member.teamName}</p>
            <p className="mt-1.5">
              {member.overdueDays > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-w-sm bg-flame-100 px-1.5 py-0.5 text-card-meta font-bold text-flame-500 dark:bg-flame-500/15">
                  <Icon name="schedule" className="text-[11px]" aria-hidden="true" />
                  {member.overdueDays}일 연체
                </span>
              ) : (
                <span className="text-card-meta text-wtext-3 dark:text-wtext-4">
                  마감 {member.dueDate.slice(5).replace('-', '/')}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-card-meta font-medium text-wtext-3 dark:text-wtext-4">미납액</p>
          <p className="mt-0.5 text-card-emphasis font-extrabold text-flame-500 tabular-nums">
            {formatCurrency(member.amount)}
            <span className="ml-0.5 text-card-meta font-medium">원</span>
          </p>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-w-md bg-ice-500 text-card-body font-bold text-white transition-colors hover:bg-ice-600 active:brightness-[0.98] motion-reduce:transition-none"
        >
          알림 발송
        </button>
        <button
          type="button"
          className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-w-md border border-wline-2 text-card-body font-bold text-wtext-2 transition-colors hover:bg-wline-2/40 active:brightness-[0.98] motion-reduce:transition-none dark:border-rink-700 dark:text-wtext-4 dark:hover:bg-rink-700"
        >
          상세 보기
        </button>
      </div>
    </article>
  );
}
