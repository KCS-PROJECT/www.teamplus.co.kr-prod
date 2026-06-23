'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useNavigation } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { fetchMatchDetail, incrementMatchView } from '@/services/matches-api';
import { openShareSheet } from '@/lib/share';
import { MESSAGES } from '@/lib/messages';
import { usePageReady } from '@/hooks/usePageReady';
import { useMatchPermissions } from '@/hooks/useMatchPermissions';
import {
  MatchVSCard,
  MatchStatusBadge,
  MatchInfoRow,
  MatchProgressBar,
  MatchErrorState,
  type MatchStatus,
  type TeamInfo,
} from '@/components/match';
import type { MatchDetail as ApiMatchDetail } from '@/types/match';

// ── 뷰 모델 ───────────────────────────────────────────────
interface MatchViewData {
  id: string;
  status: MatchStatus;
  title: string;
  venue: string;
  date: string;
  scheduledAt: string;
  homeTeam: TeamInfo;
  awayTeam: TeamInfo;
  price: number;
  currentParticipants: number;
  maxParticipants: number;
  levelRequirement: string;
  rules: string[];
  manager: { id: string; username: string | null };
  rinkName: string;
  rinkAddress: string;
}

type DetailTab = 'info' | 'roster' | 'venue';

// ── 데이터 변환 ─────────────────────────────────────────────
function toMatchStatus(raw: string): MatchStatus {
  if (raw === 'closing_soon' || raw === 'closed' || raw === 'cancelled') {
    return raw;
  }
  return 'recruiting';
}

function transformMatch(api: ApiMatchDetail): MatchViewData {
  const dt = new Date(api.scheduledAt);
  const dateStr = dt
    .toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
    })
    .replace(/\. /g, '.')
    .replace(/\.$/, '');
  const timeStr = dt.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const managerName = api.manager.name || MESSAGES.match.detail.managerFallback;

  return {
    id: api.id,
    status: toMatchStatus(api.status),
    title: api.title,
    venue: api.rinkVenueInfo ?? api.rinkName,
    date: `${dateStr} ${timeStr}`,
    scheduledAt: api.scheduledAt,
    homeTeam: { name: api.homeTeamName ?? MESSAGES.match.detail.homeTeam, role: 'HOME' },
    awayTeam: { name: api.awayTeamName ?? MESSAGES.match.detail.awayTeam, role: 'AWAY' },
    price: api.price,
    currentParticipants: api.currentParticipants ?? api.approvedCount ?? 0,
    maxParticipants: api.maxParticipants,
    levelRequirement: api.levelCode ? `${api.level} (${api.levelCode})` : api.level,
    rules: Array.isArray(api.rules) ? api.rules : [],
    manager: { id: api.manager.id, username: managerName },
    rinkName: api.rinkName,
    rinkAddress: api.rinkAddress ?? '',
  };
}

// ── 섹션 타이틀 내부 컴포넌트 ───────────────────────────────
function SectionTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-ice-500 text-card-title">
        <Icon name={icon} className="text-card-title" />
      </span>
      <h2 className="text-card-emphasis font-bold text-wtext-1 dark:text-white">{title}</h2>
    </div>
  );
}

