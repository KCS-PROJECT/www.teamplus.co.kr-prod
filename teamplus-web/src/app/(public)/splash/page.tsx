'use client';

import { useEffect } from 'react';
import { useNavigation } from '@/components/ui/NavLink';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { MESSAGES } from '@/lib/messages';

export default function SplashPage() {
  usePageReady(true); // 정적 페이지 — 마운트 즉시 ready
  const { navigate } = useNavigation();

  // [appbar-harness-v3 분류 D] 의도적 풀스크린 (스플래시).
  //   showAppBar:false + showStatusBar:true 명시 — 본문이 status-bar 영역 침범 안 함.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate('/onboarding');
    }, 2500);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <MobileContainer hasBottomNav={false} className="bg-it-blue-900">
      {/* ICETIMES 스플래시 — navy 풀블리드 + 흰 라운드 로고(빨강 arm) + TEAMPLUS 워드마크.
          시안 SoT: backdata/teamplus_하우머치스타일/ui_kits/auth/Splash.jsx */}
      <main className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden px-8">
        {/* 로고 — rx11 흰 라운드 사각형, 빨강 arm = it-red-500 */}
        <svg
          width="84"
          height="84"
          viewBox="0 0 40 40"
          fill="none"
          role="img"
          aria-label={MESSAGES.auth.brand.wordmark}
          className="relative motion-safe:animate-fade-in motion-reduce:animate-none"
        >
          <rect width="40" height="40" rx="11" fill="#ffffff" />
          <rect x="17.3" y="8" width="5.4" height="24" rx="2.7" fill="#14224f" />
          <rect x="8" y="17.3" width="12.4" height="5.4" rx="2.7" fill="#14224f" />
          <rect x="20.2" y="17.3" width="11.8" height="5.4" rx="2.7" fill="#c8202e" />
        </svg>

        {/* 워드마크 — TEAMPLUS 32px / 800 / -0.035em (시안 Splash.jsx L15) */}
        <div className="mt-[26px] text-[32px] font-extrabold leading-none tracking-[-0.035em] text-white">
          {MESSAGES.auth.brand.wordmark}
        </div>

        {/* 서브 카피 — 14px / 500 / -0.01em / white .66 (시안 L16) */}
        <p className="mt-2.5 text-[14px] font-medium tracking-[-0.01em] text-white/[.66]">
          {MESSAGES.auth.brand.tagline}
        </p>

        {/* 3 dots — 로딩 인디케이터 */}
        <div
          className="absolute bottom-16 flex gap-2"
          role="progressbar"
          aria-label="앱 로딩 중"
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-w-pill bg-white/45 motion-safe:animate-pulse motion-reduce:animate-none"
              style={{ animationDelay: `${i * 0.18}s` }}
            />
          ))}
        </div>

        {/* 하단 — ICE HOCKEY CLUB OS */}
        <div className="absolute bottom-7 text-[11.5px] font-semibold tracking-[0.04em] text-white/40">
          {MESSAGES.auth.brand.footer}
        </div>
      </main>
    </MobileContainer>
  );
}
