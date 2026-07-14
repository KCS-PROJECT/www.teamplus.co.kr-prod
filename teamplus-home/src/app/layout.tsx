import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { MotionProvider } from "@/components/providers/MotionProvider";
import { ActivityTracker } from "@/components/providers/ActivityTracker";
import { BRAND } from "@/lib/content";
import { JsonLd } from "@/components/seo/JsonLd";
import {
  SITE_URL,
  NAVER_SITE_VERIFICATION,
  SEO_KEYWORDS,
  organizationSchema,
  websiteSchema,
} from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${BRAND.name} · 아이스하키 클럽 통합 운영 플랫폼`,
    template: `%s | ${BRAND.name}`,
  },
  description: BRAND.descriptor,
  applicationName: BRAND.name,
  keywords: SEO_KEYWORDS,
  authors: [{ name: BRAND.name, url: SITE_URL }],
  creator: BRAND.legal.companyName,
  publisher: BRAND.legal.companyName,
  alternates: {
    canonical: "/",
  },
  formatDetection: {
    telephone: true,
    email: true,
    address: true,
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: SITE_URL,
    siteName: BRAND.name,
    title: `${BRAND.name} · 아이스하키 클럽 통합 운영 플랫폼`,
    description: BRAND.descriptor,
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND.name} · 아이스하키 클럽 통합 운영 플랫폼`,
    description: BRAND.descriptor,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  ...(NAVER_SITE_VERIFICATION
    ? {
        verification: {
          other: { "naver-site-verification": NAVER_SITE_VERIFICATION },
        },
      }
    : {}),
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
        {/* 전역 구조화 데이터 — 조직·사이트 정체성(GEO/AEO) */}
        <JsonLd data={[organizationSchema(), websiteSchema()]} />
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
