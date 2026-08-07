'use client';

import { useCallback, useMemo, useState } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { useNavigation } from '@/components/ui/NavLink';
import { useDebounce } from '@/hooks/useDebounce';
import { usePageReady } from '@/hooks/usePageReady';
import { useExploreClasses } from '@/hooks/useExploreClasses';
import { ExploreClassCard } from '@/components/classes/ExploreClassCard';
import {
  ExploreFilterSheet,
  type ExploreFilters,
} from '@/components/classes/ExploreFilterSheet';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import { REGIONS, districtsOf, type Region } from '@/lib/regions';
import { useAuth } from '@/contexts/AuthContext';
import type { ExploreClassItem } from '@/services/class-explore.service';

/**
 * ClassesExplorePage — 전국 수업 찾기.
 * Route: /classes-explore ((public) 그룹, 인증 가드 없음)
 *
 * [2026-08-04] 기존 `/classes` 는 자녀의 팀 소속을 전제로 하므로, 팀에 가입하지 않은
 *   학부모에게는 정규수업이 빈 화면이었다(classes.service.ts PARENT 분기 조기 반환).
 *   이 화면은 그 앞단의 "발견" 경로다 — 감독이 공개한 수업을 지역·요일·시간대로 찾는다.
 *
 * 노출 범위는 서버가 강제한다(비로그인=전체공개만 / 로그인=학부모공개까지 / 소속 팀 수업 추가).
 * SoT: docs/Planning/SPEC_CLASS_VISIBILITY.md
 */
