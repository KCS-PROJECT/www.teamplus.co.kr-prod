'use client';

import { ReactNode } from 'react';
import { useRequireRole } from '@/contexts/AuthContext';
import { RoleBottomNav } from '@/components/layout/RoleBottomNav';

export default function ShopLayout({ children }: { children: ReactNode }) {
  // 상품/결제권 충전은 결제 가능한 모든 역할 허용
  // - parent/teen/child: 기본 구매자
  // - director/coach/admin/academy_director: 본인 결제권 충전 및 관리 목적
  const { isLoading, isAllowed } = useRequireRole([
    'parent',
    'teen',
    'child',
    'director',
    'coach',
    'admin',
    'academy_director',
  ]);

  if (isLoading) {
    return <div className="min-h-screen-safe bg-wbg dark:bg-rink-900" />;
  }

  if (!isAllowed) return null;

  return (
    <div className="min-h-screen-safe flex flex-col">
      <div className="flex-1 min-h-0">{children}</div>
      <RoleBottomNav />
    </div>
  );
}
