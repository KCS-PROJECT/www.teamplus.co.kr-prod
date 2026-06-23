'use client';

import { ReactNode } from 'react';
import { useRequireRole } from '@/contexts/AuthContext';
import { RoleBottomNav } from '@/components/layout/RoleBottomNav';
import { LoadingPuck } from '@/components/ui/LoadingPuck';

export default function AdminLayout({ children }: { children: ReactNode }) {
  // [수정 2026-05-15 T04 web-router] 사이드 메뉴의 DIRECTOR/ACADEMY_DIRECTOR/COACH 진입점
  //  중 (admin) 그룹의 공유 운영 도구(/match-manage, /coach-manage 등)에 합법적으로 접근해야 한다.
  //  이전 ['admin'] 단독 가드는 layout 단에서 director 를 자기 대시보드로 강제 리다이렉트시켜
  //  "매치 관리 → 메인 홈" 버그의 원인이 됐다. 미들웨어(PROTECTED_PATHS_BY_ROLE)가 경로별
  //  RBAC 을 이미 강제하므로 layout 은 인증된 도메인 사용자 그룹까지만 열어주고
  //  세부 권한은 middleware 가 책임진다.
  const { isLoading, isAllowed } = useRequireRole([
    'admin',
    'director',
    'academy_director',
    'coach',
  ]);

  if (isLoading) return <LoadingPuck />;

  if (!isAllowed) return null;

  return (
    <div className="min-h-screen flex flex-col" data-role-area="admin">
      {/* WCAG 2.4.1 Bypass Blocks 의 anchor target.
          Skip-link("본문 바로가기")가 이 컨테이너로 점프. tabIndex=-1 으로 키보드 포커스 가능. */}
      <div id="main-content" tabIndex={-1} className="flex-1 min-h-0 outline-none">
        {children}
      </div>
      <RoleBottomNav />
    </div>
  );
}
