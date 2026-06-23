'use client';

/**
 * LiveScoreHeader — 실시간 스코어보드 상단 헤더
 *
 * 레퍼런스: 사용자 제공 HTML "Live Score Header" + "Match Detail"
 *
 * 구조:
 *  - 양 팀 로고 배지 + 팀명 + 스코어
 *  - 가운데: LIVE 인디케이터 + 피리어드 + 경과 시간
 *  - SHOTS / PENALTY / SAVES 통계 그리드
 *
 * 주의:
 *  - LIVE 점은 pulse 애니메이션 (CSS transform 사용, backdrop-blur 금지)
 */

import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import { resolveImageSrc } from '@/lib/image-url';
import type { MatchDetail } from '@/services/tournament.service';

interface Props {
  match: MatchDetail;
  /** 경기 이벤트 통계(slice). 미제공 시 계산 안 함 */
  stats?: {
    homeShots: number;
    awayShots: number;
    homePenaltyMinutes: number;
    awayPenaltyMinutes: number;
    homeSaves: number;
    awaySaves: number;
  };
}

function TeamColumn({
  side,
  team,
  score,
}: {
  side: 'home' | 'away';
  team: MatchDetail['homeTeam'];
  score: number;
}) {
  const name = team?.name ?? (side === 'home' ? '홈 팀' : '어웨이 팀');
  const colorHex =
    (side === 'home'
      ? team?.primaryColor
      : team?.primaryColor) ?? '#1E3FAE';

  return (
    <div className="flex flex-1 flex-col items-center gap-3">
      <div
        className="flex h-20 w-20 items-center justify-center rounded-2xl border border-wline bg-wbg p-3 shadow-inner dark:border-rink-700 dark:bg-rink-900"
        style={
          team?.logoUrl
            ? undefined
            : { borderColor: colorHex, borderWidth: 2 }
        }
      >
        {resolveImageSrc(team?.logoUrl) ? (
          // 팀 로고는 외부 CDN URL이 대부분이며 Next Image 도메인 설정 없이 동적으로 렌더
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolveImageSrc(team?.logoUrl)}
            alt={`${name} 로고`}
            className="h-full w-full object-contain"
          />
        ) : (
          <span
            className="text-3xl font-black"
            style={{ color: colorHex }}
            aria-hidden
          >
            {name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <div className="text-center">
        <h3 className="text-sm font-bold text-wtext-1 dark:text-white">
          {name}
        </h3>
        <p className="text-[10px] uppercase text-wtext-3 dark:text-rink-300">
          {side === 'home' ? 'HOME' : 'AWAY'}
        </p>
      </div>
      <div className="text-4xl font-black tabular-nums text-wtext-1 dark:text-white">
        {score}
      </div>
    </div>
  );
}

export function LiveScoreHeader({ match, stats }: Props) {
  const isLive =
    match.status === 'in_progress' || match.status === 'intermission';
  const periodLabel =
    match.currentPeriod != null
      ? MESSAGES.match.periodLabel(match.currentPeriod)
      : '-';
  const statusLabel =
    MESSAGES.match.statusLabel[match.status] ?? match.status;

  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-wline bg-white p-6 shadow-sm dark:border-rink-700 dark:bg-rink-800"
      aria-label="경기 스코어 헤더"
    >
      {/* LIVE 뱃지 */}
      <div className="absolute right-4 top-4">
        <LiveIndicator isLive={isLive} statusLabel={statusLabel} />
      </div>

      {/* 대회/경기 정보 */}
      <div className="mb-6 flex flex-col items-center">
        {match.tournament?.name ? (
          <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-wtext-3 dark:text-rink-300">
            {match.tournament.name}
          </p>
        ) : null}
        <p className="text-xs text-wtext-3 dark:text-rink-300">
          {match.round ? MESSAGES.match.roundLabel[match.round] : '경기'} ·{' '}
          {match.venue?.name ?? match.rink?.name ?? '경기장 미지정'}
        </p>
      </div>

      {/* 스코어 그리드 */}
      <div className="flex items-center justify-between gap-4">
        <TeamColumn side="home" team={match.homeTeam} score={match.homeScore} />

        <div className="flex shrink-0 flex-col items-center justify-center pb-8">
          <div className="mb-2 text-[10px] font-black italic text-wtext-3">
            VS
          </div>
          <div className="rounded bg-wline-2 px-2 py-0.5 text-[10px] font-bold text-wtext-2 dark:bg-rink-700 dark:text-rink-100">
            {periodLabel}
          </div>
        </div>

        <TeamColumn side="away" team={match.awayTeam} score={match.awayScore} />
      </div>

      {/* 통계 그리드 */}
      {stats && (
        <div className="mt-8 grid grid-cols-3 gap-2 border-t border-wline pt-6 dark:border-rink-700">
          <StatCell
            label="SHOTS"
            home={stats.homeShots}
            away={stats.awayShots}
          />
          <StatCell
            label="PENALTY"
            home={stats.homePenaltyMinutes}
            away={stats.awayPenaltyMinutes}
            borderX
          />
          <StatCell
            label="SAVES"
            home={stats.homeSaves}
            away={stats.awaySaves}
          />
        </div>
      )}
    </section>
  );
}

function StatCell({
  label,
  home,
  away,
  borderX,
}: {
  label: string;
  home: number;
  away: number;
  borderX?: boolean;
}) {
  return (
    <div
      className={cn(
        'text-center',
        borderX && 'border-x border-wline dark:border-rink-700',
      )}
    >
      <p className="text-[10px] font-bold text-wtext-3 dark:text-rink-300">
        {label}
      </p>
      <p className="text-sm font-bold tabular-nums text-wtext-1 dark:text-white">
        {home} - {away}
      </p>
    </div>
  );
}

/** LIVE 인디케이터 (펄스 애니메이션) — 독립 컴포넌트로 재사용 가능 */
export function LiveIndicator({
  isLive,
  statusLabel,
}: {
  isLive: boolean;
  statusLabel: string;
}) {
  if (isLive) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-bold text-red-600 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
        <span
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500"
          aria-hidden="true"
        />
        LIVE
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-wline bg-wline-2 px-2.5 py-1 text-[10px] font-bold text-wtext-2 dark:border-rink-700 dark:bg-rink-700 dark:text-rink-100">
      {statusLabel}
    </span>
  );
}
