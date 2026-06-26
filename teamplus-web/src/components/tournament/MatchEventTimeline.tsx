'use client';

/**
 * MatchEventTimeline — 실시간 경기 이벤트 타임라인
 *
 * 레퍼런스: 사용자 제공 HTML "실시간 경기 기록" + "Live Scoreboard" 타임라인
 *
 * 특징:
 *  - 골(파란색), 페널티(빨간색), 기타(회색) 아이콘/컬러 구분
 *  - 피리어드별 섹션 그루핑
 *  - 관리자(isManager=true)면 각 이벤트 행 우측에 삭제 버튼 노출
 *  - 삭제 클릭 시 onDelete 콜백 호출
 */

import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import type {
  MatchEventRecord,
  MatchEventType,
} from '@/services/tournament.service';

interface Props {
  events: MatchEventRecord[];
  /** 홈 팀 ID — 이벤트의 teamId와 매칭하여 팀 구분 */
  homeTeamId?: string | null;
  homeTeamName?: string | null;
  awayTeamName?: string | null;
  isManager?: boolean;
  onDelete?: (eventId: string) => void;
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 스타일 1:1 보존(타 화면 회귀 0).
   *   true 시 이벤트 행 박스 → flat, 골=it-blue·페널티=it-red 색만 치환(로직 동결).
   */
  iceTheme?: boolean;
}

const EVENT_ICON_MAP: Record<
  MatchEventType,
  { icon: string; color: string; bg: string; border: string }
> = {
  goal: {
    icon: 'sports_hockey',
    color: 'text-ice-500',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-ice-500',
  },
  assist: {
    icon: 'handshake',
    color: 'text-wtext-2 dark:text-rink-100',
    bg: 'bg-wbg dark:bg-rink-800',
    border: 'border-wline',
  },
  penalty: {
    icon: 'gavel',
    color: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-500',
  },
  shot: {
    icon: 'sports',
    color: 'text-wtext-2 dark:text-rink-100',
    bg: 'bg-wbg dark:bg-rink-800',
    border: 'border-wline',
  },
  save: {
    icon: 'shield',
    color: 'text-green-600 dark:text-green-400',
    bg: 'bg-green-50 dark:bg-green-900/20',
    border: 'border-green-500',
  },
  timeout: {
    icon: 'pause_circle',
    color: 'text-orange-600 dark:text-orange-400',
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    border: 'border-orange-500',
  },
  period_start: {
    icon: 'play_circle',
    color: 'text-wtext-3',
    bg: 'bg-wline-2 dark:bg-rink-800',
    border: 'border-wline',
  },
  period_end: {
    icon: 'stop_circle',
    color: 'text-wtext-3',
    bg: 'bg-wline-2 dark:bg-rink-800',
    border: 'border-wline',
  },
};

// ICETIMES 톤 — 골=it-blue · 페널티=it-red · 그 외=it-ink/fill (달력 SoT). 아이콘은 동일.
const EVENT_ICON_MAP_ICE: Record<
  MatchEventType,
  { icon: string; color: string; bg: string; border: string }
> = {
  goal: {
    icon: 'sports_hockey',
    color: 'text-it-blue-500',
    bg: 'bg-it-blue-50 dark:bg-it-blue-500/15',
    border: 'border-it-blue-500',
  },
  assist: {
    icon: 'handshake',
    color: 'text-it-ink-600 dark:text-rink-100',
    bg: 'bg-it-fill dark:bg-rink-800',
    border: 'border-it-line',
  },
  penalty: {
    icon: 'gavel',
    color: 'text-it-red-500 dark:text-it-red-300',
    bg: 'bg-it-red-50 dark:bg-it-red-500/15',
    border: 'border-it-red-500',
  },
  shot: {
    icon: 'sports',
    color: 'text-it-ink-600 dark:text-rink-100',
    bg: 'bg-it-fill dark:bg-rink-800',
    border: 'border-it-line',
  },
  save: {
    icon: 'shield',
    color: 'text-it-blue-600 dark:text-it-blue-300',
    bg: 'bg-it-blue-50 dark:bg-it-blue-500/15',
    border: 'border-it-blue-600',
  },
  timeout: {
    icon: 'pause_circle',
    color: 'text-it-ink-500 dark:text-rink-300',
    bg: 'bg-it-fill dark:bg-rink-800',
    border: 'border-it-line',
  },
  period_start: {
    icon: 'play_circle',
    color: 'text-it-ink-400',
    bg: 'bg-it-fill dark:bg-rink-800',
    border: 'border-it-line',
  },
  period_end: {
    icon: 'stop_circle',
    color: 'text-it-ink-400',
    bg: 'bg-it-fill dark:bg-rink-800',
    border: 'border-it-line',
  },
};

