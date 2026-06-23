'use client';

import { ReactNode } from 'react';

export interface QuickServiceItem {
  /** "택시\n호출" — \n 으로 2줄 */
  label: string;
  /** 아이콘 박스 색상 (CSS color) — 박스 배경에 15% opacity 적용 */
  color: string;
  /** 아이콘 (이모지 또는 SVG) */
  icon: ReactNode;
  onClick?: () => void;
}

/**
 * QuickServicesGrid — B4 "자주 쓰는 서비스" 4열 그리드
 */
export function QuickServicesGrid({ items }: { items: QuickServiceItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="px-3 sm:px-5">
      <div className="grid grid-cols-4 gap-2">
        {items.map((s, i) => (
          <button
            key={i}
            type="button"
            onClick={s.onClick}
            className="flex flex-col items-center bg-wsurface dark:bg-rink-800 border-0 rounded-[14px] py-3 sm:py-3.5 px-1.5 sm:px-2 gap-2 shadow-[0_1px_3px_rgba(20,24,38,0.04)] min-w-0"
          >
            <div className="relative w-9 h-9 sm:w-10 sm:h-10">
              <div
                className="absolute inset-0 rounded-xl opacity-15"
                style={{ background: s.color }}
                aria-hidden
              />
              <div className="absolute inset-0 grid place-items-center text-[20px] sm:text-[22px]">
                {s.icon}
              </div>
            </div>
            <div className="text-center font-semibold text-wtext-2 dark:text-rink-100 text-[10px] sm:text-[11px] whitespace-pre-line leading-[1.2] tracking-[-0.02em] break-keep">
              {s.label}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
