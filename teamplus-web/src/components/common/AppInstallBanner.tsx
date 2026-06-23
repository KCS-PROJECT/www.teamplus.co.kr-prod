'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

import { MESSAGES } from '@/lib/messages';
import {
  detectPlatform,
  dismissInstallBanner,
  shouldShowInstallBanner,
} from '@/lib/app-install';

/**
 * 모바일 웹 사용자에게 앱 설치를 권유하는 상단 슬림 배너.
 *
 * 노출 조건 (모두 충족):
 *   - 클라이언트 사이드
 *   - Flutter WebView 가 아님 (이미 앱 안에서는 의미 없음)
 *   - 모바일 UA (iOS / Android)
 *   - 7일 이내 dismiss 한 적 없음
 *   - 현재 경로가 `/get-app` 자체가 아님 (자기참조 방지)
 *
 * 마운트 위치: `ClientProviders` 최상위 — 모든 페이지 공통 노출.
 *
 * 디자인:
 *   - 상단 56px 슬림 배너 (콘텐츠 최소 침범)
 *   - 좌측 작은 앱 마크 + 텍스트
 *   - 우측 "앱 받기" CTA + X 닫기
 *   - gradient/blur/colored-shadow 금지 (TEAMPLUS 디자인 시스템)
 */
export function AppInstallBanner() {
  const router = useRouter();
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // /get-app 페이지 자체에서는 노출 X
    if (pathname === '/get-app' || pathname?.startsWith('/get-app/')) {
      setVisible(false);
      return;
    }
    setVisible(shouldShowInstallBanner());
  }, [pathname]);

  if (!visible) return null;

  const handleInstall = () => {
    // 현재 경로를 redirect 로 전달 — 앱 설치 후 deferred deeplink 처리 가능
    const redirect = pathname && pathname !== '/' ? pathname : '';
    const target = redirect
      ? `/get-app?redirect=${encodeURIComponent(redirect)}`
      : '/get-app';
    router.push(target);
  };

  const handleDismiss = () => {
    dismissInstallBanner();
    setVisible(false);
  };

  return (
    <div
      role="region"
      aria-label={MESSAGES.appInstall.bannerTitle}
      className="sticky top-0 z-30 bg-rink-800 dark:bg-rink-900 text-white border-b border-rink-700/30"
      style={{
        // status-bar safe-area 위로 자연스럽게 확장 (status bar 영역 동일 색상)
        paddingTop: 'var(--safe-area-inset-top, env(safe-area-inset-top, 0px))',
      }}
    >
      <div className="flex items-center gap-3 px-4 py-2.5">
        {/* App mark */}
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-w-lg bg-ice-500 text-white"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
            <rect x="3" y="3" width="18" height="18" rx="5" opacity="0.18" />
            <rect
              x="10"
              y="6"
              width="2.4"
              height="11"
              rx="1.2"
              transform="rotate(-18 11.2 11.5)"
            />
            <path d="M7.5 15 Q 5 17.5 5 19 L 14 19 L 14 16.8 Z" opacity="0.85" />
            <ellipse cx="17" cy="18" rx="2.8" ry="1" />
          </svg>
        </span>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-w-small font-semibold leading-tight">
            {MESSAGES.appInstall.bannerTitle}
          </p>
          <p className="text-w-caption text-white/70 leading-tight truncate">
            {MESSAGES.appInstall.bannerDescription}
          </p>
        </div>

        {/* CTA */}
        <button
          type="button"
          onClick={handleInstall}
          className="shrink-0 rounded-w-pill bg-ice-500 px-3.5 py-1.5 text-w-caption font-semibold text-white hover:bg-ice-600 active:bg-ice-700 transition-colors"
          data-track-id="app-install-banner:cta"
        >
          {MESSAGES.appInstall.bannerCta}
        </button>

        {/* Dismiss */}
        <button
          type="button"
          onClick={handleDismiss}
          aria-label={MESSAGES.appInstall.bannerDismissAria}
          className="shrink-0 flex h-8 w-8 items-center justify-center rounded-w-pill text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          data-track-id="app-install-banner:dismiss"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/**
 * Banner 노출 여부를 외부에서 조회할 때 사용 (예: MobileContainer 상단 패딩 조정).
 * 현재는 sticky 배너이므로 별도 레이아웃 조정 불필요 — 자체 height 차지.
 */
export { detectPlatform };
