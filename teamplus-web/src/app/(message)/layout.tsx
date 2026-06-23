'use client';

import { ReactNode } from 'react';
import { useRequireRole } from '@/contexts/AuthContext';
import { RoleBottomNav } from '@/components/layout/RoleBottomNav';

export default function MessageLayout({ children }: { children: ReactNode }) {
  const { isLoading, isAllowed } = useRequireRole(['admin', 'director', 'coach', 'parent']);

  if (isLoading) {
    return <div className="min-h-screen-safe bg-wbg dark:bg-rink-900" />;
  }

  if (!isAllowed) return null;

  return <>{children}<RoleBottomNav /></>;
}
