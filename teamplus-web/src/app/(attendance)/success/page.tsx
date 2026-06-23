'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useNavigation } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';

interface AttendanceInfo {
  playerName: string;
  className: string;
  time: string;
  location: string;
  coachName: string;
  checkInTime: string;
  creditsRemaining: number;
}

export default function AttendanceSuccessPage() {
  return (
    <Suspense fallback={
      <MobileContainer hasBottomNav={false}>
        <div className="flex items-center justify-center min-h-screen bg-ice-500">
          <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-w-pill animate-spin" />
        </div>
      </MobileContainer>
    }>
      <AttendanceSuccessContent />
    </Suspense>
  );
}

function AttendanceSuccessContent() {
  const { navigate } = useNavigation();
  const searchParams = useSearchParams();
  const [showContent, setShowContent] = useState(false);
  usePageReady(true); // 출석 성공 후 searchParams 즉시 ready

  // [parent-agent · 2026-05-12] 출석 성공 풀스크린 celebration — 네이티브 AppBar/BottomNav 숨김.
  //   status bar 만 유지 (notch / Dynamic Island 영역에서 시계·배터리 가시성 확보).
  //   MobileContainer outer `bg-wbg dark:bg-rink-900` 가 safe-area-top 을 채우므로
  //   상태바 텍스트가 카메라/blue 영역에 가려지지 않는다.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
  });

  const now = new Date();
  const checkInTime = searchParams?.get('checkInTime') ?? `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
  const info: AttendanceInfo = {
    playerName: searchParams?.get('playerName') ?? '',
    className: searchParams?.get('className') ?? '',
    time: searchParams?.get('time') ?? '',
    location: searchParams?.get('location') ?? '',
    coachName: searchParams?.get('coachName') ?? '',
    checkInTime,
    creditsRemaining: parseInt(searchParams?.get('creditsRemaining') ?? '0') || 0,
  };

  useEffect(() => {
    // Delay content appearance for animation
    const timer = setTimeout(() => setShowContent(true), 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <MobileContainer hasBottomNav={false}>
      <div className="relative flex flex-col min-h-screen bg-ice-500">
        {/* 스크린리더용 즉시 안내 — assertive 로 출석 완료 사실 즉시 announce */}
        <span className="sr-only" role="status" aria-live="assertive" aria-atomic="true">
          {info.playerName ? `${info.playerName} ` : ''}출석 완료. {info.className}
          {info.creditsRemaining ? `, 남은 크레딧 ${info.creditsRemaining}회` : ''}
        </span>

        {/* Decorative Background Elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div className="absolute top-10 left-10 w-32 h-32 bg-white/10 rounded-w-pill" />
          <div className="absolute bottom-40 right-5 w-48 h-48 bg-white/10 rounded-w-pill" />
          <div className="absolute top-1/3 right-10 w-20 h-20 bg-white/5 rounded-w-pill" />
        </div>

        {/* Main Content */}
        <main
          className="relative flex-1 flex flex-col items-center justify-center px-6 py-12"
          aria-labelledby="attendance-success-title"
        >
          {/* Success Animation */}
          <div
            className={`transition-all motion-reduce:transition-none duration-700 ${
              showContent ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
            }`}
          >
            {/* Success Icon with Glow */}
            <div className="relative mb-8" aria-hidden="true">
              <div className="absolute inset-0 bg-white/30 rounded-w-pill animate-pulse motion-reduce:animate-none" />
              <div className="relative w-32 h-32 bg-white rounded-w-pill flex items-center justify-center shadow-md">
                <Icon
                  name="check"
                  className="text-ice-500 text-7xl"
                  weight={800}
                />
              </div>
            </div>

            {/* Success Message */}
            <div className="text-center mb-10">
              <h1 id="attendance-success-title" className="text-4xl font-extrabold text-white mb-3 tracking-tight">
                출석 완료!
              </h1>
              <p className="text-white/80 text-card-title font-medium">
                오늘도 열심히 연습해요 <span aria-hidden="true">💪</span>
              </p>
            </div>
          </div>

          {/* Info Card */}
          <div
            className={`w-full max-w-sm transition-all motion-reduce:transition-none duration-700 delay-300 ${
              showContent
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-10'
            }`}
          >
            <div className="bg-white dark:bg-rink-900 rounded-3xl shadow-md overflow-hidden">
              {/* Player Name Header */}
              <div className="bg-wbg dark:bg-rink-800 px-6 py-5 border-b border-wline-2 dark:border-rink-700">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-w-pill bg-ice-500/10 flex items-center justify-center">
                    <Icon name="person" className="text-ice-500 text-3xl" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-wtext-3 dark:text-rink-300 text-card-meta font-medium uppercase tracking-wider">
                      출석 확인
                    </p>
                    <h2 className="text-2xl font-bold text-wtext-1 dark:text-white">
                      {info.playerName}
                    </h2>
                  </div>
                </div>
              </div>

              {/* Class Details */}
              <div className="p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                    <Icon name="sports_hockey" className="text-ice-500 text-xl" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-card-meta font-medium text-wtext-3 dark:text-rink-300 uppercase tracking-wider">
                      수업
                    </p>
                    <p className="text-card-emphasis font-bold text-wtext-1 dark:text-white">
                      {info.className}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                    <Icon name="schedule" className="text-green-600 dark:text-green-400 text-xl" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-card-meta font-medium text-wtext-3 dark:text-rink-300 uppercase tracking-wider">
                      시간
                    </p>
                    <p className="text-card-emphasis font-bold text-wtext-1 dark:text-white">
                      {info.time}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                    <Icon name="location_on" className="text-amber-600 dark:text-amber-400 text-xl" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-card-meta font-medium text-wtext-3 dark:text-rink-300 uppercase tracking-wider">
                      장소
                    </p>
                    <p className="text-card-emphasis font-bold text-wtext-1 dark:text-white">
                      {info.location}
                    </p>
                  </div>
                </div>

                {/* Divider */}
                <div className="h-px bg-wline-2 dark:bg-rink-700 my-2" />

                {/* Check-in Time & Credits */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon name="check_circle" className="text-green-500 dark:text-green-400 text-card-title" aria-hidden="true" />
                    <span className="text-card-body font-medium text-wtext-3 dark:text-rink-300">
                      체크인: {info.checkInTime}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-ice-500/10 rounded-w-pill">
                    <Icon name="token" className="text-ice-500 text-card-title" aria-hidden="true" />
                    <span className="text-card-body font-bold text-ice-500">
                      {info.creditsRemaining}회 남음
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Bottom Action Button */}
        <div
          className={`px-6 pb-10 transition-all motion-reduce:transition-none duration-700 delay-500 ${
            showContent
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-10'
          }`}
        >
          <button
            onClick={() => navigate('/child')}
            className="w-full h-16 bg-white text-ice-500 font-bold text-card-title rounded-2xl shadow-md active:brightness-95 transition-transform motion-reduce:transition-none flex items-center justify-center gap-2"
          >
            <Icon name="home" className="text-2xl" />
            홈으로 돌아가기
          </button>
        </div>
      </div>
    </MobileContainer>
  );
}
