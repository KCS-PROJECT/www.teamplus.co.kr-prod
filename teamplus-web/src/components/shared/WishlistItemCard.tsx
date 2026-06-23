'use client';

/**
 * WishlistItemCard - TEAMPLUS Shared Component
 * 찜 목록의 개별 아이템 카드 (수업/매치/상품/코치 폴리모픽).
 * 상단 16:9 이미지 + 태그/하트 오버레이 + 하단 제목/부제/가격/CTA.
 * 사용 화면: /wishlist, /shop/wishlist, 찜한 수업 목록
 */

import { cn } from '@/lib/utils';
import { resolveImageSrc } from '@/lib/image-url';

export type WishlistItemType = 'class' | 'match' | 'product' | 'coach';

export type WishlistTagTone = 'primary' | 'success' | 'warning' | 'error';

export interface WishlistItemCardProps {
  /** 아이템 종류 (폴리모픽 렌더링 결정) */
  type: WishlistItemType;
  /** 대표 이미지 URL */
  imageUrl?: string;
  /** 제목 */
  title: string;
  /** 부제 (장소/일정/코치명 등) */
  subtitle?: string;
  /** 할인 전 원가 (있을 경우 취소선 표시) */
  originalPrice?: number;
  /** 현재 가격 (원 단위) */
  price: number;
  /** 상태 태그 (예: "모집중", "마감임박") */
  tag?: { label: string; tone: WishlistTagTone };
  /** CTA 버튼 라벨 (기본: "신청하기") */
  ctaLabel?: string;
  /** 찜 삭제 핸들러 (하트 아이콘 클릭) */
  onRemove: () => void;
  /** CTA 버튼 클릭 핸들러 */
  onCtaClick?: () => void;
  /** 추가 className */
  className?: string;
}

const TAG_TONE: Record<WishlistTagTone, string> = {
  primary: 'bg-ice-500 text-white',
  success: 'bg-success text-white',
  warning: 'bg-warning text-white',
  error: 'bg-error text-white',
};

const TYPE_ICON: Record<WishlistItemType, string> = {
  class: 'school',
  match: 'sports_hockey',
  product: 'shopping_bag',
  coach: 'person',
};

const TYPE_LABEL: Record<WishlistItemType, string> = {
  class: '수업',
  match: '매치',
  product: '상품',
  coach: '코치',
};

function formatKrw(value: number): string {
  return `${value.toLocaleString('ko-KR')}원`;
}

export function WishlistItemCard({
  type,
  imageUrl,
  title,
  subtitle,
  originalPrice,
  price,
  tag,
  ctaLabel = '신청하기',
  onRemove,
  onCtaClick,
  className,
}: WishlistItemCardProps) {
  const typeLabel = TYPE_LABEL[type];

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove();
  };

  const handleCta = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCtaClick?.();
  };

  return (
    <article
      className={cn(
        'bg-white dark:bg-rink-800',
        'rounded-2xl overflow-hidden',
        'border border-wline-2 dark:border-rink-700',
        'shadow-sm',
        className
      )}
    >
      {/* Top: Image 16:9 with overlays */}
      <div className="relative aspect-[16/9] bg-wline-2 dark:bg-rink-700">
        {resolveImageSrc(imageUrl) ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={resolveImageSrc(imageUrl)}
            alt={`${typeLabel} ${title}`}
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span
              className="material-symbols-outlined text-wtext-3 dark:text-rink-300 text-5xl"
              aria-hidden="true"
            >
              {TYPE_ICON[type]}
            </span>
          </div>
        )}

        {/* Tag chip (top-left) */}
        {tag && (
          <span
            className={cn(
              'absolute top-2.5 left-2.5',
              'inline-flex items-center px-2 py-0.5 rounded-full',
              'text-[11px] font-semibold',
              TAG_TONE[tag.tone]
            )}
          >
            {tag.label}
          </span>
        )}

        {/* Remove (heart filled) button (top-right) */}
        <button
          type="button"
          onClick={handleRemove}
          aria-label={`${title} 찜 해제`}
          className={cn(
            'absolute top-2 right-2',
            'w-9 h-9 rounded-full',
            'bg-white/90 dark:bg-rink-900/80',
            'flex items-center justify-center',
            'text-error hover:bg-white dark:hover:bg-rink-900',
            'active:brightness-95 transition-colors duration-150',
            'focus:outline-none focus:ring-2 focus:ring-ice-500/40'
          )}
        >
          <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: '"FILL" 1' }} aria-hidden="true">
            favorite
          </span>
        </button>
      </div>

      {/* Bottom: content */}
      <div className="p-4">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100">
            {typeLabel}
          </span>
        </div>

        <h3 className="text-[15px] font-bold text-wtext-1 dark:text-white line-clamp-1">
          {title}
        </h3>

        {subtitle && (
          <p className="mt-1 text-sm text-wtext-3 dark:text-rink-300 line-clamp-1">
            {subtitle}
          </p>
        )}

        {/* Price row */}
        <div className="mt-3 flex items-baseline gap-2 ml-auto text-right">
          {originalPrice != null && originalPrice > price && (
            <span className="text-xs line-through text-gray-400 dark:text-rink-300">
              {formatKrw(originalPrice)}
            </span>
          )}
          <span className="text-ice-500 text-lg font-bold">
            {formatKrw(price)}
          </span>
        </div>

        {/* CTA */}
        {onCtaClick && (
          <button
            type="button"
            onClick={handleCta}
            aria-label={`${title} ${ctaLabel}`}
            className={cn(
              'mt-3 w-full h-10 rounded-lg',
              'bg-ice-500 text-white text-sm font-semibold',
              'hover:bg-ice-700 active:brightness-95',
              'transition-colors duration-150',
              'focus:outline-none focus:ring-2 focus:ring-ice-500/40'
            )}
          >
            {ctaLabel}
          </button>
        )}
      </div>
    </article>
  );
}

export default WishlistItemCard;
