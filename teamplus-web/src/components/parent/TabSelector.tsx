'use client';

import { cn } from '@/lib/utils';

/**
 * TabSelector - 탭 전환 컴포넌트
 *
 * credits 페이지의 '결제 내역 | 사용 내역' 같은
 * 2~4개의 탭 전환 UI에 사용합니다.
 */
interface TabItem<T extends string> {
  /** 탭 식별 키 */
  key: T;
  /** 탭 표시 레이블 */
  label: string;
}

interface TabSelectorProps<T extends string> {
  /** 탭 목록 */
  tabs: TabItem<T>[];
  /** 현재 활성 탭 키 */
  activeTab: T;
  /** 탭 변경 핸들러 */
  onChange: (tab: T) => void;
  /** 추가 className (컨테이너) */
  className?: string;
}

export function TabSelector<T extends string>({
  tabs,
  activeTab,
  onChange,
  className = '',
}: TabSelectorProps<T>) {
  return (
    <div className={cn('flex rounded-xl bg-wline/50 dark:bg-rink-800/50 p-1', className)}>
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={cn(
              'flex-1 relative flex items-center justify-center rounded-lg py-2.5 text-sm font-bold transition-all duration-200',
              isActive
                ? 'text-ice-500 dark:text-white shadow-sm bg-white dark:bg-rink-700'
                : 'text-wtext-3 hover:text-wtext-2 dark:text-rink-300 dark:hover:text-rink-100'
            )}
            role="tab"
            aria-selected={isActive}
          >
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export type { TabItem };
