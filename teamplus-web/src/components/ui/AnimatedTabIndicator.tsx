'use client';

/**
 * AnimatedTabIndicator — TEAMPLUS 공용 탭 인디케이터 헬퍼
 *
 * 목적:
 *   공용 탭 컴포넌트 4종 (Tabs / FilterTabs / MatchSegmentedTabs / TeamTabBar)이
 *   "활성 탭 위치로 부드럽게 슬라이딩하는 인디케이터"를 일관된 방식으로 구현할 수 있도록
 *   전용 훅 `useAnimatedTabIndicator`와 렌더링 컴포넌트 `AnimatedTabIndicator` 를 제공합니다.
 *
 * 동작 개요:
 *   1. 각 탭 버튼 DOM ref를 `registerTab(value, el)` 로 수집
 *   2. `activeValue` 가 바뀌거나 컨테이너 리사이즈 / 폰트 로드 시 `useLayoutEffect` 로 위치 측정
 *   3. 활성 탭의 `offsetLeft` / `offsetWidth` 를 인디케이터 transform(translateX) + width 로 적용
 *   4. 첫 렌더 시에는 transition 비활성화 → 깜빡임 제거, 이후 클릭부터 300ms cubic-bezier
 *   5. `prefers-reduced-motion: reduce` 환경에서는 `motion-reduce:transition-none` 클래스로 즉시 전환
 *
 * 설계 원칙:
 *   - 순수 CSS transition + transform (framer-motion 등 외부 의존성 0)
 *   - SSR 안전: 브라우저 측정은 `useLayoutEffect` 안에서만, hydration 이전 값은 null
 *   - 기존 컴포넌트의 public API 를 전혀 바꾸지 않고 "추가 장식 레이어" 로만 동작
 *
 * 디자인 규칙 (TEAMPLUS):
 *   - gradient / backdrop-blur 절대 금지 → solid color 만 사용
 *   - Primary 컬러 = CSS var `--primary` (#1E3FAE), 호출 측에서 `bg-ice-500` 등으로 지정
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

// 브라우저 환경에서만 useLayoutEffect, SSR 에서는 useEffect 로 폴백 (warning 방지)
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** 단일 탭 측정 결과 */
export interface TabRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface UseAnimatedTabIndicatorOptions {
  /** 현재 활성 탭의 value/key (탭 컴포넌트마다 이름이 다르므로 범용 string) */
  activeValue: string | null | undefined;
  /** 인디케이터 비활성화 (SSR fallback 등 특수 상황용) */
  disabled?: boolean;
}

export interface UseAnimatedTabIndicatorReturn {
  /** 탭 버튼 DOM 을 등록/해제하는 ref 콜백 팩토리 */
  registerTab: (value: string) => (el: HTMLElement | null) => void;
  /** TabsList 역할을 하는 컨테이너의 ref 콜백 */
  containerRef: (el: HTMLElement | null) => void;
  /** 인디케이터에 적용할 style (transform + width) — 측정 전에는 opacity 0 로 감춤 */
  indicatorStyle: CSSProperties;
  /** 숫자 rect (훅 소비자가 custom style 을 계산하고 싶을 때 사용) — null 이면 아직 측정 전 */
  rect: TabRect | null;
  /** 첫 측정이 끝나기 전까지는 false → transition 을 꺼야 깜빡임이 없음 */
  ready: boolean;
  /** 소비자 쪽에서 동적으로 재측정이 필요할 때 호출 */
  recalculate: () => void;
}

/**
 * 탭 인디케이터 훅 — 활성 탭 위치를 측정하여 인디케이터 style 을 반환
 */
