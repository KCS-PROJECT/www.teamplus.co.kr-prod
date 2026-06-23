'use client';

import { ReactNode } from 'react';
import { RoleBottomNav } from '@/components/layout/RoleBottomNav';

interface GalleryLayoutProps {
  children: ReactNode;
}

export default function GalleryLayout({ children }: GalleryLayoutProps) {
  return (
    <div className="min-h-screen-safe bg-wbg dark:bg-rink-900 flex flex-col">
      {children}
      <RoleBottomNav />
    </div>
  );
}
