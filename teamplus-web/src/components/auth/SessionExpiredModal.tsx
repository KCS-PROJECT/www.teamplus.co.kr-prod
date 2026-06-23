"use client";

/**
 * SessionExpiredModal — 자동 로그아웃 안내 모달
 *
 * 세션 만료(401 expired)로 자동 로그아웃될 때 표시한다.
 * `SessionExpiredGate` 가 `teamplus:api-unauthorized`(reason=expired) 이벤트를
 * 받아 노출 여부를 제어한다.
 *
 * - "닫기"   → onClose: 모달만 닫는다 (현재 화면 유지)
 * - "재로그인" → onRelogin: 로그인 페이지로 이동
 *
 * web 에 마운트되므로 Flutter WebView(app) 안에서도 그대로 표시된다.
 */

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/scroll-lock";
import { useNativeScrim } from "@/hooks/useNativeScrim";
import { MESSAGES } from "@/lib/messages";

interface SessionExpiredModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRelogin: () => void;
}

export function SessionExpiredModal({
  isOpen,
  onClose,
  onRelogin,
}: SessionExpiredModalProps) {
  // Native safe-area dim (AlertDialog 와 동일 톤)
  useNativeScrim(isOpen, "#8C141826");

  useEffect(() => {
    if (!isOpen) return;
    // ESC 로 닫히지 않게 — 사용자가 버튼으로 직접 선택하도록 유도
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") e.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    lockBodyScroll();
    return () => {
      document.removeEventListener("keydown", onKey);
      unlockBodyScroll();
    };
  }, [isOpen]);

  if (!isOpen) return null;
  if (typeof window === "undefined") return null;

  return createPortal(
    <div
      className="overlay-fullscreen-wrapper items-center justify-center p-6"
      role="dialog"
      aria-modal="true"
    >
      {/* Dim overlay — overlay-fullscreen-dim (rink-900 / 55%), blur 미사용 */}
      <div className="overlay-fullscreen-dim" aria-hidden="true" />

      <div className="relative pointer-events-auto w-full max-w-[340px] overflow-hidden rounded-w-2xl bg-wsurface dark:bg-rink-800 shadow-sh-rink ring-1 ring-wline-2 dark:ring-rink-700/60 animate-in fade-in zoom-in-95 duration-200">
        {/* 본문 */}
        <div className="px-6 pt-8 pb-7 text-center">
          <h2 className="text-w-title font-bold tracking-tight text-wtext-1 dark:text-white">
            {MESSAGES.authGuard.autoLogoutTitle}
          </h2>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-wtext-3 dark:text-rink-300">
            {MESSAGES.authGuard.autoLogoutMessage}
          </p>
        </div>

        {/* 버튼 — 카드 하단 좌우 분할 */}
        <div className="flex border-t border-wline dark:border-rink-700">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-4 text-[15px] font-medium text-wtext-2 dark:text-rink-100 hover:bg-wbg dark:hover:bg-rink-700/50 transition-colors"
          >
            {MESSAGES.common.close}
          </button>
          <button
            type="button"
            onClick={onRelogin}
            className="flex-1 py-4 text-[15px] font-semibold text-white bg-ice-500 hover:bg-ice-600 transition-colors"
          >
            {MESSAGES.authGuard.reloginButton}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
