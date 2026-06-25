'use client';

import {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
  ReactNode,
  useId,
} from 'react';
import { cn } from '@/lib/utils';
import {
  AnimatedTabIndicator,
  useAnimatedTabIndicator,
  type UseAnimatedTabIndicatorReturn,
} from './AnimatedTabIndicator';

/**
 * Tabs Component - TEAMPLUS Design System
 * WCAG 2.1 AA 준수:
 * - 키보드 네비게이션 (Arrow keys, Home, End)
 * - ARIA roles (tablist, tab, tabpanel)
 * - Focus management
 * - 최소 44px 터치 타겟
 *
 * 2026-04-18 — 슬라이딩 인디케이터 애니메이션 추가
 * - 활성 탭 위치로 인디케이터가 transform + width 로 부드럽게 이동 (300ms cubic-bezier)
 * - variant 별 인디케이터 스타일:
 *    default   → 흰색 pill 배경 (shadow-sm)
 *    pills     → Primary pill 배경
 *    underline → Primary 2px 밑줄
 * - `prefers-reduced-motion: reduce` 존중
 * - 기존 props/API 100% 호환 (추가만 있음: `disableIndicatorAnimation`)
 */

// ─── Context ─────────────────────────────────────────
interface TabsContextValue {
  activeTab: string;
  setActiveTab: (value: string) => void;
  tabsId: string;
  /** 탭 버튼이 자신의 DOM 을 등록하는 ref 콜백 팩토리 (인디케이터 애니메이션용) */
  registerTab: (value: string) => (el: HTMLElement | null) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error('Tabs 컴포넌트는 TabsRoot 내부에서 사용해야 합니다.');
  }
  return context;
}

/**
 * 인디케이터 훅 인스턴스를 하위로 내려주는 내부 컨텍스트.
 * TabsList 가 훅을 생성하고, 자식 TabsTrigger 들에게 `registerTab` 을 공급한다.
 */
const TabsIndicatorContext = createContext<UseAnimatedTabIndicatorReturn | null>(null);

// ─── Root ─────────────────────────────────────────────
interface TabsRootProps {
  children: ReactNode;
  defaultValue: string;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
}

export function Tabs({
  children,
  defaultValue,
  value,
  onValueChange,
  className,
}: TabsRootProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const tabsId = useId();

  const activeTab = value ?? internalValue;
  const setActiveTab = useCallback(
    (newValue: string) => {
      if (value === undefined) {
        setInternalValue(newValue);
      }
      onValueChange?.(newValue);
    },
    [value, onValueChange]
  );

  // 기본 no-op registerTab — TabsList 가 존재하지 않는 희귀 케이스 (e.g. custom list) 보호
  const defaultRegisterTab = useCallback(
    (): ((el: HTMLElement | null) => void) => () => undefined,
    []
  );

  const contextValue = useMemo<TabsContextValue>(
    () => ({
      activeTab,
      setActiveTab,
      tabsId,
      registerTab: defaultRegisterTab,
    }),
    [activeTab, setActiveTab, tabsId, defaultRegisterTab]
  );

  return (
    <TabsContext.Provider value={contextValue}>
      <div className={cn('w-full', className)}>{children}</div>
    </TabsContext.Provider>
  );
}

// ─── TabsList ─────────────────────────────────────────
interface TabsListProps {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'pills' | 'underline';
  /** 슬라이딩 인디케이터 애니메이션 비활성화 (기본 false). 레거시 UI 호환용. */
  disableIndicatorAnimation?: boolean;
}

