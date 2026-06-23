import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { MotionProvider } from "@/components/providers/MotionProvider";
import { ActivityTracker } from "@/components/providers/ActivityTracker";
import { BRAND } from "@/lib/content";

export const metadata: Metadata = {
  metadataBase: new URL("https://teamplus.kr"),
  title: {
    default: `${BRAND.name} · 아이스하키 클럽 통합 운영 플랫폼`,
    template: `%s | ${BRAND.name}`,
  },
  description: BRAND.descriptor,
  keywords: [
    "아이스하키",
    "클럽 관리",
    "회원 관리",
    "QR 출석",
    "결제 크레딧",
    "알림톡",
    "KG이니시스",
    "SaaS",
    "팀플러스+",
    "팀플러스",
    "TEAMPLUS",
  ],
  authors: [{ name: "팀플러스+" }],
  creator: "팀플러스+",
  publisher: "팀플러스+",
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: "https://teamplus.kr",
    siteName: BRAND.name,
    title: `${BRAND.name} · ${BRAND.tagline}`,
    description: BRAND.descriptor,
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND.name} · ${BRAND.tagline}`,
    description: BRAND.descriptor,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#05060B",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className="dark scroll-smooth">
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50
            focus:rounded-lg focus:bg-ice-500 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold"
        >
          본문 바로가기
        </a>
        <MotionProvider>
          <Header />
          <main id="main" className="relative z-10">
            {children}
          </main>
          <Footer />
          {/* v8.6 (2026-05-20) — 통합 로깅 시스템 클라이언트 활동 추적 */}
          <Suspense fallback={null}>
            <ActivityTracker />
          </Suspense>
        </MotionProvider>
      </body>
    </html>
  );
}
