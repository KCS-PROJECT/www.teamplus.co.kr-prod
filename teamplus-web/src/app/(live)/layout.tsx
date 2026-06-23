'use client';

import { ReactNode } from 'react';
import { useRequireAuth } from '@/contexts/AuthContext';
import { RoleBottomNav } from '@/components/layout/RoleBottomNav';
import { LoadingPuck } from '@/components/ui/LoadingPuck';

/**
 * (live) 그룹 레이아웃 — 실시간 스코어보드 · 라이브 리뷰 공용.
 *
 * 모든 인증 사용자(parent/teen/child/coach/director/admin) 가 접근 가능.
 * RoleBottomNav 가 자동으로 사용자 역할에 맞는 BottomNav 를 렌더링한다.
 *
 * status bar safe-area 는 각 페이지의 MobileContainer 가 처리 (padding-top:
 * var(--safe-area-inset-top)). 본 레이아웃은 BottomNav 만 추가한다.
 *
 * 2026-05-12 추가 — Task #7 teen-agent: (live)/layout.tsx 누락 보완.
 */
export default function LiveLayout({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useRequireAuth();

  if (isLoading) return <LoadingPuck />;

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen-safe flex flex-col">
      <div className="flex-1 min-h-0">{children}</div>
      <RoleBottomNav />
    </div>
  );
}
