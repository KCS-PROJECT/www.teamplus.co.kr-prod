'use client';

/**
 * MatchStatsGrid — 경기 통계 집계 그리드
 *
 * 레퍼런스: 사용자 제공 HTML "라인업 현황"
 *
 * 특징:
 *  - 양 팀의 통계(득점/슛/페널티/세이브)를 한눈에 표시
 *  - 양팀 간 진행률(progress bar)
 *  - MatchEventRecord[] 로부터 자동 집계
 */

import { cn } from '@/lib/utils';
import type {
  MatchDetail,
  MatchEventRecord,
} from '@/services/tournament.service';

interface Props {
  match: MatchDetail;
}

interface TeamStats {
  goals: number;
  shots: number;
  penalties: number;
  penaltyMinutes: number;
  saves: number;
}

function computeStats(
  events: MatchEventRecord[],
  teamId: string | null | undefined,
): TeamStats {
  const stats: TeamStats = {
    goals: 0,
    shots: 0,
    penalties: 0,
    penaltyMinutes: 0,
    saves: 0,
  };
  if (!teamId) return stats;
  for (const e of events) {
    if (e.teamId !== teamId) continue;
    switch (e.eventType) {
      case 'goal':
        stats.goals += 1;
        stats.shots += 1;
        break;
      case 'shot':
        stats.shots += 1;
        break;
      case 'penalty':
        stats.penalties += 1;
        stats.penaltyMinutes += e.penaltyMinutes ?? 0;
        break;
      case 'save':
        stats.saves += 1;
        break;
    }
  }
  return stats;
}

export function MatchStatsGrid({ match }: Props) {
  const homeStats = computeStats(match.events, match.homeTeam?.id);
  const awayStats = computeStats(match.events, match.awayTeam?.id);

  return (
    <section aria-labelledby="match-stats-title">
      <h2
        id="match-stats-title"
        className="mb-4 text-lg font-bold text-wtext-1 dark:text-white"
      >
        경기 통계
      </h2>
      <div className="grid grid-cols-2 gap-4">
        <StatsCard
          teamName={match.homeTeam?.name ?? '홈 팀'}
          label="HOME"
          stats={homeStats}
          accent="primary"
        />
        <StatsCard
          teamName={match.awayTeam?.name ?? '어웨이 팀'}
          label="AWAY"
          stats={awayStats}
          accent="teal"
        />
      </div>
    </section>
  );
}

function StatsCard({
  teamName,
  label,
  stats,
  accent,
}: {
  teamName: string;
  label: string;
  stats: TeamStats;
  accent: 'primary' | 'teal';
}) {
  const accentBar =
    accent === 'primary' ? 'bg-ice-500' : 'bg-teal-600';
  const accentText =
    accent === 'primary' ? 'text-ice-500' : 'text-teal-600';

  return (
    <div className="rounded-2xl border border-wline bg-white p-4 shadow-sm dark:border-rink-700 dark:bg-rink-800">
      <p className="mb-2 text-[10px] font-bold uppercase text-wtext-3 dark:text-rink-300">
        {label}
      </p>
      <h3 className="mb-3 truncate text-sm font-bold text-wtext-1 dark:text-white">
        {teamName}
      </h3>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div className="flex items-center justify-between">
          <dt className="text-wtext-3 dark:text-rink-300">골</dt>
          <dd className={cn('tabular-nums font-bold', accentText)}>
            {stats.goals}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-wtext-3 dark:text-rink-300">슛</dt>
          <dd className="font-bold tabular-nums text-wtext-1 dark:text-white">
            {stats.shots}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-wtext-3 dark:text-rink-300">페널티</dt>
          <dd className="font-bold tabular-nums text-wtext-1 dark:text-white">
            {stats.penalties} ({stats.penaltyMinutes}m)
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-wtext-3 dark:text-rink-300">세이브</dt>
          <dd className="font-bold tabular-nums text-wtext-1 dark:text-white">
            {stats.saves}
          </dd>
        </div>
      </dl>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-wline-2 dark:bg-rink-700">
        <div
          className={cn('h-full transition-all', accentBar)}
          style={{
            width: `${Math.min(100, (stats.shots / Math.max(1, stats.shots + 5)) * 100)}%`,
          }}
          aria-hidden
        />
      </div>
    </div>
  );
}
