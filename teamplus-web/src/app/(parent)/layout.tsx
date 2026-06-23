'use client';

import { ReactNode } from 'react';
import { useRequireRole } from '@/contexts/AuthContext';
import { RoleBottomNav } from '@/components/layout/RoleBottomNav';
import { LoadingPuck } from '@/components/ui/LoadingPuck';

export default function ParentLayout({ children }: { children: ReactNode }) {
  const { isLoading, isAllowed } = useRequireRole(['parent', 'admin']);

  if (isLoading) return <LoadingPuck />;

  if (!isAllowed) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 min-h-0">{children}</div>
      <RoleBottomNav />
    </div>
  );
}
