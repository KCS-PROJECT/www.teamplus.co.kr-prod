'use client';

import { ReactNode } from 'react';

export interface AffiliateBenefit {
  name: string;
  off: string;
  /** 아이콘 영역 색상 (var() 권장) */
  color?: string;
  icon?: ReactNode;
  onClick?: () => void;
}

/**
 * AffiliateBenefitsGrid — B2 멤버십 "제휴 혜택" 2열 그리드
 */
export function AffiliateBenefitsGrid({
  benefits,
}: {
  benefits: AffiliateBenefit[];
}) {
  if (benefits.length === 0) return null;
  return (
    <div className="px-3 sm:px-5">
      <div className="grid grid-cols-2 gap-2">
        {benefits.map((b, i) => (
          <button
            key={i}
            type="button"
            onClick={b.onClick}
            className="bg-wsurface dark:bg-rink-800 text-left border-0 rounded-xl px-3 sm:px-3.5 py-3 shadow-[0_1px_3px_rgba(20,24,38,0.04)] min-w-0"
          >
            <div
              className="grid place-items-center w-8 h-8 rounded-lg mb-2"
              style={{
                background: b.color ?? 'var(--c-ice-100)',
              }}
            >
              {b.icon}
            </div>
            <div className="font-bold text-wtext-1 dark:text-white text-[12px] sm:text-[13px] tracking-[-0.02em] truncate break-keep">
              {b.name}
            </div>
            <div
              className="font-num font-extrabold text-[11px] sm:text-[12px] mt-0.5 truncate"
              style={{ color: 'var(--c-ice-600)' }}
            >
              -{b.off}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
