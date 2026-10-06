"use client";

/**
 * SessionExpiredGate
 *
 * `teamplus:api-unauthorized`(reason=expired|replaced) 이벤트를 구독하여
 * 세션 만료(expired) 또는 다른 기기 로그인에 의한 강제 종료(replaced) 시
 * `SessionExpiredModal`(자동 로그아웃 안내)을 원인별 문구로 표시한다.
 * - `required`(미인증 접근)는 기존 토스트 + 자동 리다이렉트가 처리한다.
 * - 공개 진입점(splash/onboarding/signup/identity/login)에서는 모달을 띄우지 않는다.
 *
 * ToastProvider 하위에서 1회만 마운트한다.
 */

import { useCallback, useEffect, useState } from "react";
import {
  SessionExpiredModal,
  type SessionExpiredVariant,
} from "./SessionExpiredModal";

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
  const [variant, setVariant] = useState<SessionExpiredVariant>("expired");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = (e: Event) => {
      const detail =
        (e as CustomEvent<{ reason?: string }>).detail ?? {};
      // 세션 만료·강제 종료만 모달로 안내 (required 는 토스트/리다이렉트가 담당)
      if (detail.reason !== "expired" && detail.reason !== "replaced") return;
      if (isPublicEntryPath(window.location.pathname)) return;
      setVariant(detail.reason);
      setIsOpen(true);
    };

    window.addEventListener("teamplus:api-unauthorized", handler);
    return () =>
      window.removeEventListener("teamplus:api-unauthorized", handler);
  }, []);

  const handleRelogin = useCallback(() => {
    const { pathname, search } = window.location;
    // 안내가 뜬 뒤 이미 로그인 화면으로 넘어간 경우, 현재 주소를 그대로 넣으면 redirect 가
    // 로그인 화면 자신을 가리킨다. 그때는 그 주소가 들고 있던 원래 목적지를 이어 쓴다
    // (외부·비정상 경로 거부는 로그인 화면의 safeRedirectTarget 이 맡는다).
    const target = pathname.startsWith("/login")
      ? new URLSearchParams(search).get("redirect")
      : `${pathname}${search}`;
    const redirectQuery = target ? `redirect=${encodeURIComponent(target)}&` : "";
    window.location.href = `/login?${redirectQuery}reason=${variant}`;
  }, [variant]);

  return (
    <SessionExpiredModal
      isOpen={isOpen}
      variant={variant}
      onRelogin={handleRelogin}
    />
  );
}
