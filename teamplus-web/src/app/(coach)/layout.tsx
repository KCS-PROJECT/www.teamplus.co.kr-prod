'use client';

import { ReactNode } from 'react';
import { useRequireRole } from '@/contexts/AuthContext';
// [수정 2026-04-29] CoachBottomNav 고정 → RoleBottomNav 로 교체.
// 감독이 (coach) 그룹 페이지(/classes-manage 등) 진입 시 directorNavItems
// (수업/일정/홈/팀/마이) 가 표시되도록 하기 위해.
import { RoleBottomNav } from '@/components/layout/RoleBottomNav';
import { LoadingPuck } from '@/components/ui/LoadingPuck';

export default function CoachLayout({ children }: { children: ReactNode }) {
  const { isLoading, isAllowed } = useRequireRole(['coach', 'director', 'admin', 'academy_director']);

  if (isLoading) return <LoadingPuck />;

  if (!isAllowed) return null;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Skip Link — 스크린리더/키보드 사용자 메인 콘텐츠 빠른 이동 */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-ice-500 focus:text-white focus:rounded-md focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2"
      >
        본문 바로가기
      </a>
      <div className="flex-1 min-h-0" id="main-content">{children}</div>
      <RoleBottomNav />
    </div>
  );
}
