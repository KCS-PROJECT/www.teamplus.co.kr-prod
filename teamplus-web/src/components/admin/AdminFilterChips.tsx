'use client';

interface FilterChip<T extends string = string> {
  /** 필터 키 */
  key: T;
  /** 표시 레이블 */
  label: string;
  /** 카운트 배지 (옵션) */
  count?: number;
  /** dot 색상 클래스 (옵션, 예: 'bg-green-500') */
  dotColor?: string;
}

interface AdminFilterChipsProps<T extends string = string> {
  /** 필터 옵션 배열 */
  filters: FilterChip<T>[];
  /** 현재 선택된 필터 키 */
  activeFilter: T;
  /** 필터 변경 핸들러 */
  onFilterChange: (key: T) => void;
  /** sticky 위치 오프셋 (기본: 'top-0') */
  stickyOffset?: string;
  /** 배경 스타일 variant */
  variant?: 'default' | 'segmented';
  /** 추가 CSS 클래스 */
  className?: string;
}

/**
 * Admin 필터 칩 그룹 컴포넌트
 *
 * coach-manage, popup, match-manage, tournament-manage 등에서
 * 수평 스크롤 가능한 필터 버튼 그룹으로 사용.
 *
 * @example
 * // pill 스타일 (기본)
 * <AdminFilterChips
 *   filters={[
 *     { key: 'all', label: '전체' },
 *     { key: 'active', label: '활동 중', dotColor: 'bg-green-500' },
 *     { key: 'inactive', label: '휴직' },
 *   ]}
 *   activeFilter={filter}
 *   onFilterChange={setFilter}
 * />
 *
 * // segmented 스타일 (탭처럼 보임)
 * <AdminFilterChips
 *   variant="segmented"
 *   filters={[
 *     { key: 'all', label: '전체' },
 *     { key: 'ongoing', label: '진행 중', count: 3 },
 *   ]}
 *   activeFilter={activeTab}
 *   onFilterChange={setActiveTab}
 * />
 */
export function AdminFilterChips<T extends string = string>({
  filters,
  activeFilter,
  onFilterChange,
  stickyOffset = 'top-0',
  variant = 'default',
  className = '',
}: AdminFilterChipsProps<T>) {
  if (variant === 'segmented') {
    return (
      <div
        className={`sticky ${stickyOffset} z-30 bg-wbg dark:bg-rink-900 px-5 py-4 border-b border-wline dark:border-rink-700 ${className}`}
      >
        <div className="flex p-1 bg-wline dark:bg-rink-700 rounded-lg">
          {filters.map((filter) => (
            <button
              key={filter.key}
              onClick={() => onFilterChange(filter.key)}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                activeFilter === filter.key
                  ? 'bg-white dark:bg-rink-500 text-ice-500 shadow-sm font-semibold'
                  : 'text-wtext-3 dark:text-rink-300 hover:text-wtext-2 dark:hover:text-rink-100'
              }`}
            >
              {filter.label}
              {typeof filter.count === 'number' && filter.count > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-[10px]">
                  {filter.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Default: pill 스타일
  return (
    <div
      className={`sticky ${stickyOffset} z-20 bg-wbg dark:bg-rink-900 border-b border-wline-2 dark:border-rink-700 ${className}`}
    >
      <div className="flex gap-2 px-4 py-3 overflow-x-auto hide-scrollbar">
        {filters.map((filter) => (
          <button
            key={filter.key}
            onClick={() => onFilterChange(filter.key)}
            className={`flex h-9 shrink-0 items-center justify-center gap-2 px-4 rounded-full text-sm font-medium transition-colors active:brightness-95 ${
              activeFilter === filter.key
                ? 'bg-rink-800 dark:bg-wline text-white dark:text-wtext-1 shadow-sm'
                : 'bg-white dark:bg-rink-800 border border-wline dark:border-rink-700 text-wtext-2 dark:text-rink-100 hover:border-ice-500/50'
            }`}
          >
            {filter.dotColor && (
              <span className={`size-2 rounded-full ${filter.dotColor}`} />
            )}
            <span>{filter.label}</span>
            {typeof filter.count === 'number' && (
              <span className="text-xs opacity-75">({filter.count})</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export type { FilterChip };
