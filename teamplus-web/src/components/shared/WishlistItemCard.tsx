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
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 스타일 1:1 보존(타 화면 회귀 0).
   *   true 시 카드 박스(rounded-2xl·border·shadow) 제거 → 흰 섹션 위 flat 행 + it-* 토큰.
   *   상태 태그는 달력/재고 SoT(success=mint·error=it-red)로 매핑.
   */
  iceTheme?: boolean;
}

const TAG_TONE: Record<WishlistTagTone, string> = {
  primary: 'bg-ice-500 text-white',
  success: 'bg-success text-white',
  warning: 'bg-warning text-white',
  error: 'bg-error text-white',
};

// [ICETIMES] 상태 태그 — 재고/할인 SoT(success=mint·error=it-red), primary=it-blue.
const TAG_TONE_ICE: Record<WishlistTagTone, string> = {
  primary: 'bg-it-blue-500 text-white',
  success: 'bg-mint-600 text-white',
  warning: 'bg-sun-500 text-it-ink-900',
  error: 'bg-it-red-500 text-white',
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
  iceTheme = false,
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
        iceTheme
          ? // flat — 카드 박스 제거. 흰 섹션 위 행, 이미지만 hairline 라운드.
            'bg-transparent'
          : cn(
              'bg-white dark:bg-rink-800',
              'rounded-2xl overflow-hidden',
              'border border-wline-2 dark:border-rink-700',
              'shadow-sm',
            ),
        className
      )}
    >
      {/* Top: Image 16:9 with overlays */}
      <div
        className={cn(
          'relative aspect-[16/9]',
          iceTheme
            ? 'bg-it-fill dark:bg-it-blue-900/30 rounded-w-md overflow-hidden border border-it-line dark:border-it-blue-900'
            : 'bg-wline-2 dark:bg-rink-700'
        )}
      >
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
              className={cn(
                'material-symbols-outlined text-5xl',
                iceTheme
                  ? 'text-it-ink-400 dark:text-it-ink-300'
                  : 'text-wtext-3 dark:text-rink-300'
              )}
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
              (iceTheme ? TAG_TONE_ICE : TAG_TONE)[tag.tone]
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
            'flex items-center justify-center',
            'active:brightness-95 transition-colors duration-150',
            'focus:outline-none focus:ring-2',
            iceTheme
              ? 'bg-it-surface/90 dark:bg-it-blue-950/80 text-it-red-500 hover:bg-it-surface dark:hover:bg-it-blue-950 focus:ring-it-blue-500/40'
              : 'bg-white/90 dark:bg-rink-900/80 text-error hover:bg-white dark:hover:bg-rink-900 focus:ring-ice-500/40'
          )}
        >
          <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: '"FILL" 1' }} aria-hidden="true">
            favorite
          </span>
        </button>
      </div>

      {/* Bottom: content */}
      <div className={iceTheme ? 'pt-3' : 'p-4'}>
        <div className="flex items-center gap-1.5 mb-1">
          <span
            className={cn(
              'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold',
              iceTheme
                ? 'bg-it-fill dark:bg-it-blue-900/40 text-it-ink-600 dark:text-it-ink-200'
                : 'bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100'
            )}
          >
            {typeLabel}
          </span>
        </div>

        <h3
          className={cn(
            'text-[15px] font-bold line-clamp-1',
            iceTheme
              ? 'text-it-ink-800 dark:text-white tracking-[-0.01em]'
              : 'text-wtext-1 dark:text-white'
          )}
        >
          {title}
        </h3>

        {subtitle && (
          <p
            className={cn(
              'mt-1 text-sm line-clamp-1',
              iceTheme
                ? 'text-it-ink-500 dark:text-it-ink-300'
                : 'text-wtext-3 dark:text-rink-300'
            )}
          >
            {subtitle}
          </p>
        )}

        {/* Price row */}
        <div className="mt-3 flex items-baseline gap-2 ml-auto text-right">
          {originalPrice != null && originalPrice > price && (
            <span
              className={cn(
                'text-xs line-through',
                iceTheme
                  ? 'text-it-ink-400 dark:text-it-ink-300'
                  : 'text-gray-400 dark:text-rink-300'
              )}
            >
              {formatKrw(originalPrice)}
            </span>
          )}
          <span
            className={cn(
              'text-lg font-bold tabular-nums',
              iceTheme ? 'text-it-blue-500' : 'text-ice-500'
            )}
          >
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
              'mt-3 w-full h-10 text-sm font-semibold',
              'active:brightness-95 transition-colors duration-150',
              'focus:outline-none focus:ring-2',
              iceTheme
                ? 'rounded-w-md bg-it-blue-500 text-white hover:bg-it-blue-600 focus:ring-it-blue-500/40'
                : 'rounded-lg bg-ice-500 text-white hover:bg-ice-700 focus:ring-ice-500/40'
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
