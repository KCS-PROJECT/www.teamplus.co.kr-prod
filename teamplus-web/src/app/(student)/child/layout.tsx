'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

/**
 * 상위 (student)/layout.tsx 의 useRequireRole(['child','teen','admin']) 이
 * 이미 인증·역할 가드를 수행합니다 (CLAUDE.md 재발 방지: layout 단일 호출 원칙).
 *
 * 이 레이아웃은 CHILD 전용 하위 라우트이므로, TEEN 접근만 추가 차단합니다.
 * useRequireRole 을 재호출하지 않고 user 상태만 관찰하여 redirect 경쟁을 예방합니다.
 */
export default function ChildLayout({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading || !user) return;
    const allowed = ['child', 'admin'];
    const role = String(user.userType ?? '').toLowerCase();
    if (!allowed.includes(role)) {
      router.replace('/');
    }
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return <div className="min-h-screen bg-slate-50 dark:bg-slate-900" />;
  }

  return <>{children}</>;
}
