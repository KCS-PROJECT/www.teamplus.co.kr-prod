'use client';

import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import { useNativeScrim } from '@/hooks/useNativeScrim';

/**
 * BottomSheet — TEAMPLUS 공통 바텀 시트 컴포넌트
 *
 * 하단에서 슬라이드 업으로 등장하는 범용 시트. 필터·상세·옵션 선택 등
 * 복잡한 폼 UI 를 담을 수 있도록 children 슬롯과 optional footer 를 제공한다.
 *
 * - AI 스타일 금지: 그라디언트·블러·컬러 그림자 없음
 * - createPortal 로 MobileContainer overflow-hidden 클리핑 우회
 * - ESC 키 + 오버레이 클릭으로 close
 * - 애니메이션: 시트는 `animate-sheet-up` (translateY 100% → 0%, cubic-bezier ease-out),
 *              오버레이는 `animate-overlay-in` (opacity 0 → 1)
 *
 * @example
 * <BottomSheet
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   title="필터링"
 *   footer={
 *     <div className="flex gap-2">
 *       <button type="button" onClick={handleReset}>초기화</button>
 *       <button type="button" onClick={handleApply}>적용하기</button>
 *     </div>
 *   }
 * >
 *   <div>필터 옵션 폼</div>
 * </BottomSheet>
 */
interface BottomSheetProps {
  /** 시트 표시 여부 */
  isOpen: boolean;
  /** 닫기 핸들러 */
  onClose: () => void;
  /** 시트 제목 (헤더 + aria-label) */
  title: string;
  /** 본문 내용 */
  children: ReactNode;
  /** 하단 고정 푸터 (액션 버튼 등) */
  footer?: ReactNode;
  /** 최대 높이 (기본: 85vh) */
  maxHeight?: string;
  /** 추가 클래스명 (시트 컨테이너) */
  className?: string;
}

const CLOSE_ANIMATION_MS = 300;

export function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxHeight = '85vh',
  className,
}: BottomSheetProps) {
  // Portal 마운트 여부 (SSR 대응)
  const [mounted, setMounted] = useState(false);
  const [isRendered, setIsRendered] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const startCloseAnimation = useCallback(() => {
    if (!isRendered || isClosing) return;
    setIsClosing(true);
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setIsRendered(false);
      setIsClosing(false);
      closeTimerRef.current = null;
    }, CLOSE_ANIMATION_MS);
  }, [clearCloseTimer, isClosing, isRendered]);

  const requestClose = useCallback(() => {
    startCloseAnimation();
    onClose();
  }, [onClose, startCloseAnimation]);

  useEffect(() => {
    if (isOpen) {
      clearCloseTimer();
      setIsRendered(true);
      setIsClosing(false);
      return;
    }

    startCloseAnimation();
  }, [clearCloseTimer, isOpen, startCloseAnimation]);

  useEffect(() => {
    return clearCloseTimer;
  }, [clearCloseTimer]);

  // Flutter 네이티브 status bar(상단) 영역 dim. CSS overlay(bg-rink-900/45)와 매칭되는
  // AARRGGBB 컬러: #73141826 — Wallet v2 SoT.
  // 2026-05-16: BottomSheet 는 화면 하단까지 시트 카드가 차지하므로 하단 native scrim
  // 비활성(`bottom: false`) — 하단 dim 이 시트 카드 위에 덮이는 시각 버그 회피.
  // SoT: docs/Design/MODAL_DIM_POLICY.md
  useNativeScrim(isRendered, '#73141826', { bottom: false });

  // ESC 키로 닫기
  useEffect(() => {
    if (!isRendered || isClosing) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isClosing, isRendered, requestClose]);

  // body scroll lock (시트 열릴 때 배경 스크롤 방지)
  useEffect(() => {
    if (!isRendered) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isRendered]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) requestClose();
    },
    [requestClose],
  );

  if (!mounted || !isRendered) return null;

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
        data-bottom-sheet-dim
        onClick={requestClose}
        className={cn(
          'overlay-fullscreen-dim-sheet motion-reduce:animate-none',
          isClosing ? 'animate-overlay-out' : 'animate-overlay-in',
        )}
        aria-hidden="true"
      />

      {/* 시트 본체 — 화면 바깥에서 자연스럽게 슬라이드 업 */}
      <div
        data-bottom-sheet-panel
        className={cn(
          'relative pointer-events-auto flex w-full max-w-md flex-col overflow-hidden rounded-t-w-2xl bg-wsurface shadow-sh-rink dark:bg-rink-800 motion-reduce:animate-none',
          isClosing ? 'animate-sheet-down' : 'animate-sheet-up',
          className,
        )}
        style={{ maxHeight }}
      >
        {/* 핸들 바 — 40 × 4, Wallet v2 표준 */}
        <div
          className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-wline dark:bg-rink-700"
          aria-hidden="true"
        />

        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 pb-3 pt-4">
          <h2 className="text-w-title font-bold tracking-tight text-wtext-1 dark:text-white">
            {title}
          </h2>
          <button
            type="button"
            onClick={requestClose}
            aria-label="닫기"
            className="flex size-9 items-center justify-center rounded-full text-wtext-3 transition-colors hover:bg-wbg hover:text-wtext-1 dark:text-rink-300 dark:hover:bg-rink-700/40 dark:hover:text-white"
          >
            <Icon name="close" className="text-[22px]" aria-hidden="true" />
          </button>
        </div>

        {/* 본문 (스크롤 영역)
            [hotfix 2026-05-15 T06-F] footer 미사용 시(예: ShareSheet) 본문이
            화면 하단까지 닿아 iPhone home indicator 영역에 액션 버튼이 가려짐.
            footer 가 있으면 footer 가 safe-area 처리하므로 본문은 기본 pb-4 만,
            footer 가 없으면 본문 pb 에 safe-area-inset-bottom 추가. */}
        <div
          className="hide-scrollbar flex-1 overflow-y-auto px-5"
          style={{
            paddingBottom: footer
              ? '1rem'
              : 'calc(1rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))',
          }}
        >
          {children}
        </div>

        {/* 푸터 (옵션) */}
        {footer && (
          <div
            className="border-t border-wline-2 bg-wsurface px-5 pt-3 dark:border-rink-700/60 dark:bg-rink-800"
            style={{ paddingBottom: 'calc(0.75rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default BottomSheet;
