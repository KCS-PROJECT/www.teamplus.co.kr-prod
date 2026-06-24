'use client';

import { ReactNode } from 'react';
import { RoleBottomNav } from '@/components/layout/RoleBottomNav';
import { useRequireRole } from '@/contexts/AuthContext';

/**
 * PaymentLayout — 결제 페이지 공통 레이아웃
 *
 * 접근 권한: parent, admin
 * - parent: 자녀 수강 결제, 결제권 충전, 결제 이력 조회
 * - admin: 운영자 확인용
 *
 * 타 역할(coach/director/teen/child)이 /payment/* 하위 경로에 직접 접근 시
 * 본인 대시보드로 리다이렉트.
 */
export default function PaymentLayout({ children }: { children: ReactNode }) {
  const { isLoading, isAllowed } = useRequireRole(['parent', 'admin']);

  if (isLoading) {
    return <div className="min-h-screen-safe bg-wbg dark:bg-rink-900" />;
  }
  if (!isAllowed) return null;

  return <>{children}<RoleBottomNav /></>;
}
