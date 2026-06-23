'use client';

import { useState, useMemo, useEffect } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { NavLink } from '@/components/ui/NavLink';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';

import { usePageReady } from '@/hooks/usePageReady';
import { useDefaultUI } from '@/hooks/useNativeUI';
/**
 * FAQPage - 자주 묻는 질문 (공통)
 * Route: /faq
 *
 * 데이터 소스: GET /api/v1/app/faqs (AppFaq 모델)
 * - 어드민이 FAQ CRUD를 수정하면 앱 업데이트 없이 즉시 반영
 * - 실패 시 안내 메시지, 하드코딩 폴백 금지 (운영 일관성)
 */

interface FAQItem {
  id: string;
  category: string;
  question: string;
  answer: string;
  sortOrder: number;
  isActive: boolean;
}

const ALL_CATEGORY = '전체';

export default function FAQPage() {
  const [faqItems, setFaqItems] = useState<FAQItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  // [2026-05-13 이슈 D14] Flutter Native AppBar 끄고 Web PageAppBar(forceNative) 단일 노출.
  useDefaultUI();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORY);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // FAQ 로드
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setLoadError(null);
      const res = await api.get<FAQItem[]>('/app/faqs');
      if (cancelled) return;
      if (res.success && Array.isArray(res.data)) {
        const active = res.data
          .filter((item) => item.isActive !== false)
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
        setFaqItems(active);
      } else {
        setLoadError(res.error?.message ?? MESSAGES.error.network);
      }
      setIsLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // 카테고리 목록: 데이터에서 동적 추출
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const item of faqItems) {
      if (item.category) set.add(item.category);
    }
    return [ALL_CATEGORY, ...Array.from(set)];
  }, [faqItems]);

  const filteredFAQs = useMemo(() => {
    let result = faqItems;

    if (selectedCategory !== ALL_CATEGORY) {
      result = result.filter((item) => item.category === selectedCategory);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (item) =>
          item.question.toLowerCase().includes(query) ||
          item.answer.toLowerCase().includes(query),
      );
    }

    return result;
  }, [faqItems, selectedCategory, searchQuery]);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <MobileContainer hasBottomNav={true}>
      {/* [2026-05-13 이슈 D14] forceNative — App/Web 동일 AppBar. */}
      <PageAppBar title="자주 묻는 질문" forceNative />

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {/* Search Bar */}
        <div className="px-4 pt-4 pb-2">
          <div className="relative">
            <Icon
              name="search"
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-wtext-3 dark:text-wtext-4 text-[20px] pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-12 pl-11 pr-11 rounded-w-md border border-wline-2 dark:border-rink-700 bg-wsurface dark:bg-rink-800 text-[15px] text-wtext-1 dark:text-white placeholder:text-wtext-3 dark:placeholder:text-wtext-4 focus:outline-none focus:ring-2 focus:ring-ice-500/30 focus:border-ice-500 transition-colors motion-reduce:transition-none"
              placeholder={MESSAGES.placeholders.searchFAQ}
              disabled={isLoading || !!loadError}
              aria-label="질문 검색"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex w-8 h-8 items-center justify-center rounded-w-pill hover:bg-wline-2 dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40"
                aria-label="검색어 지우기"
              >
                <Icon name="close" className="text-[18px] text-wtext-3 dark:text-wtext-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {/* Category Chips */}
        {!isLoading && !loadError && categories.length > 1 && (
          <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-hide">
            {categories.map((category) => {
              const isActive = selectedCategory === category;
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => setSelectedCategory(category)}
                  aria-pressed={isActive}
                  className={`inline-flex items-center h-9 px-4 rounded-w-pill text-card-body font-semibold whitespace-nowrap transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40 ${
                    isActive
                      ? 'bg-ice-500 text-white shadow-sh-1'
                      : 'bg-wsurface dark:bg-rink-800 text-wtext-2 dark:text-wtext-4 border border-wline-2 dark:border-rink-700 hover:border-ice-500/40 hover:text-ice-500 dark:hover:text-blue-300'
                  }`}
                >
                  {category}
                </button>
              );
            })}
          </div>
        )}

        {/* Result Counter */}
        {!isLoading && !loadError && faqItems.length > 0 && (
          <div className="px-5 pb-1 flex items-center justify-between">
            <p className="text-card-meta font-medium text-wtext-3 dark:text-wtext-4 tabular-nums">
              총 <span className="text-ice-500 dark:text-ice-500 font-bold">{filteredFAQs.length}</span>개의 질문
            </p>
            {(searchQuery || selectedCategory !== ALL_CATEGORY) && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory(ALL_CATEGORY);
                }}
                className="text-card-meta font-semibold text-ice-500 dark:text-ice-500 hover:underline inline-flex items-center gap-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40 rounded"
              >
                <Icon name="restart_alt" className="text-[14px]" aria-hidden="true" />
                필터 초기화
              </button>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="w-10 h-10 rounded-w-pill border-2 border-ice-500/20 border-t-primary animate-spin mb-4 motion-reduce:animate-none" />
            <p className="text-card-body text-wtext-3 dark:text-wtext-4">불러오는 중...</p>
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="w-16 h-16 rounded-w-md bg-flame-100 dark:bg-flame-500/15 flex items-center justify-center mb-4">
              <Icon name="error_outline" className="text-3xl text-flame-500" />
            </div>
            <p className="text-card-body font-medium text-wtext-1 dark:text-white mb-1">
              자주 묻는 질문을 불러오지 못했어요
            </p>
            <p className="text-card-meta text-wtext-3 mb-4">{loadError}</p>
            <button
              onClick={() => window.location.reload()}
              className="h-10 px-5 rounded-lg bg-ice-500 text-white text-card-body font-semibold hover:bg-ice-600 transition-colors motion-reduce:transition-none"
            >
              다시 시도하기
            </button>
          </div>
        ) : filteredFAQs.length > 0 ? (
          <ul className="space-y-2.5 px-4 pt-3">
            {filteredFAQs.map((item) => {
              const isOpen = expandedId === item.id;
              return (
                <li
                  key={item.id}
                  id={`faq-${item.id}`}
                  className={`scroll-mt-20 rounded-w-lg border bg-wsurface dark:bg-rink-800 transition-all duration-200 motion-reduce:transition-none overflow-hidden ${
                    isOpen
                      ? 'border-ice-500/40 dark:border-ice-500/50 shadow-sh-1'
                      : 'border-wline-2 dark:border-rink-700 shadow-sh-1'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleExpand(item.id)}
                    aria-expanded={isOpen}
                    aria-controls={`faq-panel-${item.id}`}
                    className="w-full min-h-[64px] px-4 py-4 text-left hover:bg-wline-2/40 dark:hover:bg-rink-700/40 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40 focus-visible:ring-inset"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <span className="inline-flex items-center text-[10px] font-bold tracking-[0.12em] uppercase text-ice-500 dark:text-ice-500 mb-1.5 px-2 py-0.5 bg-ice-500/15 dark:bg-ice-500/20 rounded-md">
                          {item.category}
                        </span>
                        <h3 className="text-[15px] font-semibold leading-snug text-wtext-1 dark:text-white pr-2">
                          {item.question}
                        </h3>
                      </div>
                      <span
                        aria-hidden="true"
                        className={`shrink-0 inline-flex w-8 h-8 items-center justify-center rounded-w-pill transition-all duration-200 motion-reduce:transition-none ${
                          isOpen
                            ? 'bg-ice-500/15 dark:bg-ice-500/20 text-ice-500 dark:text-ice-500'
                            : 'bg-wline-2 dark:bg-rink-700 text-wtext-3 dark:text-wtext-4'
                        }`}
                      >
                        <Icon
                          name="expand_more"
                          className={`text-[22px] transition-transform duration-200 motion-reduce:transition-none ${
                            isOpen ? 'rotate-180' : 'rotate-0'
                          }`}
                          aria-hidden="true"
                        />
                      </span>
                    </div>
                  </button>

                  {/* Answer — 카드 전체 폭 구분선으로만 분리 */}
                  {isOpen && (
                    <div
                      id={`faq-panel-${item.id}`}
                      role="region"
                      aria-label={`${item.question} 답변`}
                      className="border-t border-wline-2 dark:border-rink-700 px-4 pt-4 pb-5 bg-wbg/50 dark:bg-puck/20"
                    >
                      <div className="flex items-start gap-3">
                        <span
                          aria-hidden="true"
                          className="shrink-0 inline-flex w-7 h-7 rounded-lg bg-mint-500 dark:bg-emerald-600 text-white items-center justify-center text-card-meta font-extrabold"
                        >
                          A
                        </span>
                        <p className="flex-1 text-[14px] text-wtext-1 dark:text-white leading-[1.7] whitespace-pre-wrap">
                          {item.answer}
                        </p>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="w-16 h-16 rounded-w-md bg-wline-2 dark:bg-rink-700 flex items-center justify-center mb-4">
              <Icon name="help_outline" className="text-3xl text-wtext-3 dark:text-wtext-4" />
            </div>
            <p className="text-card-body font-medium text-wtext-2 dark:text-wtext-4 mb-1">
              {searchQuery || selectedCategory !== ALL_CATEGORY
                ? '검색 결과가 없습니다'
                : '등록된 질문이 없습니다'}
            </p>
            <p className="text-card-body text-wtext-3">
              {searchQuery ? '다른 검색어를 입력해 보세요' : '곧 FAQ가 업데이트됩니다'}
            </p>
          </div>
        )}

        {/* Contact Section */}
        <div className="px-4 pt-6 pb-8">
          <div className="rounded-w-lg bg-wsurface dark:bg-rink-800 border border-wline-2 dark:border-rink-700 shadow-sh-1 p-5 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-w-lg bg-ice-500/15 dark:bg-ice-500/20 flex items-center justify-center mb-3">
              <Icon name="support_agent" className="text-[28px] text-ice-500 dark:text-ice-500" aria-hidden="true" />
            </div>
            <h3 className="text-[15px] font-bold text-wtext-1 dark:text-white mb-1">
              원하는 답변을 찾지 못하셨나요?
            </h3>
            <p className="text-card-meta text-wtext-3 dark:text-wtext-4 mb-4">
              피드백으로 의견을 보내주세요.
            </p>
            <NavLink
              href="/feedback"
              className="inline-flex items-center justify-center gap-1.5 h-11 px-5 rounded-w-md bg-ice-500 hover:bg-ice-600 text-white text-card-body font-semibold shadow-sh-1 active:brightness-95 transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40"
            >
              <Icon name="feedback" className="text-[18px]" aria-hidden="true" />
              피드백 보내기
            </NavLink>
          </div>
        </div>
      </main>
    </MobileContainer>
  );
}
