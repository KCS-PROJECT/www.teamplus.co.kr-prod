import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import '@/styles/globals.css';
import { ClientProviders } from '@/components/providers/ClientProviders';
import AuthSeedBootstrap from '@/components/AuthSeedBootstrap';
import TestRunnerBridge from '@/components/TestRunnerBridge';
import { CookieConsentBanner } from '@/components/legal/CookieConsentBanner';
import { GoogleAnalytics } from '@/components/analytics/GoogleAnalytics';
import { env } from '@/lib/env';

export const metadata: Metadata = {
  title: 'TEAMPLUS - 아이스하키 팀 관리',
  description: '아이스하키 팀을 위한 통합 관리 시스템',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  // userScalable 기본값(true) 유지 — 아동·시각 약자 WCAG AAA 접근성 보존
  //
  // viewportFit: 'cover' — WKWebView viewport 를 status bar / home indicator 까지
  // 확장하여 풀스크린 로더(LoadingPuck `fixed inset-0`)가 진짜 풀스크린으로 그려지게 한다.
  // 일반 페이지 콘텐츠가 status bar 영역을 침범하는 것은 globals.css body 의
  // `padding-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px))` 가 흡수 — Layered 처리:
  //   • body (padding) ← 일반 콘텐츠는 safe-area 안쪽에 배치
  //   • fixed inset-0  ← LoadingPuck 등 오버레이는 viewport 기준으로 풀스크린
  //   • env(safe-area-inset-*) 변수 활성화로 LoadingPuck 자체도 inner padding 자동 처리
  viewportFit: 'cover',
  // 라이트 모드 단일 강제 — OS prefers-color-scheme 무관 고정값.
  themeColor: '#f6f8fc',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ko"
      dir="ltr"
      className=""
      suppressHydrationWarning
    >
      <head>
        {/* Meta theme-color: 모바일 브라우저 상태바 색상 (라이트 고정).
            2026-05-07 v3: bg-wbg(#f6f8fc) 와 통일 — PWA standalone 모드에서 풀스크린
            로더 배경과 status bar 색이 일치하도록. */}
        <meta name="theme-color" content="#f6f8fc" />

        {/* 🎯 Backend API preconnect — DNS + TCP + TLS handshake 를 첫 API 호출 전에 미리 완료
            (평균 150~300ms 단축). crossOrigin='use-credentials' 로 쿠키 전송 허용. */}
        <link
          rel="preconnect"
          href={env.NEXT_PUBLIC_API_URL}
          crossOrigin="use-credentials"
        />
        <link
          rel="dns-prefetch"
          href={env.NEXT_PUBLIC_API_URL}
        />

        {/* Critical CSS: @font-face inline 선언 + 배경색 즉시 적용.
            ⚠️ preload <link> 는 의도적으로 제거됨 — Next.js dev HMR 이 CSS 를 분할 주입하면서
            "preloaded but not used" 경고를 억지로 유발하기 때문. font-display:block 이 FOUT
            (아이콘 이름 텍스트 노출)을 이미 차단하므로 preload 없이도 UX 손실 없음.
            재발 방지 참조: docs/Error/web/web-errors.md WEB-049 */}
        <style
          key="critical-css"
          dangerouslySetInnerHTML={{
            __html: `@font-face{font-family:'Material Symbols Outlined';font-style:normal;font-weight:100 700;font-display:block;src:url('/fonts/MaterialSymbolsOutlined.woff2') format('woff2')}html,body{background:#f8fafc;color:#0f172a;font-family:Pretendard,"Apple SD Gothic Neo",AppleSDGothicNeo-Regular,"Malgun Gothic","Noto Sans CJK KR",-apple-system,BlinkMacSystemFont,system-ui,sans-serif}`,
          }}
        />
        {/* v17 Anti-Flicker (SPEC §2.4, §2.5) — Theme FOUC 차단 강화.
            html 에 (dark|light) 클래스가 붙기 전·후 모두 즉시 SoT 배경색을 강제 적용해
            첫 paint ↔ ThemeProvider 동기화 사이 깜박임을 제거한다.
            - dark = #0a0d14 (puck 토큰)
            - light = #f6f8fc (wbg 토큰)
            - html:not(.dark):not(.light) = inline script 실행 이전 SSR fallback */}
        <style
          key="theme-bg-css"
          dangerouslySetInnerHTML={{
            __html: `html.dark, html.dark body { background-color: #0a0d14 !important; color-scheme: dark; } html.light, html.light body { background-color: #f6f8fc !important; color-scheme: light; } html:not(.dark):not(.light) body { background-color: #f6f8fc; color-scheme: light; }`,
          }}
        />
        {/* 라이트 모드 단일 강제 — 첫 페인트 직전 dark 잔재(localStorage·cookie·html class) 즉시 청소 */}
        <script
          key="theme-light-lock"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{document.documentElement.classList.remove('dark');document.documentElement.classList.add('light');localStorage.setItem('theme','light');document.cookie='theme=light;path=/;max-age=31536000;SameSite=Lax';var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content','#f8fafc');}catch(e){}})()`,
          }}
        />
        {/* Material Symbols 폰트 visibility 전환 스크립트 제거됨 — font-display:block이 웹 표준으로
            FOUT을 차단하며, JS 기반 visibility 토글은 SPOF를 만들어 아이콘 영구 숨김을 유발.
            재발 방지 참조: docs/Error/web/web-errors.md WEB-049 */}
      </head>
      {/* v17 Anti-Flicker (SPEC §2.4) — body SSR inline backgroundColor 으로 첫 paint 부터
          dark/light 캔버스 일치 보장. theme-light-lock 스크립트가 라이트로 강제 후에도
          동일 색상이라 깜박임 0. dark 토큰 #0a0d14 는 critical CSS (theme-bg-css) 가
          html.dark 시 !important 로 덮어쓴다 (SPEC §2.5). */}
      <body
        className="font-sans antialiased bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
        style={{ backgroundColor: '#f6f8fc' }}
        suppressHydrationWarning
      >
        {/* WCAG 2.4.1 Bypass Blocks — Skip to main content link.
            화면 낭독기·키보드 사용자가 BottomNav·AppBar 를 건너뛰고 본문으로 즉시 이동.
            기본 sr-only, focus 시 시각적 노출 (좌상단). */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-ice-500 focus:text-white focus:rounded-md focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2"
        >
          본문 바로가기
        </a>
        <AuthSeedBootstrap />
        <TestRunnerBridge />
        <ClientProviders>
          {children}
        </ClientProviders>
        {/* T-12 (2026-05-21): GDPR · ePrivacy 쿠키 동의 배너.
            첫 방문 시 1회 표시 후 localStorage 저장. necessary 외 카테고리는
            window 이벤트로 broadcast (T-13 GA4 등 조건부 활성화) */}
        <CookieConsentBanner />
        {/* T-13 (2026-05-22): GA4 — 4중 가드(env GA_ID + analytics consent +
            non-CHILD/TEEN + client) 모두 충족 시에만 스크립트 로드.
            가드 미충족이면 네트워크 요청 0 (return null). */}
        <GoogleAnalytics />
        {/* Kakao JavaScript SDK — SNS 공유 시트의 카카오톡 공유에 사용.
            키 미설정(NEXT_PUBLIC_KAKAO_JS_KEY 빈 값) 시 스크립트 자체를 로드하지 않아
            CSP 경고·불필요한 네트워크 요청을 회피한다. lib/kakao.ts 의 initKakao() 가
            호출 시점에 lazy 초기화를 수행한다. */}
        {env.NEXT_PUBLIC_KAKAO_JS_KEY ? (
          <Script
            src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js"
            crossOrigin="anonymous"
            strategy="afterInteractive"
          />
        ) : null}
      </body>
    </html>
  );
}
