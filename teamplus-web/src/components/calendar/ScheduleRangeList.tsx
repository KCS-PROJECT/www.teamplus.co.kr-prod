'use client';

import { Fragment, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useScreenMetrics } from '@/hooks/useScreenMetrics';
import type { ScheduleGroup, ScheduleRangeKey } from '@/hooks/useScheduleRangeGroups';
import { cn } from '@/lib/utils';

const RANGE_TABS = [
  { key: 'week', label: '이번 주' },
  { key: 'month', label: '이번 달' },
] as const;

function formatDateHeading(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00`);
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${weekday})`;
}

export interface ScheduleRangeListProps<T> {
  rangeKey: ScheduleRangeKey;
  onRangeChange: (key: ScheduleRangeKey) => void;
  groups: ScheduleGroup<T>[];
  todayKey: string;
  /** 리스트 헤더 타이틀 — 주/달 별. (예: '이번 주 일정' / '이번 달 일정') */
  headerTitle: { week: string; month: string };
  /** 이번 주 모드 우측 기간 칩 텍스트(예: "6월 8일 ~ 6월 14일"). */
  weekRangeLabel?: string;
  /** 기간 칩 노출 여부(학부모: 날짜 미선택 시에만). 기본 true. */
  showWeekRangeChip?: boolean;
  /** 기간 탭과 리스트 헤더 사이 슬롯(감독 카테고리 칩 등). */
  categorySlot?: React.ReactNode;
  renderRow: (item: T) => React.ReactNode;
  getRowKey: (item: T) => string;
  /** 기간 전체에 일정이 없을 때 표시(점선 카드 등). */
  emptyState: React.ReactNode;
  /** 날짜 선택 후 그 날 일정이 없을 때 박스 내부 메시지. */
  emptyDayMessage: string;
}

/**
 * 일정 페이지 공통 리스트 셸 — 기간 탭(이번 주/이번 달) + 카테고리 슬롯 +
 * 리스트 헤더(건수) + B-1 통합 박스(미니 날짜 헤더 + 행들) + 빈 상태.
 *
 * 학부모 통합캘린더 · 감독/오픈클래스 감독 수업 일정에서 공통 사용.
 * 캘린더 그리드는 페이지별로 다르므로 이 컴포넌트 밖(상단)에 둔다.
 */
