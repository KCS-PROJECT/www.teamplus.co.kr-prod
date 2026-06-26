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

      {/* Main Content — ICETIMES flat: 회색 캔버스 + 흰 섹션 */}
      <main className="flex-1 overflow-y-auto bg-it-canvas dark:bg-puck">
        {/* 검색 + 카테고리 — flat 흰 섹션 (카드 박스 제거) */}
        <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-4">
          <div className="relative">
            <Icon
              name="search"
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-it-ink-400 dark:text-wtext-4 text-[20px] pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-12 pl-11 pr-11 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-fill dark:bg-rink-800 text-[15px] font-semibold text-it-ink-800 dark:text-white placeholder:text-it-ink-400 dark:placeholder:text-wtext-3 focus:outline-none focus:ring-2 focus:ring-it-blue-500/20 focus:border-it-blue-500 transition-colors motion-reduce:transition-none"
              placeholder={MESSAGES.placeholders.searchFAQ}
              disabled={isLoading || !!loadError}
              aria-label="질문 검색"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex w-8 h-8 items-center justify-center rounded-w-pill hover:bg-it-line dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40"
                aria-label="검색어 지우기"
              >
                <Icon name="close" className="text-[18px] text-it-ink-400 dark:text-wtext-4" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Category Chips */}
          {!isLoading && !loadError && categories.length > 1 && (
            <div className="flex gap-2 pt-4 overflow-x-auto scrollbar-hide">
              {categories.map((category) => {
                const isActive = selectedCategory === category;
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setSelectedCategory(category)}
                    aria-pressed={isActive}
                    className={`inline-flex items-center h-9 px-4 rounded-w-pill text-[14px] font-bold whitespace-nowrap border-[1.5px] transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 ${
                      isActive
                        ? 'bg-it-blue-500 text-white border-it-blue-500'
                        : 'bg-it-surface dark:bg-rink-800 text-it-ink-600 dark:text-wtext-4 border-it-line-strong dark:border-rink-700 hover:bg-it-fill dark:hover:bg-rink-700'
                    }`}
                  >
                    {category}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* flat 섹션 사이 8px 회색 갭 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* 질문 목록 — flat 흰 섹션 (카드 박스 제거 → hairline 행) */}
        <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-7">
          {/* Result Counter — SectionHead 위계 */}
          {!isLoading && !loadError && faqItems.length > 0 && (
            <div className="pb-1 flex items-center justify-between">
              <p className="text-[13px] font-medium text-it-ink-500 dark:text-wtext-4 tabular-nums">
                총 <span className="text-it-blue-500 font-extrabold">{filteredFAQs.length}</span>개의 질문
              </p>
              {(searchQuery || selectedCategory !== ALL_CATEGORY) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory(ALL_CATEGORY);
                  }}
                  className="text-[13px] font-bold text-it-blue-500 hover:text-it-blue-600 underline underline-offset-2 inline-flex items-center gap-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 rounded"
                >
                  <Icon name="restart_alt" className="text-[14px]" aria-hidden="true" />
                  필터 초기화
                </button>
              )}
            </div>
          )}

          {isLoading ? null : loadError ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="w-16 h-16 rounded-w-md bg-it-red-50 dark:bg-it-red-500/15 flex items-center justify-center mb-4">
                <Icon name="error_outline" className="text-3xl text-it-red-500" />
              </div>
              <p className="text-[15px] font-bold text-it-ink-800 dark:text-white mb-1">
                자주 묻는 질문을 불러오지 못했어요
              </p>
              <p className="text-[13px] text-it-ink-500 dark:text-wtext-4 mb-4">{loadError}</p>
              <button
                onClick={() => window.location.reload()}
                className="h-10 px-5 rounded-w-md bg-it-blue-500 text-white text-[14px] font-bold hover:bg-it-blue-600 transition-colors motion-reduce:transition-none"
              >
                다시 시도하기
              </button>
            </div>
          ) : filteredFAQs.length > 0 ? (
            <ul className="flex flex-col">
              {filteredFAQs.map((item, idx) => {
                const isOpen = expandedId === item.id;
                const isLast = idx === filteredFAQs.length - 1;
                return (
                  <li
                    key={item.id}
                    id={`faq-${item.id}`}
                    className={`scroll-mt-20 ${!isLast && !isOpen ? 'border-b border-it-line dark:border-rink-700' : ''}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleExpand(item.id)}
                      aria-expanded={isOpen}
                      aria-controls={`faq-panel-${item.id}`}
                      className="w-full min-h-[60px] py-4 text-left transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 focus-visible:ring-inset"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <span className="inline-flex items-center text-[10px] font-bold tracking-[0.12em] uppercase text-it-blue-500 mb-1.5 px-2 py-0.5 bg-it-blue-50 dark:bg-it-blue-900/40 rounded-w-md">
                            {item.category}
                          </span>
                          <h3 className="text-[15px] font-bold leading-snug text-it-ink-800 dark:text-white pr-2">
                            {item.question}
                          </h3>
                        </div>
                        <span
                          aria-hidden="true"
                          className={`shrink-0 inline-flex w-8 h-8 items-center justify-center rounded-w-pill transition-all duration-200 motion-reduce:transition-none ${
                            isOpen
                              ? 'bg-it-blue-50 dark:bg-it-blue-900/40 text-it-blue-500'
                              : 'bg-it-fill dark:bg-rink-700 text-it-ink-400 dark:text-wtext-4'
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

                    {/* Answer — 인셋 영역으로 분리 */}
                    {isOpen && (
                      <div
                        id={`faq-panel-${item.id}`}
                        role="region"
                        aria-label={`${item.question} 답변`}
                        className={`px-4 pt-4 pb-5 bg-it-fill dark:bg-puck/30 rounded-w-md mb-4 ${!isLast ? 'border-b border-it-line dark:border-rink-700' : ''}`}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            aria-hidden="true"
                            className="shrink-0 inline-flex w-7 h-7 rounded-w-md bg-it-blue-500 text-white items-center justify-center text-[13px] font-extrabold"
                          >
                            A
                          </span>
                          <p className="flex-1 text-[14px] text-it-ink-800 dark:text-white leading-[1.7] whitespace-pre-wrap">
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
              <div className="w-16 h-16 rounded-w-md bg-it-fill dark:bg-rink-700 flex items-center justify-center mb-4">
                <Icon name="help_outline" className="text-3xl text-it-ink-400 dark:text-wtext-4" />
              </div>
              <p className="text-[15px] font-bold text-it-ink-700 dark:text-wtext-4 mb-1">
                {searchQuery || selectedCategory !== ALL_CATEGORY
                  ? '검색 결과가 없습니다'
                  : '등록된 질문이 없습니다'}
              </p>
              <p className="text-[14px] text-it-ink-500 dark:text-wtext-4">
                {searchQuery ? '다른 검색어를 입력해 보세요' : '곧 FAQ가 업데이트됩니다'}
              </p>
            </div>
          )}
        </section>

        {/* flat 섹션 사이 8px 회색 갭 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* Contact Section — flat 흰 섹션 */}
        <section className="bg-it-surface dark:bg-rink-800 px-5 pt-6 pb-8 flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-w-md bg-it-blue-50 dark:bg-it-blue-900/40 flex items-center justify-center mb-3">
            <Icon name="support_agent" className="text-[28px] text-it-blue-500" aria-hidden="true" />
          </div>
          <h3 className="text-[15px] font-bold text-it-ink-800 dark:text-white mb-1">
            원하는 답변을 찾지 못하셨나요?
          </h3>
          <p className="text-[13px] text-it-ink-500 dark:text-wtext-4 mb-4">
            피드백으로 의견을 보내주세요.
          </p>
          <NavLink
            href="/feedback"
            className="inline-flex items-center justify-center gap-1.5 h-12 px-6 rounded-w-md bg-it-blue-500 hover:bg-it-blue-600 text-white text-[15px] font-bold active:brightness-95 transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40"
          >
            <Icon name="feedback" className="text-[18px]" aria-hidden="true" />
            피드백 보내기
          </NavLink>
        </section>
      </main>
    </MobileContainer>
  );
}
