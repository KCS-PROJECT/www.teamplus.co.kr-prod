'use client';

import { ReactNode } from 'react';
import { useRequireAuth } from '@/contexts/AuthContext';
import { RoleBottomNav } from '@/components/layout/RoleBottomNav';
import { LoadingPuck } from '@/components/ui/LoadingPuck';

interface MatchLayoutProps {
  children: ReactNode;
}

/**
 * Match 그룹 공통 인증 가드.
 *
 * 기존에는 children 페이지마다 useRequireRole/useRequireAuth 를 직접 호출하여
 * AuthContext re-render 가 페이지·레이아웃 양쪽에서 중복 trigger 됐다(CLAUDE.md
 * MUST FOLLOW 위반). 본 layout 에서 useRequireAuth 한 번만 가드하면 page 측은
 * useAuth 만 watch 해 동일 Context 값을 공유한다. 페이지별 RBAC(allowedRoles)는
 * 각각 다르므로 page 내 useRequireRole 는 유지(비용 ~0ms, 가드 명시성 보존).
 */
export default function MatchLayout({ children }: MatchLayoutProps) {
  const { isLoading } = useRequireAuth();

  if (isLoading) return <LoadingPuck />;

  return (
    <div className="min-h-screen-safe bg-wbg dark:bg-rink-900">
      {children}
      <RoleBottomNav />
    </div>
  );
}
