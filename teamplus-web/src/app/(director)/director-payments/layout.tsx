'use client';

import { ReactNode } from 'react';
import { useRequireRole } from '@/contexts/AuthContext';
import { LoadingPuck } from '@/components/ui/LoadingPuck';

/**
 * 팀 정산 센터 전용 가드 — 팀 웹 역할(감독/코치/관리자)만 허용.
 *
 * 공유 `(director)/layout.tsx` 는 오픈클래스 원장(academy_director)도
 * 임시 진입을 허용하지만, `/director-payments` 는 팀 전용 정산 화면이므로
 * academy_director 를 여기서 차단한다. (auth-routing.ts 의 서버측 RBAC 와 정합 —
 * refresh-only 세션에서 미들웨어 RBAC 지연 시 클라 마운트를 막는 안전망.)
 */
export default function DirectorPaymentsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { isLoading, isAllowed } = useRequireRole(['director', 'coach', 'admin']);

  if (isLoading) return <LoadingPuck />;
  if (!isAllowed) return null;

  return <>{children}</>;
}
