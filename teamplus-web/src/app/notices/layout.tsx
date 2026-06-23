'use client';

import { ReactNode } from 'react';
import { useRequireRole } from '@/contexts/AuthContext';
import { RoleBottomNav } from '@/components/layout/RoleBottomNav';

export default function NoticesLayout({ children }: { children: ReactNode }) {
  const { isLoading, isAllowed } = useRequireRole(['admin', 'director', 'coach', 'parent', 'teen', 'child']);

  if (isLoading) {
    return <div className="min-h-screen bg-slate-50 dark:bg-slate-900" />;
  }

  if (!isAllowed) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 min-h-0">{children}</div>
      <RoleBottomNav />
    </div>
  );
}
