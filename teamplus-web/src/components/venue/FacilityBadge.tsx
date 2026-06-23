'use client';

/**
 * FacilityBadge — 구장 시설 아이콘 + 라벨 칩
 * - WCAG: 아이콘에 aria-hidden, 텍스트 라벨 항상 노출
 * - available=false 일 때 line-through 로 비노출 처리
 */

import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import { FACILITY_META, type VenueAmenity } from '@/types/venue';
import { cn } from '@/lib/utils';

interface FacilityBadgeProps {
  amenity: VenueAmenity;
  available?: boolean;
  /** 큰 사이즈 (아동 UI / 디테일 페이지 그리드용 72dp) */
  size?: 'chip' | 'tile';
  className?: string;
}

export function FacilityBadge({
  amenity,
  available = true,
  size = 'chip',
  className,
}: FacilityBadgeProps) {
  const meta = FACILITY_META.find((f) => f.key === amenity);
  if (!meta) return null;

  const label = MESSAGES.venue.facilities[meta.labelKey];
  const iconName = available ? meta.icon : 'block';

  if (size === 'tile') {
    return (
      <div
        className={cn(
          'flex flex-col items-center gap-2 min-w-[72px]',
          className,
        )}
      >
        <div
          className={cn(
            'w-[72px] h-[72px] rounded-2xl border flex items-center justify-center',
            available
              ? 'bg-blue-50 border-blue-200 text-ice-500 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300'
              : 'bg-wline-2 border-wline text-wtext-3 dark:bg-rink-800 dark:border-rink-700 dark:text-rink-300',
          )}
        >
          <Icon name={iconName} className="text-[28px]" aria-hidden="true" />
        </div>
        <span
          className={cn(
            'text-xs font-semibold',
            available
              ? 'text-wtext-2 dark:text-rink-100'
              : 'text-wtext-3 dark:text-rink-300 line-through decoration-slate-400',
          )}
        >
          {label}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border',
        available
          ? 'bg-wbg border-wline-2 dark:bg-rink-800/60 dark:border-rink-700'
          : 'bg-wline-2 border-wline dark:bg-rink-800 dark:border-rink-700',
        className,
      )}
    >
      <Icon
        name={iconName}
        className={cn(
          'text-[18px]',
          available
            ? 'text-ice-500 dark:text-blue-300'
            : 'text-wtext-3 dark:text-rink-300',
        )}
        aria-hidden="true"
      />
      <span
        className={cn(
          'text-xs font-semibold',
          available
            ? 'text-wtext-2 dark:text-rink-100'
            : 'text-wtext-3 dark:text-rink-300 line-through decoration-slate-400',
        )}
      >
        {label}
      </span>
    </div>
  );
}

export default FacilityBadge;
