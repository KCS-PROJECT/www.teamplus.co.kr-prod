'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils';

/**
 * CoachFilterTabs - 코치 페이지 공통 필터 탭 (pill 스타일)
 *
 * 사용처: coach-members (전체/활성/비활성), attendance-manage 등
 * 패턴: 수평 스크롤 가능한 pill 형태 필터 버튼 그룹
 */
export interface FilterTabItem {
  /** 탭 고유 키 */
  key: string;
  /** 표시 라벨 */
  label: string;
  /** 카운트 (선택적) */
  count?: number;
}

export interface CoachFilterTabsProps {
  /** 탭 목록 */
  tabs: FilterTabItem[];
  /** 현재 선택된 탭 키 */
  activeKey: string;
  /** 탭 변경 핸들러 */
  onChange: (key: string) => void;
  /** 추가 className */
  className?: string;
}

export const CoachFilterTabs = memo(function CoachFilterTabs({
  tabs,
  activeKey,
  onChange,
  className,
}: CoachFilterTabsProps) {
  return (
    <div
      className={cn(
        'flex gap-2 overflow-x-auto pb-1 -mx-5 px-5 hide-scrollbar',
        className
      )}
      role="tablist"
      aria-label="필터"
    >
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap',
              isActive
                ? 'bg-ice-500 text-white'
                : 'bg-wline-2 dark:bg-rink-800 text-wtext-2 dark:text-rink-100 hover:bg-wline dark:hover:bg-rink-700'
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  'min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold flex items-center justify-center',
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'bg-wline dark:bg-rink-700 text-wtext-3 dark:text-rink-300'
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
});
