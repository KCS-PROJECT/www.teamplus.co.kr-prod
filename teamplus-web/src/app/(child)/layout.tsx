'use client';

import { ReactNode } from 'react';
import { useRequireRole } from '@/contexts/AuthContext';
import { RoleBottomNav } from '@/components/layout/RoleBottomNav';
import { useIsNative } from '@/hooks/useIsNative';

export default function ChildLayout({ children }: { children: ReactNode }) {
  // child · teen 공통 사용 라우트 그룹 (QR 체크인 · 수업 등 학생 공통 기능).
  // teen 미포함 시 GlobalMenu teen 메뉴의 `/qr-checkin` 링크 클릭이 빈 화면으로 떨어짐.
  const { isLoading, isAllowed } = useRequireRole(['child', 'teen', 'admin']);
  const { isNative } = useIsNative();

  if (isLoading) {
    return <div className="min-h-screen-safe bg-wbg dark:bg-rink-900" />;
  }

  if (!isAllowed) return null;

  return (
    <div className="min-h-screen-safe bg-wbg dark:bg-rink-900 flex flex-col">
      <div className="flex-1 min-h-0">{children}</div>
      {!isNative && <RoleBottomNav />}
    </div>
  );
}
