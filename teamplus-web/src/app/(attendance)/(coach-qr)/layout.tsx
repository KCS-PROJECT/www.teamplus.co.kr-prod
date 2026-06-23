'use client';

/**
 * (coach-qr) — 출석 코치/감독 전용 라우트 그룹 layout (2026-05-20)
 *
 * RBAC SoT: 본 layout 이 단일 가드 진입점. children(qr-generate, attendance/[scheduleId])
 *   페이지는 가드 호출 금지 — isAllowed=false 시 폴백 UI 가 children 을 가린다.
 *
 * 허용 역할: coach · director · academy_director · admin
 * 폴백 UI : DESIGN.md 토큰 — gradient/blur 0.
 */

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import { MobileContainer } from '@/components/layout/MobileContainer';
import { Icon } from '@/components/ui/Icon';
import { useRequireRole } from '@/contexts/AuthContext';

export default function CoachQrLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isLoading, isAllowed } = useRequireRole([
    'coach',
    'director',
    'academy_director',
    'admin',
  ]);

  if (isLoading) {
    return (
      <MobileContainer>
        <div
          className="min-h-screen-safe bg-wbg dark:bg-puck flex items-center justify-center"
          aria-busy="true"
        >
          <div
            className="h-8 w-8 rounded-w-pill border-2 border-ice-500 border-t-transparent animate-spin motion-reduce:animate-none"
            aria-label="권한 확인 중"
          />
        </div>
      </MobileContainer>
    );
  }

  if (!isAllowed) {
    return (
      <MobileContainer>
        <div
          className="min-h-screen-safe bg-wbg dark:bg-puck flex flex-col items-center justify-center px-6 py-8 gap-4"
          role="alert"
          aria-live="polite"
        >
          <div className="h-16 w-16 rounded-w-pill bg-wsurface dark:bg-rink-800 border border-wline dark:border-rink-700 flex items-center justify-center shadow-sh-1">
            <Icon
              name="qr_code_scanner"
              className="text-2xl text-wtext-3 dark:text-rink-300"
              aria-hidden="true"
            />
          </div>
          <h1 className="text-w-h3 font-extrabold text-wtext-1 dark:text-white text-center break-keep">
            접근 권한이 없어요
          </h1>
          <p className="text-w-body text-wtext-3 dark:text-rink-300 text-center max-w-xs break-keep">
            QR 생성과 출석 관리는 코치만 가능해요.
          </p>
          <button
            type="button"
            onClick={() => router.back()}
            className="mt-2 inline-flex min-h-[48px] items-center justify-center gap-1.5 rounded-w-md bg-ice-500 px-6 text-w-body font-bold text-white hover:bg-ice-600 active:brightness-95 transition-colors"
          >
            이전으로 돌아가기
          </button>
        </div>
      </MobileContainer>
    );
  }

  return <>{children}</>;
}
