'use client';

import { ReactNode } from 'react';
import { RoleBottomNav } from '@/components/layout/RoleBottomNav';
import { useRequireAuth } from '@/contexts/AuthContext';

export default function ClassLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useRequireAuth();

  if (isLoading) return <div className="min-h-screen-safe bg-wbg dark:bg-rink-900" />;
  if (!isAuthenticated) return null;

  return <>{children}<RoleBottomNav /></>;
}
