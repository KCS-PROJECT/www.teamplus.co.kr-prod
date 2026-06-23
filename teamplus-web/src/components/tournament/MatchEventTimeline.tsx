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
}: Props) {
  if (!events.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-wline py-12 text-wtext-3 dark:border-rink-700">
        <Icon name="schedule" className="mb-2 text-4xl text-wtext-4" />
        <p className="text-sm">아직 기록된 이벤트가 없습니다</p>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col gap-3" role="list" aria-label="경기 이벤트 타임라인">
      <div
        className="absolute bottom-0 left-4 top-0 w-px bg-wline-2 dark:bg-rink-700"
        aria-hidden="true"
      />
      {events.map((event) => {
        const meta = EVENT_ICON_MAP[event.eventType] ?? EVENT_ICON_MAP.shot;
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
            className="relative flex items-start gap-4 rounded-2xl border border-wline-2 bg-white p-4 shadow-sm dark:border-rink-700 dark:bg-rink-800"
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
                <span className="text-xs font-bold tabular-nums text-wtext-3">
                  {event.eventTime} ({MESSAGES.match.periodLabel(event.periodNumber)})
                </span>
              </div>
              <p className="mt-0.5 text-xs text-wtext-3 dark:text-rink-300">
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
                className="rounded-full p-1.5 text-wtext-3 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
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