export function useAnimatedTabIndicator(
  options: UseAnimatedTabIndicatorOptions
): UseAnimatedTabIndicatorReturn {
  const { activeValue, disabled = false } = options;

  const containerElRef = useRef<HTMLElement | null>(null);
  const tabElsRef = useRef<Map<string, HTMLElement>>(new Map());
  const [rect, setRect] = useState<TabRect | null>(null);
  const [ready, setReady] = useState(false);

  // 실제 측정 로직
  const measure = useCallback(() => {
    if (disabled) return;
    const container = containerElRef.current;
    if (!container || activeValue == null) {
      setRect(null);
      return;
    }
    const target = tabElsRef.current.get(activeValue);
    if (!target) {
      setRect(null);
      return;
    }
    // offsetLeft/Top 은 offsetParent 기준 — 컨테이너가 relative 포지션이어야 정확
    const next: TabRect = {
      left: target.offsetLeft,
      top: target.offsetTop,
      width: target.offsetWidth,
      height: target.offsetHeight,
    };
    setRect((prev) => {
      if (
        prev &&
        prev.left === next.left &&
        prev.top === next.top &&
        prev.width === next.width &&
        prev.height === next.height
      ) {
        return prev;
      }
      return next;
    });
  }, [activeValue, disabled]);

  // activeValue 변경 시 즉시 재측정 (layout effect 로 paint 전에 처리)
  useIsomorphicLayoutEffect(() => {
    measure();
    // 최초 측정 후 ready = true → 이후 transition 활성화
    if (!ready && !disabled) {
      // micro-task 한 틱 뒤에 ready 로 전환 → 첫 위치는 무애니메이션으로 세팅됨
      const id = window.requestAnimationFrame(() => setReady(true));
      return () => window.cancelAnimationFrame(id);
    }
    return undefined;
  }, [measure, ready, disabled]);

  // ResizeObserver — 컨테이너 / 개별 탭 크기 변경 시 재측정
  useEffect(() => {
    if (disabled) return;
    if (typeof window === 'undefined' || typeof ResizeObserver === 'undefined') return;

    const ro = new ResizeObserver(() => {
      measure();
    });

    const container = containerElRef.current;
    if (container) ro.observe(container);
    tabElsRef.current.forEach((el) => ro.observe(el));

    // 폰트 로드 완료 후에도 다시 측정 (Pretendard 등)
    let fontsPromise: Promise<unknown> | null = null;
    if (typeof document !== 'undefined' && 'fonts' in document) {
      try {
        fontsPromise = (document as Document & {
          fonts?: { ready?: Promise<unknown> };
        }).fonts?.ready ?? null;
        fontsPromise?.then(() => measure()).catch(() => undefined);
      } catch {
        // ignore
      }
    }

    return () => {
      ro.disconnect();
    };
  }, [measure, disabled, activeValue]);

  // ref 콜백: 컨테이너 등록 + 최초 측정 트리거
  const containerRef = useCallback((el: HTMLElement | null) => {
    containerElRef.current = el;
  }, []);

  // ref 콜백: 탭 버튼 등록/해제
  const registerTab = useCallback(
    (value: string) => (el: HTMLElement | null) => {
      const map = tabElsRef.current;
      if (el) {
        map.set(value, el);
      } else {
        map.delete(value);
      }
    },
    []
  );

  // 외부 트리거용 재측정 API
  const recalculate = useCallback(() => {
    measure();
  }, [measure]);

  const indicatorStyle = useMemo<CSSProperties>(() => {
    if (!rect || disabled) {
      return { opacity: 0, pointerEvents: 'none' };
    }
    return {
      transform: `translate3d(${rect.left}px, ${rect.top}px, 0)`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      opacity: 1,
    };
  }, [rect, disabled]);

  return {
    registerTab,
    containerRef,
    indicatorStyle,
    rect,
    ready,
    recalculate,
  };
}

/** 표준 슬라이딩 트랜지션 — variant 불문 동일한 easing 적용 */
export const TAB_INDICATOR_TRANSITION =
  'transition-[transform,width,height,opacity] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none';

export interface AnimatedTabIndicatorProps {
  /** 인디케이터 스타일 (useAnimatedTabIndicator 의 indicatorStyle) */
  style: CSSProperties;
  /** 첫 측정 완료 여부 — false 일 때는 transition 을 끈다 */
  ready: boolean;
  /** 추가 className (배경색, 테두리, 높이 강제 등) */
  className?: string;
  /** position: absolute 인디케이터 내부 자식 (대부분 불필요) */
  children?: ReactNode;
}

/**
 * 선택적으로 사용하는 인디케이터 렌더링 컴포넌트 — 4개 탭 컴포넌트에서 직접 import 하여 사용
 *
 * 주의: 부모(탭 리스트 컨테이너)에는 반드시 `relative` 포지션이 지정되어야 함.
 */
export function AnimatedTabIndicator({
  style,
  ready,
  className,
  children,
}: AnimatedTabIndicatorProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute left-0 top-0 will-change-transform',
        ready ? TAB_INDICATOR_TRANSITION : 'transition-none',
        className
      )}
      style={style}
    >
      {children}
    </span>
  );
}
