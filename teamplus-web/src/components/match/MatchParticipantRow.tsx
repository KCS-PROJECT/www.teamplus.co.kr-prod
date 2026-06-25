'use client';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import { MatchPositionChip } from './MatchPositionChip';

export interface MatchParticipantRowData {
  id: string;
  name: string;
  position: string;
  level?: string;
  /** 주최자 표시 */
  isHost?: boolean;
  /** 확정=1부터 시작하는 순번, 대기=대기번호 */
  order: number;
  /** waitlist 전용 — 대기 오렌지 라인 표시 */
  isWaitlist?: boolean;
}

interface MatchParticipantRowProps {
  data: MatchParticipantRowData;
  /** 행 우측에 관리 액션을 렌더링 (예: 퇴장 버튼) */
  action?: React.ReactNode;
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 스타일 1:1 보존(타 화면 회귀 0).
   *   true 시 카드 박스 → flat it-line 타일 + it-* 톤(호스트=it-blue, 대기 스트라이프=it-red).
   */
  iceTheme?: boolean;
}

/**
 * 참가 명단 행 — 확정/대기 양쪽에서 사용.
 */
export function MatchParticipantRow({ data, action, iceTheme = false }: MatchParticipantRowProps) {
  // [ICETIMES] flat — it-line 타일 + it-* 톤. 대기=it-red 스트라이프, 호스트=it-blue.
  if (iceTheme) {
    return (
      <div
        className={cn(
          'flex items-center gap-3 rounded-w-md border bg-it-surface dark:bg-rink-800 border-it-line dark:border-it-blue-900 overflow-hidden',
          data.isWaitlist && 'opacity-80'
        )}
      >
        {data.isWaitlist && <div className="w-1 self-stretch bg-it-red-400" aria-hidden />}
        <div className="flex items-center gap-3 p-4 flex-1">
          <div className="w-6 text-center text-card-emphasis font-semibold text-it-ink-400 font-num tabular-nums">
            {data.isWaitlist ? `#${data.order}` : data.order}
          </div>

          <div className="relative w-10 h-10 shrink-0 rounded-w-pill bg-it-line dark:bg-rink-700 flex items-center justify-center">
            <span className="text-card-emphasis font-semibold text-it-ink-700 dark:text-it-ink-200">
              {data.name.charAt(0) || '?'}
            </span>
            {data.isHost && (
              <div
                className="absolute -top-1 -right-1 w-5 h-5 rounded-w-pill bg-it-blue-500 flex items-center justify-center"
                aria-label="주최자"
              >
                <Icon name="star" className="text-white text-[14px]" filled />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-card-title text-it-ink-800 dark:text-white truncate">
                {data.name}
              </span>
              {data.isHost && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-it-blue-50 text-it-blue-600 dark:bg-it-blue-900/40 dark:text-it-blue-300">
                  호스트
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <MatchPositionChip position={data.position} size="xs" />
              <span className="text-card-meta text-it-ink-500 dark:text-it-ink-300">
                {data.level || '레벨 미입력'}
              </span>
            </div>
          </div>

          {action && <div className="ml-2 shrink-0">{action}</div>}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center gap-3 bg-white dark:bg-rink-800 rounded-xl border border-wline dark:border-rink-700 overflow-hidden',
        data.isWaitlist && 'opacity-80'
      )}
    >
      {data.isWaitlist && <div className="w-1 self-stretch bg-amber-400" aria-hidden />}
      <div className="flex items-center gap-3 p-4 flex-1">
        <div className="w-6 text-center text-card-emphasis font-semibold text-wtext-3">
          {data.isWaitlist ? `#${data.order}` : data.order}
        </div>

        <div className="relative w-10 h-10 shrink-0 rounded-full bg-wline dark:bg-rink-700 flex items-center justify-center">
          <span className="text-card-emphasis font-semibold text-wtext-2 dark:text-rink-100">
            {data.name.charAt(0) || '?'}
          </span>
          {data.isHost && (
            <div
              className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-ice-500 flex items-center justify-center"
              aria-label="주최자"
            >
              <Icon name="star" className="text-white text-[14px]" filled />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-card-title text-wtext-1 dark:text-white truncate">
              {data.name}
            </span>
            {data.isHost && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-ice-500 dark:bg-blue-900/30 dark:text-blue-300">
                호스트
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <MatchPositionChip position={data.position} size="xs" />
            <span className="text-card-meta text-wtext-3 dark:text-rink-300">
              {data.level || '레벨 미입력'}
            </span>
          </div>
        </div>

        {action && <div className="ml-2 shrink-0">{action}</div>}
      </div>
    </div>
  );
}
