"use client";

/**
 * GoogleAnalytics (T-13 — 2026-05-22 신규)
 *
 * GA4 + Firebase Analytics 통합 — 4중 가드 활성화.
 *
 * 활성 조건 (모두 충족 시에만 GA 스크립트 로드):
 *  1. `NEXT_PUBLIC_GA_ID` 환경변수 존재 (운영 키 발급 대기)
 *  2. T-12 쿠키 동의 — `hasCookieConsent('analytics') === true`
 *  3. 현재 로그인 사용자가 CHILD/TEEN 이 아님 (Apple 5.1.4 · COPPA · PIPA §22조의2)
 *  4. 클라이언트 환경 (SSR 차단)
 *
 * 조건 변화 시 동적 활성/비활성:
 *  - `teamplus:cookie-consent` CustomEvent 수신 → 동의 변경 시 즉시 반영
 *  - 사용자 로그인/로그아웃 → AuthContext userType 변화 즉시 반영
 *
 * 페이지 전환 시 자동 page_view 이벤트 — Next.js usePathname/useSearchParams 변경 추적.
 *
 * 사용:
 *  - layout.tsx 하단에 `<GoogleAnalytics />` 한 번만 마운트 (CookieConsentBanner 와 별개)
 */

import Script from "next/script";
import {
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { hasCookieConsent } from "@/components/legal/CookieConsentBanner";
import { AuthContext } from "@/contexts/AuthContext";

const CONSENT_EVENT = "teamplus:cookie-consent";

/**
 * GA4 활성화 가능 여부.
 * - env GA ID 존재 + analytics 카테고리 동의 + 미성년자(CHILD/TEEN) 아님.
 */
function shouldEnableGA(userType: string | null | undefined): boolean {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  if (!gaId) return false;
  if (!hasCookieConsent("analytics")) return false;
  // Apple 5.1.4 / PIPA — 미성년자 트래킹 금지
  if (userType === "CHILD" || userType === "TEEN") return false;
  return true;
}

/**
 * 외부 노출 컴포넌트 — `useSearchParams()` Suspense 경계 강제.
 *   Next.js 15+ 의 useSearchParams 는 Suspense 안에서 사용되지 않으면 빌드 경고.
 *   layout.tsx 에서는 `<GoogleAnalytics />` 한 줄만 추가하면 됨.
 */
export function GoogleAnalytics() {
  return (
    <Suspense fallback={null}>
      <GoogleAnalyticsInner />
    </Suspense>
  );
}

function GoogleAnalyticsInner() {
  // AuthProvider 외부에서도 안전 동작 — useContext null 체크.
  // layout.tsx 의 ClientProviders 밖에서 마운트될 수 있으므로 useAuth() throw 회피.
  const authCtx = useContext(AuthContext);
  const userType = authCtx?.user?.userType ?? null;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const gaId = process.env.NEXT_PUBLIC_GA_ID;

  // CookieConsent 변경 / Auth 변경 모두 반영하기 위한 토글 상태
  const [enabled, setEnabled] = useState<boolean>(() => shouldEnableGA(userType));

  // 쿠키 동의 이벤트 수신 → 가드 재계산
  useEffect(() => {
    const handler = () => setEnabled(shouldEnableGA(userType));
    window.addEventListener(CONSENT_EVENT, handler);
    return () => window.removeEventListener(CONSENT_EVENT, handler);
  }, [userType]);

  // 사용자 로그인/로그아웃 / userType 변경 → 가드 재계산
  useEffect(() => {
    setEnabled(shouldEnableGA(userType));
  }, [userType]);

  // 페이지 전환 시 page_view 이벤트 — gtag('event','page_view') 자동 전송.
  // NEXT_PUBLIC_GA_ID 가 있어도 가드 미충족이면 noop.
  const trackPageView = useCallback(() => {
    if (!enabled || !gaId) return;
    if (typeof window === "undefined") return;
    const w = window as unknown as {
      gtag?: (cmd: string, id: string, params?: Record<string, unknown>) => void;
    };
    w.gtag?.("config", gaId, {
      page_path: pathname ?? "/",
      page_search: searchParams?.toString() ?? "",
    });
  }, [enabled, gaId, pathname, searchParams]);

  useEffect(() => {
    trackPageView();
  }, [trackPageView]);

  // 가드 미충족 시 스크립트 자체를 로드하지 않음 (네트워크 요청 0).
  if (!enabled || !gaId) {
    return null;
  }

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
        strategy="afterInteractive"
      />
      <Script
        id="ga4-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            window.gtag = gtag;
            gtag('js', new Date());
            // 익명 IP + CHILD/TEEN 자동 비활성은 본 컴포넌트의 가드로 처리됨.
            gtag('config', '${gaId}', {
              anonymize_ip: true,
              send_page_view: true,
            });
          `,
        }}
      />
    </>
  );
}

export default GoogleAnalytics;
