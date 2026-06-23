'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import { useNativeScrim } from '@/hooks/useNativeScrim';
import { lockBodyScroll, unlockBodyScroll } from '@/lib/scroll-lock';

// ─── Icon Type SVG 컴포넌트 ─────────────────────────────
// Wallet v2 Ice Blue (#2f5fff) 토큰을 직접 stroke/fill 로 사용
const ICE_PRIMARY = '#2f5fff';

function GiftIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="4" y="18" width="32" height="18" rx="3" fill={ICE_PRIMARY} fillOpacity="0.15" stroke={ICE_PRIMARY} strokeWidth="2" />
      <rect x="6" y="12" width="28" height="8" rx="2" fill={ICE_PRIMARY} fillOpacity="0.25" stroke={ICE_PRIMARY} strokeWidth="2" />
      <line x1="20" y1="12" x2="20" y2="36" stroke={ICE_PRIMARY} strokeWidth="2" />
      <path d="M20 12C20 12 16 4 10 8C4 12 20 12 20 12Z" fill={ICE_PRIMARY} fillOpacity="0.3" stroke={ICE_PRIMARY} strokeWidth="1.5" />
      <path d="M20 12C20 12 24 4 30 8C36 12 20 12 20 12Z" fill={ICE_PRIMARY} fillOpacity="0.3" stroke={ICE_PRIMARY} strokeWidth="1.5" />
    </svg>
  );
}

function MegaphoneIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M8 16L8 24H12L24 32V8L12 16H8Z" fill={ICE_PRIMARY} fillOpacity="0.2" stroke={ICE_PRIMARY} strokeWidth="2" strokeLinejoin="round" />
      <path d="M28 14C30.2091 16 30.2091 24 28 26" stroke={ICE_PRIMARY} strokeWidth="2" strokeLinecap="round" />
      <path d="M32 10C36 14 36 26 32 30" stroke={ICE_PRIMARY} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M20 4L24.5 14.5L36 16L27.5 24L30 36L20 30.5L10 36L12.5 24L4 16L15.5 14.5L20 4Z" fill={ICE_PRIMARY} fillOpacity="0.2" stroke={ICE_PRIMARY} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

const ICON_MAP: Record<string, () => React.ReactElement> = {
  gift: GiftIcon,
  megaphone: MegaphoneIcon,
  star: StarIcon,
};

// ─── EventPopup Props ────────────────────────────────────
export interface EventPopupProps {
  open: boolean;
  title: string;
  description: string;
  ctaLabel?: string;
  onCtaClick: () => void;
  onDismiss: () => void;
  onHideToday: () => void;
  iconType?: 'gift' | 'megaphone' | 'star';
}

