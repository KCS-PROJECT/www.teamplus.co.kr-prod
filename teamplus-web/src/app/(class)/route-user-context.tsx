'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { AuthUser } from '@/services/auth';

/**
 * (class) 라우트 그룹 전용 유저 컨텍스트.
 *
 * 인증 훅(useRequireRole/useAuth)은 layout.tsx 단일 소유자 원칙을 지킨다.
 * 수업 상세 하위 (coach-access) layout 에서 이미 해석한 user 를 하위 page 로
 * 파생 전달하기 위한 얇은 컨텍스트로, page 가 useAuth() 를 직접 재호출(인증 훅 중복)하지 않도록 한다.
 *
 * (coach)/route-auth-context.tsx 미러 — cross-group import 대신 (class) 트리 자기완결 provider.
 */
const RouteUserContext = createContext<AuthUser | null>(null);

export function RouteUserProvider({
  user,
  children,
}: {
  user: AuthUser | null;
  children: ReactNode;
}) {
  return (
    <RouteUserContext.Provider value={user}>{children}</RouteUserContext.Provider>
  );
}

/** layout 에서 해석된 현재 사용자를 소비한다(파생 컨텍스트만 읽음). */
export function useRouteUser(): AuthUser | null {
  return useContext(RouteUserContext);
}
