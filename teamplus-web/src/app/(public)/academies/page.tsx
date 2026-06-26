'use client';

import { useState, useCallback } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { useNavigation } from '@/components/ui/NavLink';
import { useDebounce } from '@/hooks/useDebounce';
import { usePublicAcademies } from '@/hooks/useAcademy';
import { AcademyCard } from '@/components/academy/AcademyCard';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import type { Academy } from '@/hooks/useAcademy';
import { usePageReady } from '@/hooks/usePageReady';

const REGIONS = ['서울', '경기', '인천', '부산', '대구', '대전', '광주', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];

/**
 * PublicAcademiesPage - 공개 오픈클래스 검색
 * Route: /academies (public layout, 인증 가드 없음)
 */
export default function PublicAcademiesPage() {
  const [searchInput, setSearchInput] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<string | undefined>(undefined);
  const { navigate } = useNavigation();

  const debouncedSearch = useDebounce(searchInput, 300);
  const { academies, total, isLoading } = usePublicAcademies(
    debouncedSearch || undefined,
    selectedRegion
  );

  // v18 (2026-05-20, audit §4 C #10): isLoading 도착 후 ready.
  usePageReady(!isLoading);

  const handleCardPress = useCallback((academy: Academy) => {
    navigate(`/academies/${academy.id}`);
  }, [navigate]);

  const handleRegionToggle = useCallback((region: string) => {
    setSelectedRegion((prev) => (prev === region ? undefined : region));
  }, []);

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title={MESSAGES.academy.publicList} showBack />

      <main className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck">
        {/* 검색 + 지역 필터 — flat 흰 섹션 */}
        <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-4">
          <div className="relative">
            <Icon
              name="search"
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[20px] text-it-ink-400 dark:text-wtext-4 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="오픈클래스명으로 검색"
              className={cn(
                'w-full h-12 pl-11 pr-10 rounded-w-md text-[15px] font-semibold',
                'bg-it-fill dark:bg-rink-800 text-it-ink-800 dark:text-white',
                'border-[1.5px] border-it-line-strong dark:border-rink-700',
                'placeholder:text-it-ink-400 dark:placeholder:text-wtext-3',
                'focus:outline-none focus:ring-2 focus:ring-it-blue-500/20 focus:border-it-blue-500',
                'transition-colors motion-reduce:transition-none'
              )}
              aria-label="오픈클래스 검색"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 flex size-7 items-center justify-center rounded-w-pill hover:bg-it-line dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none"
                aria-label={MESSAGES.search.clear}
              >
                <Icon name="close" className="text-[18px] text-it-ink-400 dark:text-wtext-4" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* 지역 필터 칩 */}
          <div className="pt-4 overflow-x-auto hide-scrollbar">
            <div className="flex gap-2">
              {REGIONS.map((region) => {
                const isActive = selectedRegion === region;
                return (
                  <button
                    key={region}
                    type="button"
                    onClick={() => handleRegionToggle(region)}
                    aria-pressed={isActive}
                    className={cn(
                      'shrink-0 inline-flex items-center h-9 px-4 rounded-w-pill text-[14px] font-bold whitespace-nowrap border-[1.5px] transition-colors motion-reduce:transition-none',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40',
                      isActive
                        ? 'bg-it-blue-500 text-white border-it-blue-500'
                        : 'bg-it-surface dark:bg-rink-800 text-it-ink-600 dark:text-wtext-4 border-it-line-strong dark:border-rink-700 hover:bg-it-fill dark:hover:bg-rink-700'
                    )}
                  >
                    {region}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* flat 섹션 사이 8px 회색 갭 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* 목록 — flat 흰 섹션 (AcademyCard iceTheme hairline 행) */}
        <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-8">
          {/* 결과 수 — SectionHead 위계 */}
          {!isLoading && (
            <div className="flex items-baseline gap-2 pb-1">
              <h2 className="text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white">
                오픈클래스
              </h2>
              <span className="text-[15px] font-extrabold font-num tabular-nums text-it-blue-500">
                {total}
              </span>
            </div>
          )}

          {isLoading ? null : academies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Icon name="search_off" className="text-4xl text-it-ink-400 dark:text-wtext-4 mb-3" />
              <p className="text-[14px] font-medium text-it-ink-700 dark:text-wtext-4 text-center">
                {debouncedSearch
                  ? MESSAGES.search.noResults
                  : MESSAGES.empty('오픈클래스')}
              </p>
              {debouncedSearch && (
                <p className="text-[13px] text-it-ink-500 dark:text-wtext-4 mt-1 text-center">
                  {MESSAGES.search.noResultsDescription(debouncedSearch)}
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-it-line dark:divide-rink-700">
              {academies.map((academy) => (
                <AcademyCard
                  key={academy.id}
                  academy={academy}
                  onPress={handleCardPress}
                  iceTheme
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </MobileContainer>
  );
}
