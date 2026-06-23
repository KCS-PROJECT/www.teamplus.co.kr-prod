'use client';

import { useMemo } from 'react';

export type ScheduleRangeKey = 'week' | 'month';

/** 그룹 빌더가 요구하는 최소 셀 형태 — UnifiedCalendarDay / CalendarDay 모두 구조적 호환. */
export interface ScheduleRangeCell {
  dateKey: string;
  isCurrentMonth: boolean;
}

export interface ScheduleGroup<T> {
  dateKey: string;
  items: T[];
}

interface UseScheduleRangeGroupsParams<T> {
  /** 월간 그리드 셀(42칸). month 모드의 당월 필터에 사용. */
  cells: ScheduleRangeCell[];
  /** 특정 날짜의 표시 대상 항목(필터 적용 후)을 반환. useCallback 으로 안정화 필요. */
  getItems: (dateKey: string) => T[];
  rangeKey: ScheduleRangeKey;
  /** 'YYYY-MM-DD' — 이번 주 시작일(일요일). */
  weekStart: string;
  /** 날짜 셀이 선택된 경우 그 날만 표시(빈 배열도 허용 → 빈 박스 노출). */
  selectedDateKey: string | null;
}

function pad2(value: number): string {
  return `${value}`.padStart(2, '0');
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * 일정 페이지(학부모 통합캘린더 · 감독/오픈클래스 감독 수업 일정) 공통 그룹 빌더.
 *
 * - 선택일: 그 날만 (일정 없어도 빈 그룹 1개 → 빈 박스 노출)
 * - 이번 주: 7일 중 **일정이 있는 날만** (빈 날짜 영역 숨김)
 * - 이번 달: 당월 + **일정이 있는 날만**
 */
export function useScheduleRangeGroups<T>({
  cells,
  getItems,
  rangeKey,
  weekStart,
  selectedDateKey,
}: UseScheduleRangeGroupsParams<T>): ScheduleGroup<T>[] {
  return useMemo(() => {
    if (selectedDateKey) {
      return [{ dateKey: selectedDateKey, items: getItems(selectedDateKey) }];
    }

    if (rangeKey === 'week') {
      const result: ScheduleGroup<T>[] = [];
      const start = new Date(`${weekStart}T00:00:00`);
      for (let i = 0; i < 7; i += 1) {
        const current = new Date(start);
        current.setDate(start.getDate() + i);
        const dateKey = toDateKey(current);
        const items = getItems(dateKey);
        if (items.length > 0) result.push({ dateKey, items });
      }
      return result;
    }

    // 이번 달
    const result: ScheduleGroup<T>[] = [];
    cells.forEach((cell) => {
      if (!cell.isCurrentMonth) return;
      const items = getItems(cell.dateKey);
      if (items.length === 0) return;
      result.push({ dateKey: cell.dateKey, items });
    });
    return result;
  }, [cells, getItems, rangeKey, weekStart, selectedDateKey]);
}
