'use client';

import { ReactNode } from 'react';

export interface MoreServiceItem {
  title: string;
  sub?: string;
  /** "추천", "신규" 등 */
  tag?: string | null;
  /** 칩 색상 (ice / flame / mint / sun) */
  tagColor?: 'ice' | 'flame' | 'mint' | 'sun';
  icon?: ReactNode;
  onClick?: () => void;
}

const TAG_COLORS: Record<NonNullable<MoreServiceItem['tagColor']>, { bg: string; fg: string }> = {
  ice:   { bg: 'var(--c-ice-100)',   fg: 'var(--c-ice-700)' },
  flame: { bg: 'var(--c-flame-100)', fg: 'var(--c-flame-500)' },
  mint:  { bg: 'var(--c-mint-100)',  fg: 'var(--c-mint-500)' },
  sun:   { bg: 'var(--c-sun-100)',   fg: 'var(--c-sun-500)' },
};

/**
 * MoreServicesList — B4 "더 많은 서비스" 리스트
 */
export function MoreServicesList({ items }: { items: MoreServiceItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="px-3 sm:px-5 flex flex-col gap-2">
      {items.map((s, i) => (
        <button
          key={i}
          type="button"
          onClick={s.onClick}
          className="flex items-center w-full bg-wsurface dark:bg-rink-800 text-left border-0 rounded-[14px] gap-2.5 sm:gap-3 px-3 sm:px-4 py-3 sm:py-3.5 shadow-[0_1px_3px_rgba(20,24,38,0.04)]"
        >
          <div
            className="grid place-items-center w-9 h-9 sm:w-10 sm:h-10 rounded-[10px] shrink-0"
            style={{
              background: 'var(--c-ice-50)',
              color: 'var(--c-ice-600)',
            }}
          >
            {s.icon ?? <DefaultClockIcon />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="font-bold text-wtext-1 dark:text-white truncate text-[13px] sm:text-[14px] tracking-[-0.02em] min-w-0">
                {s.title}
              </div>
              {s.tag && (
                <span
                  className="inline-flex items-center font-extrabold h-[18px] px-1.5 text-[9px] sm:text-[10px] rounded shrink-0 whitespace-nowrap"
                  style={{
                    background: TAG_COLORS[s.tagColor ?? 'ice'].bg,
                    color: TAG_COLORS[s.tagColor ?? 'ice'].fg,
                  }}
                >
                  {s.tag}
                </span>
              )}
            </div>
            {s.sub && (
              <div className="text-wtext-3 dark:text-rink-300 truncate text-[10px] sm:text-[11px] mt-0.5">
                {s.sub}
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

function DefaultClockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
      fill="none"
      className="w-5 h-5"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
