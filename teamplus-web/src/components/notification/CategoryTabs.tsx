'use client';

import { NotificationCategory, CATEGORY_LABELS } from '@/types/notification';
import { cn } from '@/lib/utils';

interface CategoryTabsProps {
  activeCategory: NotificationCategory;
  onCategoryChange: (category: NotificationCategory) => void;
  unreadCounts?: Partial<Record<NotificationCategory, number>>;
  /** [2026-06-18] 역할별 탭 목록 — 감독/코치: 전체/가입/결제/공지, 학부모: 전체/수업/결제/공지. */
  categories?: NotificationCategory[];
}

const DEFAULT_CATEGORIES: NotificationCategory[] = ['all', 'class', 'payment', 'notice'];

// Tailwind JIT 정적 클래스 — 동적 보간 불가하므로 명시 매핑.
const GRID_COLS: Record<number, string> = {
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
};

// [2026-05-19 04n Notice List 디자인 적용] 세그먼티드 컨트롤 패턴.
//   기존: 가로 스크롤 pill 칩. 신규: 카드 컨테이너 내부 grid 분할 — 활성 셀만 ice-500 채움.
//   [2026-06-18] 역할별 탭 목록(categories prop)로 외부 주입 가능하게 확장.
export function CategoryTabs({
  activeCategory,
  onCategoryChange,
  unreadCounts = {},
  categories = DEFAULT_CATEGORIES,
}: CategoryTabsProps) {
  return (
    <div className="px-5 pt-4 pb-1">
      <div
        className={cn(
          'bg-wsurface dark:bg-rink-800 rounded-2xl p-1',
          'border border-wline-2 dark:border-rink-700',
          'grid gap-1',
          GRID_COLS[categories.length] ?? 'grid-cols-4',
        )}
        role="tablist"
        aria-label="알림 카테고리 필터"
      >
        {categories.map((category) => {
          const isActive = activeCategory === category;
          const count = unreadCounts[category] || 0;
          const label = CATEGORY_LABELS[category];

          return (
            <button
              key={category}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-pressed={isActive}
              aria-label={count > 0 ? `${label} · 읽지 않음 ${count}건` : label}
              onClick={() => onCategoryChange(category)}
              className={cn(
                'h-9 rounded-xl border-0 cursor-pointer',
                'inline-flex items-center justify-center gap-1.5',
                'text-[13px] font-extrabold tracking-tight',
                'transition-colors motion-reduce:transition-none active:brightness-95',
                isActive
                  ? 'bg-ice-500 text-white shadow-sm'
                  : 'bg-transparent text-wtext-2 dark:text-rink-300 hover:bg-wline-2/40 dark:hover:bg-rink-700/40',
              )}
            >
              <span className="truncate">{label}</span>
              {count > 0 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'min-w-[18px] h-[18px] px-1.5 rounded-full',
                    'inline-flex items-center justify-center',
                    'text-[10px] font-extrabold tabular-nums',
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-wline-2 dark:bg-rink-700 text-wtext-3 dark:text-rink-300',
                  )}
                >
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default CategoryTabs;
