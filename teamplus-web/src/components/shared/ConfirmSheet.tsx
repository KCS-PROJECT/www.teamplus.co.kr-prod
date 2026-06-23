'use client';

/**
 * ConfirmSheet - TEAMPLUS Shared Component
 * 확인 바텀시트. 삭제/승인 등 사용자 확인이 필요한 동작에 사용.
 * 사용 화면: /admin/members (일괄 승인/거절), /matches/[id]/applicants, 회원 탈퇴
 */

import { useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNativeScrim } from '@/hooks/useNativeScrim';
import { cn } from '@/lib/utils';

export interface ConfirmSheetProps {
  /** 시트 열림 상태 */
  open: boolean;
  /** 제목 */
  title: string;
  /** 부가 설명 */
  description?: string;
  /** 확인 버튼 레이블 */
  confirmLabel?: string;
  /** 취소 버튼 레이블 */
  cancelLabel?: string;
  /** 확인 핸들러 */
  onConfirm: () => void;
  /** 취소 핸들러 */
  onCancel: () => void;
  /** 색상 변형 */
  variant?: 'primary' | 'danger';
}

const CONFIRM_STYLES: Record<NonNullable<ConfirmSheetProps['variant']>, string> = {
  primary: 'bg-ice-500 text-white hover:bg-ice-600 active:bg-ice-700 focus:ring-ice-500/40',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-400/40',
};

/**
 * 확인 바텀시트
 *
 * @example
 * ```tsx
 * <ConfirmSheet
 *   open={showConfirm}
 *   title="정말 삭제하시겠습니까?"
 *   description="삭제된 데이터는 복구할 수 없습니다."
 *   confirmLabel="삭제하기"
 *   variant="danger"
 *   onConfirm={handleDelete}
 *   onCancel={() => setShowConfirm(false)}
 * />
 * ```
 */
export function ConfirmSheet({
  open,
  title,
  description,
  confirmLabel = '확인',
  cancelLabel = '취소',
  onConfirm,
  onCancel,
  variant = 'primary',
}: ConfirmSheetProps) {
  // SSR/hydration 안전 — portal 은 클라이언트 마운트 후에만 렌더
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // ESC 키로 닫기
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    },
    [onCancel]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    // 스크롤 잠금
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prev;
    };
  }, [open, handleKeyDown]);

  // [2026-05-12 → 2026-05-16 v2] 네이티브 status bar 영역만 dim — Sheet 패턴.
  //   BottomSheet 류는 `bottom: false` — 하단 dim 이 시트 카드 위에 덮이는 버그 회피.
  //   SoT: docs/Design/MODAL_DIM_POLICY.md
  useNativeScrim(open, undefined, { bottom: false });

  if (!open || !mounted) return null;

  // BottomNav(z-40) 와 다른 stacking context 충돌 방지를 위해 document.body 로 portal
  return createPortal(
    <div className="fixed inset-0 z-[9990] flex items-end justify-center">
      {/* 오버레이 — 솔리드 rink-900 dim */}
      <div
        className="absolute inset-0 bg-rink-900/45"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* 시트
          [hotfix 2026-05-15 T06-C] iPhone home indicator / Android navigation
          gesture bar 영역까지 시트가 깔리도록 safe-area-inset-bottom 보강.
          기존 `pb-8`(32px) 만으로는 iPhone 홈바 위에 액션 버튼이 깔려 잘림.
          TEAMPLUS SoT: `var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))`
          (Android WebView 가 env()를 0px로 평가하는 케이스 폴백). */}
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-sheet-title"
        aria-describedby={description ? 'confirm-sheet-desc' : undefined}
        className={cn(
          'relative w-full max-w-lg',
          'bg-wsurface dark:bg-rink-800',
          'rounded-t-w-2xl shadow-sh-rink',
          'p-6',
          'animate-in slide-in-from-bottom duration-200 motion-reduce:animate-none'
        )}
        style={{
          paddingBottom:
            'calc(2rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))',
        }}
      >
        {/* 드래그 핸들 — 40 × 4, Wallet v2 표준 */}
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-wline dark:bg-rink-700" aria-hidden="true" />

        <h2
          id="confirm-sheet-title"
          className="text-w-title font-bold tracking-tight text-wtext-1 dark:text-white text-center"
        >
          {title}
        </h2>

        {description && (
          <p
            id="confirm-sheet-desc"
            className="mt-2 text-sm text-wtext-3 dark:text-rink-300 text-center leading-relaxed"
          >
            {description}
          </p>
        )}

        {/* 버튼 */}
        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className={cn(
              'flex-1 h-[52px] rounded-w-md text-[15px] font-semibold',
              'bg-wbg dark:bg-rink-700/40',
              'text-wtext-2 dark:text-rink-100',
              'hover:bg-wline-2 dark:hover:bg-rink-700/60',
              'active:brightness-95 transition-colors motion-reduce:transition-none',
              'focus:outline-none focus:ring-2 focus:ring-wline'
            )}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={cn(
              'flex-1 h-[52px] rounded-w-md text-[15px] font-semibold',
              'active:brightness-95 transition-colors motion-reduce:transition-none',
              'focus:outline-none focus:ring-2',
              CONFIRM_STYLES[variant]
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ConfirmSheet;
