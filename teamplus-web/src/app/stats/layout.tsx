'use client';

import { ReactNode } from 'react';
import { RoleBottomNav } from '@/components/layout/RoleBottomNav';

export default function StatsLayout({ children }: { children: ReactNode }) {
  return <>{children}<RoleBottomNav /></>;
}
