'use client';

export interface OtherClubItem {
  name: string;
  grade?: string;
  points?: number;
  /** 아이콘 박스 색상 */
  color?: string;
  onClick?: () => void;
}

/**
 * OtherClubList — B2 "다른 링크 멤버십" 리스트
 */
export function OtherClubList({ items }: { items: OtherClubItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="px-3 sm:px-5 flex flex-col gap-2">
      {items.map((m, i) => (
        <button
          key={i}
          type="button"
          onClick={m.onClick}
          className="flex items-center w-full bg-wsurface dark:bg-rink-800 text-left border-0 rounded-[14px] gap-2.5 sm:gap-3 px-3 sm:px-4 py-3 sm:py-3.5 shadow-[0_1px_3px_rgba(20,24,38,0.04)]"
        >
          <div
            className="grid place-items-center w-10 h-10 sm:w-11 sm:h-11 rounded-[10px] shrink-0"
            style={{
              background: m.color ?? 'var(--c-rink-300)',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              stroke="#fff"
              strokeWidth="2.2"
              fill="none"
              className="w-5 h-5 sm:w-[22px] sm:h-[22px]"
            >
              <path d="M12 2 L14 8 L20 8 L15 12 L17 18 L12 14 L7 18 L9 12 L4 8 L10 8 Z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-wtext-1 dark:text-white truncate text-[13px] sm:text-[14px] tracking-[-0.02em]">
              {m.name}
            </div>
            {(m.grade || m.points != null) && (
              <div className="text-wtext-3 dark:text-rink-300 truncate font-num text-[10px] sm:text-[11px] mt-0.5">
                {[m.grade, m.points != null ? `${m.points.toLocaleString()}P` : null]
                  .filter(Boolean)
                  .join(' · ')}
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
