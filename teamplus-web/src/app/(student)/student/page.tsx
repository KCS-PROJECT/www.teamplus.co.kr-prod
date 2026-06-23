'use client';

export const dynamic = 'force-dynamic';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';

/**
 * `/student` URL 호환성 유지용 redirect 페이지.
 *
 * [2026-04-30] 통합 대시보드 정책 폐기 — child/teen 분리 진입점으로 복원.
 * 기존 북마크/딥링크가 `/student` 를 가리킬 수 있으므로 페이지는 보존하되,
 * 역할에 따라 `/child` 또는 `/teen` 으로 자동 이동시킨다.
 *
 * 인증·역할 가드는 (student)/layout.tsx 의 useRequireRole(['child','teen','admin'])
 * 가 처리하므로 본 페이지는 단순 redirect 만 담당.
 *
 * [appbar-harness-v2] 클라이언트 redirect 사이 짧은 공백 동안에도 status bar
 *   가 유지되도록 명시적으로 useNativeUI 호출. iOS 시뮬레이터에서 redirect
 *   gap 동안 status bar 사라지는 회귀 방지.
 */
export default function StudentRedirectPage() {
  usePageReady(true); // 정적 페이지 — 마운트 즉시 ready
  const router = useRouter();
  const { user } = useAuth();

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });

  useEffect(() => {
    if (!user) return;
    const userType = user.userType?.toLowerCase();
    if (userType === 'child') {
      router.replace('/child');
    } else if (userType === 'teen') {
      router.replace('/teen');
    } else {
      // ADMIN 등 예외 케이스 — 메인 라우터로
      router.replace('/');
    }
  }, [user, router]);

  return null;
}
