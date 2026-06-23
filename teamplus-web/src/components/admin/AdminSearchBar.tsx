'use client';

import { Icon } from '@/components/ui/Icon';

interface AdminSearchBarProps {
  /** 검색어 */
  value: string;
  /** 검색어 변경 핸들러 */
  onChange: (value: string) => void;
  /** placeholder 텍스트 */
  placeholder?: string;
  /** 우측 필터 버튼 표시 여부 */
  showFilter?: boolean;
  /** 필터 버튼 클릭 핸들러 */
  onFilterClick?: () => void;
  /** sticky 위치 (기본: 'top-0') */
  stickyOffset?: string;
  /** 추가 CSS 클래스 */
  className?: string;
}

/**
 * Admin 검색 바 컴포넌트
 *
 * venue-manage, tournament-manage 등에서 사용하는 검색 입력 영역.
 * sticky로 고정 가능하며, 우측에 필터 버튼을 추가할 수 있음.
 *
 * @example
 * <AdminSearchBar
 *   value={searchQuery}
 *   onChange={setSearchQuery}
 *   placeholder="대회명, 장소 검색..."
 * />
 *
 * <AdminSearchBar
 *   value={query}
 *   onChange={setQuery}
 *   placeholder="구장명 또는 주소 검색"
 *   showFilter
 *   onFilterClick={() => setShowFilters(true)}
 * />
 */
export function AdminSearchBar({
  value,
  onChange,
  placeholder = '검색...',
  showFilter = false,
  onFilterClick,
  stickyOffset,
  className = '',
}: AdminSearchBarProps) {
  const stickyClass = stickyOffset ? `sticky ${stickyOffset} z-20` : '';

  return (
    <div className={`${stickyClass} bg-wbg dark:bg-rink-900 px-5 py-4 ${className}`}>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <Icon name="search" className="text-wtext-3 dark:text-rink-300 text-xl" />
          </div>
          <input
            type="search"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className="block w-full pl-10 pr-4 py-3 border-none rounded-xl bg-white dark:bg-rink-800 text-wtext-1 dark:text-white placeholder-wtext-3 dark:placeholder-rink-300 focus:outline-none focus:ring-2 focus:ring-ice-500 text-sm shadow-sm"
          />
        </div>
        {showFilter && (
          <button
            type="button"
            onClick={onFilterClick}
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-white dark:bg-rink-800 text-wtext-3 dark:text-rink-300 hover:text-ice-500 hover:bg-ice-500/10 dark:hover:bg-ice-500/20 transition-colors motion-reduce:transition-none shadow-sm"
            aria-label="필터"
          >
            <Icon name="tune" className="text-xl" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
