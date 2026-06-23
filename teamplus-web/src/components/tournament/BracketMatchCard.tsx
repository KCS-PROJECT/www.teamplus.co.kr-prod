'use client';

/**
 * BracketMatchCard — 대진표 경기 카드 (8강/4강)
 *
 * 레퍼런스: 사용자 제공 HTML "Match 1" / "Semi 1" 카드
 *
 * 역할 기반 동작:
 *  - isManager=true + 경기 진행 중/예정: "스코어 입력" CTA 노출
 *  - isManager=false: 조회 전용
 */

import { NavLink } from '@/components/ui/NavLink';
import { cn } from '@/lib/utils';
import type { MatchSummary } from '@/services/tournament.service';

interface Props {
  match: MatchSummary;
  /** 결승 카드(확대형) 여부 */
  isFinal?: boolean;
  /** 승자 강조 표시 (TBD 표시를 위해 양팀 모두 없을 수 있음) */
  showWinner?: boolean;
}

/** 팀 이니셜 badge 색상 — team id 기반 해시 */
function resolveTeamColor(teamId: string | undefined | null): string {
  if (!teamId) return 'bg-wline text-wtext-2 dark:bg-rink-700 dark:text-rink-100';
  const palette = [
    'bg-blue-100 text-ice-500 dark:bg-blue-900/40 dark:text-blue-300',
    'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
    'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  ] as const;
  let hash = 0;
  for (let i = 0; i < teamId.length; i++) {
    hash = ((hash << 5) - hash + teamId.charCodeAt(i)) | 0;
  }
  return palette[Math.abs(hash) % palette.length];
}

function TeamRow({
  name,
  shortName,
  teamId,
  score,
  isWinner,
  isLoser,
}: {
  name: string | undefined;
  shortName: string | null | undefined;
  teamId: string | null | undefined;
  score: number | undefined;
  isWinner: boolean;
  isLoser: boolean;
}) {
  if (!name) {
    return (
      <div className="flex items-center justify-between">
        <span className="text-sm italic text-wtext-3">TBD</span>
        <span className="text-sm text-wtext-3">-</span>
      </div>
    );
  }

  const initial = (shortName ?? name).charAt(0).toUpperCase();
  const colorClass = resolveTeamColor(teamId);

  return (
    <div
      className={cn(
        'flex items-center justify-between',
        isLoser && 'opacity-50',
      )}
    >
      <div className="flex items-center gap-2">
        <div
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
            colorClass,
          )}
          aria-hidden="true"
        >
          {initial}
        </div>
        <span
          className={cn(
            'max-w-[100px] truncate text-sm',
            isWinner ? 'font-bold text-wtext-1 dark:text-white' : 'font-medium text-wtext-2 dark:text-rink-100',
          )}
        >
          {name}
        </span>
      </div>
      <span
        className={cn(
          'text-sm tabular-nums',
          isWinner
            ? 'font-bold text-wtext-1 dark:text-white'
            : score !== undefined
              ? 'font-medium text-wtext-2 dark:text-rink-300'
              : 'text-wtext-3',
        )}
      >
        {score !== undefined ? score : '-'}
      </span>
    </div>
  );
}

