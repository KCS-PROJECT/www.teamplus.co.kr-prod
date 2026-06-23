import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import AuthSeedBootstrap from "@/components/AuthSeedBootstrap";
import TestRunnerBridge from "@/components/TestRunnerBridge";
import { UnauthorizedToastListener } from "@/components/auth/UnauthorizedToastListener";
import { ActivityTracker } from "@/components/providers/ActivityTracker";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "TEAMPLUS - 팀플러스",
  description: "아이스 하키 클럽 관리 플랫폼",
  keywords: [
    "아이스하키",
    "클럽 관리",
    "출석 관리",
    "결제 관리",
    "TEAMPLUS",
    "팀플러스",
  ],
  authors: [{ name: "TEAMPLUS" }],
  creator: "TEAMPLUS",
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    title: "TEAMPLUS - 팀플러스",
    description: "아이스 하키 클럽 관리 플랫폼",
    siteName: "TEAMPLUS",
    locale: "ko_KR",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#1E40AF",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 서버사이드에서 쿠키를 읽어 테마 결정 (FOUC 방지)
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get("teamplus_theme");
  const isDark = themeCookie?.value === "dark";

  return (
    <html
      lang="ko"
      className={isDark ? "dark" : ""}
      style={{ background: isDark ? "#0f172a" : "#f8fafc" }}
      suppressHydrationWarning
    >
      <head>
        {/* 🎯 Backend API preconnect — DNS+TCP+TLS 미리 확보 (150-300ms 단축) */}
        <link
          rel="preconnect"
          href={env.API_ORIGIN}
          crossOrigin="use-credentials"
        />
        <link rel="dns-prefetch" href={env.API_ORIGIN} />
        {/* Critical CSS: 외부 CSS 로드 전에 배경색 즉시 적용 */}
        <style
          dangerouslySetInnerHTML={{
            __html: `html{background:${isDark ? "#0f172a" : "#f8fafc"}}body{background:${isDark ? "#0f172a" : "#f8fafc"};color:${isDark ? "#f8fafc" : "#171717"}}`,
          }}
        />
        {/* Fallback: localStorage 기반 테마 (쿠키가 없는 첫 방문자용) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(!document.cookie.includes('teamplus_theme')){var t=localStorage.getItem('teamplus_theme');var d=t==='dark'||(!t&&matchMedia('(prefers-color-scheme:dark)').matches);if(d){document.documentElement.classList.add('dark');document.documentElement.style.background='#0f172a';document.body.style.background='#0f172a';document.cookie='teamplus_theme=dark;path=/;max-age=31536000'}else{document.cookie='teamplus_theme=light;path=/;max-age=31536000'}}}catch(e){}})()`,
          }}
        />
      </head>
      <body
        className="bg-slate-50 dark:bg-slate-900 text-neutral-900 dark:text-white"
        suppressHydrationWarning
      >
        <AuthSeedBootstrap />
        <TestRunnerBridge />
        {/* [2026-05-13 Phase D-1] 401/AUTH_REQUIRED 발생 시 상단 배너로 알림.
            apiLifecycle onError 가 `teamplus-admin:api-unauthorized` 를 dispatch. */}
        <UnauthorizedToastListener />
        {/* v8.6 (2026-05-20) — 통합 로깅 시스템 클라이언트 활동 추적 */}
        <Suspense fallback={null}>
          <ActivityTracker />
        </Suspense>
        {/* [2026-06-07 D-2] 글로벌 QueryClient — 전 대시보드 캐시 공유 */}
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