export default function ClassesExplorePage() {
  const [searchInput, setSearchInput] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<Region | undefined>();
  // [2026-08-04] 시군구 — 시/도 선택 시에만 노출·전송. 시/도가 바뀌면 반드시 초기화한다
  //   (남겨두면 "부산 + 강남구" 조합으로 조회돼 결과가 항상 0건이 된다).
  const [selectedDistrict, setSelectedDistrict] = useState<string | undefined>();
  // 초기값을 인라인으로 둔다 — 다른 모듈의 상수를 초기값으로 쓰면 모듈 초기화 순서에 따라
  //   undefined 가 들어와 `filters.timeSlot` 접근에서 페이지 전체가 죽는다(2026-08-04 실측).
  const [filters, setFilters] = useState<ExploreFilters>({ dayOfWeek: [] });
  const [sort, setSort] = useState<'recent' | 'capacity'>('recent');
  const [filterOpen, setFilterOpen] = useState(false);
  const { navigate } = useNavigation();
  const { isAuthenticated } = useAuth();

  const debouncedSearch = useDebounce(searchInput, 300);

  const { items, total, isLoading, isLoadingMore, hasMore, loadMore } =
    useExploreClasses({
      q: debouncedSearch || undefined,
      city: selectedRegion,
      district: selectedDistrict,
      category: filters.category,
      trainingType: filters.trainingType,
      dayOfWeek: filters.dayOfWeek.length > 0 ? filters.dayOfWeek : undefined,
      timeSlot: filters.timeSlot,
      priceMax: filters.priceMax,
      sort,
    });

  usePageReady(!isLoading);

  // 적용된 상세 필터 개수 — 버튼 배지로 표시해 "필터가 걸려 있다"는 사실을 숨기지 않는다.
  const activeFilterCount = useMemo(() => {
    let n = filters.dayOfWeek.length > 0 ? 1 : 0;
    if (filters.timeSlot) n += 1;
    if (filters.category) n += 1;
    if (filters.trainingType) n += 1;
    if (filters.priceMax) n += 1;
    return n;
  }, [filters]);

  const handleCardPress = useCallback(
    (item: ExploreClassItem) => {
      navigate(`/classes/${item.id}`);
    },
    [navigate],
  );

  const handleRegionToggle = useCallback((region: Region) => {
    setSelectedRegion((prev) => (prev === region ? undefined : region));
    setSelectedDistrict(undefined);
  }, []);

  const handleDistrictToggle = useCallback((district: string) => {
    setSelectedDistrict((prev) => (prev === district ? undefined : district));
  }, []);

  return (
    <MobileContainer hasBottomNav>
      {/* forceNative — 네이티브 WebView 에서도 웹 DOM 헤더를 단독 렌더한다.
          (public) 그룹은 useNativeUI 호출이 없어 Flutter AppBar 가 뜨지 않으므로,
          이 값이 없으면 앱에서 헤더가 통째로 사라진다. */}
      <PageAppBar title={MESSAGES.class.explore.title} showBack forceNative />

      <main className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck">
        {/* 검색 + 지역 필터 */}
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
              placeholder={MESSAGES.class.explore.searchPlaceholder}
              className={cn(
                'w-full h-12 pl-11 pr-10 rounded-w-md text-[15px] font-semibold',
                'bg-it-fill dark:bg-rink-800 text-it-ink-800 dark:text-white',
                'border-[1.5px] border-it-line-strong dark:border-rink-700',
                'placeholder:text-it-ink-400 dark:placeholder:text-wtext-3',
                'focus:outline-none focus:ring-2 focus:ring-it-blue-500/20 focus:border-it-blue-500',
                'transition-colors motion-reduce:transition-none',
              )}
              aria-label={MESSAGES.class.explore.searchAriaLabel}
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

          {/* 지역 칩 */}
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
                        : 'bg-it-surface dark:bg-rink-800 text-it-ink-600 dark:text-wtext-4 border-it-line-strong dark:border-rink-700 hover:bg-it-fill dark:hover:bg-rink-700',
                    )}
                  >
                    {region}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 시군구 칩 — [2026-08-04] 시/도를 고른 뒤에만 나타난다.
              지역 미입력 수업(2026-08-04 이전 등록)은 시군구를 고르는 순간 결과에서 빠진다 —
              구까지 지정한 사용자에게 "구 미상" 수업을 섞어 보여주지 않기 위한 의도된 동작. */}
          {selectedRegion && (
          <div className="pt-2 overflow-x-auto hide-scrollbar">
            <div className="flex gap-2">
              {districtsOf(selectedRegion).map((district) => {
                const isActive = selectedDistrict === district;
                return (
                  <button
                    key={district}
                    type="button"
                    onClick={() => handleDistrictToggle(district)}
                    aria-pressed={isActive}
                    className={cn(
                      'shrink-0 inline-flex items-center h-8 px-3.5 rounded-w-pill text-[13px] font-bold whitespace-nowrap border-[1.5px] transition-colors motion-reduce:transition-none',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40',
                      isActive
                        ? 'bg-it-ink-800 text-white border-it-ink-800 dark:bg-white dark:text-it-ink-900 dark:border-white'
                        : 'bg-it-fill dark:bg-rink-900 text-it-ink-500 dark:text-wtext-4 border-it-line dark:border-rink-700 hover:bg-it-line/50 dark:hover:bg-rink-700',
                    )}
                  >
                    {district}
                  </button>
                );
              })}
            </div>
          </div>
          )}

          {/* 상세 필터 + 정렬 */}
          <div className="pt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFilterOpen(true)}
              className={cn(
                'inline-flex items-center gap-1.5 h-9 px-3.5 rounded-w-pill text-[14px] font-bold border-[1.5px] transition-colors motion-reduce:transition-none',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40',
                activeFilterCount > 0
                  ? 'bg-it-blue-500/10 text-it-blue-500 border-it-blue-500'
                  : 'bg-it-surface dark:bg-rink-800 text-it-ink-600 dark:text-wtext-4 border-it-line-strong dark:border-rink-700',
              )}
            >
              <Icon name="tune" className="text-[18px]" aria-hidden="true" />
              {MESSAGES.class.explore.filterButton}
              {activeFilterCount > 0 && (
                <span className="font-num tabular-nums">{activeFilterCount}</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setSort((p) => (p === 'recent' ? 'capacity' : 'recent'))}
              className="inline-flex items-center gap-1 h-9 px-3 rounded-w-pill text-[14px] font-bold text-it-ink-600 dark:text-wtext-4 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40"
              aria-label={MESSAGES.class.explore.sortLabel}
            >
              <Icon name="swap_vert" className="text-[18px]" aria-hidden="true" />
              {sort === 'recent'
                ? MESSAGES.class.explore.sortRecent
                : MESSAGES.class.explore.sortCapacity}
            </button>
          </div>
        </section>

        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* 목록 */}
        <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-8">
          {!isLoading && (
            <div className="flex items-baseline gap-2 pb-1">
              <h2 className="text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white">
                {MESSAGES.class.explore.resultTitle}
              </h2>
              <span className="text-[15px] font-extrabold font-num tabular-nums text-it-blue-500">
                {total}
              </span>
            </div>
          )}

          {isLoading ? null : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Icon name="search_off" className="text-4xl text-it-ink-400 dark:text-wtext-4 mb-3" />
              <p className="text-[14px] font-medium text-it-ink-700 dark:text-wtext-4 text-center">
                {MESSAGES.class.explore.emptyTitle}
              </p>
              <p className="text-[13px] text-it-ink-500 dark:text-wtext-4 mt-1 text-center">
                {MESSAGES.class.explore.emptyDescription}
              </p>
              {/* 비로그인 사용자는 전체공개 수업만 보이므로, 결과가 없을 때 이유를 알려준다. */}
              {!isAuthenticated && (
                <p className="text-[13px] font-semibold text-it-blue-500 mt-3 text-center">
                  {MESSAGES.class.explore.emptyGuestHint}
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="flex flex-col divide-y divide-it-line dark:divide-rink-700">
                {items.map((item) => (
                  <ExploreClassCard
                    key={item.id}
                    item={item}
                    onPress={handleCardPress}
                  />
                ))}
              </div>

              {hasMore && (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  className="mt-5 w-full h-12 rounded-w-md text-[15px] font-bold border-[1.5px] border-it-line-strong dark:border-rink-700 text-it-ink-600 dark:text-wtext-4 transition-colors motion-reduce:transition-none active:brightness-95 disabled:opacity-60"
                >
                  {isLoadingMore
                    ? MESSAGES.class.explore.loadingMore
                    : MESSAGES.class.explore.loadMore}
                </button>
              )}
            </>
          )}
        </section>
      </main>

      <ExploreFilterSheet
        isOpen={filterOpen}
        onClose={() => setFilterOpen(false)}
        value={filters}
        onApply={setFilters}
      />
    </MobileContainer>
  );
}