export function ScheduleRangeList<T>({
  rangeKey,
  onRangeChange,
  groups,
  todayKey,
  headerTitle,
  weekRangeLabel,
  showWeekRangeChip = true,
  categorySlot,
  renderRow,
  getRowKey,
  emptyState,
  emptyDayMessage,
}: ScheduleRangeListProps<T>) {
  const [indicator, setIndicator] = useState<{ left: number; width: number }>({
    left: 0,
    width: 0,
  });
  const tabListRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Record<ScheduleRangeKey, HTMLButtonElement | null>>({
    week: null,
    month: null,
  });
  const hasMeasuredIndicator = indicator.width > 0;

  const updateIndicator = useCallback(() => {
    const tab = tabRefs.current[rangeKey];
    const tabList = tabListRef.current;
    if (!tab || !tabList) return;
    const tabRect = tab.getBoundingClientRect();
    const tabListRect = tabList.getBoundingClientRect();
    setIndicator({
      left: tabRect.left - tabListRect.left,
      width: tabRect.width,
    });
  }, [rangeKey]);

  // 화면 폭 변경(회전·키보드·접힘 포함) 시 인디케이터 재측정 — SoT 단일 구독자
  const { width: screenWidth } = useScreenMetrics();
  useLayoutEffect(() => {
    updateIndicator();
  }, [updateIndicator, screenWidth]);

  const totalCount = groups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <>
      {/* 기간 필터 탭 — 이번 주 / 이번 달 */}
      <section className="px-5 pt-3" aria-label="기간 필터">
        <div
          ref={tabListRef}
          role="tablist"
          aria-label="기간 선택"
          className="relative isolate grid grid-cols-2 gap-1 rounded-[14px] border border-wline bg-wbg p-1 dark:border-rink-700 dark:bg-rink-900/40"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-1 left-1 rounded-[10px] bg-white shadow-[0_2px_8px_rgba(20,24,38,0.06)] transition-[transform,width,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none dark:bg-rink-700"
            style={{
              width: `${indicator.width}px`,
              transform: `translateX(${indicator.left}px)`,
              opacity: indicator.width > 0 ? 1 : 0,
            }}
          />
          {RANGE_TABS.map((tab) => {
            const isActive = rangeKey === tab.key;
            return (
              <button
                key={tab.key}
                ref={(element) => {
                  tabRefs.current[tab.key] = element;
                }}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onRangeChange(tab.key)}
                className={cn(
                  'relative z-[1] h-[38px] rounded-[10px] text-card-body font-extrabold tracking-[-0.01em] transition-[color,transform,background-color,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none active:scale-[0.985]',
                  isActive
                    ? 'text-wtext-1 dark:text-white'
                    : 'text-wtext-3 hover:text-wtext-2 dark:text-rink-300 dark:hover:text-rink-100',
                  isActive &&
                    !hasMeasuredIndicator &&
                    'bg-white shadow-[0_2px_8px_rgba(20,24,38,0.06)] dark:bg-rink-700',
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </section>

      {categorySlot}

      {/* List Header */}
      <div className="flex items-center justify-between px-6 pb-2 pt-[18px]">
        <div className="inline-flex items-baseline gap-2">
          <span className="text-card-body font-extrabold tracking-[-0.02em] text-wtext-1 dark:text-white">
            {rangeKey === 'week' ? headerTitle.week : headerTitle.month}
          </span>
          {rangeKey === 'week' && showWeekRangeChip && weekRangeLabel && (
            <span className="rounded-md bg-ice-500/[0.14] px-2 py-[2px] text-card-meta font-extrabold tabular-nums text-ice-500 dark:bg-blue-900/30 dark:text-blue-300">
              {weekRangeLabel}
            </span>
          )}
        </div>
        {totalCount > 0 && (
          <span className="shrink-0 text-card-meta font-bold tabular-nums text-wtext-3 dark:text-rink-300">
            일정 {totalCount}건
          </span>
        )}
      </div>

      {/* Day Groups — B-1: 박스 1개 안에 날짜 미니헤더 + 행들 */}
      <section className="px-5 pb-10" aria-label="기간 내 일정 목록">
        {groups.length > 0 ? (
          <div
            key={rangeKey}
            className="overflow-hidden rounded-w-xl border border-wline bg-wsurface shadow-sh-1 dark:border-rink-700 dark:bg-rink-800"
          >
            {groups.map((group, index) => {
              const isToday = group.dateKey === todayKey;
              return (
                <div
                  key={group.dateKey}
                  className={cn(
                    index > 0 && 'border-t border-wline-2 dark:border-rink-700',
                  )}
                >
                  {/* 미니 날짜 헤더 */}
                  <div className="flex items-center gap-1.5 px-4 pb-1 pt-3">
                    <span
                      className={cn(
                        'text-card-meta font-extrabold tracking-[-0.01em]',
                        isToday
                          ? 'text-wtext-1 dark:text-white'
                          : 'text-wtext-2 dark:text-rink-100',
                      )}
                    >
                      {formatDateHeading(group.dateKey)}
                    </span>
                    {isToday && (
                      <span className="rounded-md bg-ice-500 px-[7px] py-[1px] text-card-meta font-extrabold text-white">
                        오늘
                      </span>
                    )}
                  </div>

                  {group.items.length > 0 ? (
                    <div className="px-4">
                      {group.items.map((item) => (
                        <Fragment key={getRowKey(item)}>{renderRow(item)}</Fragment>
                      ))}
                    </div>
                  ) : (
                    <div
                      className="flex items-center gap-2 px-4 pb-3 pt-1 text-wtext-3 dark:text-rink-300"
                      role="note"
                      aria-label="예정된 일정 없음"
                    >
                      <Icon
                        name="calendar_today"
                        className="text-card-body"
                        aria-hidden="true"
                      />
                      <span className="text-card-meta font-semibold">
                        {emptyDayMessage}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          emptyState
        )}
      </section>
    </>
  );
}
