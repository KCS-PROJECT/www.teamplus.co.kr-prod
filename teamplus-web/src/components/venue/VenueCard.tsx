'use client';

/**
 * VenueCard — 구장 목록 카드
 *
 * 목업 소스: `구장 정보 탐색 (고해상도 보정)` 카드 디자인을 Next.js/Tailwind 로 이식.
 * - 이미지 + 추천 배지 + 상태 배지
 * - 이름, 주소, 전화
 * - 시설 칩 4종 (라커룸/샤워실/관람석/주차 기본)
 * - 길찾기·전화하기 액션 (VenueActionBar inline)
 * - Director/Coach 관리자는 수정/상태 토글 버튼 노출 (optional)
 *
 * 디자인 원칙:
 * - Primary #1E3FAE 솔리드 / shadow-md / 라운드
 * - AI 스타일(backdrop-blur, gradient) 금지
 * - ring + border 로 입체감 대신 뚜렷한 외곽선
 */

import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useNavigation } from '@/components/ui/NavLink';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import { resolveImageSrc } from '@/lib/image-url';
import type { Venue, VenueAmenity } from '@/types/venue';
import { FacilityBadge } from './FacilityBadge';
import { VenueActionBar } from './VenueActionBar';
import { VenueStatusBadge } from './VenueStatusBadge';

interface VenueCardProps {
  venue: Venue;
  /** 추천 배지 표시 여부 */
  recommended?: boolean;
  /** Director/Coach 관리 버튼 노출 여부 */
  showManageActions?: boolean;
  onEdit?: (venue: Venue) => void;
  onToggleStatus?: (venue: Venue) => void;
  /** 기본 시설 아이콘 4종이 아닌 커스텀 슬롯 */
  footerSlot?: ReactNode;
  className?: string;
  /** 아동 UI (CHILD 역할): 터치타겟 72dp */
  childMode?: boolean;
}

const DEFAULT_AMENITIES: VenueAmenity[] = [
  'locker_room',
  'shower',
  'stand',
  'parking',
];

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1515703407324-5f753afd8be8?w=800&h=400&fit=crop';

export function VenueCard({
  venue,
  recommended = false,
  showManageActions = false,
  onEdit,
  onToggleStatus,
  footerSlot,
  className,
  childMode = false,
}: VenueCardProps) {
  const { navigate } = useNavigation();
  const amenities = Array.isArray(venue.amenities) && venue.amenities.length > 0
    ? venue.amenities
    : DEFAULT_AMENITIES;

  const goToDetail = () => navigate(`/venue-detail/${venue.id}`);

  return (
    <article
      className={cn(
        'bg-white dark:bg-rink-800 rounded-2xl overflow-hidden shadow-md ring-1 ring-wline dark:ring-rink-700',
        className,
      )}
      aria-label={`${venue.name} 카드`}
    >
      {/* 이미지 영역 */}
      <button
        type="button"
        onClick={goToDetail}
        className="relative h-44 w-full block bg-wline-2 dark:bg-rink-700 focus:outline-none focus:ring-2 focus:ring-ice-500"
        aria-label={`${venue.name} 상세 보기`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={resolveImageSrc(venue.imageUrl) ?? FALLBACK_IMAGE}
          alt={venue.name}
          className="absolute inset-0 size-full object-cover"
        />
        {recommended ? (
          <span className="absolute top-3 right-3 bg-ice-500 text-white text-[11px] font-bold px-3 py-1 rounded-full shadow">
            {MESSAGES.venue.recommended}
          </span>
        ) : null}
        <span className="absolute top-3 left-3">
          <VenueStatusBadge status={venue.status} size="sm" />
        </span>
      </button>

      {/* 본문 */}
      <div className="p-5">
        <div className="mb-4">
          <h3
            className={cn(
              'font-bold text-wtext-1 dark:text-white leading-tight mb-2',
              childMode ? 'text-[22px]' : 'text-xl',
            )}
          >
            {venue.name}
          </h3>

          <div className="space-y-1.5">
            <div className="flex items-start gap-2 text-sm text-wtext-3 dark:text-rink-300">
              <Icon
                name="location_on"
                className="text-[18px] mt-0.5 shrink-0"
                aria-hidden="true"
              />
              <p className="leading-snug">
                {venue.address ?? MESSAGES.venue.noAddress}
              </p>
            </div>
            {venue.phone ? (
              <div className="flex items-center gap-2 text-sm text-wtext-3 dark:text-rink-300">
                <Icon name="call" className="text-[18px]" aria-hidden="true" />
                <span>{venue.phone}</span>
              </div>
            ) : null}
          </div>
        </div>

        {/* 시설 칩 */}
        <div className="flex flex-wrap gap-2 mb-5 py-3 border-y border-wline-2 dark:border-rink-700">
          {amenities.slice(0, 4).map((amenity) => (
            <FacilityBadge key={amenity} amenity={amenity} size="chip" />
          ))}
        </div>

        {/* 관리 버튼 (관리자) */}
        {showManageActions ? (
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => onEdit?.(venue)}
              className="flex-1 flex items-center justify-center gap-1.5 h-11 bg-wline-2 dark:bg-rink-700 text-wtext-1 dark:text-white font-semibold text-sm rounded-xl hover:bg-wline dark:hover:bg-rink-500 transition-colors"
            >
              <Icon name="edit" className="text-[18px]" aria-hidden="true" />
              {MESSAGES.venue.actions.edit}
            </button>
            <button
              type="button"
              onClick={() => onToggleStatus?.(venue)}
              className="flex-1 flex items-center justify-center gap-1.5 h-11 border border-ice-500 text-ice-500 dark:text-blue-300 font-semibold text-sm rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
            >
              <Icon name="tune" className="text-[18px]" aria-hidden="true" />
              {MESSAGES.venue.actions.toggleStatus}
            </button>
          </div>
        ) : null}

        {/* 액션바 또는 커스텀 슬롯 */}
        {footerSlot ?? (
          <VenueActionBar
            phone={venue.phone}
            address={venue.address}
            latitude={venue.latitude}
            longitude={venue.longitude}
            childMode={childMode}
          />
        )}
      </div>
    </article>
  );
}

export default VenueCard;
