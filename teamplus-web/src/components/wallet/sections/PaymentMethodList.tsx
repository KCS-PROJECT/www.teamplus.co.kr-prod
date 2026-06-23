'use client';

import { MESSAGES } from '@/lib/messages';

export interface PaymentMethod {
  name: string;
  sub?: string;
  /** 좌측 아이콘 박스 배경 (CSS color 또는 var()) */
  color?: string;
  /** 좌측 아이콘 박스 안의 텍스트/이모지 */
  icon: string;
  onClick?: () => void;
}

/**
 * PaymentMethodList — B1 "기타 결제수단" 리스트
 */
export function PaymentMethodList({ methods }: { methods: PaymentMethod[] }) {
  if (methods.length === 0) return null;
  return (
    <div className="px-3 sm:px-5 pt-4">
      <div className="text-wtext-3 dark:text-rink-300 font-semibold text-[12px] sm:text-[13px] mb-2 tracking-[-0.02em]">
        {MESSAGES.wallet.pay.otherPaymentTitle}
      </div>
      {methods.map((m, i) => (
        <button
          key={i}
          type="button"
          onClick={m.onClick}
          className="flex items-center w-full bg-wsurface dark:bg-rink-800 text-left border-0 rounded-[14px] mb-2 px-3 sm:px-4 py-3 sm:py-3.5 gap-2.5 sm:gap-3 shadow-[0_1px_3px_rgba(20,24,38,0.04)]"
        >
          <div
            className="grid place-items-center font-num font-extrabold text-wtext-1 w-10 sm:w-11 h-8 rounded-md text-[13px] sm:text-[14px] shrink-0"
            style={{
              background: m.color ?? 'var(--c-ice-100)',
            }}
          >
            {m.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-wtext-1 dark:text-white truncate text-[13px] sm:text-[14px] tracking-[-0.02em]">
              {m.name}
            </div>
            {m.sub && (
              <div className="text-wtext-3 dark:text-rink-300 truncate text-[10px] sm:text-[11px] mt-0.5">
                {m.sub}
              </div>
            )}
          </div>
          <svg
            viewBox="0 0 24 24"
            stroke="var(--c-text-4)"
            strokeWidth="2"
            fill="none"
            className="w-3.5 h-3.5 shrink-0"
          >
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </button>
      ))}
    </div>
  );
}