export function BracketMatchCard({
  match,
  isFinal = false,
}: Props) {
  const isCompleted = match.status === 'completed';
  const isLive =
    match.status === 'in_progress' || match.status === 'intermission';
  const homeWin =
    isCompleted && match.homeScore > match.awayScore;
  const awayWin =
    isCompleted && match.awayScore > match.homeScore;

  const scheduledAt = match.scheduledAt
    ? new Date(match.scheduledAt)
    : null;
  const dateLabel = scheduledAt
    ? `${String(scheduledAt.getMonth() + 1).padStart(2, '0')}.${String(scheduledAt.getDate()).padStart(2, '0')}`
    : '-';
  const timeLabel = scheduledAt
    ? `${String(scheduledAt.getHours()).padStart(2, '0')}:${String(scheduledAt.getMinutes()).padStart(2, '0')}`
    : '-';

  const venueLabel = match.rink?.name ?? match.venue?.name ?? 'TBD';

  if (isFinal) {
    return (
      <NavLink
        href={`/hockey-matches/${match.id}`}
        className="relative flex w-48 flex-col overflow-hidden rounded-xl border border-ice-500/30 bg-white shadow-md ring-2 ring-ice-500/10 dark:bg-rink-800"
        aria-label={`결승 경기: ${match.homeTeam?.name ?? 'TBD'} vs ${match.awayTeam?.name ?? 'TBD'}`}
      >
        <div className="flex items-center justify-between border-b border-wline-2 bg-ice-500/5 px-3 py-2 dark:border-rink-700">
          <span className="text-[10px] font-bold text-ice-500">
            {dateLabel} {timeLabel}
          </span>
          <span className="text-[10px] font-bold text-ice-500/70">
            {venueLabel}
          </span>
        </div>
        <div className="space-y-4 p-4">
          <TeamRow
            name={match.homeTeam?.name}
            shortName={match.homeTeam?.shortName}
            teamId={match.homeTeam?.id}
            score={isCompleted ? match.homeScore : undefined}
            isWinner={homeWin}
            isLoser={awayWin}
          />
          <div className="flex justify-center text-xs font-bold text-wtext-3">
            VS
          </div>
          <TeamRow
            name={match.awayTeam?.name}
            shortName={match.awayTeam?.shortName}
            teamId={match.awayTeam?.id}
            score={isCompleted ? match.awayScore : undefined}
            isWinner={awayWin}
            isLoser={homeWin}
          />
        </div>
      </NavLink>
    );
  }

  return (
    <NavLink
      href={`/hockey-matches/${match.id}`}
      className={cn(
        'relative flex w-48 flex-col overflow-hidden rounded-xl border border-wline bg-white shadow-sm transition-shadow hover:shadow-md dark:border-rink-700 dark:bg-rink-800',
        !isCompleted && !match.homeTeam && !match.awayTeam && 'opacity-80',
      )}
      aria-label={`${match.homeTeam?.name ?? 'TBD'} vs ${match.awayTeam?.name ?? 'TBD'}`}
    >
      {isLive && (
        <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[9px] font-bold text-red-600 ring-1 ring-red-200 dark:bg-red-900/30 dark:text-red-300 dark:ring-red-800">
          <span className="h-1 w-1 rounded-full bg-red-500" />
          LIVE
        </span>
      )}
      <div className="flex items-center justify-between border-b border-wline-2 bg-wbg px-3 py-2 dark:border-rink-700 dark:bg-rink-900/50">
        <span className="text-[10px] font-medium text-wtext-3">
          {dateLabel} {timeLabel}
        </span>
        <span className="text-[10px] text-wtext-3">{venueLabel}</span>
      </div>
      <div className="space-y-3 p-3">
        <TeamRow
          name={match.homeTeam?.name}
          shortName={match.homeTeam?.shortName}
          teamId={match.homeTeam?.id}
          score={isCompleted || isLive ? match.homeScore : undefined}
          isWinner={homeWin}
          isLoser={awayWin}
        />
        <TeamRow
          name={match.awayTeam?.name}
          shortName={match.awayTeam?.shortName}
          teamId={match.awayTeam?.id}
          score={isCompleted || isLive ? match.awayScore : undefined}
          isWinner={awayWin}
          isLoser={homeWin}
        />
      </div>
    </NavLink>
  );
}

/** 대진표 커넥터 라인 (라운드 사이) */
export function BracketConnector({
  height,
  className,
}: {
  height: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex w-8 flex-col items-center justify-center',
        className,
      )}
      aria-hidden="true"
    >
      <div
        className="w-full rounded-r-lg border-b border-r border-t border-wline dark:border-rink-700"
        style={{ height: `${height}px` }}
      />
    </div>
  );
}
