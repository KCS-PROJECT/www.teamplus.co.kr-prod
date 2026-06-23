'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useNavigation } from '@/components/ui/NavLink';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { fetchMatchRoster } from '@/services/matches-api';
import { MESSAGES } from '@/lib/messages';
import { usePageReady } from '@/hooks/usePageReady';
import { useMatchPermissions } from '@/hooks/useMatchPermissions';
import {
  MatchParticipantRow,
  MatchProgressBar,
  MatchVSCard,
  MatchErrorState,
} from '@/components/match';
import type { MatchRoster } from '@/types/match';

// ── 페이지 ──────────────────────────────────────────────────
export default function MatchRosterPage() {
  const params = useParams();
  const matchId = (params?.id as string) ?? '';
  const { back, navigate } = useNavigation();

  const [data, setData] = useState<MatchRoster | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [error, setError] = useState<string | null>(null);

  // roster는 비로그인도 열람 가능하지만, 관리 버튼을 위해 권한 체크
  const permissions = useMatchPermissions();

  const loadRoster = useCallback(async () => {
    if (!matchId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchMatchRoster(matchId);
      setData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : MESSAGES.error.network);
    } finally {
      setIsLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  if (isLoading) {
    return (
      <MobileContainer hasBottomNav={false}>
        <PageAppBar title={MESSAGES.match.roster.title} onBack={() => back()} forceNative />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-ice-500 border-t-transparent rounded-w-pill animate-spin motion-reduce:animate-none" />
        </div>
      </MobileContainer>
    );
  }

  if (error || !data) {
    return (
      <MobileContainer hasBottomNav={false}>
        <PageAppBar title={MESSAGES.match.roster.title} onBack={() => back()} forceNative />
        <MatchErrorState
          message={error ?? MESSAGES.error.general}
          onRetry={() => void loadRoster()}
        />
      </MobileContainer>
    );
  }

  return (
    <MobileContainer hasBottomNav={false}>
      {/* [appbar-harness-v4 §3 분류 A] canManage 일 때만 extraActions, 그렇지 않으면
          순수 기본 (시계/종/메뉴 3 액션). showTimeline/showMy redundancy 제거. */}
      <PageAppBar
        title={MESSAGES.match.roster.title}
        onBack={() => back()}
        forceNative
        extraActions={
          permissions.canManage
            ? [
                {
                  icon: 'manage_accounts',
                  label: MESSAGES.match.roster.manageAriaLabel,
                  onClick: () => navigate(`/matches/${matchId}/applicants`),
                },
              ]
            : undefined
        }
      />

      <main className="flex-1 overflow-y-auto pb-30">
        {/* VS 카드 (scheduledAt 있을 때) */}
        {data.scheduledAt && data.rinkName && (
          <div className="px-4 pt-4">
            <MatchVSCard
              homeTeamName={data.homeTeamName ?? null}
              awayTeamName={data.awayTeamName ?? null}
              scheduledAt={data.scheduledAt}
              rinkName={data.rinkName}
            />
          </div>
        )}

        {/* 참여 현황 + 진행률 */}
        <section className="p-4">
          <div className="bg-white dark:bg-rink-800 rounded-2xl p-5 border border-wline-2 dark:border-rink-700">
            <p className="text-card-meta font-bold text-wtext-3 dark:text-rink-300 uppercase tracking-wider mb-1">
              {MESSAGES.match.roster.current}
            </p>
            <h1 className="text-card-emphasis font-bold text-wtext-1 dark:text-white mb-4">
              {data.matchTitle}
            </h1>
            <MatchProgressBar
              current={data.currentCount}
              total={data.totalSlots}
              showRemaining
            />
          </div>
        </section>

        {/* 확정 섹션 */}
        <section className="px-4 pb-4">
          <h2 className="flex items-center gap-2 text-card-body font-bold text-wtext-3 dark:text-rink-300 uppercase tracking-wider mb-3">
            {MESSAGES.match.roster.confirmed}
            <span className="inline-flex items-center px-2 py-0.5 rounded-w-pill bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[11px] font-bold normal-case tracking-normal">
              {MESSAGES.match.roster.countLabel(data.confirmedPlayers.length)}
            </span>
          </h2>
          <div className="space-y-3">
            {data.confirmedPlayers.length === 0 && (
              <div className="bg-white dark:bg-rink-800 rounded-2xl p-5 border border-wline dark:border-rink-700 text-center text-card-body text-wtext-3">
                {MESSAGES.match.roster.empty}
              </div>
            )}
            {data.confirmedPlayers.map((player) => (
              <MatchParticipantRow
                key={player.id}
                data={{
                  id: player.id,
                  name: player.name,
                  position: player.position ?? '',
                  level: player.level ?? undefined,
                  isHost: player.isHost,
                  order: player.order,
                }}
              />
            ))}
          </div>
        </section>

        {/* 대기 섹션 */}
        {data.waitlistPlayers.length > 0 && (
          <section className="px-4 pb-4">
            <h2 className="flex items-center gap-2 text-card-body font-bold text-wtext-3 dark:text-rink-300 uppercase tracking-wider mb-3">
              {MESSAGES.match.roster.waiting}
              <span className="inline-flex items-center px-2 py-0.5 rounded-w-pill bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[11px] font-bold normal-case tracking-normal">
                {MESSAGES.match.roster.countLabel(data.waitlistPlayers.length)}
              </span>
            </h2>
            <div className="space-y-3">
              {data.waitlistPlayers.map((player) => (
                <MatchParticipantRow
                  key={player.id}
                  data={{
                    id: player.id,
                    name: player.name,
                    position: player.position ?? '',
                    level: player.level ?? undefined,
                    order: player.waitNumber,
                    isWaitlist: true,
                  }}
                />
              ))}
            </div>
          </section>
        )}
      </main>
    </MobileContainer>
  );
}
