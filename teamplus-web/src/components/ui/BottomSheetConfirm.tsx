'use client';

import { useCallback, useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { cn } from '@/lib/utils';
import { lockBodyScroll, unlockBodyScroll } from '@/lib/scroll-lock';
import { useNativeScrim } from '@/hooks/useNativeScrim';
import { MESSAGES } from '@/lib/messages';

/**
 * BottomSheetConfirm — TEAMPLUS 약관 동의·확인 바텀시트 (Phase 2 P4)
 *
 * 결제수단 등록·수업 환불 등 사용자의 명시적 동의가 필요한 컨텍스트에서
 * 약관 체크박스 + 확인 버튼을 모은 시트.
 *
 * - AI 스타일 금지: 그라디언트·블러·컬러 그림자 없음 (`shadow-sh-rink` 는
 *   디자인 토큰화된 중성 그림자로 SoT 준수)
 * - createPortal 로 MobileContainer overflow-hidden 클리핑 우회
 * - ESC 키 + 오버레이 클릭으로 cancel
 * - 애니메이션: 시트는 `animate-sheet-up`, 오버레이는 `animate-overlay-in`
 * - body 스크롤 잠금: `lockBodyScroll()` (reference-counted)
 *
 * @example
 * <BottomSheetConfirm
 *   isOpen={isOpen}
 *   terms={[
 *     { id: 'pii',     label: '[필수] 고객정보 제 3자 제공동의',  required: true,  checked: true,  onDetailClick: () => openDetail('pii') },
 *     { id: 'service', label: '[필수] 결제 서비스 이용약관',      required: true,  checked: false, onDetailClick: () => openDetail('service') },
 *   ]}
 *   onTermToggle={(id) => toggleTerm(id)}
 *   onConfirm={() => handleConfirm()}
 *   onCancel={() => setIsOpen(false)}
 * />
 */
export interface ConfirmTermItem {
  /** 고유 식별자 */
  id: string;
  /** 약관 라벨 — 예: "[필수] 고객정보 제 3자 제공동의" */
  label: string;
  /** 필수 여부 (UI 상 강제 사용은 아니며, 라벨 prefix 로 표기 가정) */
  required: boolean;
  /** 현재 체크 여부 */
  checked: boolean;
  /** 상세보기 콜백 — 존재 시 우측 chevron 표시 */
  onDetailClick?: () => void;
}

export interface BottomSheetConfirmProps {
  /** 시트 표시 여부 */
  isOpen: boolean;
  /** 시트 헤더 제목 (기본: "약관에 동의해주세요.") */
  title?: string;
  /** 약관 항목 리스트 */
  terms: ConfirmTermItem[];
  /** 약관 토글 콜백 (체크박스 또는 라벨 클릭) */
  onTermToggle: (id: string) => void;
  /** 확인 버튼 콜백 */
  onConfirm: () => void;
  /** 취소 핸들러 (X 버튼 / ESC / 오버레이 클릭) */
  onCancel: () => void;
  /** 확인 버튼 라벨 (기본: "확인") */
  confirmLabel?: string;
  /** 추가 클래스명 (시트 컨테이너) */
  className?: string;
}

export const BottomSheetConfirm: React.FC<BottomSheetConfirmProps> = ({
  isOpen,
  title = '약관에 동의해주세요.',
  terms,
  onTermToggle,
  onConfirm,
  onCancel,
  confirmLabel = '확인',
  className,
}) => {
  // Portal 마운트 여부 (SSR 대응)
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // ESC 키로 cancel
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  // body scroll lock
  useEffect(() => {
    if (!isOpen) return;
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, [isOpen]);

  // [2026-05-12 → 2026-05-16 v2] 네이티브 status bar 영역만 dim — BottomSheet 는 화면
  //   하단까지 시트 카드가 차지하므로 하단 native scrim 비활성(`bottom: false`) 으로
  //   하단 dim 이 시트 카드 위에 덮이는 시각 버그 회피.
  //   BottomSheet 표준 AARRGGBB = '#73141826' (rink-900 / 45%) — SPEC §2.4
  //   SoT: docs/Design/MODAL_DIM_POLICY.md (BottomSheet 패턴)
  useNativeScrim(isOpen, '#73141826', { bottom: false });

  const handleOverlayClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onCancel();
    },
    [onCancel],
  );

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div
      className="overlay-fullscreen-wrapper items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={handleOverlayClick}
    >
      {/* 오버레이 — viewport 전체(status bar / home indicator) dim, SPEC 2026-05-16 SoT */}
      <div
        className="overlay-fullscreen-dim-sheet animate-overlay-in motion-reduce:animate-none"
        aria-hidden="true"
      />

      {/* 시트 본체 */}
      <div
        className={cn(
          'relative pointer-events-auto flex w-full max-w-md flex-col rounded-t-w-2xl bg-wsurface shadow-sh-rink animate-sheet-up dark:bg-rink-800 motion-reduce:animate-none',
          className,
        )}
        style={{ paddingBottom: 32 }}
      >
        {/* 그랩 핸들 — 40x4 rounded */}
        <div
          className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-wline dark:bg-rink-700"
          aria-hidden="true"
        />

        {/* 헤더 — 제목 + X 버튼 */}
        <div className="flex items-center justify-between px-6 pb-3.5 pt-4">
          <h2 className="text-w-title font-bold tracking-tight text-wtext-1 dark:text-white">
            {title}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label={MESSAGES.common.close}
            className="flex size-8 shrink-0 items-center justify-center text-wtext-2 transition-colors hover:text-wtext-1 dark:text-rink-100 dark:hover:text-white"
          >
            <Icon name="close" className="text-[20px]" aria-hidden="true" />
          </button>
        </div>

        {/* 약관 항목 — 첫 항목 위에 구분선 (babel_10 라인 295) */}
        <ul className="border-t border-wline-2 dark:border-rink-700/60">
          {terms.map((term, idx) => {
            const isChecked = term.checked;
            const isLast = idx === terms.length - 1;
            return (
              <li
                key={term.id}
                className={cn(
                  'flex items-center gap-3 px-6 py-3.5',
                  !isLast && 'border-b border-wline-2 dark:border-rink-700/60',
                )}
              >
                {/* ice-500 원형 체크박스 (22x22) */}
                <button
                  type="button"
                  onClick={() => onTermToggle(term.id)}
                  role="checkbox"
                  aria-checked={isChecked}
                  aria-label={term.label}
                  className={cn(
                    'flex size-[22px] shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                    isChecked
                      ? 'border-ice-500 bg-ice-500'
                      : 'border-wline bg-transparent dark:border-rink-700',
                  )}
                >
                  {isChecked && (
                    <Icon
                      name="check"
                      className="text-[14px] text-white"
                      aria-hidden="true"
                    />
                  )}
                </button>

                {/* 라벨 (클릭 시 토글) */}
                <button
                  type="button"
                  onClick={() => onTermToggle(term.id)}
                  className="flex-1 text-left text-sm font-semibold tracking-tight text-wtext-1 dark:text-white"
                >
                  {term.label}
                </button>

                {/* 상세보기 chevron — onDetailClick 있을 때만 */}
                {term.onDetailClick && (
                  <button
                    type="button"
                    onClick={term.onDetailClick}
                    aria-label={`${term.label} 상세보기`}
                    className="flex size-8 shrink-0 items-center justify-center text-wtext-3 transition-colors hover:text-wtext-1 dark:text-rink-300 dark:hover:text-white"
                  >
                    <Icon
                      name="chevron_right"
                      className="text-[18px]"
                      aria-hidden="true"
                    />
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        {/* 확인 버튼 — 52px ice-500 white rounded-w-md */}
        <div className="px-5 pt-4">
          <button
            type="button"
            onClick={onConfirm}
            className="h-[52px] w-full rounded-w-md bg-ice-500 text-w-body font-bold text-white transition-colors hover:bg-ice-600 active:bg-ice-700"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default BottomSheetConfirm;
