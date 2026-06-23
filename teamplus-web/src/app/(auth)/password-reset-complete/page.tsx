'use client';

import { useNavigation } from '@/components/ui/NavLink';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { Icon } from '@/components/ui/Icon';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';

export default function PasswordResetCompletePage() {
  usePageReady(true); // 정적 페이지 — 마운트 즉시 ready
  const { navigate } = useNavigation();

  // appbar-harness-v2 Step E (admin-agent · 2026-05-12) —
  //   완료/성공 페이지는 풀스크린 의도이나 status bar 영역은 **반드시 노출**.
  //   AppBar/BottomNav 는 페이지 자체가 일러스트레이션과 하단 CTA 로 구성되므로 숨김.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
  });

  const handleGoToLogin = () => {
    navigate('/login');
  };

  return (
    <MobileContainer hasBottomNav={false} className="bg-wbg dark:bg-rink-900">
      {/*
        [2026-05-12] Status Bar Spacer 하드코딩(h-6=24px) 제거.
        MobileContainer 가 outer fixed 컨테이너에 `paddingTop: var(--safe-area-inset-top, env())`
        을 적용하므로 모든 iPhone/Android 기기에서 동적으로 정확한 status bar 영역이 확보된다.
        하드코딩 spacer 는 iPhone 14 Pro (Dynamic Island 59px) 등에서 부족하거나
        Android Pixel (status bar 24px) 에서 과도한 여백을 야기해 회귀가 잦았다.
      */}

      {/* Main Content Area */}
      <main
        data-no-enter
        className="flex-1 flex flex-col items-center justify-center px-6 pb-30 relative w-full"
        aria-labelledby="reset-complete-title"
      >
        {/* Decorative Background Element */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-ice-500/5 rounded-w-pill -z-10 pointer-events-none" />

        {/* Hero Icon Section */}
        <div className="flex flex-col items-center gap-8 animate-in fade-in zoom-in duration-500 motion-reduce:animate-none">
          {/* Icon Container */}
          <div className="relative group" aria-hidden="true">
            {/* Outer Ring with Pulse */}
            <div className="absolute inset-0 bg-ice-500/10 rounded-w-pill scale-150 animate-pulse motion-reduce:animate-none" />
            {/* Main Circle */}
            <div className="relative w-24 h-24 rounded-w-pill bg-ice-500/10 flex items-center justify-center shadow-[0_20px_40px_-15px_rgba(30,63,174,0.15)] ring-1 ring-ice-500/20">
              <Icon
                name="check"
                className="text-ice-500 text-5xl select-none"
                filled
                weight={600}
              />
            </div>
          </div>

          {/* Text Content */}
          <div className="flex flex-col gap-3 text-center max-w-[280px]">
            <h1 id="reset-complete-title" className="text-2xl font-bold tracking-tight text-wtext-1 dark:text-white leading-tight">
              비밀번호가
              <br />
              변경되었습니다!
            </h1>
            <p className="text-wtext-3 dark:text-rink-300 text-[15px] font-normal leading-relaxed">
              이제 새로운 비밀번호로 안전하게
              <br />
              서비스를 이용해 보세요.
            </p>
          </div>
        </div>
      </main>

      {/* Bottom Action Area */}
      <div className="w-full px-6 pb-8 bg-wbg dark:bg-rink-900">
        <button
          type="button"
          onClick={handleGoToLogin}
          aria-label="로그인 페이지로 이동"
          className="relative w-full overflow-hidden rounded-2xl h-14 bg-ice-500 text-white text-card-emphasis font-bold tracking-tight shadow-[0_20px_40px_-15px_rgba(30,63,174,0.15)] hover:brightness-110 active:brightness-95 transition-all duration-200 motion-reduce:transition-none flex items-center justify-center gap-2 group"
        >
          <span className="z-10">로그인하러 가기</span>
          <Icon
            name="arrow_forward"
            className="text-xl z-10 group-hover:translate-x-1 transition-transform duration-200"
            weight={600}
            aria-hidden="true"
          />
        </button>
      </div>
    </MobileContainer>
  );
}
