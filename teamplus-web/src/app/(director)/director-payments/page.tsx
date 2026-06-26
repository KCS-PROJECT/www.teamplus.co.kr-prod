'use client';

import { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';
import {
  getDirectorPaymentSummary,
  type DirectorPaymentSummary as PaymentSummary,
  type DirectorTeamPayment as TeamPayment,
  type DirectorUnpaidMember as UnpaidMember,
} from '@/services/payment';

// ─── Types ──────────────────────────────────────────
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
      const result = await getDirectorPaymentSummary();
      setSummary(result.summary);
      setTeams(result.teams);
      setUnpaidMembers(result.unpaidMembers);
    } catch (err) {
      // 서비스가 실패 시 빈 구조를 반환하므로 여기는 예기치 못한 예외 방어용 — 빈 상태 유지.
      console.error(MESSAGES.common.loadFailed, err);
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

  // [추가 2026-05-15 V04 J-2] 단일 팀(teams.length <= 1) 환경에서 "팀별 결제" 탭은
  //   의미가 없으므로 노출하지 않는다. activeTab 이 'teams' 상태였다면 'overview' 로 복귀.
  const showTeamsTab = teams.length > 1;
  useEffect(() => {
    if (!showTeamsTab && activeTab === 'teams') {
      setActiveTab('overview');
    }
  }, [showTeamsTab, activeTab]);

  if (isLoading || !summary) return null;

  // [수정 2026-05-15 V04 J-2] showTeamsTab=false 면 '팀별 결제' 탭 제외.
  const tabs: { key: TabType; label: string }[] = [
    { key: 'overview', label: '전체 현황' },
    ...(showTeamsTab ? [{ key: 'teams' as TabType, label: '팀별 결제' }] : []),
    { key: 'unpaid', label: `미수금 ${summary.unpaidCount}` },
  ];

  const hasUnpaid = summary.unpaid > 0;
  const hasUnpaidMembers = summary.unpaidCount > 0;

  return (
    <MobileContainer hasBottomNav={showWebUI}>
      {showWebUI && <PageAppBar title="결제 관리" forceNative />}

      <main className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck" role="main" aria-label="감독 결제 관리">
        {/* ── 결제 요약 — navy 밴드 Hero (ICETIMES flat, full-bleed 카드 박스 제거) ──────── */}
        <section className="animate-fade-in bg-it-blue-800 px-5 pb-[22px] pt-5 motion-reduce:animate-none dark:bg-it-blue-900">
          {/* 상단 라벨 + 월 칩 */}
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/70">
              결제 요약
            </p>
            <span className="rounded-w-pill bg-white/12 px-2.5 py-1 text-[12px] font-bold text-white">
              {new Date().getMonth() + 1}월
            </span>
          </div>

          {/* 총 수입 — 단일 히어로 숫자 */}
          <div className="mt-3.5">
            <p className="text-[12.5px] text-white/70">총 수입</p>
            <p className="mt-[3px] text-[34px] font-extrabold leading-none tracking-tight text-white tabular-nums">
              {formatCurrency(summary.totalRevenue)}
              <span className="ml-1 text-w-body font-semibold text-white/70">원</span>
            </p>
          </div>

          {/* 미수금 / 정산 예정 — 정의형 2열 (반투명 라인 구분) */}
          <div className="mt-4 grid grid-cols-2 gap-6 border-t border-white/15 pt-3.5">
            <div>
              <p className="text-[12px] text-white/70">미수금</p>
              <p
                className={cn(
                  'mt-[3px] text-[17px] font-extrabold tabular-nums',
                  hasUnpaid ? 'text-[#ff9c8c]' : 'text-white',
                )}
              >
                {formatCurrency(summary.unpaid)}
                <span className="ml-0.5 text-[12px] font-medium text-white/70">원</span>
              </p>
            </div>
            <div>
              <p className="text-[12px] text-white/70">정산 예정</p>
              <p className="mt-[3px] text-[17px] font-extrabold text-white tabular-nums">
                {formatCurrency(summary.pendingSettlement)}
                <span className="ml-0.5 text-[12px] font-medium text-white/70">원</span>
              </p>
            </div>
          </div>

          {/* 결제 완료 / 미납 — 닷 제거, 숫자 위계로 */}
          <div className="mt-3.5 flex items-center gap-5 border-t border-white/15 pt-3 text-[12.5px]">
            <span className="text-white/70">
              결제 완료{' '}
              <strong className="font-bold text-white tabular-nums">{summary.completedCount}명</strong>
            </span>
            <span className={hasUnpaidMembers ? 'text-[#ff9c8c]' : 'text-white/70'}>
              미납{' '}
              <strong className={cn('font-bold tabular-nums', !hasUnpaidMembers && 'text-white')}>
                {summary.unpaidCount}명
              </strong>
            </span>
          </div>
        </section>

        {/* flat 섹션 사이 8px 회색 갭 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* ── 탭 — 시안 SegmentedTabs(밑줄형, flat 흰 섹션) ──────────────────────── */}
        <div className="bg-it-surface dark:bg-rink-800">
          <div
            role="tablist"
            aria-label="결제 현황 필터"
            className="flex border-b border-it-line dark:border-rink-700"
          >
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
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    'relative flex-1 px-1 pb-[13px] pt-[14px] text-[15px] tracking-[-0.01em] transition-colors duration-200 motion-reduce:transition-none',
                    isActive
                      ? 'font-extrabold text-it-blue-600 dark:text-white'
                      : 'font-semibold text-it-ink-500 hover:text-it-ink-800 dark:text-wtext-4 dark:hover:text-white',
                  )}
                >
                  {tab.label}
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute inset-x-0 -bottom-px h-[2.5px] rounded-sm',
                      isActive ? 'bg-it-blue-500' : 'bg-transparent',
                    )}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* ── 탭 컨텐츠 ─────────────────────────────────────────────────── */}
        <div className="pb-30">
          {activeTab === 'overview' && (
            <div
              role="tabpanel"
              id="director-payments-panel-overview"
              aria-labelledby="director-payments-tab-overview"
            >
              {/* 결제 유형별 현황 — flat 흰 섹션 (단일 blue 액센트) */}
              <section className="bg-it-surface px-5 py-5 dark:bg-rink-800">
                <h3 className="mb-4 text-[15px] font-extrabold text-it-ink-800 dark:text-white">결제 유형별 현황</h3>
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

                {/* 최근 정산 내역 — hairline 구분, mock 제거(실데이터 기준 빈 상태) */}
                <div className="mt-5 border-t border-it-line pt-4 dark:border-rink-700">
                  <h3 className="text-[15px] font-extrabold text-it-ink-800 dark:text-white">최근 정산 내역</h3>
                  <p className="mt-1 text-[13px] text-it-ink-500 dark:text-wtext-4">
                    정산이 완료되면 이곳에 표시됩니다.
                  </p>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'teams' && (
            <section
              role="tabpanel"
              id="director-payments-panel-teams"
              aria-labelledby="director-payments-tab-teams"
              className="bg-it-surface px-5 dark:bg-rink-800"
            >
              {teams.map((team, i) => (
                <TeamPaymentCard key={team.id} team={team} index={i} last={i === teams.length - 1} />
              ))}
            </section>
          )}

          {activeTab === 'unpaid' && (
            <section
              role="tabpanel"
              id="director-payments-panel-unpaid"
              aria-labelledby="director-payments-tab-unpaid"
              className="bg-it-surface px-5 dark:bg-rink-800"
            >
              {unpaidMembers.length > 0 ? (
                unpaidMembers.map((member, i) => (
                  <UnpaidMemberCard key={member.id} member={member} index={i} last={i === unpaidMembers.length - 1} />
                ))
              ) : (
                <div
                  className="flex flex-col items-center gap-2.5 py-12"
                  role="status"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-w-pill bg-mint-100 dark:bg-mint-500/15">
                    <Icon name="check_circle" className="text-2xl text-mint-500" aria-hidden="true" />
                  </div>
                  <p className="text-card-body text-it-ink-700 dark:text-wtext-4">미수금이 없습니다.</p>
                </div>
              )}
            </section>
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
        <span className="text-[14.5px] font-medium text-it-ink-700 dark:text-wtext-4">{label}</span>
        <span className="text-[13px] font-bold text-it-ink-800 tabular-nums dark:text-white">
          {count}/{total}명 · {pct}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} ${pct}퍼센트`}
        className="h-1.5 overflow-hidden rounded-w-pill bg-it-line dark:bg-rink-700"
      >
        <div
          className={cn(
            'h-full rounded-w-pill transition-all duration-700 motion-reduce:transition-none',
            muted ? 'bg-it-blue-300' : 'bg-it-blue-500',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function TeamPaymentCard({ team, index = 0, last }: { team: TeamPayment; index?: number; last?: boolean }) {
  const pct = team.totalMembers > 0 ? Math.round((team.paidMembers / team.totalMembers) * 100) : 0;
  const feeLabel = team.feeType === 'MONTHLY_FIXED' ? '정기권' : '횟수제';
  const timingLabel = team.billingTiming === 'PREPAID' ? '선결제' : '후결제';
  const isComplete = pct === 100;

  return (
    <article
      className={cn(
        'animate-slide-up py-[14px] motion-reduce:animate-none',
        !last && 'border-b border-it-line dark:border-rink-700',
      )}
      style={{ animationDelay: staggerDelay(index) }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold text-it-ink-800 truncate dark:text-white">{team.teamName}</h3>
          {/* 칩 → muted 텍스트 한 줄 (가운뎃점 구분) */}
          <p className="mt-0.5 text-[13px] text-it-ink-500 dark:text-wtext-4">
            {feeLabel} · {timingLabel}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-card-emphasis font-bold text-it-ink-800 tabular-nums dark:text-white">
            {formatCurrency(team.paidAmount)}
            <span className="ml-0.5 text-card-meta font-medium text-it-ink-400">원</span>
          </p>
          <p className="text-card-meta text-it-ink-400 tabular-nums dark:text-wtext-4">
            / {formatCurrency(team.totalAmount)}원
          </p>
        </div>
      </div>

      {/* 진행률 바 */}
      <div className="mt-4 mb-1.5 flex items-center justify-between">
        <span className="text-card-meta font-semibold text-it-ink-500 dark:text-wtext-4">납부율</span>
        <span
          className={cn(
            'text-card-meta font-bold tabular-nums',
            isComplete ? 'text-mint-500' : 'text-it-blue-600',
          )}
        >
          {team.paidMembers}
          <span className="font-medium text-it-ink-400 dark:text-wtext-4">/{team.totalMembers}명</span>
          <span className="ml-1.5">{pct}%</span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${team.teamName} 납부율 ${pct}퍼센트`}
        className="h-1.5 overflow-hidden rounded-w-pill bg-it-line dark:bg-rink-700"
      >
        <div
          className={cn(
            'h-full rounded-w-pill transition-all duration-500 motion-reduce:transition-none',
            isComplete ? 'bg-mint-500' : 'bg-it-blue-500',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* 미납 — 컬러 박스 제거, 위험색 텍스트 + 작은 아이콘 */}
      {team.unpaidMembers > 0 && (
        <p className="mt-3 inline-flex items-center gap-1 text-card-meta font-semibold text-it-red-500">
          <Icon name="error" className="text-[14px]" aria-hidden="true" />
          미납 {team.unpaidMembers}명
        </p>
      )}
    </article>
  );
}

