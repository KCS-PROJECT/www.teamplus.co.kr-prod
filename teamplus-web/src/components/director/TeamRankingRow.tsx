'use client';

import type { ParticipatingTeam } from './MatchCard';

interface TeamRankingRowProps {
  /** 순위 (1부터 시작) */
  rank: number;
  /** 팀 정보 */
  team: ParticipatingTeam;
  /** 승수 */
  wins: number;
  /** 패수 */
  losses: number;
  /** 무승부 (선택) */
  draws?: number;
}

// 순위별 배지 색상
const RANK_BADGE_MAP: Record<number, string> = {
  1: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  2: 'bg-wline text-wtext-2 dark:bg-rink-500 dark:text-rink-100',
  3: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

/**
 * 대회 팀 순위 행 컴포넌트
 * 대회 상세 페이지의 순위 탭에서 사용합니다.
 */
export function TeamRankingRow({ rank, team, wins, losses, draws }: TeamRankingRowProps) {
  const rankBadge =
    RANK_BADGE_MAP[rank] ??
    'bg-wline-2 text-wtext-3 dark:bg-rink-700 dark:text-rink-300';

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-wline-2 dark:border-rink-700 last:border-b-0">
      <div className="flex items-center gap-3">
        <span
          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${rankBadge}`}
        >
          {rank}
        </span>
        <div
          className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${team.colorClass}`}
        >
          {team.shortName}
        </div>
        <span className="text-sm font-medium text-wtext-1 dark:text-white">
          {team.name}
        </span>
      </div>
      <div className="text-right">
        <span className="text-sm font-bold text-wtext-1 dark:text-white">
          {wins}승
        </span>
        {draws != null && (
          <span className="text-sm text-wtext-3 dark:text-rink-300 ml-2">
            {draws}무
          </span>
        )}
        <span className="text-sm text-wtext-3 dark:text-rink-300 ml-2">
          {losses}패
        </span>
      </div>
    </div>
  );
}
