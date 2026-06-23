'use client';

/**
 * TeamTabBar — 팀 상세 페이지 탭 바
 *
 * 레퍼런스: 사용자 제공 HTML "팀 상세 정보" Sticky Tab Navigation
 *
 * pill 스타일 (기존 페이지와 일관성 유지). 역할 기반 탭 숨김은 사용 부모에서 처리.
 *
 * 2026-04-18 — 슬라이딩 인디케이터 애니메이션 추가
 * - 흰색 pill 배경이 활성 탭 위치로 transform + width 로 부드럽게 슬라이딩 (300ms cubic-bezier)
 * - `prefers-reduced-motion: reduce` 환경에서는 즉시 전환
 * - 기존 props/API 100% 호환
 */

import type { ReactNode, RefCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  AnimatedTabIndicator,
  useAnimatedTabIndicator,
} from '@/components/ui/AnimatedTabIndicator';

export interface TeamTab<K extends string> {
  key: K;
  label: string;
  /** 배지 카운트 (0 이면 숨김) */
  count?: number;
}

interface TeamTabBarProps<K extends string> {
  tabs: readonly TeamTab<K>[];
  active: K;
  onChange: (key: K) => void;
  /** 접근성 레이블 */
  ariaLabel?: string;
  /** 컨테이너 추가 클래스 */
  className?: string;
}

export function TeamTabBar<K extends string>({
  tabs,
  active,
  onChange,
  ariaLabel,
  className,
}: TeamTabBarProps<K>) {
  const { registerTab, containerRef, rect, ready } = useAnimatedTabIndicator({
    activeValue: active,
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
      aria-label={ariaLabel ?? '탭 메뉴'}
      className={cn(
        'relative flex rounded-xl bg-wline-2 p-1 dark:bg-rink-800',
        className,
      )}
    >
      <AnimatedTabIndicator
        style={indicatorStyle}
        ready={ready}
        className="rounded-lg bg-white dark:bg-rink-700 shadow-sm z-0"
      />
      {tabs.map((tab) => (
        <TabButton
          key={tab.key}
          label={tab.label}
          count={tab.count}
          active={active === tab.key}
          onClick={() => onChange(tab.key)}
          tabRef={registerTab(tab.key)}
        />
      ))}
    </div>
  );
}

// ─── Internal: TabButton ────────────────────────────
function TabButton({
  label,
  count,
  active,
  onClick,
  tabRef,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  tabRef: (el: HTMLElement | null) => void;
}): ReactNode {
  return (
    <button
      ref={tabRef as RefCallback<HTMLButtonElement>}
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'relative z-[1] flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-bold transition-colors duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/30',
        active
          ? 'text-ice-500 dark:text-white'
          : 'text-wtext-3 dark:text-rink-300',
      )}
    >
      <span>{label}</span>
      {typeof count === 'number' && count > 0 && (
        <span
          className={cn(
            'inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums',
            active
              ? 'bg-ice-500 text-white'
              : 'bg-wline text-wtext-2 dark:bg-rink-700 dark:text-rink-100',
          )}
          aria-label={`${count}건`}
        >
          {count}
        </span>
      )}
    </button>
  );
}
