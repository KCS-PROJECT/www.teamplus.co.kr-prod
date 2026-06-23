"use client";

/**
 * VenueMapHero — 지도 히어로 섹션 (목록 / 상세 공통)
 * - 실제 지도 SDK(Kakao/Naver)는 추후 연동. 현재는 정적 그리드 + 핀 오버레이.
 * - "현재 위치" 말풍선 표시
 * - AI 스타일 금지: backdrop-blur-md 는 헤더 예외로만 허용되므로 회피
 */

import { Icon } from "@/components/ui/Icon";
import { MESSAGES } from "@/lib/messages";
import { cn } from "@/lib/utils";
import type { Venue } from "@/types/venue";

interface VenueMapHeroProps {
  venues?: Venue[];
  currentLocationLabel?: string;
  highlightVenue?: Venue | null;
  nearbyCount?: number;
  className?: string;
  /** 상세용 작은 높이 / 목록용 큰 높이 */
  variant?: "list" | "detail";
}

const BG_PATTERN_STYLE: React.CSSProperties = {
  backgroundColor: "var(--c-bg)",
};

export function VenueMapHero({
  venues = [],
  currentLocationLabel,
  highlightVenue,
  nearbyCount,
  className,
  variant = "list",
}: VenueMapHeroProps) {
  const count = nearbyCount ?? venues.length;
  const height = variant === "detail" ? "h-64" : "h-52";

  return (
    <section
      className={cn(
        "relative w-full overflow-hidden border-b border-wline dark:border-rink-800",
        height,
        className,
      )}
      aria-label={MESSAGES.venue.mapPreview}
    >
      <div
        className="absolute inset-0 dark:bg-rink-800"
        style={BG_PATTERN_STYLE}
      />

      {/* 주변 링크장 핀 3개 고정 위치 (실제 지도 연동 전 플레이스홀더) */}
      <div className="absolute inset-0" aria-hidden="true">
        <Icon
          name="location_on"
          className="absolute top-[22%] left-[28%] text-[32px] text-ice-500 drop-shadow"
        />
        <Icon
          name="location_on"
          className="absolute top-[42%] left-[62%] text-[32px] text-ice-500 drop-shadow"
        />
        <Icon
          name="location_on"
          className="absolute top-[64%] left-[45%] text-[32px] text-ice-700 drop-shadow"
        />
      </div>

      {/* 상세 뷰: 하이라이트 핀 + 말풍선 */}
      {variant === "detail" && highlightVenue ? (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center">
            <Icon
              name="location_on"
              className="text-[52px] text-ice-500 drop-shadow-lg"
              aria-hidden="true"
            />
            <div className="mt-1 bg-white dark:bg-rink-900 border border-ice-500 rounded-lg shadow-md px-3 py-1.5">
              <p className="text-xs font-bold text-ice-500 dark:text-blue-300">
                {highlightVenue.name}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* 목록 뷰: 현재 위치 말풍선 카드 */}
      {variant === "list" ? (
        <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
          <div className="bg-white dark:bg-rink-900 border border-wline dark:border-rink-700 rounded-xl shadow-md px-3 py-2 flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/40 flex items-center justify-center text-ice-500">
              <Icon
                name="my_location"
                className="text-[20px]"
                aria-hidden="true"
              />
            </div>
            <div>
              <p className="text-[10px] font-bold text-wtext-3 uppercase tracking-wider">
                {MESSAGES.venue.currentLocation}
              </p>
              <p className="text-sm font-bold text-wtext-1 dark:text-white">
                {currentLocationLabel ?? MESSAGES.venue.locationChecking}
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 bg-ice-500 text-white px-3 py-1.5 rounded-full text-xs font-bold shadow">
            <Icon name="place" className="text-[14px]" aria-hidden="true" />
            {MESSAGES.venue.nearbyCount(count)}
          </span>
        </div>
      ) : null}
    </section>
  );
}

export default VenueMapHero;
