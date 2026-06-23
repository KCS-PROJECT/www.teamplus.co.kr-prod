'use client';

import { cn } from '@/lib/utils';
import {
  AnimatedTabIndicator,
  useAnimatedTabIndicator,
} from '@/components/ui/AnimatedTabIndicator';

export interface MatchTab<T extends string = string> {
  value: T;
  label: string;
  /** 배지용 숫자 (예: 대기 신청자 수) */
  count?: number;
}

interface MatchSegmentedTabsProps<T extends string> {
  tabs: MatchTab<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * 매치 화면 상단 segmented 탭 (목록: 모집중/마감, 상세: 정보/명단/장소 등).
 *
 * HTML 소스의 "새 매치 등록 / 등록된 매치" 및 "경기 정보 / 참여 명단 / 장소 안내" 탭 패턴.
 *
 * 2026-04-18 — 슬라이딩 인디케이터 애니메이션 추가
 * - 흰색 pill 배경이 활성 탭 위치로 transform + width 로 부드럽게 슬라이딩 (300ms cubic-bezier)
 * - `prefers-reduced-motion: reduce` 환경에서는 즉시 전환
 * - 기존 props/API 100% 호환
 */
export function MatchSegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: MatchSegmentedTabsProps<T>) {
  const { registerTab, containerRef, rect, ready } = useAnimatedTabIndicator({
    activeValue: value,
  });

  // segmented pill: 활성 탭 전체를 덮는 흰색 둥근 배경
  const indicatorStyle: React.CSSProperties = rect
    ? {
        transform: `translate3d(${rect.left}px, ${rect.top}px, 0)`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        opacity: 1,
      }
    : { opacity: 0, pointerEvents: 'none' };

  return (
    <div
      ref={containerRef as React.RefCallback<HTMLDivElement>}
      role="tablist"
      className={cn(
        'relative flex rounded-xl bg-wline-2 dark:bg-rink-800 p-1',
        className
      )}
    >
      <AnimatedTabIndicator
        style={indicatorStyle}
        ready={ready}
        className="rounded-lg bg-white dark:bg-rink-900 shadow-sm z-0"
      />
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            ref={registerTab(tab.value) as React.RefCallback<HTMLButtonElement>}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              'relative z-[1] flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-lg text-sm font-bold transition-colors duration-200 motion-reduce:transition-none',
              active
                ? 'text-ice-500'
                : 'text-wtext-3 dark:text-rink-300 hover:text-wtext-2 dark:hover:text-rink-100'
            )}
          >
            {tab.label}
            {typeof tab.count === 'number' && tab.count > 0 && (
              <span
                className={cn(
                  'inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold',
                  active
                    ? 'bg-ice-500 text-white'
                    : 'bg-wline dark:bg-rink-700 text-wtext-2 dark:text-rink-100'
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
}
