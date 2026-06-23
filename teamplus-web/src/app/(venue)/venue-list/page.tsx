"use client";

/**
 * /venue-list — 구장 정보 탐색 페이지
 *
 * 목업 기반 (구장 정보 탐색 / 고해상도 보정):
 *  - VenueMapHero 지도 히어로
 *  - 검색 입력 (디바운스)
 *  - VenueCard 리스트 (API 연동, 공통 컴포넌트 사용)
 *  - 관리자(DIRECTOR/COACH/ADMIN) 권한일 때 상단에 "구장 관리" 진입 CTA 노출
 *
 * RBAC:
 *  - `(venue)` 그룹은 공개(비로그인 허용)이며, 모든 역할이 조회 가능
 *  - PARENT/TEEN/CHILD 는 조회 전용이므로 관리 CTA 를 숨김
 *  - CHILD 는 WCAG AAA 모드로 카드 확대
 */

import { useCallback, useMemo, useState } from "react";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { Icon } from "@/components/ui/Icon";
import { useNavigation } from "@/components/ui/NavLink";
import { MESSAGES } from "@/lib/messages";
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { useVenues, useVenuePermissions } from "@/hooks/useVenues";
import { VenueCard, VenueMapHero } from "@/components/venue";
import { usePageReady } from '@/hooks/usePageReady';

export default function VenueListPage() {
  const { navigate } = useNavigation();
  const { user } = useSessionAuth();
  const { venues, isLoading, error, refresh, setParams } = useVenues({
    limit: 20,
  });
  const permissions = useVenuePermissions();

  // v18 (2026-05-20, audit §4 C #11): isLoading 도착 후 ready.
  usePageReady(!isLoading);

  const [searchTerm, setSearchTerm] = useState("");

  const childMode = (user?.userType ?? "").toLowerCase() === "child";

  const currentLocationLabel = useMemo(() => {
    if (!venues || venues.length === 0) return MESSAGES.venue.locationChecking;
    const first = venues.find((v) => !!v.city) ?? venues[0];
    return first?.city ? `${first.city}` : MESSAGES.venue.defaultCity;
  }, [venues]);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchTerm(value);
      setParams((prev) => ({ ...prev, search: value || undefined, page: 1 }));
    },
    [setParams],
  );

  return (
    <MobileContainer hasBottomNav={true}>
      <PageAppBar title={MESSAGES.venue.listTitle} />

      <main className="flex-1 overflow-y-auto">
        {/* 지도 히어로 */}
        <VenueMapHero
          venues={venues}
          currentLocationLabel={currentLocationLabel}
          nearbyCount={venues.length}
          variant="list"
        />

        <div className="px-5 pt-5">
          {/* 검색 */}
          <div className="mb-5">
            <label htmlFor="venue-search" className="sr-only">
              {MESSAGES.venue.searchPlaceholder}
            </label>
            <div className="relative">
              <Icon
                name="search"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-wtext-3 text-[20px]"
                aria-hidden="true"
              />
              <input
                id="venue-search"
                type="search"
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder={MESSAGES.venue.searchPlaceholder}
                className="w-full bg-white dark:bg-rink-800 rounded-xl pl-10 pr-4 py-3 text-card-body text-wtext-1 dark:text-white placeholder-wtext-3 shadow-sm border border-wline dark:border-rink-700 focus:outline-none focus:ring-2 focus:ring-ice-500"
              />
            </div>
          </div>

          {/* 섹션 헤더 */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-card-title font-bold text-wtext-1 dark:text-white">
              {MESSAGES.venue.nearbyLabel}
            </h2>
            <span className="text-card-body font-semibold text-ice-500 dark:text-blue-300">
              {MESSAGES.venue.foundCount(venues.length)}
            </span>
          </div>

          {/* 에러 */}
          {error ? (
            <div className="rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 p-4 mb-4 text-card-body text-red-700 dark:text-red-300 flex items-center justify-between">
              <span>{error}</span>
              <button
                type="button"
                onClick={refresh}
                className="text-card-meta font-bold text-red-700 dark:text-red-300 underline"
              >
                {MESSAGES.venue.retry}
              </button>
            </div>
          ) : null}

          {/* 목록 */}
          {isLoading ? (
            <div className="py-16 flex items-center justify-center text-wtext-3 text-card-body">
              {MESSAGES.venue.loading}
            </div>
          ) : venues.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-wtext-3">
              <Icon
                name="place"
                className="text-[48px] mb-2"
                aria-hidden="true"
              />
              <p className="text-card-body">{MESSAGES.venue.empty}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-5 pb-6">
              {venues.map((venue, idx) => (
                <VenueCard
                  key={venue.id}
                  venue={venue}
                  recommended={idx === 0}
                  childMode={childMode}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* 관리 진입 FAB — 권한 있는 사용자만 */}
      {permissions.canViewManage && (
        <button
          type="button"
          onClick={() => navigate("/venue-manage")}
          aria-label={MESSAGES.venue.manageTitle}
          className="fixed bottom-24 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-w-pill bg-ice-500 hover:bg-ice-700 text-white shadow-md hover:shadow-lg active:brightness-95 transition-all motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
        >
          <Icon name="add" className="text-2xl" aria-hidden="true" />
        </button>
      )}
    </MobileContainer>
  );
}
