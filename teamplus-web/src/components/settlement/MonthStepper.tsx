'use client';

import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import { shiftMonth } from '@/components/settlement/settlement-format';

/**
 * 월 스텝퍼 — 네이비 밴드 위 ◀ 라벨 ▶. 미래 월은 ▶ 비활성.
 * 라벨은 호출부가 주입한다(결제 내역 "N월 결제" / 납부 현황 "N월분").
 */
export function MonthStepper({
  yearMonth,
  currentYm,
  onChange,
  label,
}: {
  yearMonth: string;
  currentYm: string;
  onChange: (ym: string) => void;
  label: string;
}) {
  const nextMonthDisabled = yearMonth >= currentYm;
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(shiftMonth(yearMonth, -1))}
        aria-label={MESSAGES.settlement.prevMonth}
        className="grid h-7 w-7 place-items-center rounded-w-pill text-white/80 transition-colors hover:bg-white/12 active:brightness-95 motion-reduce:transition-none"
      >
        <Icon name="chevron_left" className="text-[18px]" aria-hidden="true" />
      </button>
      <span className="min-w-[92px] rounded-w-pill bg-white/12 px-2.5 py-1 text-center text-[12px] font-bold text-white tabular-nums">
        {label}
      </span>
      <button
        type="button"
        onClick={() => onChange(shiftMonth(yearMonth, 1))}
        disabled={nextMonthDisabled}
        aria-label={MESSAGES.settlement.nextMonth}
        className="grid h-7 w-7 place-items-center rounded-w-pill text-white/80 transition-colors hover:bg-white/12 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-30 motion-reduce:transition-none"
      >
        <Icon name="chevron_right" className="text-[18px]" aria-hidden="true" />
      </button>
    </div>
  );
}
