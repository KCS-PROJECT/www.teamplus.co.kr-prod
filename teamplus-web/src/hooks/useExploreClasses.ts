'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchExploreClasses,
  type ExploreClassItem,
  type ExploreClassesParams,
} from '@/services/class-explore.service';

const PAGE_SIZE = 20;

/**
 * 전국 수업 탐색 데이터 훅 — "더보기" 누적 페이지네이션.
 *
 * 프로젝트 표준 패턴(useState + useCallback + useEffect)을 따른다.
 * TanStack Query 는 2026-04-21 전체 롤백되어 사용하지 않는다.
 *
 * 필터가 바뀌면 1페이지부터 다시 조회하고, 더보기는 결과를 뒤에 이어 붙인다.
 * 오래된 응답이 최신 결과를 덮어쓰지 않도록 요청 시퀀스로 가드한다
 * (검색어 디바운스 + 필터 연타 시 순서가 뒤집힐 수 있다).
 */
export function useExploreClasses(params: ExploreClassesParams) {
  const [items, setItems] = useState<ExploreClassItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // 필터 값을 문자열로 직렬화해 의존성으로 사용 — 객체 참조 변경으로 인한 재조회를 막는다.
  const filterKey = JSON.stringify({
    q: params.q ?? '',
    city: params.city ?? '',
    district: params.district ?? '',
    category: params.category ?? '',
    trainingType: params.trainingType ?? '',
    dayOfWeek: params.dayOfWeek ?? [],
    timeSlot: params.timeSlot ?? '',
    priceMax: params.priceMax ?? 0,
    sort: params.sort ?? 'recent',
  });

  const seqRef = useRef(0);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const load = useCallback(
    async (targetPage: number) => {
      const seq = ++seqRef.current;
      if (targetPage === 1) setIsLoading(true);
      else setIsLoadingMore(true);

      try {
        const res = await fetchExploreClasses({
          ...paramsRef.current,
          page: targetPage,
          limit: PAGE_SIZE,
        });
        // 뒤늦게 도착한 이전 요청은 버린다.
        if (seq !== seqRef.current) return;

        setTotal(res.total);
        setPage(res.page);
        setItems((prev) =>
          targetPage === 1 ? res.items : [...prev, ...res.items],
        );
      } finally {
        if (seq === seqRef.current) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    void load(1);
    // filterKey 로 필터 변경만 감지 — load 는 안정적(useCallback deps 없음).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  const loadMore = useCallback(() => {
    if (isLoading || isLoadingMore) return;
    if (items.length >= total) return;
    void load(page + 1);
  }, [isLoading, isLoadingMore, items.length, total, page, load]);

  return {
    items,
    total,
    isLoading,
    isLoadingMore,
    hasMore: items.length < total,
    loadMore,
    refresh: () => load(1),
  };
}