function formatPlayer(ev: MatchEventRecord): string {
  const main = ev.player
    ? `No. ${ev.player.jerseyNumber ?? '?'} ${ev.player.member?.playerName ?? '-'}`
    : '';
  const assists = [ev.assistPlayer1, ev.assistPlayer2]
    .filter(Boolean)
    .map(
      (a) =>
        `No. ${a!.jerseyNumber ?? '?'} ${a!.member?.playerName ?? '-'}`,
    )
    .join(', ');
  if (main && assists) return `${main} (Assist: ${assists})`;
  if (main) return main;
  if (ev.description) return ev.description;
  return '기록 없음';
}

export function MatchEventTimeline({
  events,
  homeTeamId,
  homeTeamName,
  awayTeamName,
  isManager = false,
  onDelete,
  iceTheme = false,
}: Props) {
  const iconMap = iceTheme ? EVENT_ICON_MAP_ICE : EVENT_ICON_MAP;

  if (!events.length) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center border border-dashed py-12',
          iceTheme
            ? 'rounded-w-md border-it-line-strong text-it-ink-400 dark:border-rink-700'
            : 'rounded-xl border-wline text-wtext-3 dark:border-rink-700',
        )}
      >
        <Icon
          name="schedule"
          className={cn('mb-2 text-4xl', iceTheme ? 'text-it-ink-300' : 'text-wtext-4')}
        />
        <p className="text-sm">아직 기록된 이벤트가 없습니다</p>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col gap-3" role="list" aria-label="경기 이벤트 타임라인">
      <div
        className={cn(
          'absolute bottom-0 left-4 top-0 w-px',
          iceTheme ? 'bg-it-line dark:bg-rink-700' : 'bg-wline-2 dark:bg-rink-700',
        )}
        aria-hidden="true"
      />
      {events.map((event) => {
        const meta = iconMap[event.eventType] ?? iconMap.shot;
        const typeLabel = MESSAGES.matchEvent.typeLabel[event.eventType] ?? event.eventType;
        const teamLabel =
          event.teamId === homeTeamId
            ? homeTeamName ?? 'HOME'
            : awayTeamName ?? 'AWAY';
        const eventTitle =
          event.eventType === 'goal'
            ? `GOAL! ${teamLabel}`
            : event.eventType === 'penalty'
              ? `PENALTY! ${teamLabel} - ${event.penaltyType ? MESSAGES.matchEvent.penaltyTypeLabel[event.penaltyType] ?? event.penaltyType : ''} ${event.penaltyMinutes ?? 0}m`
              : `${typeLabel} ${teamLabel}`;

        return (
          <div
            key={event.id}
            className={cn(
              'relative flex items-start gap-4 p-4',
              iceTheme
                ? // ICETIMES flat — 카드 박스(rounded-2xl/shadow) 제거, hairline 경계.
                  'rounded-w-md border-[1.5px] border-it-line bg-it-surface dark:border-rink-700 dark:bg-it-blue-950'
                : 'rounded-2xl border border-wline-2 bg-white shadow-sm dark:border-rink-700 dark:bg-rink-800',
            )}
            role="listitem"
          >
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                meta.bg,
              )}
              aria-hidden="true"
            >
              <Icon name={meta.icon} className={cn('text-lg', meta.color)} />
            </div>
            <div className="flex flex-1 flex-col">
              <div className="flex items-start justify-between gap-2">
                <h4 className={cn('text-sm font-bold', meta.color)}>
                  {eventTitle}
                </h4>
                <span
                  className={cn(
                    'text-xs font-bold tabular-nums',
                    iceTheme ? 'text-it-ink-400' : 'text-wtext-3',
                  )}
                >
                  {event.eventTime} ({MESSAGES.match.periodLabel(event.periodNumber)})
                </span>
              </div>
              <p
                className={cn(
                  'mt-0.5 text-xs',
                  iceTheme ? 'text-it-ink-500 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300',
                )}
              >
                {formatPlayer(event)}
                {event.isGameWinner && ' · 결승골'}
                {event.isPowerPlay && ' · 파워플레이'}
                {event.isShortHanded && ' · 쇼트핸디드'}
              </p>
            </div>
            {isManager && (
              <button
                type="button"
                onClick={() => onDelete?.(event.id)}
                className={cn(
                  'rounded-full p-1.5',
                  iceTheme
                    ? 'text-it-ink-400 hover:bg-it-red-50 hover:text-it-red-500 dark:hover:bg-it-red-500/15 dark:hover:text-it-red-300'
                    : 'text-wtext-3 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400',
                )}
                aria-label="이벤트 삭제하기"
              >
                <Icon name="delete_outline" className="text-lg" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
