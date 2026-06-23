"use client";

/**
 * SessionExpiredGate
 *
 * `teamplus:api-unauthorized`(reason=expired) 이벤트를 구독하여
 * 세션 만료 시 `SessionExpiredModal`(자동 로그아웃 안내)을 표시한다.
 * - `required`(미인증 접근)는 기존 토스트 + 자동 리다이렉트가 처리한다.
 * - 공개 진입점(splash/onboarding/signup/identity/login)에서는 모달을 띄우지 않는다.
 *
 * ToastProvider 하위에서 1회만 마운트한다.
 */

import { useCallback, useEffect, useState } from "react";
import { SessionExpiredModal } from "./SessionExpiredModal";

/** 모달을 띄우지 않는 공개 진입점 */
function isPublicEntryPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return (
    pathname.startsWith("/login") ||
    pathname.startsWith("/splash") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/identity")
  );
}

export function SessionExpiredGate() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = (e: Event) => {
      const detail =
        (e as CustomEvent<{ reason?: string }>).detail ?? {};
      // 세션 만료만 모달로 안내 (required 는 토스트/리다이렉트가 담당)
      if (detail.reason !== "expired") return;
      if (isPublicEntryPath(window.location.pathname)) return;
      setIsOpen(true);
    };

    window.addEventListener("teamplus:api-unauthorized", handler);
    return () =>
      window.removeEventListener("teamplus:api-unauthorized", handler);
  }, []);

  const handleClose = useCallback(() => setIsOpen(false), []);

  const handleRelogin = useCallback(() => {
    const { pathname, search } = window.location;
    const redirect = encodeURIComponent(`${pathname}${search}`);
    window.location.href = `/login?redirect=${redirect}&reason=expired`;
  }, []);

  return (
    <SessionExpiredModal
      isOpen={isOpen}
      onClose={handleClose}
      onRelogin={handleRelogin}
    />
  );
}
