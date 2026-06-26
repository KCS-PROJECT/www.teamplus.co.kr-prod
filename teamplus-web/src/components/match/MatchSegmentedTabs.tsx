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
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 스타일 1:1 보존(타 화면 회귀 0).
   *   true 시 it-* 토큰(it-fill 트랙 · it-surface pill · it-blue 활성 텍스트).
   */
  iceTheme?: boolean;
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
  iceTheme = false,
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
        'relative flex rounded-w-md p-1',
        iceTheme ? 'bg-it-fill dark:bg-rink-800' : 'rounded-xl bg-wline-2 dark:bg-rink-800',
        className
      )}
    >
      <AnimatedTabIndicator
        style={indicatorStyle}
        ready={ready}
        className={cn(
          'shadow-sm z-0',
          iceTheme ? 'rounded-w-md bg-it-surface dark:bg-rink-900' : 'rounded-lg bg-white dark:bg-rink-900'
        )}
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
              'relative z-[1] flex-1 inline-flex items-center justify-center gap-1.5 h-10 text-sm font-bold transition-colors duration-200 motion-reduce:transition-none',
              iceTheme ? 'rounded-w-md' : 'rounded-lg',
              active
                ? iceTheme
                  ? 'text-it-blue-500'
                  : 'text-ice-500'
                : iceTheme
                  ? 'text-it-ink-500 dark:text-it-ink-300 hover:text-it-ink-800 dark:hover:text-white'
                  : 'text-wtext-3 dark:text-rink-300 hover:text-wtext-2 dark:hover:text-rink-100'
            )}
          >
            {tab.label}
            {typeof tab.count === 'number' && tab.count > 0 && (
              <span
                className={cn(
                  'inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-w-pill px-1.5 text-[10px] font-bold',
                  active
                    ? iceTheme
                      ? 'bg-it-blue-500 text-white'
                      : 'bg-ice-500 text-white'
                    : iceTheme
                      ? 'bg-it-line dark:bg-rink-700 text-it-ink-600 dark:text-it-ink-300'
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