// ── 메인 ────────────────────────────────────────────────────
export default function MatchDetailPage() {
  const { navigate, back } = useNavigation();
  const params = useParams();
  const matchId = (params?.id as string) ?? '';

  const [match, setMatch] = useState<MatchViewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('info');

  const permissions = useMatchPermissions({
    matchManagerId: match?.manager.id ?? null,
  });

  const loadMatch = useCallback(async () => {
    if (!matchId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchMatchDetail(matchId);
      setMatch(transformMatch(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : MESSAGES.error.general);
    } finally {
      setIsLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    void loadMatch();
  }, [loadMatch]);

  // 상세 진입 시 viewCount 증가 (멱등성: 백엔드에서 1일 1회 제한)
  useEffect(() => {
    if (!matchId) return;
    // best-effort: 조회수는 실패해도 사용자 경험에 영향 없음
    incrementMatchView(matchId).catch(() => {});
  }, [matchId]);

  const handleShare = () => {
    if (!match) return;
    openShareSheet({
      title: match.title,
      text: `${match.date} ${match.venue}`,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
    });
  };

  const handleApply = () => {
    if (!permissions.isAuthenticated) {
      navigate('/login');
      return;
    }
    navigate(`/matches/${matchId}/payment`);
  };

  const handleViewRoster = () => navigate(`/matches/${matchId}/roster`);
  const handleManageApplicants = () => navigate(`/matches/${matchId}/applicants`);

  // ── 로딩 상태 ──
  if (isLoading) {
    return (
      <MobileContainer hasBottomNav={false}>
        <PageAppBar title={MESSAGES.match.detail.title} onBack={() => back()} forceNative />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-ice-500 border-t-transparent rounded-w-pill animate-spin motion-reduce:animate-none" />
        </div>
      </MobileContainer>
    );
  }

  // ── 에러 상태 ──
  if (error || !match) {
    return (
      <MobileContainer hasBottomNav={false}>
        <PageAppBar title={MESSAGES.match.detail.title} onBack={() => back()} forceNative />
        <MatchErrorState
          message={error ?? MESSAGES.error.general}
          onRetry={() => void loadMatch()}
        />
      </MobileContainer>
    );
  }

  const remainingSlots = Math.max(0, match.maxParticipants - match.currentParticipants);
  const isClosed = match.status === 'closed' || match.status === 'cancelled';

  return (
    <MobileContainer hasBottomNav={false} className="pb-0">
      {/* [appbar-harness-v4 §3 분류 A] extraActions 단독 사용 — PageAppBar SoT 가
          [...extras] + [☰] 패턴을 자동 적용 (시계/종 redundancy 제거).
          showTimeline/showMy 명시적 false 코드 정리 (extraActions branch 가 이미 hide). */}
      <PageAppBar
        title={MESSAGES.match.detail.title}
        onBack={() => back()}
        forceNative
        extraActions={[
          {
            icon: 'ios_share',
            label: MESSAGES.match.detail.shareAriaLabel,
            onClick: handleShare,
          },
        ]}
      />

      <main className="flex-1 overflow-y-auto pb-30">
        {/* 상단 상태 배지 */}
        <div className="flex justify-center pt-5 px-6">
          <MatchStatusBadge status={match.status} />
        </div>

        {/* VS 카드 (MatchVSCard - Phase 2-B) */}
        <div className="px-4 mt-4 mb-5">
          <MatchVSCard
            homeTeamName={match.homeTeam.name}
            awayTeamName={match.awayTeam.name}
            scheduledAt={match.scheduledAt}
            rinkName={match.rinkName}
          />
        </div>

        {/* 탭 네비게이션 */}
        <div className="px-4 mb-4 sticky top-0 z-10 bg-white dark:bg-rink-900 pt-2 pb-2">
          <div
            role="tablist"
            aria-label={MESSAGES.match.detail.applicantsLabelAria}
            className="flex items-center bg-wline-2 dark:bg-rink-800 rounded-xl p-1"
          >
            {([
              { value: 'info', label: MESSAGES.match.detail.tabs.info },
              { value: 'roster', label: MESSAGES.match.detail.tabs.roster },
              { value: 'venue', label: MESSAGES.match.detail.tabs.venue },
            ] as const).map((tab) => (
              <button
                key={tab.value}
                role="tab"
                type="button"
                aria-selected={activeTab === tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`flex-1 h-10 rounded-lg text-card-body font-bold transition-colors motion-reduce:transition-none ${
                  activeTab === tab.value
                    ? 'bg-white dark:bg-rink-900 text-ice-500 shadow-sm'
                    : 'text-wtext-3 dark:text-rink-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* 탭 컨텐츠: 경기 정보 */}
        {activeTab === 'info' && (
          <>
            <section className="px-6 mb-6">
              <SectionTitle icon="info" title={MESSAGES.match.detail.tabs.info} />
              <div className="bg-white dark:bg-rink-800 rounded-2xl border border-wline-2 dark:border-rink-700 overflow-hidden">
                <MatchInfoRow
                  icon="payments"
                  label={MESSAGES.match.detail.infoLabels.price}
                  value={`${match.price.toLocaleString()}원`}
                  emphasize
                />
                <MatchInfoRow
                  icon="group"
                  label={MESSAGES.match.detail.infoLabels.participants}
                  value={
                    <>
                      <span className="font-bold">
                        {MESSAGES.match.detail.participantCount(
                          match.currentParticipants
                        )}
                      </span>
                      <span className="text-wtext-3 dark:text-rink-300">
                        {' '}/ {MESSAGES.match.detail.participantCount(
                          match.maxParticipants
                        )}
                      </span>
                    </>
                  }
                />
                <MatchInfoRow
                  icon="leaderboard"
                  label={MESSAGES.match.detail.infoLabels.levelLimit}
                  value={match.levelRequirement}
                  last
                />
              </div>
            </section>

            {/* 경기 규칙 */}
            {match.rules.length > 0 && (
              <section className="px-6 mb-6">
                <SectionTitle icon="gavel" title={MESSAGES.match.detail.rules} />
                <ul className="bg-white dark:bg-rink-800 rounded-2xl border border-wline-2 dark:border-rink-700 p-5 space-y-3">
                  {match.rules.map((rule, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-3 text-card-body text-wtext-2 dark:text-rink-100 leading-relaxed"
                    >
                      <span className="w-1.5 h-1.5 rounded-w-pill bg-ice-500 mt-2 shrink-0" />
                      {rule}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* 매니저 정보 */}
            <section className="px-6 mb-6">
              <SectionTitle icon="person" title={MESSAGES.match.detail.manager} />
              <div className="bg-white dark:bg-rink-800 rounded-2xl border border-wline-2 dark:border-rink-700 p-5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-w-pill bg-wline dark:bg-rink-700 flex items-center justify-center">
                    <Icon name="person" className="text-wtext-3 text-2xl" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-card-body text-wtext-1 dark:text-white">
                      {match.manager.username ?? MESSAGES.match.detail.managerFallback}
                    </p>
                    <p className="text-card-meta text-wtext-3 dark:text-rink-300 truncate">
                      {MESSAGES.match.detail.inquiry}
                    </p>
                  </div>
                  {permissions.canManage && (
                    <button
                      type="button"
                      onClick={() => navigate(`/matches/${matchId}/edit`)}
                      aria-label={MESSAGES.match.detail.editAriaLabel}
                      className="shrink-0 px-3 py-2 text-card-meta font-bold border border-ice-500 rounded-lg text-ice-500 hover:bg-ice-500/5 transition-colors motion-reduce:transition-none"
                    >
                      {MESSAGES.match.detail.editBtn}
                    </button>
                  )}
                </div>
              </div>
            </section>
          </>
        )}

        {/* 탭 컨텐츠: 참여 명단 */}
        {activeTab === 'roster' && (
          <section className="px-6 mb-6">
            <SectionTitle icon="groups" title={MESSAGES.match.detail.tabs.roster} />
            <div className="bg-white dark:bg-rink-800 rounded-2xl border border-wline-2 dark:border-rink-700 p-6">
              <MatchProgressBar
                current={match.currentParticipants}
                total={match.maxParticipants}
                showRemaining
              />
              <button
                type="button"
                onClick={handleViewRoster}
                className="mt-4 w-full h-11 rounded-xl border border-wline dark:border-rink-700 text-card-body font-bold text-ice-500 hover:bg-ice-500/5 transition-colors motion-reduce:transition-none"
              >
                {MESSAGES.match.detail.viewAll}
              </button>
            </div>
          </section>
        )}

        {/* 탭 컨텐츠: 장소 안내 */}
        {activeTab === 'venue' && (
          <section className="px-6 mb-6">
            <SectionTitle
              icon="location_on"
              title={MESSAGES.match.detail.tabs.venue}
            />
            <div className="bg-white dark:bg-rink-800 rounded-2xl border border-wline-2 dark:border-rink-700 overflow-hidden">
              <div className="w-full h-40 bg-wline-2 dark:bg-rink-700 flex items-center justify-center">
                <Icon name="map" className="text-wtext-4 dark:text-rink-300 text-6xl" />
              </div>
              <div className="p-5">
                <p className="text-card-emphasis font-bold text-wtext-1 dark:text-white mb-1">
                  {match.rinkName}
                </p>
                {match.rinkAddress && (
                  <p className="text-card-body text-wtext-3 dark:text-rink-300 mb-4">
                    {match.rinkAddress}
                  </p>
                )}
                <div className="flex gap-3">
                  <button
                    type="button"
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-card-body font-medium text-wtext-2 dark:text-rink-100 border border-wline dark:border-rink-700 rounded-lg hover:bg-wbg dark:hover:bg-rink-700 active:brightness-95 transition-colors motion-reduce:transition-none"
                  >
                    <Icon name="map" className="text-card-emphasis" />
                    {MESSAGES.match.detail.openMap}
                  </button>
                  <button
                    type="button"
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-card-body font-medium text-wtext-2 dark:text-rink-100 border border-wline dark:border-rink-700 rounded-lg hover:bg-wbg dark:hover:bg-rink-700 active:brightness-95 transition-colors motion-reduce:transition-none"
                  >
                    <Icon name="local_parking" className="text-card-emphasis" />
                    {MESSAGES.match.detail.parking}
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* 하단 CTA — 역할 기반 3분기 (manage / apply / view) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-rink-900 border-t border-wline dark:border-rink-700 z-50">
        <div className="px-5 py-3 w-full max-w-md mx-auto">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-card-body text-wtext-3 dark:text-rink-300">
              {isClosed
                ? MESSAGES.match.detail.closedNotice
                : MESSAGES.match.detail.spotsLeft(remainingSlots)}
            </span>
            <button
              type="button"
              className="text-card-meta text-wtext-3 dark:text-rink-300 underline"
            >
              {MESSAGES.match.detail.refundPolicy}
            </button>
          </div>

          {permissions.canManage ? (
            <button
              type="button"
              onClick={handleManageApplicants}
              className="w-full h-14 bg-ice-500 hover:bg-ice-700 active:brightness-95 text-white text-card-emphasis font-bold rounded-xl transition-colors motion-reduce:transition-none flex items-center justify-center gap-2"
            >
              <Icon name="manage_accounts" className="text-xl" />
              {MESSAGES.match.detail.manage}
            </button>
          ) : permissions.isViewer && !permissions.canApply ? (
            <button
              type="button"
              onClick={handleViewRoster}
              className="w-full h-14 bg-ice-500 hover:bg-ice-700 active:brightness-95 text-white text-card-emphasis font-bold rounded-xl transition-colors motion-reduce:transition-none flex items-center justify-center gap-2"
            >
              <Icon name="groups" className="text-xl" />
              {MESSAGES.match.detail.view}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleApply}
              disabled={isClosed}
              className="w-full h-14 bg-ice-500 hover:bg-ice-700 active:brightness-95 disabled:bg-wline dark:disabled:bg-rink-700 disabled:text-wtext-3 text-white text-card-emphasis font-bold rounded-xl transition-colors motion-reduce:transition-none"
            >
              {!permissions.isAuthenticated
                ? MESSAGES.match.detail.loginRequired
                : isClosed
                  ? MESSAGES.match.detail.closedLabel
                  : MESSAGES.match.detail.apply}
            </button>
          )}
        </div>
      </div>
    </MobileContainer>
  );
}
