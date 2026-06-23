'use client';

import { memo } from 'react';
import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';

/**
 * PullToRefreshIndicator
 *
 * 6개 역할별 메인화면(admin · director · coach · parent · teen · child) 에서
 * 공통으로 사용하는 Pull-to-Refresh 인디케이터.
 *
 * v3 (2026-04-22 — "날짜 위 스피너 안 보임" 회귀 수정):
 *   · 이전 v2 는 `<main>` 내부 `absolute top-0` overlay 로 배치 → iOS/WebView 의
 *     네이티브 bounce 스크롤이 먼저 발동해 `<main>` 전체가 translateY 로 밀리면
 *     인디케이터가 AppBar 뒤로 숨어 보이지 않는 버그.
 *   · 수정: 이제 `<main>` 외부 (AppBar ↔ main 사이) 의 **flex item** 으로 배치.
 *     호출측은 `<PageAppBar>` (또는 thin wrapper `<WalletAppBar>`) 와 `<main>` 사이에 이 컴포넌트를 놓는다.
 *     `<main>` 의 스크롤/bounce 와 완전히 독립되어 어떤 환경에서도 항상 노출.
 *   · height 전환 시 `<main>` 이 `flex-1` 이라 자동 수축 → 자연스러운 당김 연출.
 *
 * SPEC: docs/Planning/SPEC_PULL_TO_REFRESH.md
 *
 * 상태 전이:
 *   1) pullDistance === 0 && !isRefreshing → height 0 (접힘, flex item 으로 공간 안 차지)
 *   2) 0 < pullDistance < threshold       → "아래로 당겨서 새로고침" + 진행률 비례 회전 화살표
 *   3) pullDistance >= threshold          → Primary 컬러 + "놓으면 새로고침"
 *   4) isRefreshing                        → 원형 스피너 + "새로고침 중..."
 *
 * Design 7 원칙:
 *   · NO gradient / NO backdrop-blur / NO colored shadow
 *   · Primary(#1E3FAE) 단색 · 원형 border 스피너
 *   · motion-reduce 환경 대응 (transition-none)
 *
 * CHILD 화면(WCAG AAA) 은 size="lg" 로 호출: 스피너 32×32 · 텍스트 16px · 7:1 대비.
 */

export interface PullToRefreshIndicatorProps {
  /** 현재 당긴 거리 (px) — usePullToRefresh 훅에서 주입 */
  pullDistance: number;
  /** 새로고침 진행 중 여부 — usePullToRefresh 훅에서 주입 */
  isRefreshing: boolean;
  /** 트리거 임계값 (px) — 기본 80 */
  threshold?: number;
  /** 크기 변형 — 'md'(일반 24×24 · 13px) · 'lg'(CHILD 32×32 · 16px · WCAG AAA) */
  size?: 'md' | 'lg';
  /** role="status" aria-label (테스트 · 스크린리더용) */
  ariaLabel?: string;
  /** 추가 className */
  className?: string;
}

const SPINNER_SIZE = {
  md: 'w-6 h-6 border-2',
  lg: 'w-8 h-8 border-[3px]',
} as const;

const ICON_SIZE = {
  md: 'text-xl',
  lg: 'text-2xl',
} as const;

const TEXT_SIZE = {
  md: 'text-sm',
  lg: 'text-base font-semibold',
} as const;

const REFRESHING_HEIGHT = {
  md: 48,
  lg: 60,
} as const;

export const PullToRefreshIndicator = memo(function PullToRefreshIndicator({
  pullDistance,
  isRefreshing,
  threshold = 80,
  size = 'md',
  ariaLabel,
  className,
}: PullToRefreshIndicatorProps) {
  const isVisible = pullDistance > 0 || isRefreshing;
  const refreshingHeight = REFRESHING_HEIGHT[size];
  const height = isVisible
    ? Math.max(pullDistance, isRefreshing ? refreshingHeight : 0)
    : 0;

  const reached = pullDistance >= threshold;
  const rotateDeg = Math.min((pullDistance / threshold) * 180, 180);

  return (
    <div
      className={cn(
        // <main> 외부 flex item — AppBar 와 main 사이에 위치하여 어떤 bounce 스크롤
        // 환경에서도 "날짜 위 스피너" 가 안정적으로 노출되도록 한다.
        // flex-shrink-0 으로 collapse 방지 · height style 로 동적 확장.
        'flex-shrink-0 flex justify-center items-end overflow-hidden',
        'bg-wbg dark:bg-rink-900',
        'transition-[height] duration-200 ease-out motion-reduce:transition-none',
        className,
      )}
      style={{ height }}
      role="status"
      aria-live="polite"
      aria-label={ariaLabel ?? MESSAGES.ui.refreshing}
    >
      <div className="flex items-center gap-2 pb-2 text-wtext-3 dark:text-rink-300">
        {isRefreshing ? (
          <>
            <div
              className={cn(
                SPINNER_SIZE[size],
                'border-wline dark:border-rink-700 border-t-primary rounded-full animate-spin motion-reduce:animate-none',
              )}
              aria-hidden="true"
            />
            <span className={cn(TEXT_SIZE[size], 'text-wtext-2 dark:text-rink-100')}>
              {MESSAGES.ui.refreshing}
            </span>
          </>
        ) : reached ? (
          <>
            <Icon
              name="arrow_upward"
              className={cn(ICON_SIZE[size], 'text-ice-500')}
              aria-hidden="true"
            />
            <span className={cn(TEXT_SIZE[size], 'text-ice-500 font-bold')}>
              {MESSAGES.ui.releaseRefresh}
            </span>
          </>
        ) : pullDistance > 0 ? (
          <>
            <span
              className="inline-flex transition-transform duration-100 ease-out motion-reduce:transition-none"
              style={{ transform: `rotate(${rotateDeg}deg)` }}
              aria-hidden="true"
            >
              <Icon
                name="arrow_downward"
                className={cn(ICON_SIZE[size], 'text-wtext-3 dark:text-rink-300')}
              />
            </span>
            <span className={TEXT_SIZE[size]}>{MESSAGES.ui.pullRefresh}</span>
          </>
        ) : null}
      </div>
    </div>
  );
});

export default PullToRefreshIndicator;
