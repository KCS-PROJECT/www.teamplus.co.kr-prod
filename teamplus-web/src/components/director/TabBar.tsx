'use client';

import { useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

export interface TabItem<T extends string = string> {
  key: T;
  label: string;
}

interface TabBarProps<T extends string = string> {
  /** 탭 목록 */
  tabs: TabItem<T>[];
  /** 현재 활성 탭 키 */
  activeTab: T;
  /** 탭 변경 핸들러 */
  onChange: (tab: T) => void;
  /** 탭 스타일 변형: 'underline' (밑줄) | 'pill' (배경 필) */
  variant?: 'underline' | 'pill';
  /** 추가 CSS 클래스 */
  className?: string;
}

/**
 * 공통 탭 바 컴포넌트
 * 팀 정보 페이지, 대회 상세 페이지 등에서 사용됩니다.
 *
 * @example
 * // Underline 스타일 (팀 정보)
 * <TabBar
 *   tabs={[
 *     { key: 'info', label: '코치진' },
 *     { key: 'members', label: '팀원' },
 *     { key: 'schedule', label: '일정' },
 *   ]}
 *   activeTab={activeTab}
 *   onChange={setActiveTab}
 * />
 *
 * // Pill 스타일 (대회 목록)
 * <TabBar
 *   tabs={[
 *     { key: 'active', label: '진행 중인 대회' },
 *     { key: 'past', label: '지난 대회' },
 *   ]}
 *   activeTab={activeTab}
 *   onChange={setActiveTab}
 *   variant="pill"
 * />
 */
export function TabBar<T extends string = string>({
  tabs,
  activeTab,
  onChange,
  variant = 'underline',
  className = '',
}: TabBarProps<T>) {
  const indicatorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Underline 인디케이터 위치 업데이트
  useEffect(() => {
    if (variant !== 'underline') return;
    if (!indicatorRef.current || !containerRef.current) return;

    const activeIndex = tabs.findIndex((t) => t.key === activeTab);
    const tabWidth = containerRef.current.offsetWidth / tabs.length;
    indicatorRef.current.style.transform = `translateX(${activeIndex * tabWidth}px)`;
    indicatorRef.current.style.width = `${tabWidth}px`;
  }, [activeTab, tabs, variant]);

  const handleChange = useCallback(
    (tab: T) => {
      if (tab !== activeTab) {
        onChange(tab);
      }
    },
    [activeTab, onChange],
  );

  // Pill 변형
  if (variant === 'pill') {
    return (
      <div className={`flex bg-wline-2 dark:bg-rink-800 rounded-xl p-1 ${className}`}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleChange(tab.key)}
            className={cn(
              'flex-1 py-2.5 px-4 rounded-lg text-sm font-bold transition-all',
              activeTab === tab.key
                ? 'bg-ice-500 text-white shadow-sm'
                : 'text-wtext-3 dark:text-rink-300 hover:text-wtext-2 dark:hover:text-rink-100',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    );
  }

  // Underline 변형 (기본)
  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div className="flex">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleChange(tab.key)}
            className={cn(
              'flex-1 py-3.5 text-sm font-bold transition-all duration-300 relative z-10',
              activeTab === tab.key
                ? 'text-ice-500'
                : 'text-wtext-3 dark:text-rink-300',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        ref={indicatorRef}
        className="absolute bottom-0 h-0.5 bg-ice-500 transition-all duration-300 ease-out"
      />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-wline dark:bg-rink-800" />
    </div>
  );
}
