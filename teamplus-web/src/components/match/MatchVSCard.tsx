'use client';

import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';

interface MatchVSCardProps {
  homeTeamName?: string | null;
  awayTeamName?: string | null;
  /** 친선 경기 · 리그 경기 등의 라벨 (기본: '친선 경기') */
  matchType?: string;
  /** ISO 문자열 또는 Date 객체 */
  scheduledAt: Date | string;
  rinkName: string;
  className?: string;
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 스타일 1:1 보존(타 화면 회귀 0).
   *   true 시 navy 히어로 밴드 위 navy 톤 카드(흰 글자) — 밴드와 통합.
   */
  iceTheme?: boolean;
}

/**
 * 매치 상세 페이지 상단의 VS 카드.
 *
 * HTML 목업 "매치 상세 정보 (VS 카드)" 디자인 재현:
 * - 좌: 홈팀 / 중앙: VS 배지 / 우: 어웨이팀
 * - 상단 매치 유형 배지(친선 경기 등)
 * - 하단 일시·장소 정보
 *
 * 팀이 지정되지 않은 픽업 매치의 경우 placeholder 아이콘을 표시합니다.
 * AI 스타일 금지 원칙(솔리드 컬러, shadow-sm)을 준수합니다.
 */
export function MatchVSCard({
  homeTeamName,
  awayTeamName,
  matchType = MESSAGES.match.detail.vs,
  scheduledAt,
  rinkName,
  className,
  iceTheme = false,
}: MatchVSCardProps) {
  const dt = typeof scheduledAt === 'string' ? new Date(scheduledAt) : scheduledAt;
  const dateLabel = Number.isNaN(dt.getTime())
    ? '-'
    : dt.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'short',
      });
  const timeLabel = Number.isNaN(dt.getTime())
    ? ''
    : dt.toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

  // [ICETIMES] flat — navy 히어로 밴드 위 navy 톤 카드(흰 글자). 밴드와 통합.
  if (iceTheme) {
    return (
      <article
        className={cn(
          'bg-it-blue-900/60 dark:bg-it-blue-950 rounded-w-md border border-white/10 dark:border-white/5 overflow-hidden',
          className
        )}
      >
        {/* 매치 유형 배지 */}
        <div className="flex justify-center pt-5">
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-w-pill bg-white/15 text-white text-card-meta font-bold">
            <Icon name="sports_hockey" className="text-sm" />
            {matchType}
          </span>
        </div>

        {/* VS 본체 */}
        <div className="flex items-center justify-between px-6 py-5">
          <TeamBlock
            name={homeTeamName ?? MESSAGES.match.detail.homeTeam}
            role="HOME"
            roleLabel={MESSAGES.match.detail.home}
            placeholderIcon="groups"
            iceTheme
          />

          <div className="flex flex-col items-center px-2">
            <span
              className="flex h-10 w-12 items-center justify-center rounded-w-md bg-white/15 text-sm font-black italic text-white"
              aria-label={MESSAGES.match.detail.vsAriaLabel}
            >
              VS
            </span>
          </div>

          <TeamBlock
            name={awayTeamName ?? MESSAGES.match.detail.awayTeam}
            role="AWAY"
            roleLabel={MESSAGES.match.detail.away}
            placeholderIcon="sports_hockey"
            iceTheme
          />
        </div>

        {/* 일시 · 장소 */}
        <div className="border-t border-white/10 px-6 py-4">
          <div className="flex items-center justify-center gap-2 mb-1.5">
            <Icon name="event" className="text-white/70 text-base" />
            <span className="text-card-emphasis font-semibold text-white">
              {dateLabel}
              {timeLabel && ` · ${timeLabel}`}
            </span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <Icon name="location_on" className="text-white/80 text-base" />
            <span className="text-card-body text-white/70">{rinkName}</span>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      className={cn(
        'bg-white dark:bg-rink-800 rounded-2xl border border-wline-2 dark:border-rink-700 overflow-hidden shadow-sm',
        className
      )}
    >
      {/* 매치 유형 배지 */}
      <div className="flex justify-center pt-5">
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-ice-500/10 dark:bg-ice-500/20 text-ice-500 text-card-meta font-bold">
          <Icon name="sports_hockey" className="text-sm" />
          {matchType}
        </span>
      </div>

      {/* VS 본체 */}
      <div className="flex items-center justify-between px-6 py-5">
        <TeamBlock
          name={homeTeamName ?? MESSAGES.match.detail.homeTeam}
          role="HOME"
          roleLabel={MESSAGES.match.detail.home}
          placeholderIcon="groups"
        />

        <div className="flex flex-col items-center px-2">
          <span
            className="flex h-10 w-12 items-center justify-center rounded-lg bg-rink-900 dark:bg-rink-700 text-sm font-black italic text-white shadow-sm"
            aria-label={MESSAGES.match.detail.vsAriaLabel}
          >
            VS
          </span>
        </div>

        <TeamBlock
          name={awayTeamName ?? MESSAGES.match.detail.awayTeam}
          role="AWAY"
          roleLabel={MESSAGES.match.detail.away}
          placeholderIcon="sports_hockey"
        />
      </div>

      {/* 일시 · 장소 */}
      <div className="border-t border-wline-2 dark:border-rink-700 px-6 py-4">
        <div className="flex items-center justify-center gap-2 mb-1.5">
          <Icon name="event" className="text-wtext-3 text-base" />
          <span className="text-card-emphasis font-semibold text-wtext-2 dark:text-rink-100">
            {dateLabel}
            {timeLabel && ` · ${timeLabel}`}
          </span>
        </div>
        <div className="flex items-center justify-center gap-2">
          <Icon name="location_on" className="text-ice-500 text-base" />
          <span className="text-card-body text-wtext-3 dark:text-rink-300">
            {rinkName}
          </span>
        </div>
      </div>
    </article>
  );
}

