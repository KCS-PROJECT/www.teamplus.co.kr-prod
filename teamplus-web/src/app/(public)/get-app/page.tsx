'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { MobileContainer } from '@/components/layout/MobileContainer';
import { Icon } from '@/components/ui/Icon';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { MESSAGES } from '@/lib/messages';
import {
  detectPlatform,
  getAllStoreUrls,
  type AppInstallPlatform,
} from '@/lib/app-install';
import { isNativeApp } from '@/lib/environment';
import { cn } from '@/lib/utils';

/**
 * /get-app — 앱 설치 안내 페이지
 *
 * 진입 경로:
 *   1. 사용자가 직접 URL 입력
 *   2. AppInstallBanner "앱 받기" 버튼
 *   3. Deeplink fallback (`teamplus://` 실패 시 자동 이동)
 *   4. 카카오톡 등 외부 공유 링크의 fallback URL
 *
 * 동작:
 *   - 마운트 시 User-Agent 로 OS 자동 감지
 *   - 감지된 OS 버튼을 강조하되, 다른 OS 도 항상 선택 가능 (PC 사용자 대응)
 *   - 네이티브 WebView 환경이면 의미가 없으므로 홈으로 redirect
 *   - `?redirect=` 쿼리 보존 — 앱 설치 후 첫 진입 시 deferred deeplink 처리 (별도 SDK 필요)
 */
export default function GetAppPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [platform, setPlatform] = useState<AppInstallPlatform>('other');
  const [mounted, setMounted] = useState(false);

  useNativeUI({ showStatusBar: true, showAppBar: false, showBottomNav: false });

  // OS 감지는 클라이언트 사이드에서만 (SSR 안전)
  useEffect(() => {
    // 이미 앱 안이면 홈으로 (잘못된 진입 차단)
    if (isNativeApp()) {
      router.replace('/');
      return;
    }
    setPlatform(detectPlatform());
    setMounted(true);
  }, [router]);

  usePageReady(mounted);

  // 스토어 URL — referrer 에 redirect 쿼리 포함 (Android install referrer 활용)
  const redirectParam = searchParams?.get('redirect') ?? '';
  const storeUrls = useMemo(
    () => getAllStoreUrls({ referrer: redirectParam || undefined }),
    [redirectParam],
  );

  const isIos = platform === 'ios';
  const isAndroid = platform === 'android';
  const isOther = platform === 'other';

  return (
    <MobileContainer
      hasBottomNav={false}
      className="bg-wbg dark:bg-rink-900"
      ariaLabel="앱 설치 안내"
    >
      <div className="flex flex-col min-h-full px-5 pt-10 pb-8">
        {/* Hero */}
        <section className="flex flex-col items-center text-center pt-6 pb-8">
          <AppMarkIllustration />
          <h1 className="mt-7 text-w-h2 font-bold text-wtext-1 dark:text-white">
            {MESSAGES.appInstall.pageTitle}
          </h1>
          <p className="mt-3 text-w-body text-wtext-3 dark:text-slate-400 leading-relaxed max-w-xs">
            {MESSAGES.appInstall.pageSubtitle}
          </p>
          {!isOther && mounted && (
            <p className="mt-4 text-w-small text-ice-500 font-medium">
              {MESSAGES.appInstall.detectedHint(isIos ? 'iOS' : 'Android')}
            </p>
          )}
        </section>

        {/* 스토어 선택 카드 */}
        <section
          className="bg-white dark:bg-rink-800 rounded-w-2xl p-5 shadow-sh-1"
          aria-label={MESSAGES.appInstall.chooseDevice}
        >
          {isOther && (
            <div className="mb-4 pb-4 border-b border-wline dark:border-rink-800/60">
              <h2 className="text-w-body font-semibold text-wtext-1 dark:text-white">
                {MESSAGES.appInstall.otherDeviceTitle}
              </h2>
              <p className="mt-1 text-w-small text-wtext-3 dark:text-slate-400 leading-relaxed">
                {MESSAGES.appInstall.otherDeviceDescription}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <StoreButton
              href={storeUrls.ios}
              label={MESSAGES.appInstall.iosButton}
              deviceLabel={MESSAGES.appInstall.chooseDeviceIos}
              icon={<AppleIcon />}
              highlighted={isIos}
            />
            <StoreButton
              href={storeUrls.android}
              label={MESSAGES.appInstall.androidButton}
              deviceLabel={MESSAGES.appInstall.chooseDeviceAndroid}
              icon={<PlayIcon />}
              highlighted={isAndroid}
            />
          </div>
        </section>

        {/* 웹 계속 이용 — 보조 액션 */}
        <div className="mt-auto pt-8 flex justify-center">
          <button
            type="button"
            onClick={() => {
              const target = redirectParam && redirectParam.startsWith('/')
                ? redirectParam
                : '/';
              router.push(target);
            }}
            className="text-w-small text-wtext-3 dark:text-slate-400 underline underline-offset-4 decoration-wline-2 dark:decoration-rink-800 hover:text-wtext-1 dark:hover:text-white transition-colors"
          >
            {MESSAGES.appInstall.continueWeb}
          </button>
        </div>
      </div>
    </MobileContainer>
  );
}

/* ─────────────────────────────────────────────────────────── */

interface StoreButtonProps {
  href: string;
  label: string;
  deviceLabel: string;
  icon: React.ReactNode;
  highlighted: boolean;
}

function StoreButton({
  href,
  label,
  deviceLabel,
  icon,
  highlighted,
}: StoreButtonProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'group flex items-center gap-4 rounded-w-xl px-4 py-4 transition-colors',
        highlighted
          ? 'bg-ice-500 text-white hover:bg-ice-600 active:bg-ice-600'
          : 'bg-wbg dark:bg-rink-900 text-wtext-1 dark:text-white hover:bg-wline-2 dark:hover:bg-rink-800/80',
      )}
      aria-label={`${deviceLabel} — ${label}`}
    >
      <span
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-w-lg',
          highlighted
            ? 'bg-white/15 text-white'
            : 'bg-white dark:bg-rink-800 text-wtext-1 dark:text-white',
        )}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="flex-1 text-left">
        <span
          className={cn(
            'block text-w-caption',
            highlighted ? 'text-white/80' : 'text-wtext-3 dark:text-slate-400',
          )}
        >
          {deviceLabel}
        </span>
        <span className="block text-w-body font-semibold">{label}</span>
      </span>
      <Icon
        name="chevron_right"
        className={cn(
          'transition-transform group-hover:translate-x-0.5 text-xl',
          highlighted ? 'text-white/80' : 'text-wtext-4 dark:text-slate-500',
        )}
        aria-hidden="true"
      />
    </a>
  );
}

