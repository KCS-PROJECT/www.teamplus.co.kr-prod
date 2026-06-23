'use client';

/**
 * FilterTabs - TEAMPLUS Shared Component
 * 상단 세그먼트 컨트롤형 필터 탭. 카운트 배지 옵션 지원.
 * 사용 화면: /members (대기/승인/거절), /matches (전체/모집중/마감), /notifications, /messages
 *
 * 2026-04-18 — 슬라이딩 인디케이터 애니메이션 추가
 * - Primary 2px 밑줄이 활성 탭 위치로 transform + width 로 부드럽게 슬라이딩 (300ms cubic-bezier)
 * - 기존 props/API 100% 호환 (추가 없음)
 * - `prefers-reduced-motion: reduce` 환경에서는 즉시 전환
 */

import { cn } from '@/lib/utils';
import {
  AnimatedTabIndicator,
  useAnimatedTabIndicator,
} from '@/components/ui/AnimatedTabIndicator';

export interface FilterTabItem {
  /** 고유 키 */
  key: string;
  /** 탭 레이블 */
  label: string;
  /** 카운트 뱃지 (옵션) */
  count?: number;
}

export interface FilterTabsProps {
  /** 탭 목록 */
  tabs: FilterTabItem[];
  /** 현재 활성 탭 키 */
  activeKey: string;
  /** 탭 변경 핸들러 */
  onChange: (key: string) => void;
  /** 추가 className */
  className?: string;
  /** aria-label (탭 그룹 설명) */
  ariaLabel?: string;
}

export function FilterTabs({
  tabs,
  activeKey,
  onChange,
  className,
  ariaLabel = '필터 탭',
}: FilterTabsProps) {
  const { registerTab, containerRef, rect, ready } = useAnimatedTabIndicator({
    activeValue: activeKey,
  });

  // 밑줄(2px) 을 활성 탭 bottom 바로 위(-1px, border-b 위치) 에 위치시킨다.
  // 컨테이너가 `border-b` 를 갖고 있으므로, 인디케이터의 top = tab.offsetTop + tab.offsetHeight - 1
  const indicatorStyle: React.CSSProperties = rect
    ? {
        transform: `translate3d(${rect.left}px, ${rect.top + rect.height - 1}px, 0)`,
        width: `${rect.width}px`,
        height: '2px',
        opacity: 1,
      }
    : { opacity: 0, pointerEvents: 'none' };

  return (
    <div
      ref={containerRef as React.RefCallback<HTMLDivElement>}
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'relative flex items-center gap-8 border-b border-wline-2 dark:border-rink-700',
        'overflow-x-auto no-scrollbar',
        className
      )}
    >
      <AnimatedTabIndicator
        style={indicatorStyle}
        ready={ready}
        className="bg-ice-500 z-0"
      />
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            ref={registerTab(tab.key) as React.RefCallback<HTMLButtonElement>}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`filter-tab-panel-${tab.key}`}
            onClick={() => onChange(tab.key)}
            className={cn(
              'relative z-[1] shrink-0 py-3 text-sm transition-colors duration-150 motion-reduce:transition-none',
              'focus:outline-none focus:ring-2 focus:ring-ice-500/40 rounded',
              'inline-flex items-center gap-1.5',
              isActive
                ? 'text-ice-500 font-bold'
                : 'text-wtext-3 dark:text-rink-300 font-medium hover:text-wtext-2 dark:hover:text-rink-100'
            )}
          >
            <span>{tab.label}</span>
            {typeof tab.count === 'number' && tab.count > 0 && (
              <span
                className={cn(
                  'inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold',
                  isActive
                    ? 'bg-ice-500 text-white'
                    : 'bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-rink-100'
                )}
                aria-label={`${tab.count}건`}
              >
                {tab.count > 99 ? '99+' : tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default FilterTabs;
