'use client';

import { ReactNode } from 'react';
import { RoleBottomNav } from '@/components/layout/RoleBottomNav';

/**
 * Public Layout
 * 비로그인 사용자도 접근 가능한 페이지
 * RoleBottomNav는 로그인 상태일 때만 렌더링됨 (비로그인 시 null 반환)
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return <>{children}<RoleBottomNav /></>;
}
