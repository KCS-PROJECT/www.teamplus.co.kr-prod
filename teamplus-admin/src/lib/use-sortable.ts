'use client';

import { useState, useMemo, useCallback } from 'react';

export type SortDirection = 'asc' | 'desc';

export interface SortState<K extends string> {
  key: K;
  direction: SortDirection;
}

/**
 * 공통 테이블 정렬 훅 — admin 역할별 페이지(감독/코치/학부모/학생)에서 사용.
 *
 * - 기본 정렬: 첫 번째 인자 `defaultSort` (보통 소속 팀 오름차순)
 * - 헤더 클릭으로 키 변경 / 같은 키 재클릭 시 방향 토글
 * - getValue: 키별 비교용 값 추출 (string | number | null/undefined 허용)
 */
export function useSortable<T, K extends string>(
  items: T[],
  defaultSort: SortState<K>,
  getValue: (item: T, key: K) => string | number | null | undefined,
) {
  const [sort, setSort] = useState<SortState<K>>(defaultSort);

  const toggleSort = useCallback((key: K) => {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    );
  }, []);

  const sorted = useMemo(() => {
    const arr = [...items];
    arr.sort((a, b) => {
      const av = getValue(a, sort.key);
      const bv = getValue(b, sort.key);
      // null/undefined 는 항상 뒤로
      const aEmpty = av === null || av === undefined || av === '';
      const bEmpty = bv === null || bv === undefined || bv === '';
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      let cmp = 0;
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv), 'ko');
      return sort.direction === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [items, sort, getValue]);

  return { sorted, sort, toggleSort };
}

/**
 * 정렬 가능 헤더 셀 — 클릭으로 정렬 토글, 활성 키에 ▲/▼ 인디케이터.
 */
export function sortIndicator(active: boolean, direction: SortDirection): string {
  if (!active) return '';
  return direction === 'asc' ? ' ▲' : ' ▼';
}