function TeamBlock({
  name,
  role,
  roleLabel,
  placeholderIcon,
  iceTheme = false,
}: {
  name: string;
  role: 'HOME' | 'AWAY';
  roleLabel: string;
  placeholderIcon: string;
  iceTheme?: boolean;
}) {
  const isHome = role === 'HOME';

  // [ICETIMES] navy 밴드 위 — 흰/반투명 톤.
  if (iceTheme) {
    return (
      <div className="flex flex-col items-center gap-2 w-1/3">
        <div
          className={cn(
            'flex h-16 w-16 items-center justify-center rounded-w-pill border-2',
            isHome ? 'bg-white/10 border-white/15' : 'bg-white/15 border-white/25'
          )}
        >
          <Icon name={placeholderIcon} className={cn('text-3xl', isHome ? 'text-white/70' : 'text-white')} />
        </div>
        <span className="text-card-title text-white text-center break-keep line-clamp-2">{name}</span>
        <span className="text-[10px] font-semibold tracking-wider text-white/60 uppercase">{roleLabel}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 w-1/3">
      <div
        className={cn(
          'flex h-16 w-16 items-center justify-center rounded-full border-2',
          isHome
            ? 'bg-wline-2 border-wline dark:bg-rink-700 dark:border-rink-700'
            : 'bg-blue-50 border-blue-100 dark:bg-blue-900/20 dark:border-blue-800'
        )}
      >
        <Icon
          name={placeholderIcon}
          className={cn(
            'text-3xl',
            isHome
              ? 'text-wtext-3 dark:text-rink-300'
              : 'text-ice-500 dark:text-blue-300'
          )}
        />
      </div>
      <span className="text-card-title text-wtext-1 dark:text-white text-center break-keep line-clamp-2">
        {name}
      </span>
      <span className="text-[10px] font-semibold tracking-wider text-wtext-3 dark:text-rink-300 uppercase">
        {roleLabel}
      </span>
    </div>
  );
}
