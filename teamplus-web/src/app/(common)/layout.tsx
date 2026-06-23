'use client';

import { ReactNode } from 'react';
import { useRequireAuth } from '@/contexts/AuthContext';
import { RoleBottomNav } from '@/components/layout/RoleBottomNav';
import { LoadingPuck } from '@/components/ui/LoadingPuck';

export default function CommonLayout({ children }: { children: ReactNode }) {
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
