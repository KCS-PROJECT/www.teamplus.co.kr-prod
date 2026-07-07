"use client";

/**
 * SessionExpiredModal — 자동 로그아웃 안내 모달
 *
 * 세션 만료(401 expired) 또는 다른 기기 로그인에 의한 강제 종료(replaced)로
 * 자동 로그아웃될 때 표시한다. `SessionExpiredGate` 가
 * `teamplus:api-unauthorized`(reason=expired|replaced) 이벤트를 받아
 * 노출 여부와 variant 를 제어한다.
 *
 * - "재로그인" 단일 버튼 → onRelogin: 로그인 페이지로 이동 (redirect 로 보던 화면 복귀)
 *   세션이 죽은 상태로 화면에 잔류하는 함정을 막기 위해 닫기 버튼은 두지 않는다.
 *
 * web 에 마운트되므로 Flutter WebView(app) 안에서도 그대로 표시된다.
 */

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/scroll-lock";
import { useNativeScrim } from "@/hooks/useNativeScrim";
import { MESSAGES } from "@/lib/messages";

export type SessionExpiredVariant = "expired" | "replaced";

interface SessionExpiredModalProps {
  isOpen: boolean;
  /** expired = 세션 만료(기본) · replaced = 다른 기기 로그인으로 강제 종료 */
  variant?: SessionExpiredVariant;
  onRelogin: () => void;
}

export function SessionExpiredModal({
  isOpen,
  variant = "expired",
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
            {variant === "replaced"
              ? MESSAGES.authGuard.sessionReplacedTitle
              : MESSAGES.authGuard.autoLogoutTitle}
          </h2>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-wtext-3 dark:text-rink-300">
            {variant === "replaced"
              ? MESSAGES.authGuard.sessionReplacedMessage
              : MESSAGES.authGuard.autoLogoutMessage}
          </p>
        </div>

        {/* 버튼 — 재로그인 단일 CTA (닫기 없음: 죽은 세션 잔류 차단) */}
        <div className="flex border-t border-wline dark:border-rink-700">
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
