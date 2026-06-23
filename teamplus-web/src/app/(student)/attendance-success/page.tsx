'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useNavigation } from '@/components/ui/NavLink';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { Icon } from '@/components/ui/Icon';
import { useNativeUI } from '@/hooks/useNativeUI';
import { cn } from '@/lib/utils';
import { usePageReady } from '@/hooks/usePageReady';

export default function ChildAttendanceSuccessPage() {
  usePageReady(true); // 정적 페이지 — 마운트 즉시 ready
  return (
    <Suspense fallback={
      <MobileContainer hasBottomNav={true} className="bg-wbg dark:bg-rink-900">
        <div className="flex h-full items-center justify-center">
          <div className="w-8 h-8 border-4 border-ice-500/30 border-t-primary rounded-w-pill animate-spin motion-reduce:animate-none" />
        </div>
      </MobileContainer>
    }>
      <ChildAttendanceSuccessContent />
    </Suspense>
  );
}

function ChildAttendanceSuccessContent() {
  const { navigate } = useNavigation();
  const searchParams = useSearchParams();
  const [showContent, setShowContent] = useState(false);

  // 출석 성공 풀스크린 — 헤더/BottomNav 모두 숨김, StatusBar 만 노출.
  //   MobileContainer 의 safe-area-inset-top 으로 notch/Dynamic Island 영역 확보.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });

  const remainingClasses = parseInt(searchParams?.get('remainingClasses') ?? '0') || 0;
  const className = searchParams?.get('className') ?? '';
  const checkInTime = searchParams?.get('checkInTime') ?? '';

  useEffect(() => {
    const timer = setTimeout(() => setShowContent(true), 150);
    return () => clearTimeout(timer);
  }, []);

  const handleConfirm = () => {
    navigate('/schedule');
  };

  return (
    <MobileContainer hasBottomNav={true} className="bg-wbg dark:bg-rink-900 overflow-hidden">
      <div className="relative flex h-full w-full flex-col">
        {/* Subtle decoration (brand consistent, no gradients) */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div className="absolute -top-20 -right-20 h-64 w-64 rounded-w-pill bg-ice-500/5 dark:bg-ice-500/10" />
          <div className="absolute -bottom-24 -left-16 h-72 w-72 rounded-w-pill bg-ice-500/5 dark:bg-ice-500/10" />

          <div
            className="absolute top-[14%] left-[12%] text-ice-500/30 motion-reduce:hidden"
            style={{ animation: 'float 6s ease-in-out infinite' }}
          >
            <Icon name="celebration" className="text-3xl" filled aria-hidden="true" />
          </div>
          <div
            className="absolute top-[18%] right-[12%] text-ice-500/40 motion-reduce:hidden"
            style={{ animation: 'float 5s ease-in-out infinite', animationDelay: '1s' }}
          >
            <Icon name="star" className="text-2xl" filled aria-hidden="true" />
          </div>
          <div
            className="absolute bottom-[26%] left-[10%] text-ice-500/30 motion-reduce:hidden"
            style={{ animation: 'float 7s ease-in-out infinite', animationDelay: '2s' }}
          >
            <Icon name="sports_hockey" className="text-3xl" filled aria-hidden="true" />
          </div>
        </div>

        {/* Main Content */}
        <main className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-6" role="main" aria-live="polite">
          {/* Hero Checkmark */}
          <div
            className={cn(
              'relative mb-8 flex flex-col items-center justify-center transition-all duration-700 motion-reduce:transition-none',
              showContent ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
            )}
          >
            <div className="relative flex h-32 w-32 items-center justify-center rounded-w-pill bg-ice-500 shadow-md ring-[6px] ring-ice-500/15">
              <Icon
                name="check"
                className="text-white text-[5rem]"
                weight={700}
                filled
                aria-hidden="true"
              />
            </div>
          </div>

          {/* Text Content */}
          <div
            className={cn(
              'flex flex-col items-center gap-2 text-center transition-all duration-700 delay-150 motion-reduce:transition-none',
              showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
            )}
          >
            <span className="inline-flex items-center gap-1.5 rounded-w-pill bg-ice-500/10 px-3 py-1 text-card-meta font-bold text-ice-500">
              <Icon name="verified" className="text-[14px]" filled aria-hidden="true" />
              출석 완료
            </span>
            <h1 className="text-3xl font-extrabold tracking-tight text-wtext-1 dark:text-white">
              오늘도 잘 왔어요!
            </h1>
            <p className="text-card-emphasis font-medium text-wtext-3 dark:text-rink-100">
              꾸준함이 최고의 실력이에요
            </p>
          </div>

          {/* Info Card */}
          <div
            className={cn(
              'mt-8 w-full max-w-[320px] transition-all duration-700 delay-300 motion-reduce:transition-none',
              showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
            )}
          >
            <div className="rounded-2xl border border-wline-2 bg-white p-4 shadow-sm dark:border-rink-700 dark:bg-rink-800">
              {className && (
                <div className="mb-3 flex items-center gap-3 border-b border-wline-2 pb-3 dark:border-rink-700">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ice-500/10">
                    <Icon name="sports_hockey" className="text-xl text-ice-500" filled aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-wtext-3 dark:text-rink-300">오늘 수업</p>
                    <p className="truncate text-card-body font-bold text-wtext-1 dark:text-white">{className}</p>
                  </div>
                  {checkInTime && (
                    <span className="shrink-0 rounded-w-pill bg-wline-2 px-2 py-0.5 text-[11px] font-bold text-wtext-2 tabular-nums dark:bg-rink-700 dark:text-rink-100">
                      {checkInTime}
                    </span>
                  )}
                </div>
              )}
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ice-500/10">
                  <Icon name="calendar_month" className="text-xl text-ice-500" filled aria-hidden="true" />
                </div>
                <div className="flex-1">
                  <p className="text-[11px] font-semibold text-wtext-3 dark:text-rink-300">남은 수업</p>
                  <p className="text-card-title font-bold text-wtext-1 dark:text-white tabular-nums">
                    {remainingClasses}회
                  </p>
                </div>
                <div className="flex items-center gap-1" aria-hidden="true">
                  <span className="h-2 w-2 rounded-w-pill bg-ice-500" />
                  <span className="h-2 w-2 rounded-w-pill bg-ice-500/50" />
                  <span className="h-2 w-2 rounded-w-pill bg-ice-500/20" />
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Footer Action */}
        <footer
          className={cn(
            'relative z-10 w-full shrink-0 px-6 pb-10 pt-3 transition-all duration-700 delay-500 motion-reduce:transition-none',
            showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          )}
        >
          <button
            type="button"
            onClick={handleConfirm}
            className="flex h-14 w-full items-center justify-center rounded-2xl bg-ice-500 text-white shadow-md transition-colors hover:bg-ice-700 active:brightness-95 motion-reduce:transition-none"
          >
            <span className="text-card-title font-bold">수업 일정 보기</span>
          </button>
        </footer>
      </div>

      <style jsx global>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
      `}</style>
    </MobileContainer>
  );
}
