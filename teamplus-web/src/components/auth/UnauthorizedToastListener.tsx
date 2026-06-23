"use client";

/**
 * UnauthorizedToastListener
 *
 * `teamplus:api-unauthorized` 글로벌 이벤트를 구독하여 토스트로 안내한다.
 * - `apiLifecycle` onError 훅이 401 또는 AUTH_REQUIRED 감지 시 dispatch
 * - 로그인 페이지로 자동 이동이 일어나기 전에 잠깐 토스트를 띄워 UX 연속성 확보
 *
 * ToastProvider 하위에서 1회만 마운트하면 충분.
 */

import { useEffect } from "react";
import { useToast } from "@/components/ui/Toast";
import { MESSAGES } from "@/lib/messages";

interface UnauthorizedEventDetail {
  requestId?: string;
  url?: string;
  code?: string;
  reason?: "required" | "expired" | string;
  message?: string;
}

export function UnauthorizedToastListener(): null {
  const { toast } = useToast();

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 동일 인증 이벤트가 연속 발사되어도 토스트가 한 번만 뜨도록 스로틀
    let lastShownAt = 0;
    const THROTTLE_MS = 3000;

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<UnauthorizedEventDetail>).detail ?? {};

      // 세션 만료(expired)는 SessionExpiredModal(자동 로그아웃 안내)이 담당하므로
      // 토스트를 중복 표시하지 않는다. required(미인증 접근)만 토스트로 안내.
      if (detail.reason === "expired") return;

      const now = Date.now();
      if (now - lastShownAt < THROTTLE_MS) return;
      lastShownAt = now;

      // 로그인 페이지에서는 이미 reason 배너가 떠 있으므로 중복 표시 금지
      if (window.location.pathname.startsWith("/login")) return;

      const message = detail.message ?? MESSAGES.authGuard.required;

      toast.warning(message, {
        description: MESSAGES.authGuard.redirectingToLogin,
      });
    };

    window.addEventListener("teamplus:api-unauthorized", handler);
    return () =>
      window.removeEventListener("teamplus:api-unauthorized", handler);
  }, [toast]);

  return null;
}