export function TabsList({
  children,
  className,
  variant = 'default',
  disableIndicatorAnimation = false,
}: TabsListProps) {
  const parent = useTabsContext();
  const { tabsId, activeTab } = parent;

  const indicator = useAnimatedTabIndicator({
    activeValue: activeTab,
    disabled: disableIndicatorAnimation,
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const tabs = e.currentTarget.querySelectorAll<HTMLButtonElement>(
      '[role="tab"]:not([disabled])'
    );
    const tabsArray = Array.from(tabs);
    const currentIndex = tabsArray.findIndex((tab) => tab === document.activeElement);

    let nextIndex = currentIndex;

    switch (e.key) {
      case 'ArrowLeft':
        nextIndex = currentIndex > 0 ? currentIndex - 1 : tabsArray.length - 1;
        e.preventDefault();
        break;
      case 'ArrowRight':
        nextIndex = currentIndex < tabsArray.length - 1 ? currentIndex + 1 : 0;
        e.preventDefault();
        break;
      case 'Home':
        nextIndex = 0;
        e.preventDefault();
        break;
      case 'End':
        nextIndex = tabsArray.length - 1;
        e.preventDefault();
        break;
    }

    if (nextIndex !== currentIndex) {
      tabsArray[nextIndex]?.focus();
    }
  };

  // 컨테이너 스타일 — relative 포지션 필수 (인디케이터가 absolute 이므로)
  const variants = {
    default: cn(
      'relative inline-flex items-center p-1',
      'bg-wline-2 dark:bg-rink-800 rounded-lg',
      'gap-1'
    ),
    pills: cn('relative inline-flex items-center', 'gap-2'),
    underline: cn(
      'relative flex items-center',
      'border-b border-wline dark:border-rink-700',
      'gap-0'
    ),
  };

  const indicatorClassName = {
    default: 'rounded-md bg-white dark:bg-rink-700 shadow-sm',
    pills: 'rounded-full bg-ice-500',
    underline: 'bg-ice-500',
  }[variant];

  // variant 별 인디케이터 스타일 계산
  // - default / pills: 활성 탭 전체를 덮는 pill 배경
  // - underline: 활성 탭 하단 2px 바 (border-b 라인 바로 위)
  const finalStyle: React.CSSProperties = (() => {
    if (!indicator.rect) {
      return { opacity: 0, pointerEvents: 'none' };
    }
    const { left, top, width, height } = indicator.rect;
    if (variant === 'underline') {
      const yBottom = top + height - 2;
      return {
        transform: `translate3d(${left}px, ${yBottom}px, 0)`,
        width: `${width}px`,
        height: '2px',
        opacity: 1,
      };
    }
    return {
      transform: `translate3d(${left}px, ${top}px, 0)`,
      width: `${width}px`,
      height: `${height}px`,
      opacity: 1,
    };
  })();

  return (
    <TabsIndicatorContext.Provider value={indicator}>
      <div
        ref={indicator.containerRef as React.RefCallback<HTMLDivElement>}
        role="tablist"
        aria-label="탭 목록"
        id={`${tabsId}-tablist`}
        className={cn(variants[variant], className)}
        onKeyDown={handleKeyDown}
      >
        {/* 슬라이딩 인디케이터 — 탭 버튼들 뒤에 깔림 (z-index: 0) */}
        {!disableIndicatorAnimation && (
          <AnimatedTabIndicator
            style={finalStyle}
            ready={indicator.ready}
            className={cn('z-0', indicatorClassName)}
          />
        )}
        {children}
      </div>
    </TabsIndicatorContext.Provider>
  );
}

// ─── TabsTrigger ──────────────────────────────────────
interface TabsTriggerProps {
  children: ReactNode;
  value: string;
  className?: string;
  disabled?: boolean;
  variant?: 'default' | 'pills' | 'underline';
}

export function TabsTrigger({
  children,
  value,
  className,
  disabled = false,
  variant = 'default',
}: TabsTriggerProps) {
  const { activeTab, setActiveTab, tabsId } = useTabsContext();
  const indicator = useContext(TabsIndicatorContext);
  const isSelected = activeTab === value;

  // 인디케이터가 활성화된 경우 (TabsList 안에 있는 경우) 에만 ref 등록
  const tabRef = indicator?.registerTab(value);

  const baseStyles = cn(
    // WCAG 2.1: 최소 44px 터치 타겟
    'min-h-[44px] px-4',
    'font-medium text-sm',
    // color 전환만 유지 (배경/밑줄은 인디케이터가 담당)
    'transition-colors duration-200 motion-reduce:transition-none',
    'focus:outline-none focus:ring-2 focus:ring-ice-500/50 focus:ring-offset-2 focus-visible-disabled',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    'relative z-[1]'
  );

  // 인디케이터 있음 → 텍스트 색상만 제어 (배경/밑줄은 제거)
  const variantsWithIndicator = {
    default: cn(
      baseStyles,
      'rounded-md bg-transparent',
      isSelected
        ? 'text-wtext-1 dark:text-white'
        : 'text-wtext-2 dark:text-rink-300 hover:text-wtext-1 dark:hover:text-white'
    ),
    pills: cn(
      baseStyles,
      'rounded-full bg-transparent',
      isSelected
        ? 'text-white'
        : 'text-wtext-2 dark:text-rink-300 hover:text-wtext-1 dark:hover:text-white'
    ),
    underline: cn(
      baseStyles,
      'rounded-none -mb-px',
      isSelected
        ? 'text-ice-500'
        : 'text-wtext-2 dark:text-rink-300 hover:text-wtext-1 dark:hover:text-white'
    ),
  };

  // 인디케이터 없음 (disableIndicatorAnimation=true 혹은 TabsList 밖) → 레거시 방식
  const variantsLegacy = {
    default: cn(
      baseStyles,
      'rounded-md',
      isSelected
        ? 'bg-white dark:bg-rink-700 text-wtext-1 dark:text-white shadow-sm'
        : 'text-wtext-2 dark:text-rink-300 hover:text-wtext-1 dark:hover:text-white'
    ),
    pills: cn(
      baseStyles,
      'rounded-full',
      isSelected
        ? 'bg-ice-500 text-white'
        : 'bg-wline-2 dark:bg-rink-800 text-wtext-2 dark:text-rink-300 hover:bg-wline dark:hover:bg-rink-700'
    ),
    underline: cn(
      baseStyles,
      'border-b-2 rounded-none -mb-px',
      isSelected
        ? 'border-ice-500 text-ice-500'
        : 'border-transparent text-wtext-2 dark:text-rink-300 hover:text-wtext-1 dark:hover:text-white hover:border-wline'
    ),
  };

  const variants = indicator ? variantsWithIndicator : variantsLegacy;

  return (
    <button
      ref={tabRef as React.RefCallback<HTMLButtonElement> | undefined}
      role="tab"
      type="button"
      id={`${tabsId}-tab-${value}`}
      aria-selected={isSelected}
      aria-controls={`${tabsId}-panel-${value}`}
      tabIndex={isSelected ? 0 : -1}
      disabled={disabled}
      onClick={() => !disabled && setActiveTab(value)}
      className={cn(variants[variant], className)}
    >
      {children}
    </button>
  );
}

// ─── TabsContent ──────────────────────────────────────
interface TabsContentProps {
  children: ReactNode;
  value: string;
  className?: string;
  forceMount?: boolean;
}

export function TabsContent({
  children,
  value,
  className,
  forceMount = false,
}: TabsContentProps) {
  const { activeTab, tabsId } = useTabsContext();
  const isSelected = activeTab === value;

  if (!isSelected && !forceMount) {
    return null;
  }

  return (
    <div
      role="tabpanel"
      id={`${tabsId}-panel-${value}`}
      aria-labelledby={`${tabsId}-tab-${value}`}
      tabIndex={0}
      hidden={!isSelected}
      className={cn('mt-4 focus:outline-none', !isSelected && 'hidden', className)}
    >
      {children}
    </div>
  );
}

// Re-export all components
export { Tabs as TabsRoot };
