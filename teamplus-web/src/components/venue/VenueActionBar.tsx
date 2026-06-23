'use client';

/**
 * VenueActionBar — 길 찾기 / 전화하기 액션 버튼 쌍
 * - `inline`: 카드 내부
 * - `sticky`: 상세 페이지 하단 고정
 * - AI 스타일 금지: 솔리드 Primary 컬러만 사용
 */

import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';

interface VenueActionBarProps {
  phone?: string | null;
  address?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  variant?: 'inline' | 'sticky';
  className?: string;
  /** 아동 UI(CHILD 역할)일 경우 버튼 72dp 이상으로 확대 */
  childMode?: boolean;
}

/**
 * 길 찾기 외부 앱 호출 (카카오맵 우선, 안드로이드/iOS 모두 호환 가능한 웹 링크)
 */
function openDirections(
  address?: string | null,
  latitude?: string | number | null,
  longitude?: string | number | null,
) {
  if (typeof window === 'undefined') return;

  if (latitude != null && longitude != null) {
    const lat = String(latitude);
    const lng = String(longitude);
    window.open(
      `https://map.kakao.com/link/to/TEAMPLUS,${lat},${lng}`,
      '_blank',
      'noopener,noreferrer',
    );
    return;
  }

  if (address) {
    window.open(
      `https://map.kakao.com/link/search/${encodeURIComponent(address)}`,
      '_blank',
      'noopener,noreferrer',
    );
  }
}

/** 실제 다이얼 가능한 숫자/+만 남긴 문자열 반환 (없으면 빈 문자열) */
function sanitizePhone(phone?: string | null): string {
  return (phone ?? '').replace(/[^0-9+]/g, '');
}

function callPhone(phone?: string | null) {
  if (typeof window === 'undefined') return;
  const dialable = sanitizePhone(phone);
  if (!dialable) return;
  window.location.href = `tel:${dialable}`;
}

export function VenueActionBar({
  phone,
  address,
  latitude,
  longitude,
  variant = 'inline',
  className,
  childMode = false,
}: VenueActionBarProps) {
  const buttonSize = childMode
    ? 'h-[72px] text-[17px] rounded-2xl'
    : 'h-12 text-sm rounded-xl';

  // 다이얼 가능한 유효 번호인지 — 숫자/+만 남겼을 때 길이 > 0
  const hasValidPhone = sanitizePhone(phone).length > 0;

  const content = (
    <div className={cn('flex gap-3', className)}>
      <button
        type="button"
        onClick={() => openDirections(address, latitude, longitude)}
        className={cn(
          'flex-1 flex items-center justify-center gap-2 bg-ice-500 hover:bg-ice-700 text-white font-bold shadow-md transition-colors active:brightness-95',
          buttonSize,
        )}
        aria-label={MESSAGES.venue.actions.findWay}
      >
        <Icon name="near_me" className="text-[20px]" aria-hidden="true" />
        {MESSAGES.venue.actions.findWay}
      </button>
      <button
        type="button"
        onClick={() => callPhone(phone)}
        disabled={!hasValidPhone}
        aria-disabled={!hasValidPhone}
        title={hasValidPhone ? undefined : '등록된 전화번호가 없습니다'}
        className={cn(
          'flex-1 flex items-center justify-center gap-2 border font-bold transition-colors motion-reduce:transition-none',
          hasValidPhone
            ? 'border-ice-500 bg-white dark:bg-rink-900 text-ice-500 dark:text-blue-300 active:bg-blue-50 dark:active:bg-rink-800'
            : 'border-wline dark:border-rink-700 bg-wbg dark:bg-rink-800 text-wtext-3 dark:text-rink-300 cursor-not-allowed',
          buttonSize,
        )}
        aria-label={MESSAGES.venue.actions.call}
      >
        <Icon name="call" className="text-[20px]" aria-hidden="true" />
        {MESSAGES.venue.actions.call}
      </button>
    </div>
  );

  if (variant === 'sticky') {
    return (
      <div
        className={cn(
          'fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-40',
          'bg-white dark:bg-rink-900 border-t border-wline dark:border-rink-800',
          'px-4 pt-3 pb-[calc(var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))+1rem)]',
        )}
      >
        {content}
      </div>
    );
  }

  return content;
}

export default VenueActionBar;
