'use client';

/**
 * PhotoTile - TEAMPLUS Shared Component
 * 포토 갤러리의 개별 사진 타일 (aspect-square 정사각형).
 * 날짜 오버레이(좌하단) + 선택 체크박스(우상단, 선택 모드).
 * 사용 화면: /photos/[albumId], /gallery, 대회 사진 그리드
 */

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { resolveImageSrc } from '@/lib/image-url';
import { ImageLightbox } from './ImageLightbox';

export interface PhotoTileProps {
  /** 원본 사진 URL */
  photoUrl: string;
  /** 썸네일 URL (없으면 photoUrl 사용) */
  thumbnailUrl?: string;
  /** 사진 설명 / alt text */
  caption?: string;
  /** 촬영 시각 */
  takenAt?: Date;
  /** 선택 모드 활성화 여부 */
  selectable?: boolean;
  /** 선택됨 여부 */
  selected?: boolean;
  /** 선택 토글 핸들러 */
  onToggleSelect?: () => void;
  /** 타일 클릭 핸들러 (뷰어 진입) — onClick 미지정 + enableInternalLightbox=true 시
   *  PhotoTile 이 직접 lightbox 를 띄운다. 기존 사용처(부모가 라우팅으로 viewer 진입)
   *  와의 하위호환 유지. */
  onClick?: () => void;
  /** 내부 lightbox 활성화 여부 — onClick 미지정 시 PhotoTile 이 자체 lightbox 를 띄움
   *  (SPEC_POPUP_FULLSCREEN_DIM useNativeScrim + overlay-fullscreen-dim 표준 준수).
   *  부모가 별도 viewer 페이지로 라우팅하는 기존 사용처는 false (기본값) 유지. */
  enableInternalLightbox?: boolean;
  /** 추가 className */
  className?: string;
}

function formatDateShort(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${mm}.${dd}`;
}

export function PhotoTile({
  photoUrl,
  thumbnailUrl,
  caption,
  takenAt,
  selectable = false,
  selected = false,
  onToggleSelect,
  onClick,
  enableInternalLightbox = false,
  className,
}: PhotoTileProps) {
  const imageSrc = resolveImageSrc(thumbnailUrl ?? photoUrl);
  const altText = caption ?? '갤러리 사진';

  // 내부 lightbox 상태 — onClick 미지정 + enableInternalLightbox=true 일 때만 활성
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const useInternalLightbox = enableInternalLightbox && !onClick && !selectable;

  const handleClick = () => {
    if (selectable && onToggleSelect) {
      onToggleSelect();
      return;
    }
    if (useInternalLightbox) {
      setIsLightboxOpen(true);
      return;
    }
    onClick?.();
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleSelect?.();
  };

  return (
    <>
    <button
      type="button"
      onClick={handleClick}
      aria-label={
        selectable
          ? `${altText}${selected ? ', 선택됨' : ''} (탭하여 ${selected ? '선택 해제' : '선택'})`
          : `${altText} 크게 보기`
      }
      aria-pressed={selectable ? selected : undefined}
      className={cn(
        'relative aspect-square overflow-hidden bg-wline-2 dark:bg-rink-800',
        'rounded-lg transition-opacity duration-150',
        'focus:outline-none focus:ring-2 focus:ring-ice-500/40',
        'hover:opacity-90 active:opacity-80',
        selected && 'ring-2 ring-ice-500 ring-offset-2 ring-offset-white dark:ring-offset-slate-900',
        className
      )}
    >
      {/* Image */}
      {imageSrc && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={imageSrc}
          alt={altText}
          className="absolute inset-0 size-full object-cover"
        />
      )}

      {/* Bottom gradient overlay for date readability (solid black/40, no gradient) */}
      {takenAt && (
        <div
          className="absolute bottom-0 left-0 right-0 h-12 bg-black/40 pointer-events-none"
          aria-hidden="true"
        />
      )}

      {/* Date (bottom-right) */}
      {takenAt && (
        <span
          className="absolute bottom-1 right-1.5 text-white text-[10px] font-medium tracking-tight drop-shadow-sm"
          aria-hidden="true"
        >
          {formatDateShort(takenAt)}
        </span>
      )}

      {/* Selection checkbox (top-right) */}
      {selectable && (
        <span
          role="checkbox"
          aria-checked={selected}
          aria-label={selected ? '선택 해제' : '선택'}
          onClick={handleCheckboxClick}
          className={cn(
            'absolute top-1.5 right-1.5',
            'w-6 h-6 rounded-full flex items-center justify-center',
            'border-2 transition-colors duration-150',
            selected
              ? 'bg-ice-500 border-ice-500 text-white'
              : 'bg-white/70 border-white text-transparent'
          )}
        >
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            check
          </span>
        </span>
      )}
    </button>

    {/* 내부 Lightbox — onClick 미지정 + enableInternalLightbox=true 일 때만 활성
        SPEC_POPUP_FULLSCREEN_DIM 준수 (useNativeScrim + overlay-fullscreen-dim) */}
    {useInternalLightbox && (
      <ImageLightbox
        isOpen={isLightboxOpen}
        onClose={() => setIsLightboxOpen(false)}
        src={photoUrl}
        alt={altText}
        caption={caption}
        unoptimized={false}
      />
    )}
    </>
  );
}

export default PhotoTile;
