'use client';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';
import { staggerDelay, formatCurrency } from '@/components/settlement/settlement-format';
import type { UnpaidMemberRow } from '@/services/payment';

export function UnpaidMemberCard({
  member,
  index = 0,
  last,
  isReminding = false,
  onRemind,
  onDetail,
}: {
  member: UnpaidMemberRow;
  index?: number;
  last?: boolean;
  isReminding?: boolean;
  onRemind: (member: UnpaidMemberRow) => void;
  onDetail: (member: UnpaidMemberRow) => void;
}) {
  // 회원이 수업·대회를 동시에 미납할 수 있어 출처별 건수 메타로 표기 — 미납액이
  //   여러 건의 합산임을 카드에서 바로 읽히게 한다.
  const hasClass = member.sources.includes('CLASS');
  const hasTournament = member.sources.includes('TOURNAMENT');
  const sourceCountText = [
    hasClass ? MESSAGES.settlement.sourceClassCount(member.classCount) : null,
    hasTournament
      ? MESSAGES.settlement.sourceTournamentCount(member.tournamentCount)
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <article
      className={cn(
        'animate-slide-up py-[14px] motion-reduce:animate-none',
        !last && 'border-b border-it-line dark:border-rink-700',
      )}
      style={{ animationDelay: staggerDelay(index) }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {/* 시안 Avatar(red tone) — 44px. 인물 자리이므로 이니셜 대신 person 아이콘. */}
          <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-w-pill bg-it-red-50 dark:bg-it-red-500/15">
            <Icon
              name="person"
              className="text-[24px] text-it-red-500 dark:text-it-red-300"
              aria-hidden="true"
            />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-[15px] font-bold text-it-ink-800 truncate dark:text-white">{member.name}</h4>
            {member.teamName && (
              <p className="text-[13px] text-it-ink-500 truncate dark:text-wtext-4">{member.teamName}</p>
            )}
            {sourceCountText && (
              <p className="mt-1 text-[13px] text-it-ink-500 truncate dark:text-wtext-4">
                {sourceCountText}
              </p>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11.5px] font-medium text-it-ink-400 dark:text-wtext-4">
            {MESSAGES.settlement.unpaidLabel}
          </p>
          <p className="mt-0.5 text-[15px] font-extrabold text-it-red-500 tabular-nums">
            {formatCurrency(member.outstandingAmount)}
            <span className="ml-0.5 text-[12px] font-medium">{MESSAGES.settlement.won}</span>
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => onRemind(member)}
          disabled={isReminding}
          className="inline-flex h-10 flex-1 items-center justify-center rounded-w-md bg-it-blue-500 text-[13.5px] font-semibold text-white transition-colors hover:bg-it-blue-600 active:brightness-[0.98] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
        >
          {isReminding ? MESSAGES.director2.sending : MESSAGES.settlement.sendReminder}
        </button>
        <button
          type="button"
          onClick={() => onDetail(member)}
          className="inline-flex h-10 flex-1 items-center justify-center rounded-w-md border-[1.5px] border-it-line-strong text-[13.5px] font-semibold text-it-blue-600 transition-colors hover:bg-it-fill active:brightness-[0.98] motion-reduce:transition-none dark:border-rink-700 dark:text-wtext-4 dark:hover:bg-rink-700"
        >
          {MESSAGES.settlement.viewDetail}
        </button>
      </div>
    </article>
  );
}
