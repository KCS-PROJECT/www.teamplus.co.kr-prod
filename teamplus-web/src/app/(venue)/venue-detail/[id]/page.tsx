"use client";

/**
 * /venue-detail/[id] — 구장 상세 페이지
 *
 * 목업 기반 (매치 참여 명단 / 장소 상세):
 *  - 상단 지도 히어로 + 현위치 말풍선
 *  - 이름 + 설명
 *  - 주소 / 전화 / 영업시간 정보 라인
 *  - 보유 시설 타일 그리드 (WCAG AAA 72dp)
 *  - 시설 둘러보기 이미지 갤러리
 *  - Sticky bottom: 길 찾기 / 전화하기
 *
 * 조회 공개 (비로그인 포함). 편집 버튼은 관리 권한일 때만 노출.
 */

import { use, useCallback, useMemo } from "react";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { Icon } from "@/components/ui/Icon";
import { useNavigation } from "@/components/ui/NavLink";
import { MESSAGES } from "@/lib/messages";
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { useVenueDetail, useVenuePermissions } from "@/hooks/useVenues";
import {
  VenueMapHero,
  FacilityBadge,
  VenueInfoRow,
  VenueActionBar,
  VenueImageGallery,
  VenueStatusBadge,
} from "@/components/venue";
import type { VenueAmenity } from "@/types/venue";
import { usePageReady } from '@/hooks/usePageReady';

interface VenueDetailPageProps {
  params: Promise<{ id: string }>;
}

const DEFAULT_GRID_AMENITIES: VenueAmenity[] = [
  "locker_room",
  "shower",
  "parking",
  "kids_room",
];

