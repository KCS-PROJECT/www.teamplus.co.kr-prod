'use client';

import { ReactNode } from 'react';
import { RoleBottomNav } from '@/components/layout/RoleBottomNav';

interface NoticeLayoutProps {
  children: ReactNode;
}

export default function NoticeLayout({ children }: NoticeLayoutProps) {
  return (
    <div className="min-h-screen-safe flex flex-col">
      <div className="flex-1 min-h-0">{children}</div>
      <RoleBottomNav />
    </div>
  );
}
