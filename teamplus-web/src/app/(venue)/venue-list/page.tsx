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
import { VenueMapHero, VenueStatusBadge } from "@/components/venue";
import { FACILITY_META, type Venue, type VenueAmenity } from "@/types/venue";
import { usePageReady } from '@/hooks/usePageReady';

const DEFAULT_AMENITIES: VenueAmenity[] = [
  "locker_room",
  "shower",
  "stand",
  "parking",
];

/** 다이얼 가능한 숫자/+만 남긴 문자열 (없으면 빈 문자열) */
function sanitizePhone(phone?: string | null): string {
  return (phone ?? "").replace(/[^0-9+]/g, "");
}

/** 길 찾기 외부 앱 호출 (카카오맵, 좌표 우선) */
function openDirections(
  address?: string | null,
  latitude?: string | number | null,
  longitude?: string | number | null,
) {
  if (typeof window === "undefined") return;
  if (latitude != null && longitude != null) {
    window.open(
      `https://map.kakao.com/link/to/TEAMPLUS,${String(latitude)},${String(longitude)}`,
      "_blank",
      "noopener,noreferrer",
    );
    return;
  }
  if (address) {
    window.open(
      `https://map.kakao.com/link/search/${encodeURIComponent(address)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }
}

function callPhone(phone?: string | null) {
  if (typeof window === "undefined") return;
  const dialable = sanitizePhone(phone);
  if (!dialable) return;
  window.location.href = `tel:${dialable}`;
}

/**
 * VenueRow — ICETIMES flat hairline 행 (page-local).
 * 공유 VenueCard(카드 박스)는 iceTheme 미지원이라 회귀 위험으로 미사용 →
 * 박스 제거 + 흰 섹션 위 hairline 행 + 시설 칩(it-blue) + 길찾기/전화(it-blue)로 직접 렌더.
 */
function VenueRow({
  venue,
  recommended,
  childMode,
  onClick,
}: {
  venue: Venue;
  recommended: boolean;
  childMode: boolean;
  onClick: () => void;
}) {
  const amenities =
    Array.isArray(venue.amenities) && venue.amenities.length > 0
      ? venue.amenities
      : DEFAULT_AMENITIES;
  const hasValidPhone = sanitizePhone(venue.phone).length > 0;
  const btnSize = childMode ? "h-[44px] text-card-body" : "h-10 text-card-meta";

  return (
    <div className="px-5 py-4">
      {/* 이름 + 상태 (행 헤더) */}
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500 rounded-w-md"
        aria-label={`${venue.name} 상세 보기`}
      >
        <div className="flex items-center gap-2 flex-wrap mb-1.5">
          <VenueStatusBadge status={venue.status} size="sm" iceTheme />
          {recommended ? (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-w-pill bg-it-blue-50 text-it-blue-500 dark:bg-it-blue-900/30 dark:text-it-blue-300">
              {MESSAGES.venue.recommended}
            </span>
          ) : null}
        </div>
        <h3
          className={
            childMode
              ? "text-[20px] font-bold text-it-ink-800 dark:text-white leading-tight"
              : "text-card-title font-bold text-it-ink-800 dark:text-white leading-tight"
          }
        >
          {venue.name}
        </h3>
        <div className="mt-1.5 flex items-start gap-1.5 text-card-meta text-it-ink-500 dark:text-rink-300">
          <Icon
            name="location_on"
            className="text-[16px] mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <p className="leading-snug">{venue.address ?? MESSAGES.venue.noAddress}</p>
        </div>
      </button>

      {/* 시설 칩 (it-blue) */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {amenities.slice(0, 4).map((amenity) => {
          const meta = FACILITY_META.find((f) => f.key === amenity);
          if (!meta) return null;
          return (
            <span
              key={amenity}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-w-pill bg-it-blue-50 dark:bg-it-blue-900/30 text-it-blue-500 dark:text-it-blue-300 text-[12px] font-semibold"
            >
              <Icon name={meta.icon} className="text-[15px]" aria-hidden="true" />
              {MESSAGES.venue.facilities[meta.labelKey]}
            </span>
          );
        })}
      </div>

      {/* 길찾기 / 전화 (it-blue) */}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() =>
            openDirections(venue.address, venue.latitude, venue.longitude)
          }
          className={`flex-1 flex items-center justify-center gap-1.5 ${btnSize} font-bold rounded-w-md bg-it-blue-500 text-white active:brightness-95 transition-[filter] motion-reduce:transition-none`}
          aria-label={MESSAGES.venue.actions.findWay}
        >
          <Icon name="near_me" className="text-[18px]" aria-hidden="true" />
          {MESSAGES.venue.actions.findWay}
        </button>
        <button
          type="button"
          onClick={() => callPhone(venue.phone)}
          disabled={!hasValidPhone}
          aria-disabled={!hasValidPhone}
          className={`flex-1 flex items-center justify-center gap-1.5 ${btnSize} font-bold rounded-w-md border transition-colors motion-reduce:transition-none ${
            hasValidPhone
              ? "border-it-line-strong dark:border-rink-700 bg-it-surface dark:bg-rink-900 text-it-blue-600 dark:text-it-blue-300 active:bg-it-blue-50 dark:active:bg-it-blue-900/30"
              : "border-it-line dark:border-rink-700 bg-it-fill dark:bg-rink-800 text-it-ink-400 dark:text-rink-300 cursor-not-allowed"
          }`}
          aria-label={MESSAGES.venue.actions.call}
        >
          <Icon name="call" className="text-[18px]" aria-hidden="true" />
          {MESSAGES.venue.actions.call}
        </button>
      </div>
    </div>
  );
}

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

      <main className="flex-1 overflow-y-auto pb-30 bg-it-canvas dark:bg-puck">
        {/* 지도 히어로 (공유 컴포넌트 VenueMapHero — iceTheme 미지원, 골격 유지) */}
        <VenueMapHero
          venues={venues}
          currentLocationLabel={currentLocationLabel}
          nearbyCount={venues.length}
          variant="list"
        />

        {/* 검색 — full-bleed 흰 섹션 (히어로 위로 살짝 오버랩) */}
        <section className="-mt-6 relative z-10 bg-it-surface dark:bg-it-blue-950 rounded-t-3xl px-5 pt-6 pb-5">
          <label htmlFor="venue-search" className="sr-only">
            {MESSAGES.venue.searchPlaceholder}
          </label>
          <div className="relative">
            <Icon
              name="search"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-it-ink-400 text-[20px]"
              aria-hidden="true"
            />
            <input
              id="venue-search"
              type="search"
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder={MESSAGES.venue.searchPlaceholder}
              className="w-full bg-it-fill dark:bg-rink-800 rounded-w-md pl-10 pr-4 py-3 text-card-body text-it-ink-800 dark:text-white placeholder-it-ink-400 border-[1.5px] border-it-line-strong dark:border-rink-700 focus:outline-none focus:border-it-blue-500"
            />
          </div>
        </section>

        {/* 8px 회색 갭 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" />

        {/* 목록 — full-bleed 흰 섹션 + hairline 행 */}
        <section className="bg-it-surface dark:bg-it-blue-950">
          {/* 섹션 헤더 */}
          <div className="flex items-center justify-between px-5 pt-6 pb-3">
            <h2 className="text-[17px] font-extrabold text-it-ink-800 dark:text-white">
              {MESSAGES.venue.nearbyLabel}
            </h2>
            <span className="text-card-meta font-bold text-it-blue-500 dark:text-it-blue-300">
              {MESSAGES.venue.foundCount(venues.length)}
            </span>
          </div>

          {/* 에러 */}
          {error ? (
            <div className="mx-5 mb-4 rounded-w-md bg-it-red-50 dark:bg-it-red-500/15 border border-it-red-200 dark:border-it-red-500/30 p-4 text-card-body text-it-red-600 dark:text-it-red-300 flex items-center justify-between">
              <span>{error}</span>
              <button
                type="button"
                onClick={refresh}
                className="text-card-meta font-bold text-it-red-600 dark:text-it-red-300 underline"
              >
                {MESSAGES.venue.retry}
              </button>
            </div>
          ) : null}

          {/* 목록 */}
          {isLoading ? (
            <div className="py-16 flex items-center justify-center text-it-ink-400 text-card-body">
              {MESSAGES.venue.loading}
            </div>
          ) : venues.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-it-ink-400">
              <Icon
                name="place"
                className="text-[48px] mb-2"
                aria-hidden="true"
              />
              <p className="text-card-body">{MESSAGES.venue.empty}</p>
            </div>
          ) : (
            <div className="divide-y divide-it-line dark:divide-rink-700">
              {venues.map((venue, idx) => (
                <VenueRow
                  key={venue.id}
                  venue={venue}
                  recommended={idx === 0}
                  childMode={childMode}
                  onClick={() => navigate(`/venue-detail/${venue.id}`)}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* 관리 진입 FAB — 권한 있는 사용자만 */}
      {permissions.canViewManage && (
        <button
          type="button"
          onClick={() => navigate("/venue-manage")}
          aria-label={MESSAGES.venue.manageTitle}
          className="fixed bottom-24 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-w-pill bg-it-blue-500 hover:bg-it-blue-600 text-white shadow-md hover:shadow-lg active:brightness-95 transition-all motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
        >
          <Icon name="add" className="text-2xl" aria-hidden="true" />
        </button>
      )}
    </MobileContainer>
  );
}
