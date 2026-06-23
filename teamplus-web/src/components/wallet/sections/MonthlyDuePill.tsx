'use client';

import { MESSAGES } from '@/lib/messages';

/**
 * MonthlyDuePill — B1 이번달 결제할 금액 strip
 *
 * 가변형(fluid) 리팩토링 (2026-05-07):
 *   - inline px 고정값 → Tailwind 점진형
 *   - 좁은 화면에서도 라벨 + 금액 + chevron 한 줄 유지
 *   - 큰 금액(예: 1,234,567원)도 truncate + min-w-0 로 보호
 *
 * 좌상단 점수 배지(9.1) + 본문 라벨 + 우측 금액 + chevron
 */
export interface MonthlyDuePillProps {
  amount: number;
  score?: string;
  label?: string;
  unit?: string;
  onClick?: () => void;
}

export function MonthlyDuePill({
  amount,
  score,
  label = MESSAGES.wallet.pay.monthlyDue,
  unit = '원',
  onClick,
}: MonthlyDuePillProps) {
  return (
    <div className="px-3 sm:px-5 pt-4">
      <button
        type="button"
        onClick={onClick}
        className="flex items-center w-full bg-wsurface dark:bg-rink-800 relative text-left border-0 rounded-[14px] gap-2 sm:gap-2.5 px-3 sm:px-4 py-3 sm:py-3.5 shadow-[0_1px_3px_rgba(20,24,38,0.04)]"
      >
        {score && (
          <span
            className="absolute font-num font-bold text-white text-[10px] rounded-[3px] px-1.5 py-0.5"
            style={{
              top: -8,
              left: 14,
              background: 'var(--c-ice-600)',
            }}
          >
            {score}
          </span>
        )}

        <div className="flex items-center gap-1.5 text-wtext-2 dark:text-rink-100 font-semibold text-[13px] sm:text-[14px] min-w-0 break-keep">
          <span className="truncate">{label}</span>
          <span
            className="grid place-items-center font-bold rounded-full text-[9px] w-3.5 h-3.5 shrink-0"
            style={{
              border: '1px solid var(--c-text-4)',
              color: 'var(--c-text-4)',
            }}
          >
            ?
          </span>
        </div>

        <div className="flex-1 min-w-0" />

        <div
          className="font-num font-extrabold text-[clamp(18px,5vw,22px)] tabular-nums shrink-0"
          style={{ color: 'var(--c-ice-600)' }}
        >
          {amount.toLocaleString('ko-KR')}
          <span className="font-sans text-[12px] sm:text-[14px]">{unit}</span>
        </div>

        <svg
          viewBox="0 0 24 24"
          stroke="var(--c-text-3)"
          strokeWidth="2"
          fill="none"
          className="w-4 h-4 shrink-0"
        >
          <polyline points="9 6 15 12 9 18" />
        </svg>
      </button>
    </div>
  );
}
