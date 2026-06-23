'use client';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';
import type { RecentMenuEntry } from '@/lib/recent-menu';

interface DrawerRecentMenuProps {
  items: RecentMenuEntry[];
  onNavigate: (entry: RecentMenuEntry) => void;
  className?: string;
}

/**
 * DrawerRecentMenu — Drawer 전용 "최근 이용 메뉴" 가로 스크롤 칩
 *
 * - items 빈 배열 → "최근 이용한 메뉴가 없어요" 빈 상태
 * - items 있음     → Icon + label 칩, 클릭 시 onNavigate(entry)
 * - aria-label="최근 이용 메뉴"
 * - 솔리드 컬러만 사용 (gradient/blur 금지)
 */
export function DrawerRecentMenu({
  items,
  onNavigate,
  className,
}: DrawerRecentMenuProps) {
  return (
    <section
      className={cn(
        'bg-white dark:bg-rink-800 rounded-2xl border border-wline-2 dark:border-rink-700 shadow-sm',
        className,
      )}
      aria-label={MESSAGES.drawer.recentMenu}
    >
      <div className="px-5 pt-4 pb-2 flex items-center gap-2">
        <Icon
          name="history"
          className="text-[18px] text-wtext-3 dark:text-rink-300"
          aria-hidden="true"
        />
        <h3 className="text-[13px] font-bold text-wtext-1 dark:text-white">
          {MESSAGES.drawer.recentMenu}
        </h3>
      </div>

      {items.length === 0 ? (
        <div className="px-5 pb-4 pt-1">
          <p className="text-xs text-wtext-3 dark:text-rink-300">
            {MESSAGES.drawer.noRecent}
          </p>
        </div>
      ) : (
        <div
          className="px-5 pb-4 overflow-x-auto hide-scrollbar"
          style={{ scrollbarWidth: 'none' }}
        >
          <ul className="flex gap-2 flex-nowrap min-w-max whitespace-nowrap">
            {items.map((entry) => (
              <li key={`${entry.href}-${entry.ts}`}>
                <button
                  type="button"
                  onClick={() => onNavigate(entry)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full',
                    'bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100',
                    'hover:bg-ice-500 hover:text-white dark:hover:bg-ice-500',
                    'border border-wline dark:border-rink-700',
                    'text-xs font-semibold transition-colors motion-reduce:transition-none',
                    'focus-visible:ring-2 focus-visible:ring-ice-500/40 focus-visible:outline-none',
                  )}
                  aria-label={`${entry.label} 바로가기`}
                >
                  <Icon
                    name={entry.icon}
                    className="text-[16px]"
                    aria-hidden="true"
                  />
                  <span>{entry.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
