'use client';

import { memo, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { useNativeScrim } from '@/hooks/useNativeScrim';
import type { ConfirmOptions, ModalVariant } from './ModalContext';

/**
 * P1 · 컨펌 팝업 (가운데 다이얼로그)
 * reference: /claude-design/_ _ _offline_.html § "P1 · 컨펌 팝업 (가운데 다이얼로그)"
 *
 * 사양 요약:
 * - width 296px, rounded 14px
 * - bg surface, shadow 0 18px 48px rgba(15,18,30,0.25)
 * - 본문 padding 28 24 24, 메시지 15/600 text1 line-height 1.55 -0.02em
 * - 1px divider line2
 * - 버튼 좌(취소): h50, 15/600 text3, 우 borderRight 1px line2
 * - 버튼 우(확인): h50, 15/700 ice-500 (default) / red-600 (danger)
 *
 * Flutter 네이티브 safe area dim 색.
 */
// [2026-05-16 SoT] 모든 Modal 계열 dim 통일 — rink-900 / 55% (#8C141826)
//   SPEC: docs/Planning/SPEC_POPUP_FULLSCREEN_DIM.md §2.4
const SCRIM_COLOR_AARRGGBB = '#8C141826';

// ─── Variant 설정 — P1 형식: 우측 확인 버튼 색상만 분기 ─────
const variantConfig: Record<ModalVariant, { confirmText: string; confirmHover: string }> = {
  default: {
    confirmText: 'text-[color:var(--c-ice-500)]',
    confirmHover: 'hover:bg-[color:var(--c-ice-50)] dark:hover:bg-rink-700/40',
  },
  danger: {
    confirmText: 'text-red-600 dark:text-red-400',
    confirmHover: 'hover:bg-red-50 dark:hover:bg-red-900/20',
  },
  success: {
    confirmText: 'text-emerald-600 dark:text-emerald-400',
    confirmHover: 'hover:bg-emerald-50 dark:hover:bg-emerald-900/20',
  },
  warning: {
    confirmText: 'text-amber-600 dark:text-amber-400',
    confirmHover: 'hover:bg-amber-50 dark:hover:bg-amber-900/20',
  },
};

// ─── ConfirmDialog (P1) ───────────────────────────────────
interface ConfirmDialogProps {
  isOpen: boolean;
  options: ConfirmOptions;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog = memo(function ConfirmDialog({
  isOpen,
  options,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const {
    title,
    message,
    confirmText = '확인',
    cancelText = '취소',
    variant = 'default',
  } = options;

  const config = variantConfig[variant];

  // [2026-05-30] 확인 버튼 ref — autoFocus 대신 preventScroll 포커스에 사용.
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  // [2026-05-30] 모달 정적화 — 사용자 요청("멈춰있도록"). enter/exit 애니메이션을 모두
  //   제거하여 즉시 표시·즉시 닫힘. 슬라이드/페이드 전환에서 보이던 깜박임 제거.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      } else if (e.key === 'Enter') {
        onConfirm();
      }
    },
    [onConfirm, onCancel],
  );

  // 키보드 + 포커스
  // [2026-05-30] lockBodyScroll(document.body overflow:hidden) 제거 — 깜박임 근본 원인.
  //   이 앱은 main(overflow-y-auto)이 스크롤 컨테이너인데 body 에 overflow:hidden 을 걸면
  //   브라우저가 배경을 상단(scrollTop 0)으로 점프시켜 "dim 되며 화면이 위로 올라가는" 깜박임이
  //   발생했다. 배경 조작은 overlay(fixed inset-0, z-9990)가 이미 차단하므로 body lock 불필요.
  //   autoFocus 대신 preventScroll 포커스로 scroll-into-view 점프도 함께 차단.
  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      confirmBtnRef.current?.focus({ preventScroll: true });
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, handleKeyDown]);

  // [2026-05-16 SoT] viewport 전체 dim — overlay-fullscreen-wrapper +
  //   overlay-fullscreen-dim 표준화. Native safe-area 는 SCRIM_COLOR_AARRGGBB
  //   (#8C141826 = rink-900/55) 로 동기. 다른 화면 이벤트 완전 차단.
  useNativeScrim(isOpen, SCRIM_COLOR_AARRGGBB);

  if (!isOpen) return null;
  if (typeof window === 'undefined') return null;

  // P1: title 있으면 굵은 제목 + 일반 메시지, 없으면 메시지만 (중앙 정렬)
  const hasTitle = Boolean(title && title !== '확인');

  const content = (
    <div className="overlay-fullscreen-wrapper items-center justify-center p-5">
      {/* Dim overlay — overlay-fullscreen-dim (rink-900 / 55%) */}
      <div
        className="overlay-fullscreen-dim"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Dialog — 296px, rounded 14, surface bg, deep shadow
          [수정 2026-05-30] 모든 enter/exit 애니메이션 제거(정적) — 사용자 요청("멈춰있도록").
          슬라이드업·페이드 전환에서 보이던 깜박임을 없애고 즉시 표시·즉시 닫힘. */}
      <div
        className={cn(
          'relative pointer-events-auto bg-wsurface dark:bg-rink-800',
          'overflow-hidden',
        )}
        style={{
          width: 296,
          borderRadius: 14,
          boxShadow: '0 18px 48px rgba(15,18,30,0.25)',
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={hasTitle ? 'confirm-dialog-title' : 'confirm-dialog-message'}
        aria-describedby={hasTitle && message ? 'confirm-dialog-message' : undefined}
      >
        {/* 본문 — padding 28 24 24, 중앙 정렬 */}
        <div className="px-6 pt-7 pb-6 text-center">
          {hasTitle && (
            <h2
              id="confirm-dialog-title"
              className="text-[16px] font-extrabold tracking-[-0.02em] text-wtext-1 dark:text-white mb-1.5"
              style={{ lineHeight: 1.4 }}
            >
              {title}
            </h2>
          )}
          {message && (
            <p
              id="confirm-dialog-message"
              className="text-[15px] font-semibold tracking-[-0.02em] text-wtext-1 dark:text-white whitespace-pre-line"
              style={{ lineHeight: 1.55 }}
            >
              {message}
            </p>
          )}
        </div>

        {/* 1px divider — line2 */}
        <div className="h-px bg-wline-2 dark:bg-rink-700/60" />

        {/* 버튼 — 좌 취소(text3) | 우 확인(ice-500 / variant 색) */}
        <div className="flex">
          <button
            type="button"
            onClick={onCancel}
            className={cn(
              'flex-1 h-[50px] bg-transparent border-0',
              'text-[15px] font-semibold text-wtext-3 dark:text-rink-100',
              'border-r border-wline-2 dark:border-rink-700/60',
              'hover:bg-wbg dark:hover:bg-rink-700/40 active:brightness-95',
              'transition-colors motion-reduce:transition-none',
              'focus-visible:outline-none focus-visible:bg-wbg dark:focus-visible:bg-rink-700/40',
            )}
          >
            {cancelText}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={onConfirm}
            className={cn(
              'flex-1 h-[50px] bg-transparent border-0',
              'text-[15px] font-bold',
              'active:brightness-95 transition-colors motion-reduce:transition-none',
              'focus-visible:outline-none',
              config.confirmText,
              config.confirmHover,
            )}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
});
