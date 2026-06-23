'use client';

import { useEffect, useState } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useNavigation } from '@/components/ui/NavLink';
import { useAuth } from '@/contexts/AuthContext';
import { getDashboardPathByUserType } from '@/lib/auth-routing';

export default function NotFoundPage() {
  const { navigate, back } = useNavigation();
  const { user } = useAuth();
  // SSR/CSR hydration mismatch 방지 — user 정보는 client-only 로 복원되므로
  // mount 전엔 항상 '/' 로 결정적 렌더.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const homeHref = mounted
    ? getDashboardPathByUserType(user?.userType, '/')
    : '/';

  return (
    <MobileContainer hasBottomNav={false}>
      {/* Ice Rink Background Pattern */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Ice surface base */}
        <div className="absolute inset-0 bg-sky-50 dark:bg-slate-900" />

        {/* Rink lines - 아이스 링크 라인 패턴 */}
        <div className="absolute inset-0">
          {/* Center red line */}
          <div className="absolute left-1/2 top-0 bottom-0 w-1 bg-red-400/20 -translate-x-1/2" />
          {/* Blue lines */}
          <div className="absolute left-1/3 top-0 bottom-0 w-0.5 bg-blue-400/15" />
          <div className="absolute right-1/3 top-0 bottom-0 w-0.5 bg-blue-400/15" />
          {/* Center circle */}
          <div className="absolute left-1/2 top-1/2 w-40 h-40 border-2 border-blue-400/10 rounded-full -translate-x-1/2 -translate-y-1/2" />
          {/* Face-off dots */}
          <div className="absolute left-1/4 top-1/3 w-3 h-3 bg-red-400/20 rounded-full" />
          <div className="absolute right-1/4 top-1/3 w-3 h-3 bg-red-400/20 rounded-full" />
          <div className="absolute left-1/4 bottom-1/3 w-3 h-3 bg-red-400/20 rounded-full" />
          <div className="absolute right-1/4 bottom-1/3 w-3 h-3 bg-red-400/20 rounded-full" />
        </div>

        {/* Ice scratch texture overlay */}
        <div className="absolute inset-0 opacity-[0.03] bg-black/[0.02]" />
      </div>

      {/* Back Button */}
      <header className="relative z-10 flex items-center px-5 pt-12 pb-4">
        <button
          onClick={() => back()}
          className="flex items-center justify-center size-10 rounded-full bg-white/80 dark:bg-slate-800/80 shadow-sm hover:shadow-md transition-shadow motion-reduce:transition-none duration-150 ease-out transform-gpu"
          aria-label="뒤로 가기"
        >
          <Icon name="arrow_back_ios_new" className="text-slate-700 dark:text-slate-300 text-lg" />
        </button>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 px-6 flex flex-col items-center justify-center text-center -mt-10">

        {/* Hockey Puck with 404 - 퍽 아이콘 */}
        <div className="relative mb-8">
          {/* Puck shadow */}
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-28 h-4 bg-slate-900/10 dark:bg-black/20 rounded-full" />

          {/* Hockey Puck */}
          <div className="relative w-32 h-32 flex items-center justify-center">
            {/* Puck body */}
            <div className="absolute inset-0 bg-slate-800 dark:bg-slate-700 rounded-full shadow-md" />
            {/* Puck top surface */}
            <div className="absolute inset-2 bg-slate-900 dark:bg-slate-800 rounded-full flex items-center justify-center">
              {/* 404 text on puck */}
              <span className="text-white font-black text-3xl tracking-tighter select-none">
                404
              </span>
            </div>
            {/* Puck highlight */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-2 bg-white/10 rounded-full" />
          </div>

          {/* Motion lines - 퍽이 슬라이딩한 흔적 */}
          <div className="absolute -left-8 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 opacity-40">
            <div className="w-6 h-0.5 bg-slate-400 rounded-full" />
            <div className="w-8 h-0.5 bg-slate-400 rounded-full" />
            <div className="w-5 h-0.5 bg-slate-400 rounded-full" />
          </div>
        </div>

        {/* Hockey Sticks crossed - 교차된 하키 스틱 장식 */}
        <div className="absolute top-1/4 right-6 opacity-10 rotate-12">
          <Icon name="sports_hockey" className="text-6xl text-slate-600 dark:text-slate-400" />
        </div>
        <div className="absolute bottom-1/4 left-6 opacity-10 -rotate-12">
          <Icon name="sports_hockey" className="text-6xl text-slate-600 dark:text-slate-400" />
        </div>

        {/* Message */}
        <div className="max-w-xs">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white leading-tight">
            앗, 퍽이 골대를 빗나갔어요!
          </h1>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            요청하신 페이지를 찾을 수 없습니다.<br />
            주소가 변경되었거나 아직 준비 중일 수 있어요.
          </p>
        </div>

        {/* Goal Net Icon */}
        <div className="mt-6 flex items-center justify-center gap-2 text-slate-400 dark:text-slate-500">
          <div className="w-12 h-px bg-slate-300 dark:bg-slate-600" />
          <Icon name="sports_score" className="text-2xl" />
          <div className="w-12 h-px bg-slate-300 dark:bg-slate-600" />
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex flex-col w-full max-w-xs gap-3">
          <Button
            onClick={() => navigate(homeHref)}
            className="w-full h-12 text-base font-semibold shadow-md"
          >
            <Icon name="home" className="mr-2" />
            홈으로 돌아가기
          </Button>

          <Button
            variant="outline"
            onClick={() => back()}
            className="w-full h-12 text-base"
          >
            <Icon name="arrow_back" className="mr-2" />
            이전 페이지로
          </Button>
        </div>

        {/* Encouraging message */}
        <p className="mt-8 text-xs text-slate-400 dark:text-slate-500">
          다시 도전하면 골인할 수 있어요! 🏒
        </p>
      </main>

      {/* Bottom decoration - Ice rink boards */}
      <div className="relative z-10 h-16 bg-slate-100 dark:bg-slate-800" />
    </MobileContainer>
  );
}
