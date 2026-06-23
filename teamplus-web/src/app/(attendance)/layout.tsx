'use client';

import { ReactNode } from 'react';
import { RoleBottomNav } from '@/components/layout/RoleBottomNav';

export default function AttendanceLayout({ children }: { children: ReactNode }) {
  return <>{children}<RoleBottomNav /></>;
}
