'use client';

import { memo, useEffect, useCallback, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../Icon';
import { cn } from '@/lib/utils';
import { lockBodyScroll, unlockBodyScroll } from '@/lib/scroll-lock';
import { useNativeScrim } from '@/hooks/useNativeScrim';

// ============ Types ============

export interface FullModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  showCloseButton?: boolean;
  closeOnEscape?: boolean;
  headerRight?: ReactNode;
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
  variant?: 'default' | 'slide-up' | 'slide-right';
}

// ============ Animation Variants ============

/**
 * 등장 효과 — 프로젝트 표준 `animate-fade-in`(200ms, tailwind.config.cjs) 으로 통일한다.
 *
 * 기존에는 `animate-in slide-in-from-bottom` 등 `tailwindcss-animate` 플러그인 클래스를
 * 썼는데, 이 프로젝트에는 해당 플러그인이 없어 **CSS 가 생성되지 않아 아무 효과가 없었다**
 * (모달이 즉시 튀어나옴). 플러그인이 나중에 다른 이유로 설치되면 의도치 않게 슬라이드가
 * 켜지는 문제도 있어 제거한다.
 *
 * 방향성 있는 슬라이드는 화면 전체를 덮는 풀스크린 오버레이에는 맞지 않는다
 * (아래에서 올라오면 바텀시트 동작으로 읽힌다). variant prop 은 호출부 호환을 위해
 * 유지하되 모두 같은 페이드를 쓴다.
 */
const animationVariants = {
  default: 'animate-fade-in',
  'slide-up': 'animate-fade-in',
  'slide-right': 'animate-fade-in',
};

// ============ FullModal Component ============

export const FullModal = memo(function FullModal({
  isOpen,
  onClose,
  children,
  title,
  showCloseButton = true,
  closeOnEscape = true,
  headerRight,
  footer,
  className,
  contentClassName,
  variant = 'slide-up',
}: FullModalProps) {
  // Handle ESC key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === 'Escape') {
        onClose();
      }
    },
    [closeOnEscape, onClose]
  );

  // Prevent body scroll and add keyboard listener
  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      lockBodyScroll();

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        unlockBodyScroll();
      };
    }
  }, [isOpen, handleKeyDown]);

  // [2026-05-16 SoT] viewport 전체 fullscreen — overlay-fullscreen-wrapper +
  //   flex-col + 솔리드 bg-wbg/rink-900 (FullModal 은 opaque 풀스크린, dim 불필요).
  //   Native safe-area 는 #8C141826 (rink-900/55) 로 동기.
  //   SPEC: docs/Planning/SPEC_POPUP_FULLSCREEN_DIM.md
  useNativeScrim(isOpen, '#8C141826');

  if (!isOpen) return null;
  if (typeof window === 'undefined') return null;

  const content = (
    <div
      className={cn(
        'overlay-fullscreen-wrapper flex-col bg-wbg dark:bg-rink-900',
        animationVariants[variant],
        'motion-reduce:animate-none',
        className
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'fullmodal-title' : undefined}
    >
      {/* Header
          [수정 2026-05-23] 닫기 버튼을 좌측 → 우측으로 이동.
            풀스크린 검색 모달(팀 선택/우편번호 등)에서 모바일 UX 컨벤션(상단 우측 X)
            을 따라 닫기 버튼을 우측 정렬. 좌측은 빈 spacer(w-9)로 대칭 확보하여
            absolute 중앙 정렬된 title 시각 균형 유지. headerRight 슬롯은 닫기 X
            왼쪽에 배치되어 [headerRight ...] [X] 순으로 노출. */}
      <header className="sticky top-0 z-10 bg-wsurface dark:bg-rink-800 border-b border-wline-2 dark:border-rink-700/60 safe-area-top">
        <div className="flex items-center justify-between px-4 py-3">
          {/* Left Spacer — title absolute centering 시각 균형 유지 */}
          <div className="w-9 shrink-0" aria-hidden="true" />

          {/* Title */}
          {title && (
            <h1
              id="fullmodal-title"
              className={cn(
                'text-w-title font-bold tracking-tight text-wtext-1 dark:text-white',
                'absolute left-1/2 -translate-x-1/2',
                'max-w-[60%] truncate'
              )}
            >
              {title}
            </h1>
          )}

          {/* Right Side Actions — [headerRight ...] [Close X] 순서 */}
          <div className="flex items-center gap-1">
            {headerRight}
            {showCloseButton && (
              <button
                onClick={onClose}
                className={cn(
                  'flex size-9 items-center justify-center -mr-2 rounded-full',
                  'text-wtext-2 dark:text-rink-100',
                  'hover:bg-wbg dark:hover:bg-rink-700/40',
                  'transition-colors'
                )}
                aria-label="닫기"
              >
                <Icon name="close" className="text-2xl" />
              </button>
            )}
            {!showCloseButton && !headerRight && (
              <div className="w-9 shrink-0" aria-hidden="true" />
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main
        className={cn(
          'flex-1 overflow-y-auto',
          footer ? 'pb-20' : 'pb-safe',
          contentClassName
        )}
      >
        {children}
      </main>

      {/* Footer */}
      {footer && (
        <footer
          className="fixed bottom-0 left-0 right-0 bg-wsurface dark:bg-rink-800 border-t border-wline-2 dark:border-rink-700/60 px-4 pt-3"
          style={{ paddingBottom: 'calc(0.75rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))' }}
        >
          {footer}
        </footer>
      )}
    </div>
  );

  return createPortal(content, document.body);
});
