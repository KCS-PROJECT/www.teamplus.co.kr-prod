"use client";

/**
 * UnauthorizedToastListener (Admin)
 *
 * `teamplus-admin:api-unauthorized` 글로벌 이벤트를 구독하여 fixed 상단 배너로 안내한다.
 * - `apiLifecycle` onError 훅이 401 또는 AUTH_REQUIRED 감지 시 dispatch
 * - 로그인 페이지로 자동 이동 직전 잠깐 배너를 띄워 UX 연속성 확보
 *
 * Web 의 `UnauthorizedToastListener` 와 동일한 책임이며, Admin 은 별도 토스트
 * 라이브러리가 없으므로 자체 inline 배너로 처리한다. ToastProvider 도입 시
 * 본 컴포넌트를 toast.warning() 호출로 교체할 수 있다.
 *
 * 마운트: src/app/layout.tsx — 전역 ClientProviders 하위 1회.
 */

import { useEffect, useState, type ReactElement } from "react";

interface UnauthorizedEventDetail {
  requestId?: string;
  url?: string;
  code?: string;
  reason?: "required" | "expired" | string;
  message?: string;
}

const THROTTLE_MS = 3000;
const SHOW_DURATION_MS = 3000;

export function UnauthorizedToastListener(): ReactElement | null {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;

    let lastShownAt = 0;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<UnauthorizedEventDetail>).detail ?? {};
      const now = Date.now();
      if (now - lastShownAt < THROTTLE_MS) return;
      lastShownAt = now;

      // 로그인 페이지에서는 이미 reason 배너가 떠있으므로 중복 차단
      if (window.location.pathname.startsWith("/login")) return;

      const isExpired = detail.reason === "expired";
      setMessage(
        detail.message ??
          (isExpired
            ? "세션이 만료되었습니다. 다시 로그인해주세요."
            : "로그인이 필요합니다."),
      );
      setDescription("잠시 후 로그인 페이지로 이동합니다.");
      setVisible(true);

      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setVisible(false), SHOW_DURATION_MS);
    };

    window.addEventListener("teamplus-admin:api-unauthorized", handler);
    return () => {
      window.removeEventListener("teamplus-admin:api-unauthorized", handler);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed top-4 left-1/2 z-[9999] -translate-x-1/2 min-w-[280px] max-w-[480px] rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 shadow-lg"
    >
      <p className="text-sm font-bold text-amber-900">{message}</p>
      {description && (
        <p className="mt-0.5 text-xs text-amber-700">{description}</p>
      )}
    </div>
  );
}