/* ─────────────────────────────────────────────────────────── */
/* 일러스트 + 아이콘 — currentColor 기반, 외부 의존성 없음                   */

function AppMarkIllustration() {
  return (
    <div className="flex h-32 w-32 items-center justify-center rounded-w-2xl bg-white dark:bg-rink-800 shadow-sh-2">
      <svg
        viewBox="0 0 96 96"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="h-20 w-20 text-ice-500"
      >
        {/* App tile background */}
        <rect x="8" y="8" width="80" height="80" rx="20" fill="currentColor" opacity="0.1" />
        {/* Stick + puck mark */}
        <g fill="currentColor">
          <rect x="38" y="22" width="6" height="48" rx="3" transform="rotate(-18 41 46)" />
          <path d="M30 60 Q 22 70 22 76 L 56 76 L 56 66 Z" opacity="0.85" />
          <ellipse cx="64" cy="72" rx="10" ry="3.5" />
        </g>
      </svg>
    </div>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true" fill="currentColor">
      <path d="M16.365 1.43c0 1.14-.46 2.27-1.214 3.08-.79.84-2.06 1.47-3.1 1.38-.13-1.11.45-2.27 1.18-3.04C14.06 1.97 15.4 1.42 16.365 1.43zM20.5 17.32c-.49 1.12-.72 1.62-1.36 2.61-.89 1.39-2.14 3.12-3.69 3.13-1.38.02-1.74-.9-3.62-.89-1.88.01-2.27.91-3.66.89-1.55-.03-2.74-1.59-3.63-2.98C2.07 16.5 1.81 11.78 3.5 9.32c1.21-1.77 3.11-2.8 4.9-2.8 1.81 0 2.96.99 4.45.99 1.45 0 2.34-.99 4.43-.99 1.6 0 3.29.87 4.5 2.37-3.95 2.17-3.31 7.85-1.28 8.43z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <path d="M3.5 2.5v19l8.5-9.5-8.5-9.5z" fill="currentColor" opacity="0.65" />
      <path d="M3.5 2.5 17 11l4.5-3.5-14-7L3.5 2.5z" fill="currentColor" opacity="0.85" />
      <path d="M3.5 21.5 17 13l4.5 3.5-14 7-4-2z" fill="currentColor" opacity="0.85" />
      <path d="M17 11l4.5-3.5L21.5 16.5 17 13l-5.5-1z" fill="currentColor" />
    </svg>
  );
}
