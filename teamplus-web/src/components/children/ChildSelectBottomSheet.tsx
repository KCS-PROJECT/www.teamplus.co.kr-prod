'use client';

import { useEffect, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { lockBodyScroll, unlockBodyScroll } from '@/lib/scroll-lock';
import { useNativeScrim } from '@/hooks/useNativeScrim';
import { cn } from '@/lib/utils';
import { resolveImageSrc } from '@/lib/image-url';

export interface ChildSelectItem {
  id: string;
  name: string;
  age?: number;
  profileImage?: string;
}

interface ChildSelectBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (childId: string) => void;
  items: ChildSelectItem[];
  isSubmitting?: boolean;
}

export const ChildSelectBottomSheet = memo(function ChildSelectBottomSheet({
  isOpen,
  onClose,
  onSelect,
  items: childrenList,
  isSubmitting = false,
}: ChildSelectBottomSheetProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) onClose();
    },
    [onClose, isSubmitting],
  );

  useEffect(() => {
    if (!isOpen) return;
    lockBodyScroll();
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      unlockBodyScroll();
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  // [2026-05-12 → 2026-05-16 v2] 네이티브 status bar 영역만 dim — Sheet 패턴.
  //   BottomSheet 류는 `bottom: false` — 시트 카드가 화면 하단까지 차지.
  //   SoT: docs/Design/MODAL_DIM_POLICY.md
  useNativeScrim(isOpen, undefined, { bottom: false });

  const handleBackdropClick = () => {
    if (!isSubmitting) onClose();
  };

  if (!isOpen || typeof window === 'undefined') return null;

  const sheet = (
    <div
      className="overlay-fullscreen-wrapper items-end justify-center animate-in fade-in duration-200"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="child-select-title"
    >
      <div className="overlay-fullscreen-dim-sheet" aria-hidden="true" />
      <div
        className={cn(
          'relative pointer-events-auto z-10 w-full max-w-md',
          'bg-white dark:bg-rink-800',
          'rounded-t-3xl shadow-md',
          'border-t border-wline dark:border-rink-700',
          'animate-in slide-in-from-bottom duration-300 ease-out',
        )}
        style={{ paddingBottom: 'calc(1rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div
            className="h-1 w-10 rounded-full bg-wline dark:bg-rink-500"
            aria-hidden="true"
          />
        </div>

        {/* 헤더 */}
        <div className="px-6 pb-4">
          <h2
            id="child-select-title"
            className="text-lg font-bold text-wtext-1 dark:text-white"
          >
            자녀 선택
          </h2>
          <p className="mt-1 text-sm text-wtext-3 dark:text-rink-300">
            수강신청할 자녀를 선택해주세요
          </p>
        </div>

        <div className="h-px bg-wline-2 dark:bg-rink-700" aria-hidden="true" />

        {/* 자녀 리스트 */}
        <ul
          className={cn(
            'px-6 py-4 flex flex-col gap-3 max-h-[50vh] overflow-y-auto hide-scrollbar',
            isSubmitting && 'pointer-events-none opacity-60',
          )}
        >
          {childrenList.map((child) => (
            <li key={child.id}>
              <button
                type="button"
                onClick={() => onSelect(child.id)}
                disabled={isSubmitting}
                className={cn(
                  'group w-full flex items-center gap-3 min-h-16 p-4',
                  'rounded-xl border border-wline dark:border-rink-700',
                  'bg-white dark:bg-rink-800',
                  'hover:border-ice-500 hover:bg-wbg dark:hover:bg-rink-700/60',
                  'active:brightness-95 transition-colors duration-150',
                  'text-left',
                )}
                aria-label={`${child.name} 선택`}
              >
                <div className="relative w-12 h-12 shrink-0 rounded-full overflow-hidden bg-wline-2 dark:bg-rink-700 flex items-center justify-center">
                  {resolveImageSrc(child.profileImage) ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={resolveImageSrc(child.profileImage)}
                      alt={child.name}
                      className="absolute inset-0 size-full object-cover"
                    />
                  ) : (
                    <Icon
                      name="face"
                      className="text-2xl text-wtext-3 dark:text-rink-300"
                      aria-hidden="true"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold text-wtext-1 dark:text-white truncate">
                    {child.name}
                  </p>
                  {typeof child.age === 'number' && (
                    <p className="text-sm text-wtext-3 dark:text-rink-300">
                      {child.age}세
                    </p>
                  )}
                </div>
                <Icon
                  name="chevron_right"
                  className="text-wtext-3 dark:text-rink-300 text-xl group-hover:text-ice-500 shrink-0"
                  aria-hidden="true"
                />
              </button>
            </li>
          ))}
        </ul>

        <div className="h-px bg-wline-2 dark:bg-rink-700" aria-hidden="true" />

        {/* 취소 버튼 */}
        <div className="px-6 pt-4">
          <Button
            variant="outline"
            fullWidth
            onClick={onClose}
            disabled={isSubmitting}
          >
            취소
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
});
