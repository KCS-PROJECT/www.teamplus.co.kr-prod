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

      <main className="flex-1 overflow-y-auto hide-scrollbar">
        {/* 검색바 */}
        <div className="px-4 pt-4 pb-2">
          <div className="relative">
            <Icon
              name="search"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-card-title text-wtext-3 dark:text-rink-300"
            />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="오픈클래스명으로 검색"
              className={cn(
                'w-full pl-10 pr-4 py-2.5 rounded-xl text-card-body',
                'bg-white dark:bg-rink-800 text-wtext-1 dark:text-white',
                'border border-wline dark:border-rink-700',
                'placeholder:text-wtext-3 dark:placeholder:text-wtext-3',
                'focus:outline-none focus:ring-2 focus:ring-ice-500 focus:border-transparent',
                'transition-colors motion-reduce:transition-none'
              )}
              aria-label="오픈클래스 검색"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-w-pill hover:bg-wline-2 dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none"
                aria-label={MESSAGES.search.clear}
              >
                <Icon name="close" className="text-card-emphasis text-wtext-3" />
              </button>
            )}
          </div>
        </div>

        {/* 지역 필터 칩 */}
        <div className="px-4 pb-3 overflow-x-auto hide-scrollbar">
          <div className="flex gap-2">
            {REGIONS.map((region) => (
              <button
                key={region}
                type="button"
                onClick={() => handleRegionToggle(region)}
                className={cn(
                  'shrink-0 px-3 py-1.5 rounded-w-pill text-card-meta font-medium transition-colors motion-reduce:transition-none',
                  'focus:outline-none focus:ring-2 focus:ring-ice-500',
                  selectedRegion === region
                    ? 'bg-ice-500 text-white'
                    : 'bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100 hover:bg-wline dark:hover:bg-rink-500'
                )}
              >
                {region}
              </button>
            ))}
          </div>
        </div>

        {/* 결과 수 */}
        {!isLoading && (
          <div className="px-4 pb-2">
            <p className="text-card-meta text-wtext-3 dark:text-rink-300">
              {total}개의 오픈클래스
            </p>
          </div>
        )}

        {/* 목록 */}
        <div className="px-4 pb-8">
          {isLoading ? null : academies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Icon name="search_off" className="text-4xl text-wtext-4 dark:text-rink-500 mb-3" />
              <p className="text-card-body text-wtext-3 dark:text-rink-300 text-center">
                {debouncedSearch
                  ? MESSAGES.search.noResults
                  : MESSAGES.empty('오픈클래스')}
              </p>
              {debouncedSearch && (
                <p className="text-card-meta text-wtext-3 dark:text-rink-300 mt-1 text-center">
                  {MESSAGES.search.noResultsDescription(debouncedSearch)}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {academies.map((academy) => (
                <AcademyCard
                  key={academy.id}
                  academy={academy}
                  onPress={handleCardPress}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </MobileContainer>
  );
}