export default function VenueDetailPage({ params }: VenueDetailPageProps) {
  const { id } = use(params);
  const { navigate } = useNavigation();
  const { user } = useSessionAuth();
  const permissions = useVenuePermissions();
  const { venue, isLoading, error, refresh } = useVenueDetail(id);

  // v18 (2026-05-20, audit §4 C #12): isLoading 도착 후 ready.
  usePageReady(!isLoading);

  const childMode = (user?.userType ?? "").toLowerCase() === "child";

  const gridAmenities = useMemo<VenueAmenity[]>(() => {
    if (!venue?.amenities || venue.amenities.length === 0) {
      return DEFAULT_GRID_AMENITIES;
    }
    return venue.amenities;
  }, [venue?.amenities]);

  const operatingLabel = useMemo(() => {
    if (!venue?.operatingHours) return MESSAGES.venue.info.noOperatingHours;
    return MESSAGES.venue.info.operatingHours(
      venue.operatingHours.open,
      venue.operatingHours.close,
    );
  }, [venue?.operatingHours]);

  const copyAddress = useCallback(async () => {
    if (!venue?.address) return;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(venue.address);
        if (typeof window !== "undefined") {
          window.alert(MESSAGES.venue.info.copiedAddress);
        }
      }
    } catch {
      // noop — 무시 (권한/http 환경 등)
    }
  }, [venue?.address]);

  return (
    <MobileContainer hasBottomNav={false}>
      {/* [appbar-harness-v4 · 2026-05-12] rightAction → extraActions 변환:
          시계/종/메뉴 우측 3 액션 SoT 보존하면서 권한자에게만 편집 액션 추가. */}
      <PageAppBar
        title={venue?.name ?? MESSAGES.venue.detailTitle}
        extraActions={
          permissions.canViewManage
            ? [
                {
                  icon: "edit",
                  onClick: () => navigate("/venue-manage"),
                  label: MESSAGES.venue.manageTitle,
                },
              ]
            : undefined
        }
      />

      <main className="flex-1 overflow-y-auto pb-30 bg-it-canvas dark:bg-puck">
        {/* 지도 히어로 (공유 컴포넌트 VenueMapHero — iceTheme 미지원, 골격 유지) */}
        <VenueMapHero variant="detail" highlightVenue={venue} />

        {/* 상단 오버랩 컨테이너 — flat 흰 섹션 */}
        <section className="-mt-6 relative z-10 bg-it-surface dark:bg-it-blue-950 rounded-t-3xl">
          <div className="px-6 pt-7 pb-6">
            {isLoading ? (
              <div className="py-10 flex items-center justify-center text-it-ink-500 text-card-body">
                {MESSAGES.venue.loading}
              </div>
            ) : error || !venue ? (
              <div className="py-10 flex flex-col items-center justify-center text-it-ink-500">
                <Icon
                  name="error"
                  className="text-[40px] mb-2"
                  aria-hidden="true"
                />
                <p className="text-card-body mb-3">{error ?? MESSAGES.venue.empty}</p>
                <button
                  type="button"
                  onClick={refresh}
                  className="text-card-meta font-bold text-it-blue-500 dark:text-it-blue-300 underline"
                >
                  {MESSAGES.venue.retry}
                </button>
              </div>
            ) : (
              <>
                {/* 이름 + 상태 + 북마크 */}
                <div className="flex items-start justify-between mb-5">
                  <div className="flex-1 min-w-0 pr-3">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {/* VenueStatusBadge — iceTheme 지원(공유 컴포넌트) → flat 상태색 전달 */}
                      <VenueStatusBadge status={venue.status} size="sm" iceTheme />
                      {venue.rinkSize ? (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-w-pill bg-it-fill dark:bg-rink-700 text-it-ink-700 dark:text-rink-100">
                          {venue.rinkSize}
                        </span>
                      ) : null}
                    </div>
                    <h1
                      className={
                        childMode
                          ? "text-[22px] font-bold text-it-ink-800 dark:text-white leading-tight"
                          : "text-2xl font-bold text-it-ink-800 dark:text-white leading-tight"
                      }
                    >
                      {venue.name}
                    </h1>
                    <p className="text-card-body text-it-ink-500 dark:text-rink-300 mt-1 leading-relaxed">
                      {venue.description ?? MESSAGES.venue.defaultDescription}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="w-10 h-10 flex items-center justify-center rounded-w-pill bg-it-fill dark:bg-rink-700 text-it-ink-500 hover:text-it-blue-500 transition-colors motion-reduce:transition-none"
                    aria-label={MESSAGES.venue.actions.share}
                  >
                    <Icon
                      name="bookmark_border"
                      className="text-[22px]"
                      aria-hidden="true"
                    />
                  </button>
                </div>

                {/* 정보 라인 */}
                <div className="space-y-5">
                  <VenueInfoRow
                    icon="location_on"
                    primary={venue.address ?? MESSAGES.venue.noAddress}
                    secondary={
                      venue.addressDetail ? (
                        <span>{venue.addressDetail}</span>
                      ) : venue.zipCode ? (
                        <span>(우) {venue.zipCode}</span>
                      ) : null
                    }
                    action={
                      venue.address ? (
                        <button
                          type="button"
                          onClick={copyAddress}
                          className="text-[11px] font-bold text-it-blue-500 bg-it-blue-50 dark:bg-it-blue-900/30 dark:text-it-blue-300 px-2 py-1 rounded-w-md"
                        >
                          {MESSAGES.venue.info.copyAddress}
                        </button>
                      ) : null
                    }
                  />
                  {venue.phone ? (
                    <VenueInfoRow icon="call" primary={venue.phone} />
                  ) : null}
                  <VenueInfoRow
                    icon="schedule"
                    primary={operatingLabel}
                    secondary={
                      venue.operatingHours ? (
                        <span className="inline-block px-2 py-0.5 rounded-w-md bg-it-red-50 dark:bg-it-red-500/20 text-it-red-500 dark:text-it-red-300 font-medium">
                          {MESSAGES.venue.info.enterNotice}
                        </span>
                      ) : null
                    }
                  />
                </div>
              </>
            )}
          </div>

          {/* 섹션 구분선 — flat 8px 회색 갭 */}
          <div className="h-2 bg-it-canvas dark:bg-puck" />

          {/* 보유 시설 — 흰 섹션 (FacilityBadge·VenueImageGallery 는 공유 컴포넌트, iceTheme 미지원 → 골격 유지) */}
          <div className="bg-it-surface dark:bg-it-blue-950 px-6 py-7">
            <h2 className="text-card-title font-bold text-it-ink-800 dark:text-white mb-5">
              {MESSAGES.venue.facilities.title}
            </h2>
            <div className="grid grid-cols-4 gap-2">
              {gridAmenities.slice(0, 8).map((amenity) => (
                <FacilityBadge key={amenity} amenity={amenity} size="tile" />
              ))}
            </div>
          </div>

          {/* 섹션 구분선 — flat 8px 회색 갭 */}
          <div className="h-2 bg-it-canvas dark:bg-puck" />

          {/* 시설 둘러보기 (사진 갤러리 — 비주얼 결과물, 골격 유지) */}
          <div className="bg-it-surface dark:bg-it-blue-950">
            <VenueImageGallery />
          </div>
        </section>
      </main>

      {/* Sticky 액션바 */}
      <VenueActionBar
        variant="sticky"
        phone={venue?.phone}
        address={venue?.address}
        latitude={venue?.latitude}
        longitude={venue?.longitude}
        childMode={childMode}
      />
    </MobileContainer>
  );
}