function UnpaidMemberCard({ member, index = 0, last }: { member: UnpaidMember; index?: number; last?: boolean }) {
  const billingLabel = member.billingType === 'POSTPAID' ? '후결제' : '선결제';
  return (
    <article
      className={cn(
        'animate-slide-up py-[14px] motion-reduce:animate-none',
        !last && 'border-b border-it-line dark:border-rink-700',
      )}
      style={{ animationDelay: staggerDelay(index) }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {/* 시안 Avatar(red tone, 이니셜) — 44px */}
          <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-w-pill bg-it-red-50 dark:bg-it-red-500/15">
            <span className="text-[18px] font-bold text-it-red-600 dark:text-it-red-300">
              {member.name?.charAt(0) || '?'}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-[15px] font-bold text-it-ink-800 truncate dark:text-white">{member.name}</h4>
            <p className="text-[12.5px] text-it-ink-500 truncate dark:text-wtext-4">{member.teamName}</p>
            <div className="mt-1.5">
              <span className="inline-flex items-center rounded-w-sm bg-it-blue-50 px-1.5 py-0.5 text-[11.5px] font-bold text-it-blue-600 dark:bg-it-blue-900/30 dark:text-it-blue-300">
                {billingLabel}
              </span>
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11.5px] font-medium text-it-ink-400 dark:text-wtext-4">미납액</p>
          <p className="mt-0.5 text-[16px] font-extrabold text-it-red-600 tabular-nums">
            {formatCurrency(member.amount)}
            <span className="ml-0.5 text-[12px] font-medium">원</span>
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="inline-flex h-[38px] flex-1 items-center justify-center rounded-w-sm bg-it-blue-500 text-[14px] font-bold text-white transition-colors hover:bg-it-blue-600 active:brightness-[0.98] motion-reduce:transition-none"
        >
          알림 발송
        </button>
        <button
          type="button"
          className="inline-flex h-[38px] flex-1 items-center justify-center rounded-w-sm border-[1.5px] border-it-line-strong text-[14px] font-bold text-it-blue-600 transition-colors hover:bg-it-fill active:brightness-[0.98] motion-reduce:transition-none dark:border-rink-700 dark:text-wtext-4 dark:hover:bg-rink-700"
        >
          상세 보기
        </button>
      </div>
    </article>
  );
}
