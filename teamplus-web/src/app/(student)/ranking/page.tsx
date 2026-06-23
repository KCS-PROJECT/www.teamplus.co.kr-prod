'use client';

import { useState, useEffect, useCallback } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { SubmainAppBar } from '@/components/layout/SubmainAppBar';
import { Icon } from '@/components/ui/Icon';
import { apiRequest } from '@/services/api-client';
import { cn } from '@/lib/utils';

import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
interface TeamMember {
  id: string;
  playerName: string;
  playerLevel: string;
  approvalStatus: string;
}

interface MyRanking {
  currentRank: number;
  totalUsers: number;
  score: number;
  clubId: string | null;
}

const LEVEL_ORDER: Record<string, number> = { S: 0, A: 1, B: 2, C: 3, D: 4 };
const LEVEL_COLOR: Record<string, string> = {
  S: 'bg-ice-500/10 text-ice-500',
  A: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  B: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  C: 'bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-rink-100',
  D: 'bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-rink-300',
};

export default function RankingPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [myRanking, setMyRanking] = useState<MyRanking | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 공통 SubmainAppBar 사용 — Flutter 네이티브 AppBar 비활성화 (중복 헤더 방지)
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
    appBarTitle: '팀 랭킹',
  });

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  const fetchRanking = useCallback(async () => {
    setIsLoading(true);
    try {
      // 내 랭킹 + 팀 목록 병렬 조회
      const [rankRes, listRes] = await Promise.all([
        apiRequest<MyRanking>({ method: 'GET', url: '/users/me/ranking', retry: false }),
        apiRequest<Array<{ id: string }>>({ method: 'GET', url: '/teams/my/list', retry: false }),
      ]);

      if (rankRes.success && rankRes.data) {
        setMyRanking(rankRes.data);
      }

      if (!listRes.success || !listRes.data?.length) return;
      const clubId = listRes.data[0].id;

      const membersRes = await apiRequest<TeamMember[]>({
        method: 'GET',
        url: `/teams/${clubId}/members`,
        retry: false,
      });
      if (membersRes.success && Array.isArray(membersRes.data)) {
        const approved = membersRes.data
          .filter((m) => m.approvalStatus === 'approved')
          .sort((a, b) => (LEVEL_ORDER[a.playerLevel] ?? 9) - (LEVEL_ORDER[b.playerLevel] ?? 9));
        setMembers(approved);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchRanking(); }, [fetchRanking]);

  const percentile = myRanking && myRanking.totalUsers > 0
    ? Math.round((1 - (myRanking.currentRank - 1) / myRanking.totalUsers) * 100)
    : null;

  const topThree = members.slice(0, 3);
  const rest = members.slice(3);

  return (
    <MobileContainer hasBottomNav>
      <SubmainAppBar title="팀 랭킹" />
      <main className="flex-1 overflow-y-auto px-5 py-6 pb-30" role="main" aria-label="랭킹">
        {/* 내 랭킹 통계 카드 */}
        {isLoading ? null : myRanking ? (
          <div className="mb-6 rounded-2xl border border-ice-500/20 bg-white p-5 shadow-sm dark:border-ice-500/30 dark:bg-rink-800">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ice-500/10">
                  <Icon name="person" className="text-card-title text-ice-500" filled aria-hidden="true" />
                </div>
                <p className="text-card-meta font-bold uppercase tracking-wider text-wtext-3 dark:text-rink-300">내 랭킹</p>
              </div>
              {percentile !== null && (
                <span className="rounded-w-pill bg-ice-500/10 px-2.5 py-0.5 text-card-meta font-bold text-ice-500">
                  상위 {percentile}%
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-3xl font-black text-ice-500 tabular-nums leading-none">{myRanking.currentRank}</span>
                <span className="mt-1 text-card-meta font-semibold text-wtext-3 dark:text-rink-300">내 순위</span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-3xl font-black text-wtext-1 dark:text-white tabular-nums leading-none">
                  {myRanking.score.toLocaleString()}
                </span>
                <span className="mt-1 text-card-meta font-semibold text-wtext-3 dark:text-rink-300">포인트</span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-3xl font-black text-wtext-1 dark:text-white tabular-nums leading-none">
                  {myRanking.totalUsers}
                </span>
                <span className="mt-1 text-card-meta font-semibold text-wtext-3 dark:text-rink-300">전체 인원</span>
              </div>
            </div>
          </div>
        ) : null}

        {/* 팀 멤버 랭킹 목록 */}
        {isLoading ? null : members.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <div className="flex h-16 w-16 items-center justify-center rounded-w-pill bg-ice-500/10">
              <Icon name="emoji_events" className="text-3xl text-ice-500" aria-hidden="true" />
            </div>
            <div className="text-center">
              <p className="text-card-body font-semibold text-wtext-2 dark:text-rink-100">아직 랭킹 정보가 없어요</p>
              <p className="mt-1 text-card-meta text-wtext-3 dark:text-rink-300">수업에 참여하면 랭킹이 시작돼요</p>
            </div>
          </div>
        ) : (
          <>
            {/* 상위 3명 시상대 — TEEN 페르소나 액센트 (flame-500) */}
            {topThree.length > 0 && (
              <section className="mb-6">
                <h3 className="mb-3 flex items-center gap-1.5 text-card-body font-bold text-wtext-3 dark:text-rink-300">
                  <Icon name="workspace_premium" className="text-[16px] text-flame-500" filled aria-hidden="true" />
                  TOP {topThree.length}
                </h3>
                <div className="grid grid-cols-3 items-end gap-2">
                  {/* 2위 */}
                  {topThree[1] ? (
                    <PodiumCard rank={2} member={topThree[1]} heightClass="h-24" />
                  ) : <div />}
                  {/* 1위 */}
                  {topThree[0] ? (
                    <PodiumCard rank={1} member={topThree[0]} heightClass="h-32" isChampion />
                  ) : <div />}
                  {/* 3위 */}
                  {topThree[2] ? (
                    <PodiumCard rank={3} member={topThree[2]} heightClass="h-20" />
                  ) : <div />}
                </div>
              </section>
            )}

            {/* 나머지 순위 */}
            {rest.length > 0 && (
              <section>
                <h3 className="mb-3 text-card-body font-bold text-wtext-3 dark:text-rink-300">전체 순위</h3>
                <div className="flex flex-col gap-2">
                  {rest.map((item, index) => {
                    const rank = index + 4;
                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 rounded-xl border border-wline-2 bg-white p-3 shadow-sm transition-colors hover:bg-wbg motion-reduce:transition-none dark:border-rink-700 dark:bg-rink-800 dark:hover:bg-rink-700/50"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-wline-2 text-card-body font-bold text-wtext-2 tabular-nums dark:bg-rink-700 dark:text-rink-100">
                          {rank}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-card-body font-semibold text-wtext-1 dark:text-white">{item.playerName}</p>
                          <p className="mt-0.5 text-card-meta text-wtext-3 dark:text-rink-300">팀 회원</p>
                        </div>
                        <div className={cn('flex shrink-0 items-center gap-1 rounded-w-pill px-2.5 py-1 text-card-meta font-bold', LEVEL_COLOR[item.playerLevel] ?? LEVEL_COLOR.C)}>
                          <Icon name="military_tech" className="text-[14px]" filled aria-hidden="true" />
                          Lv. {item.playerLevel}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </MobileContainer>
  );
}

// ─── PodiumCard ────────────────────────────────
function PodiumCard({
  rank,
  member,
  heightClass,
  isChampion = false,
}: {
  rank: number;
  member: TeamMember;
  heightClass: string;
  isChampion?: boolean;
}) {
  const medals = ['🥇', '🥈', '🥉'];
  const medal = medals[rank - 1];

  return (
    <div className="flex flex-col items-center gap-2">
      {/* 아바타 */}
      <div
        className={cn(
          'relative flex items-center justify-center rounded-w-pill border-[3px] bg-white shadow-sm dark:bg-rink-800',
          isChampion ? 'h-16 w-16 border-ice-500' : 'h-12 w-12 border-wline dark:border-rink-700'
        )}
      >
        <Icon
          name="person"
          className={cn('text-wtext-3 dark:text-rink-300', isChampion ? 'text-3xl' : 'text-2xl')}
          filled
          aria-hidden="true"
        />
        <span
          className="absolute -top-2 -right-1 text-xl"
          aria-label={`${rank}위`}
          role="img"
        >
          {medal}
        </span>
      </div>

      {/* 이름 */}
      <div className="text-center">
        <p className={cn('truncate font-bold text-wtext-1 dark:text-white', isChampion ? 'text-card-body' : 'text-card-meta')}>
          {member.playerName}
        </p>
        <p className={cn('truncate font-semibold', isChampion ? 'text-card-meta text-ice-500' : 'text-card-meta text-wtext-3 dark:text-rink-300')}>
          Lv. {member.playerLevel}
        </p>
      </div>

      {/* 단상 */}
      <div
        className={cn(
          'flex w-full items-start justify-center rounded-t-xl pt-2 text-card-title font-black text-white tabular-nums',
          heightClass,
          isChampion ? 'bg-ice-500' : rank === 2 ? 'bg-ice-500/70' : 'bg-ice-500/50'
        )}
      >
        {rank}
      </div>
    </div>
  );
}
