'use client';

/**
 * ImageLightbox — 이미지 전체화면 라이트박스 (preview lightbox 표준)
 *
 * 모든 이미지 미리보기 컴포넌트(ImageUploader / PhotoUploader / AvatarUploader)에서
 * 공유되는 lightbox 모달. SPEC_POPUP_FULLSCREEN_DIM 표준 준수.
 *
 * 표준 적용:
 *   1. useNativeScrim — Flutter 네이티브 safe-area 영역(상단 status bar / 하단 home
 *      indicator)까지 dim 처리 (Modal 표준 색상 '#8C141826' = rink-900 / 55%)
 *   2. overlay-fullscreen-wrapper + overlay-fullscreen-dim — viewport 100% (100dvh
 *      포함)까지 cover, z-index 9990 (AppBar 30 / BottomNav 40 위)
 *   3. createPortal(document.body) — DOM 상단으로 escape
 *   4. body scroll lock — lockBodyScroll / unlockBodyScroll
 *   5. ESC 키 + 오버레이 클릭 닫기
 *   6. role="dialog" + aria-modal="true" + aria-labelledby
 *
 * SPEC: docs/Planning/SPEC_POPUP_FULLSCREEN_DIM.md (2026-05-16)
 *
 * @example
 * <ImageLightbox
 *   isOpen={lightboxIndex !== null}
 *   onClose={() => setLightboxIndex(null)}
 *   src={previews[lightboxIndex].url}
 *   alt={`사진 ${lightboxIndex + 1}`}
 * />
 */

import { useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { lockBodyScroll, unlockBodyScroll } from '@/lib/scroll-lock';
import { useNativeScrim } from '@/hooks/useNativeScrim';
import { resolveImageSrc } from '@/lib/image-url';

export interface ImageLightboxProps {
  /** 열림 상태 */
  isOpen: boolean;
  /** 닫기 핸들러 */
  onClose: () => void;
  /** 이미지 원본 URL (objectURL 또는 서버 URL) */
  src: string;
  /** 접근성 alt 텍스트 (대화상자 라벨로도 사용) */
  alt: string;
  /** 하단 캡션 (선택) */
  caption?: string;
  /** unoptimized — objectURL 등 외부 최적화 불가 시 true */
  unoptimized?: boolean;
}

// Modal 표준 scrim 컬러 (AARRGGBB) — rink-900 / 55%
const MODAL_SCRIM_COLOR = '#8C141826';

export function ImageLightbox({
  isOpen,
  onClose,
  src,
  alt,
  caption,
  // 일반 <img> 렌더링으로 전환되어 더이상 사용하지 않지만 호출부 호환을 위해 prop 시그니처 유지.
  unoptimized: _unoptimized = true,
}: ImageLightboxProps) {
  // ✅ 필수 1: Flutter Native scrim (iOS notch / Home Indicator / Android NavBar)
  useNativeScrim(isOpen, MODAL_SCRIM_COLOR);

  // ✅ 필수 2: body scroll lock
  useEffect(() => {
    if (!isOpen) return;
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, [isOpen]);

  // ✅ 필수 3: ESC 키 닫기
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // 오버레이(자기 자신) 클릭 시에만 닫기 — 내부 이미지 클릭은 무시
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  if (!isOpen) return null;
  if (typeof window === 'undefined') return null;

  const lightboxContent = (
    <div
      className="overlay-fullscreen-wrapper items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={handleOverlayClick}
    >
      <div className="overlay-fullscreen-dim" aria-hidden="true" />

      {/* 닫기 버튼 (우상단 safe-area 고려) */}
      <button
        type="button"
        onClick={onClose}
        aria-label="닫기"
        className={cn(
          'absolute z-10',
          'flex h-11 w-11 items-center justify-center rounded-full',
          'bg-black/55 text-white hover:bg-black/75',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
          'transition-colors motion-reduce:transition-none',
        )}
        style={{
          top: 'calc(env(safe-area-inset-top, 0px) + 16px)',
          right: 'calc(env(safe-area-inset-right, 0px) + 16px)',
        }}
      >
        <span className="material-symbols-outlined text-2xl" aria-hidden="true">
          close
        </span>
      </button>

      {/* 이미지 컨테이너 — pointer-events-auto 보장 */}
      <div
        className={cn(
          'relative pointer-events-auto',
          'flex flex-col items-center justify-center gap-3',
          'max-w-[92vw] max-h-[80dvh]',
          'animate-in fade-in zoom-in-95 duration-200 ease-out motion-reduce:animate-none',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative w-[92vw] max-w-[640px] aspect-square">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resolveImageSrc(src)}
            alt={alt}
            className="absolute inset-0 size-full object-contain"
          />
        </div>

        {caption && (
          <p className="max-w-[92vw] text-center text-sm text-white/90 drop-shadow-sm">
            {caption}
          </p>
        )}
      </div>
    </div>
  );

  return createPortal(lightboxContent, document.body);
}

export default ImageLightbox;
