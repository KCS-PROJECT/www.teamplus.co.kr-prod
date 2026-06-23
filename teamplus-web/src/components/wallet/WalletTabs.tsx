'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * WalletTabs — underline 스타일 4탭
 *
 * - active: text-1 font-extrabold + 2px bottom bar
 * - inactive: text-4 font-medium
 * - 신한pLay 월렛 디자인의 탭 strip 정확 재현
 * - 키보드: ArrowLeft / ArrowRight 로 탭 이동
 */
export interface WalletTab<T extends string = string> {
  id: T;
  label: string;
}

export interface WalletTabsProps<T extends string = string> {
  tabs: WalletTab<T>[];
  value: T;
  onChange: (tab: T) => void;
  /** ARIA: tab list label */
  ariaLabel?: string;
}

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function WalletTabs<T extends string = string>({
  tabs,
  value,
  onChange,
  ariaLabel = '탭 목록',
}: WalletTabsProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Map<T, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  const [animateIndicator, setAnimateIndicator] = useState(false);

  // 인디케이터 위치 계산 (active 탭의 텍스트 너비 기준)
  useIsoLayoutEffect(() => {
    const container = containerRef.current;
    const button = buttonRefs.current.get(value);
    if (!container || !button) return;
    const containerRect = container.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    setIndicator({
      left: buttonRect.left - containerRect.left,
      width: buttonRect.width,
    });
  }, [value, tabs]);

  // 첫 렌더는 transition 없이 placement, 이후 click부터 애니메이션
  useEffect(() => {
    if (indicator && !animateIndicator) {
      const id = window.setTimeout(() => setAnimateIndicator(true), 50);
      return () => window.clearTimeout(id);
    }
  }, [indicator, animateIndicator]);

  const handleKey = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      const next = (idx + dir + tabs.length) % tabs.length;
      onChange(tabs[next].id);
      buttonRefs.current.get(tabs[next].id)?.focus();
    }
  };

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label={ariaLabel}
      className="flex relative bg-wsurface dark:bg-rink-800 border-b border-wline-2 dark:border-rink-700 px-4 sm:px-5 pt-1 gap-3 sm:gap-[18px] overflow-x-auto hide-scrollbar"
    >
      {tabs.map((tab, idx) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              if (el) buttonRefs.current.set(tab.id, el);
              else buttonRefs.current.delete(tab.id);
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKey(e, idx)}
            className={`relative bg-transparent border-0 cursor-pointer transition-colors px-0 pt-3 pb-3.5 text-[15px] sm:text-[16px] tracking-[-0.02em] whitespace-nowrap shrink-0 ${
              active ? 'font-extrabold' : 'font-medium'
            }`}
            style={{
              color: active ? 'var(--c-text-1)' : 'var(--c-text-4)',
            }}
          >
            {tab.label}
          </button>
        );
      })}

      {/* underline indicator */}
      {indicator && (
        <span
          aria-hidden
          className="absolute bg-wtext-1 dark:bg-white bottom-0 h-0.5 rounded-[2px]"
          style={{
            left: indicator.left,
            width: indicator.width,
            transition: animateIndicator
              ? 'left var(--w-dur) var(--w-ease), width var(--w-dur) var(--w-ease)'
              : 'none',
          }}
        />
      )}
    </div>
  );
}
