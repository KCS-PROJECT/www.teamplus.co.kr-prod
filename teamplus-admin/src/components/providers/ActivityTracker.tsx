"use client";

/**
 * ActivityTracker — teamplus-web (v8.6, 2026-05-20)
 *
 * 클라이언트 활동(PAGE_VIEW · CLICK · global error · beforeunload flush)을
 * activity-collector를 통해 서버 파일에 기록.
 *
 * 통합 지점: ClientProviders.tsx에 <ActivityTracker /> 삽입.
 *
 * 클릭 추적 가드 — opt-in: data-track-id="someId" 속성이 있는 요소만 캡처.
 * (지문 채취 회피 · 사용자 동의 가능 범위 명확화)
 */

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  activityCollector,
  trackClientError,
  trackPageView,
} from "@/lib/activity-collector";

export function ActivityTracker(): null {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // PAGE_VIEW — 경로 변경마다
  useEffect(() => {
    if (!pathname) return;
    trackPageView({
      pathname,
      search: searchParams?.toString() ?? "",
      referrer: typeof document !== "undefined" ? document.referrer : undefined,
    });
  }, [pathname, searchParams]);

  // CLICK — capture phase + data-track-id 가진 요소만
  useEffect(() => {
    if (typeof document === "undefined") return;
    const handler = (ev: Event) => {
      try {
        const target = ev.target as HTMLElement | null;
        if (!target || typeof target.closest !== "function") return;
        const el = target.closest("[data-track-id]") as HTMLElement | null;
        if (!el) return;
        const trackId = el.getAttribute("data-track-id");
        if (!trackId) return;
        activityCollector.collect({
          ts: new Date().toISOString(),
          category: "activity",
          action: "CLICK",
          resource: trackId,
          message: `CLICK ${trackId}`,
          meta: {
            tag: el.tagName,
            href: (el as HTMLAnchorElement).href,
            text: el.textContent?.trim().slice(0, 50),
          },
        });
      } catch {
        /* swallow */
      }
    };
    document.addEventListener("click", handler, { capture: true });
    return () => document.removeEventListener("click", handler, { capture: true });
  }, []);

  // 글로벌 에러 — window.onerror + unhandledrejection
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onError = (event: ErrorEvent) => {
      try {
        trackClientError(event.error ?? new Error(event.message), {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        });
      } catch {
        /* swallow */
      }
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      try {
        const err =
          event.reason instanceof Error
            ? event.reason
            : new Error(String(event.reason));
        trackClientError(err, { type: "unhandledrejection" });
      } catch {
        /* swallow */
      }
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  // beforeunload — 잔여 큐 sendBeacon flush
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      activityCollector.flushBeacon();
    };
    window.addEventListener("beforeunload", handler);
    window.addEventListener("pagehide", handler);
    return () => {
      window.removeEventListener("beforeunload", handler);
      window.removeEventListener("pagehide", handler);
    };
  }, []);

  return null;
}
