'use client';

/**
 * 포스트 목록 (/contents) — 발행된 BlogPost 소비 화면.
 * 설계 SoT: docs/Planning/SPEC_DASHBOARD_READING_CONTENT.md §2-2
 *
 * - 데이터: GET /blog (공개) — pinned 우선 + 생성 최신순 (기존 API 정렬 계약 그대로, "최신" 을 약속하지 않음)
 * - 전 역할 접근: (common)/layout 의 useRequireAuth 만 사용, PROTECTED_PATHS_BY_ROLE 미등록(Accepted Decision 10)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { ContentCard } from '@/components/contents/ContentCard';
import { usePageReady } from '@/hooks/usePageReady';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import {
  getBlogList,
  type BlogCategory,
  type BlogListItem,
} from '@/services/blog.service';

const PAGE_SIZE = 12;

type CategoryFilter = BlogCategory | 'ALL';

const CATEGORY_FILTERS: ReadonlyArray<{ value: CategoryFilter; label: string }> = [
  { value: 'ALL', label: MESSAGES.contents.categoryAll },
  { value: 'NEWS', label: MESSAGES.contents.categories.NEWS },
  { value: 'GUIDE', label: MESSAGES.contents.categories.GUIDE },
  { value: 'EVENT', label: MESSAGES.contents.categories.EVENT },
  { value: 'PRESS', label: MESSAGES.contents.categories.PRESS },
];

type ScreenStatus = 'loading' | 'ready' | 'error';

export default function ContentsListPage() {
  const [items, setItems] = useState<BlogListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState<CategoryFilter>('ALL');
  const [status, setStatus] = useState<ScreenStatus>('loading');
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // 필터 전환 중 이전 요청 응답이 늦게 도착해 새 목록을 덮는 것을 차단
  const requestSeq = useRef(0);

  const loadFirstPage = useCallback(async (nextCategory: CategoryFilter) => {
    const seq = ++requestSeq.current;
    setStatus('loading');
    try {
      const result = await getBlogList({
        page: 1,
        pageSize: PAGE_SIZE,
        category: nextCategory === 'ALL' ? undefined : nextCategory,
      });
      if (seq !== requestSeq.current) return;
      setItems(result.items);
      setTotal(result.total);
      setPage(1);
      setStatus('ready');
    } catch {
      if (seq !== requestSeq.current) return;
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void loadFirstPage(category);
  }, [category, loadFirstPage]);

  const handleLoadMore = useCallback(async () => {
    if (isLoadingMore) return;
    const seq = requestSeq.current;
    setIsLoadingMore(true);
    try {
      const nextPage = page + 1;
      const result = await getBlogList({
        page: nextPage,
        pageSize: PAGE_SIZE,
        category: category === 'ALL' ? undefined : category,
      });
      if (seq !== requestSeq.current) return;
      setItems((prev) => {
        const existing = new Set(prev.map((p) => p.id));
        return [...prev, ...result.items.filter((p) => !existing.has(p.id))];
      });
      setTotal(result.total);
      setPage(nextPage);
    } catch {
      // 더보기 실패는 목록을 파괴하지 않는다 — 버튼이 남아 재시도 가능
    } finally {
      setIsLoadingMore(false);
    }
  }, [category, isLoadingMore, page]);

  usePageReady(status !== 'loading');

  const hasMore = status === 'ready' && items.length < total;

  return (
    <MobileContainer>
      <PageAppBar title={MESSAGES.contents.pageTitle} forceNative />

      <main
        className="flex-1 overflow-y-auto bg-it-canvas dark:bg-puck"
        role="main"
        aria-label={MESSAGES.contents.pageTitle}
      >
        {/* 타이틀 + 설명 + 카테고리 칩 — flat 흰 섹션 */}
        <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-4">
          <p className="text-[13.5px] text-it-ink-500 dark:text-rink-300">
            {MESSAGES.contents.pageDescription}
          </p>
          <div
            className="mt-3 flex gap-2 overflow-x-auto scrollbar-hide"
            role="tablist"
            aria-label="카테고리 필터"
          >
            {CATEGORY_FILTERS.map((filter) => {
              const isActive = category === filter.value;
              return (
                <button
                  key={filter.value}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setCategory(filter.value)}
                  className={cn(
                    'h-9 shrink-0 rounded-w-pill px-4 text-[13px] font-bold transition-colors motion-reduce:transition-none',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/50',
                    isActive
                      ? 'bg-it-blue-500 text-white'
                      : 'bg-it-fill dark:bg-rink-700/40 text-it-ink-600 dark:text-rink-100 hover:bg-it-line/60 dark:hover:bg-rink-700',
                  )}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>
        </section>

        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* 본문 — 상태별 렌더 */}
        <section className="bg-it-surface dark:bg-rink-800 px-5 py-5 min-h-[50vh]">
          {status === 'loading' && (
            <div className="space-y-8" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="animate-pulse motion-reduce:animate-none">
                  <div className="aspect-[16/10] w-full rounded-w-lg bg-it-fill dark:bg-rink-700/40" />
                  <div className="mt-3 h-3 w-24 rounded bg-it-fill dark:bg-rink-700/40" />
                  <div className="mt-2 h-4 w-3/4 rounded bg-it-fill dark:bg-rink-700/40" />
                  <div className="mt-2 h-3 w-full rounded bg-it-fill dark:bg-rink-700/40" />
                </div>
              ))}
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Icon
                name="wifi_off"
                className="text-5xl text-it-ink-300 dark:text-rink-500"
                aria-hidden="true"
              />
              <p className="mt-4 text-[14px] text-it-ink-500 dark:text-rink-300">
                {MESSAGES.contents.loadFailed}
              </p>
              <button
                type="button"
                onClick={() => void loadFirstPage(category)}
                className="mt-4 h-11 rounded-w-md bg-it-blue-500 px-6 font-semibold text-white transition-colors motion-reduce:transition-none hover:bg-it-blue-600 active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/50"
              >
                {MESSAGES.contents.retry}
              </button>
            </div>
          )}

          {status === 'ready' && items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Icon
                name="campaign"
                className="text-5xl text-it-ink-300 dark:text-rink-500"
                aria-hidden="true"
              />
              <p className="mt-4 text-[14px] font-semibold text-it-ink-600 dark:text-rink-100">
                {MESSAGES.contents.empty}
              </p>
              {category !== 'ALL' && (
                <>
                  <p className="mt-1 text-[13px] text-it-ink-400 dark:text-rink-300">
                    {MESSAGES.contents.emptyFilterHint}
                  </p>
                  <button
                    type="button"
                    onClick={() => setCategory('ALL')}
                    className="mt-4 h-10 rounded-w-md border border-it-line dark:border-rink-700 bg-it-fill dark:bg-rink-700/40 px-5 text-[13px] font-bold text-it-ink-600 dark:text-rink-100 transition-colors motion-reduce:transition-none hover:bg-it-line/60 dark:hover:bg-rink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/50"
                  >
                    {MESSAGES.contents.categoryAll}
                  </button>
                </>
              )}
            </div>
          )}

          {status === 'ready' && items.length > 0 && (
            <>
              <ul className="space-y-8">
                {items.map((post) => (
                  <li key={post.id}>
                    <ContentCard post={post} />
                  </li>
                ))}
              </ul>
              {hasMore && (
                <button
                  type="button"
                  onClick={() => void handleLoadMore()}
                  disabled={isLoadingMore}
                  className="mt-8 flex h-11 w-full items-center justify-center gap-1.5 rounded-w-md border border-it-line dark:border-rink-700 bg-it-fill dark:bg-rink-700/40 text-[13px] font-bold text-it-ink-600 dark:text-rink-100 transition-colors motion-reduce:transition-none hover:bg-it-line/60 dark:hover:bg-rink-700 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/50"
                >
                  <Icon name="expand_more" className="text-[18px]" aria-hidden="true" />
                  {MESSAGES.contents.loadMore}
                </button>
              )}
            </>
          )}
        </section>
      </main>
    </MobileContainer>
  );
}
