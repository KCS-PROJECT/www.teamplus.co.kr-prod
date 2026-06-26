'use client';

/**
 * TournamentStatusBadge — 대회 상태 라벨 뱃지
 *
 * 상태:
 *  - recruiting   : 접수중 (blue)
 *  - closing_soon : 마감 임박 (red)
 *  - closed       : 모집 완료 (slate)
 *  - in_progress  : 진행 중 (green)
 *  - completed    : 완료 (slate)
 *  - cancelled    : 취소 (orange)
 *
 * AI 스타일 금지: gradient/blur/shadow-* 사용하지 않음.
 */

import { MESSAGES } from '@/lib/messages';
import type { TournamentUiStatus } from '@/services/tournament.service';
import { cn } from '@/lib/utils';

interface Props {
  status: TournamentUiStatus;
  /** D-Day 숫자 (접수중/마감임박 상태에서만 표시) */
  dDay?: number;
  className?: string;
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 스타일 1:1 보존(타 화면 회귀 0).
   *   true 시 it-* 토큰(blue/red/ink — 달력 SoT 톤)으로 치환.
   */
  iceTheme?: boolean;
}

const STATUS_STYLE: Record<
  TournamentUiStatus,
  { bg: string; text: string; border: string }
> = {
  recruiting: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    text: 'text-ice-500 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-800',
  },
  closing_soon: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    text: 'text-red-700 dark:text-red-300',
    border: 'border-red-200 dark:border-red-800',
  },
  closed: {
    bg: 'bg-wline-2 dark:bg-rink-800',
    text: 'text-wtext-2 dark:text-rink-100',
    border: 'border-wline dark:border-rink-700',
  },
  in_progress: {
    bg: 'bg-green-50 dark:bg-green-900/20',
    text: 'text-green-700 dark:text-green-300',
    border: 'border-green-200 dark:border-green-800',
  },
  completed: {
    bg: 'bg-wline-2 dark:bg-rink-800',
    text: 'text-wtext-2 dark:text-rink-300',
    border: 'border-wline dark:border-rink-700',
  },
  cancelled: {
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    text: 'text-orange-700 dark:text-orange-300',
    border: 'border-orange-200 dark:border-orange-800',
  },
};

// ICETIMES flat 톤 — 달력 SoT(정규=초록 미사용 · 진행/접수=blue · 마감/취소=red · 종료=ink).
const STATUS_STYLE_ICE: Record<
  TournamentUiStatus,
  { bg: string; text: string; border: string }
> = {
  recruiting: {
    bg: 'bg-it-blue-50 dark:bg-it-blue-500/15',
    text: 'text-it-blue-500 dark:text-it-blue-300',
    border: 'border-it-blue-200 dark:border-it-blue-500/40',
  },
  closing_soon: {
    bg: 'bg-it-red-50 dark:bg-it-red-500/15',
    text: 'text-it-red-500 dark:text-it-red-300',
    border: 'border-it-red-200 dark:border-it-red-500/40',
  },
  closed: {
    bg: 'bg-it-fill dark:bg-rink-800',
    text: 'text-it-ink-600 dark:text-rink-100',
    border: 'border-it-line-strong dark:border-rink-700',
  },
  in_progress: {
    bg: 'bg-it-blue-50 dark:bg-it-blue-500/15',
    text: 'text-it-blue-500 dark:text-it-blue-300',
    border: 'border-it-blue-200 dark:border-it-blue-500/40',
  },
  completed: {
    bg: 'bg-it-fill dark:bg-rink-800',
    text: 'text-it-ink-500 dark:text-rink-300',
    border: 'border-it-line-strong dark:border-rink-700',
  },
  cancelled: {
    bg: 'bg-it-red-50 dark:bg-it-red-500/15',
    text: 'text-it-red-500 dark:text-it-red-300',
    border: 'border-it-red-200 dark:border-it-red-500/40',
  },
};

export function TournamentStatusBadge({ status, dDay, className, iceTheme = false }: Props) {
  const style = (iceTheme ? STATUS_STYLE_ICE : STATUS_STYLE)[status];
  const label = MESSAGES.tournament.statusLabel[status] ?? status;
  const showDDay =
    (status === 'recruiting' || status === 'closing_soon') &&
    dDay !== undefined &&
    dDay >= 0;

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-tight',
        style.bg,
        style.text,
        style.border,
        className,
      )}
      aria-label={`대회 상태: ${label}${showDDay ? ` D-${dDay}` : ''}`}
    >
      {label}
      {showDDay && <span className="tabular-nums">· D-{dDay}</span>}
    </span>
  );
}
