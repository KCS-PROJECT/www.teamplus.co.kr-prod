'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  BottomNav,
  adminNavItems,
  coachNavItems,
  directorNavItems,
  parentNavItems,
  teenNavItems,
  childNavItems,
  academyDirectorNavItems,
} from './BottomNav';

/**
 * 역할별 명시적 BottomNav 컴포넌트
 *
 * 각 역할 layout.tsx 또는 서브페이지에서 명시적으로 import해서 사용합니다.
 * - AdminBottomNav, DirectorBottomNav, CoachBottomNav
 * - ParentBottomNav, TeenBottomNav, ChildBottomNav
 */

export function AdminBottomNav() {
  return (
    <BottomNav
      items={adminNavItems}
      homeHref="/admin"
    />
  );
}

export function DirectorBottomNav() {
  return (
    <BottomNav
      items={directorNavItems}
      homeHref="/director"
    />
  );
}

export function CoachBottomNav() {
  return (
    <BottomNav
      items={coachNavItems}
      homeHref="/coach"
    />
  );
}

export function AcademyDirectorBottomNav() {
  return (
    <BottomNav
      items={academyDirectorNavItems}
      homeHref="/academy-director"
    />
  );
}

export function ParentBottomNav() {
  return (
    <BottomNav
      items={parentNavItems}
      homeHref="/parent"
    />
  );
}

export function TeenBottomNav() {
  return (
    <BottomNav
      items={teenNavItems}
      homeHref="/teen"
    />
  );
}

export function ChildBottomNav() {
  return (
    <BottomNav
      items={childNavItems}
      homeHref="/child"
    />
  );
}

/**
 * RoleBottomNav - 역할 기반 자동 BottomNav
 *
 * (common) layout 또는 역할 혼재 영역에서 useAuth()로 역할을 자동 감지합니다.
 * 역할이 확정된 layout에서는 위의 명시적 컴포넌트를 사용하세요.
 */

const NAV_CONFIG = {
  admin:              { items: adminNavItems,              homeHref: '/admin' },
  director:           { items: directorNavItems,           homeHref: '/director' },
  coach:              { items: coachNavItems,              homeHref: '/coach' },
  // [수정 2026-05-13 P1] ACADEMY_DIRECTOR 전용 대시보드 URL 분리.
  academy_director:   { items: academyDirectorNavItems,    homeHref: '/academy-director' },
  parent:             { items: parentNavItems,             homeHref: '/parent' },
  teen:               { items: teenNavItems,               homeHref: '/teen' },
  child:              { items: childNavItems,              homeHref: '/child' },
} as const;

type NavRole = keyof typeof NAV_CONFIG;

export function RoleBottomNav() {
  const { user } = useAuth();
  // SSR/CSR hydration mismatch 방지 — user 가 토큰 캐시/스토리지에서 client-only 로 복원되므로
  // 첫 렌더(서버 + 클라 hydration) 은 항상 null, 그 다음 렌더에서만 role 평가.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;

  const role = user?.userType?.toLowerCase() as NavRole | undefined;

  if (!role || !(role in NAV_CONFIG)) return null;

  const config = NAV_CONFIG[role];

  return (
    <BottomNav
      items={config.items}
      homeHref={config.homeHref}
    />
  );
}

export default RoleBottomNav;
