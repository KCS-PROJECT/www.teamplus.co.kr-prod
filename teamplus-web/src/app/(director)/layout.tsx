'use client';

import { ReactNode } from 'react';
import { useRequireRole } from '@/contexts/AuthContext';
import { RoleBottomNav } from '@/components/layout/RoleBottomNav';
import { LoadingPuck } from '@/components/ui/LoadingPuck';

export default function DirectorLayout({ children }: { children: ReactNode }) {
  // [수정 2026-04-30] 사용자 요청 — 코치/오픈클래스 감독도 감독 화면에 임시 진입 허용.
  // 권한·메뉴 차등화는 추후 적용. 현재는 시각적 동일 노출이 우선.
  const { isLoading, isAllowed } = useRequireRole(['director', 'coach', 'academy_director', 'admin']);

  if (isLoading) return <LoadingPuck />;

  if (!isAllowed) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 min-h-0">{children}</div>
      <RoleBottomNav />
    </div>
  );
}
