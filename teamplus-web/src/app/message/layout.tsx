'use client';

import { ReactNode } from 'react';
import { RoleBottomNav } from '@/components/layout/RoleBottomNav';

export default function MessageLayout({ children }: { children: ReactNode }) {
  return <>{children}<RoleBottomNav /></>;
}