// ─── EventPopup Component ────────────────────────────────
export function EventPopup({
  open,
  title,
  description,
  ctaLabel = '상세보기',
  onCtaClick,
  onDismiss,
  onHideToday,
  iconType = 'gift',
}: EventPopupProps) {
  const [isVisible, setIsVisible] = useState(false);

  // Flutter 네이티브 safe area(Status Bar / Home Indicator) 전 영역 dim.
  // CSS overlay(bg-rink-900/55)와 매칭되는 AARRGGBB 컬러: #8C141826 — Wallet v2 SoT
  useNativeScrim(open, '#8C141826');

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => setIsVisible(true), 50);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [open]);

  // 배경 스크롤 잠금 + ESC 키 dismiss — 다른 모달(Modal/ConfirmDialog)과 일관
  const handleDismiss = useCallback(() => {
    setIsVisible(false);
    setTimeout(onDismiss, 300);
  }, [onDismiss]);

  useEffect(() => {
    if (!open) return;
    lockBodyScroll();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDismiss();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      unlockBodyScroll();
    };
  }, [open, handleDismiss]);

  const handleCtaClick = useCallback(() => {
    setIsVisible(false);
    setTimeout(onCtaClick, 300);
  }, [onCtaClick]);

  const handleHideToday = useCallback(() => {
    setIsVisible(false);
    setTimeout(onHideToday, 300);
  }, [onHideToday]);

  if (!open) return null;
  if (typeof window === 'undefined') return null;

  const IconComponent = ICON_MAP[iconType] || GiftIcon;

  const content = (
    // SPEC §2 canonical 3-element pattern (wrapper + dim + body)
    //  · wrapper: overlay-fullscreen-wrapper (100dvh · margin/padding 0) — status bar 까지 cover
    //  · dim: 별도 자식 + onClick={handleDismiss} 직접 부착
    //  · body: relative pointer-events-auto z-10 + scale/translate 애니메이션
    //  z-[10000] 유지 — EventPopup 은 다른 Modal 위에 떠야 함 (overlay-critical+ 레벨)
    //  SoT: docs/Planning/SPEC_POPUP_FULLSCREEN_DIM.md §2.1
    <div
      className={cn(
        'overlay-fullscreen-wrapper items-center justify-center transition-opacity duration-300 motion-reduce:transition-none',
        isVisible ? 'opacity-100' : 'opacity-0'
      )}
      style={{ zIndex: 10000 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-popup-title"
    >
      {/* Overlay — overlay-fullscreen-dim (rink-900/55 Modal 표준) */}
      <div
        className="overlay-fullscreen-dim animate-overlay-in motion-reduce:animate-none"
        onClick={handleDismiss}
        aria-hidden="true"
      />

      {/* Modal Card — relative pointer-events-auto z-10 + 좌우 mx-6 (구 wrapper p-6 대체) */}
      <div
        className={cn(
          'relative pointer-events-auto z-10 w-full max-w-[400px] mx-6 bg-wsurface dark:bg-rink-800 rounded-[28px] overflow-hidden shadow-sh-rink ring-1 ring-wline-2 dark:ring-rink-700/60 transition-all duration-300 motion-reduce:transition-none',
          isVisible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'
        )}
      >
        {/* Content Area */}
        <div className="px-8 pt-10 pb-6 flex flex-col items-center text-center">
          {/* 아이콘 원형 */}
          <div className="w-20 h-20 bg-ice-100 dark:bg-ice-900/40 rounded-full flex items-center justify-center mb-6">
            <IconComponent />
          </div>

          {/* 제목 */}
          <h2
            id="event-popup-title"
            className="text-2xl font-bold tracking-tight text-wtext-1 dark:text-white mb-3"
          >
            {title}
          </h2>

          {/* 설명 */}
          <p className="text-[15px] text-wtext-3 dark:text-rink-300 leading-relaxed mb-8 whitespace-pre-line">
            {description}
          </p>

          {/* CTA 버튼 */}
          <button
            onClick={handleCtaClick}
            className="w-full h-[52px] bg-ice-500 hover:bg-ice-600 active:bg-ice-700 text-white rounded-w-md font-bold text-[17px] transition-colors motion-reduce:transition-none"
          >
            {ctaLabel}
          </button>

          {/* Dismiss 버튼 */}
          <button
            onClick={handleDismiss}
            className="w-full h-[52px] text-wtext-4 dark:text-rink-300 font-medium text-[15px] hover:text-wtext-2 dark:hover:text-rink-100 transition-colors motion-reduce:transition-none"
          >
            다음에 볼게요
          </button>
        </div>

        {/* Footer — "오늘 하루 보지 않기" (safe-area-inset-bottom 대응) */}
        <div
          className="bg-wbg dark:bg-rink-900/40 pt-3 text-center border-t border-wline-2 dark:border-rink-700/60"
          style={{ paddingBottom: 'calc(0.75rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))' }}
        >
          <button
            onClick={handleHideToday}
            className="text-xs text-wtext-4 dark:text-rink-300 hover:text-wtext-2 dark:hover:text-rink-100 transition-colors motion-reduce:transition-none"
          >
            오늘 하루 보지 않기
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
