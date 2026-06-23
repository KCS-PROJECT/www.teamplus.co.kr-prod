'use client';

import { useEffect } from 'react';
import { useNavigation } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';

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
    <MobileContainer hasBottomNav={false} className="bg-wsurface dark:bg-puck">
      <main className="relative flex h-full w-full flex-col items-center justify-between px-8">
        {/* Main Content */}
        <div className="flex-grow flex flex-col items-center justify-center">
          <div className="flex flex-col items-center">
            {/* Logo with Pulse Rings */}
            <div className="relative w-32 h-32 mb-10 flex items-center justify-center">
              {/* Pulse Rings — 외곽 펄스 (motion-reduce 자동 비활성) */}
              <span
                className="absolute inset-0 rounded-w-pill bg-ice-500/20 motion-safe:animate-ping motion-reduce:animate-none"
                aria-hidden="true"
              />
              <span
                className="absolute inset-2 rounded-w-pill bg-ice-500/10 motion-safe:animate-pulse motion-reduce:animate-none"
                aria-hidden="true"
              />

              {/* Logo Puck — 위/아래 분리된 하키 퍽 */}
              <div className="relative w-24 h-24 flex items-center justify-center">
                <div className="absolute bottom-0 w-24 h-16 bg-rink-900 dark:bg-rink-700 rounded-w-pill" />
                <div className="absolute top-0 w-24 h-16 bg-rink-800 dark:bg-rink-500 rounded-w-pill flex items-center justify-center border-b-4 border-rink-900 dark:border-rink-700">
                  <Icon name="sports_hockey" filled className="text-white text-4xl" />
                </div>
              </div>
            </div>

            {/* Wordmark — TEAMPLUS 영문 로고 */}
            <div className="flex items-center gap-1 mb-2">
              <span className="text-ice-500 text-w-caption font-extrabold tracking-[0.4em]">
                TEAMPLUS
              </span>
              <span className="w-1.5 h-1.5 rounded-w-pill bg-ice-500 motion-safe:animate-pulse motion-reduce:animate-none" />
            </div>

            {/* App Title */}
            <h1 className="text-w-h1 font-extrabold tracking-tight text-ice-500 leading-tight mb-3">
              팀플러스
            </h1>
            <p className="text-wtext-3 dark:text-rink-300 text-w-body-lg font-medium tracking-normal text-center">
              아이스하키 대회·수강 관리를 한 번에
            </p>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="pb-10 w-full max-w-[240px] flex flex-col items-center gap-8">
          {/* Progress Bar — 좌→우 진행 애니메이션 */}
          <div
            className="w-full h-1.5 bg-wbg dark:bg-rink-800 rounded-w-pill overflow-hidden"
            role="progressbar"
            aria-label="앱 로딩 중"
          >
            <div className="h-full bg-ice-500 rounded-w-pill motion-safe:animate-[splash-progress_2.4s_ease-out_forwards] w-2/3" />
          </div>

          {/* Powered By */}
          <div className="flex flex-col items-center gap-4">
            <span className="text-w-caption text-wtext-4 dark:text-rink-500 font-bold tracking-[0.2em]">
              POWERED BY TEAMPLUS
            </span>
          </div>
        </div>

        {/* 진행바 키프레임 */}
        <style jsx>{`
          @keyframes splash-progress {
            0% {
              width: 8%;
            }
            60% {
              width: 60%;
            }
            100% {
              width: 100%;
            }
          }
        `}</style>
      </main>
    </MobileContainer>
  );
}
