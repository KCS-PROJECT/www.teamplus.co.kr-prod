'use client';

import { useEffect, ReactNode, memo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../Icon';
import { cn } from '@/lib/utils';
import { lockBodyScroll, unlockBodyScroll } from '@/lib/scroll-lock';
import { useNativeScrim } from '@/hooks/useNativeScrim';
import type { ModalSize } from './ModalContext';

// ============ Types ============

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  size?: ModalSize;
  showCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  className?: string;
  contentClassName?: string;
  footer?: ReactNode;
}

// ============ Size Mappings ============

const sizeClasses: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  full: 'max-w-full min-h-screen rounded-none',
};

// ============ Modal Component ============

export const Modal = memo(function Modal({
  isOpen,
  onClose,
  children,
  title,
  size = 'md',
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  className,
  contentClassName,
  footer,
}: ModalProps) {
  // Handle ESC key press
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closeOnEscape) {
        onClose();
      }
    },
    [closeOnEscape, onClose]
  );

  // Handle overlay click — dim/wrapper 모두 클로즈 트리거 (body는 stopPropagation)
  const handleOverlayClick = useCallback(() => {
    if (closeOnOverlayClick) {
      onClose();
    }
  }, [closeOnOverlayClick, onClose]);

  // Add/remove event listeners and prevent body scroll
  useEffect(() => {
    if (isOpen) {
      lockBodyScroll();
      document.addEventListener('keydown', handleKeyDown);

      return () => {
        unlockBodyScroll();
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, handleKeyDown]);

  // [2026-05-16 SoT] viewport 전체(status bar/appbar/bottom nav/home indicator)
  //   dim 표준화 — overlay-fullscreen-wrapper + overlay-fullscreen-dim 사용.
  //   Native safe-area 는 useNativeScrim('#8C141826' = rink-900/55) 로 동기.
  //   SPEC: docs/Planning/SPEC_POPUP_FULLSCREEN_DIM.md
  useNativeScrim(isOpen, '#8C141826');

  if (!isOpen) return null;

  // Use portal to render at document root
  if (typeof window === 'undefined') return null;

  const modalContent = (
    <div
      className="overlay-fullscreen-wrapper items-center justify-center p-4"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      <div
        className="overlay-fullscreen-dim transition-opacity duration-150 ease-out will-change-opacity"
        aria-hidden="true"
      />
      <div
        className={cn(
          'relative pointer-events-auto w-full bg-wsurface dark:bg-rink-800',
          'rounded-[28px] shadow-sh-rink',
          'ring-1 ring-wline-2 dark:ring-rink-700/60',
          'transform-gpu will-change-transform',
          'animate-in fade-in slide-in-from-bottom-2 duration-200 ease-out motion-reduce:animate-none',
          sizeClasses[size],
          size === 'full' && 'm-0 rounded-none ring-0',
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-wline-2 dark:border-rink-700/60">
            {title && (
              <h2
                id="modal-title"
                className="text-w-title font-bold tracking-tight text-wtext-1 dark:text-white"
              >
                {title}
              </h2>
            )}
            {showCloseButton && (
              <button
                onClick={onClose}
                className={cn(
                  'flex size-9 items-center justify-center rounded-full',
                  'text-wtext-3 hover:text-wtext-1 dark:text-rink-100 dark:hover:text-white',
                  'hover:bg-wbg dark:hover:bg-rink-700/40',
                  'transition-colors',
                  !title && 'ml-auto'
                )}
                aria-label="닫기"
              >
                <Icon name="close" className="text-xl" />
              </button>
            )}
          </div>
        )}

        <div
          className={cn(
            'p-5',
            size === 'full' && 'min-h-[calc(100vh-140px)] overflow-y-auto',
            contentClassName
          )}
        >
          {children}
        </div>

        {footer && (
          <div className="px-5 py-4 border-t border-wline-2 dark:border-rink-700/60">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
});
