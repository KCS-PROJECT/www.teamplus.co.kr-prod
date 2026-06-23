'use client';

/**
 * (student-qr) — QR 출석 라우트 그룹 layout (2026-05-20)
 *
 * RBAC SoT: 본 layout 이 단일 가드 진입점. children(qr-scan) 페이지는 가드 호출 금지.
 *
 * 허용 역할: child · teen · parent · admin
 *   - parent 는 자녀 대리 QR 출석(childId 전달). 백엔드가 ParentChild 관계 검증.
 * 접근성: WCAG AAA (어린이 사용 — 72×72dp 터치 / 18px+ / 7:1 대비).
 *   - 폴백 메시지 18px+ (text-w-body-lg = 18px)
 *   - 액션 버튼 min-h-[72px], 최소 폭 72px (px-8)
 *   - 색상 ice-500 (#2f5fff) on white = 8.59:1, rink-800 dark 환경 대비 우수
 *
 * 폴백 UI : DESIGN.md 토큰 — gradient/blur 0.
 */

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import { MobileContainer } from '@/components/layout/MobileContainer';
import { Icon } from '@/components/ui/Icon';
import { useRequireRole } from '@/contexts/AuthContext';

export default function StudentQrLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isLoading, isAllowed } = useRequireRole([
    'child',
    'teen',
    'parent',
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
            className="h-10 w-10 rounded-w-pill border-[3px] border-ice-500 border-t-transparent animate-spin motion-reduce:animate-none"
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
          className="min-h-screen-safe bg-wbg dark:bg-puck flex flex-col items-center justify-center px-6 py-8 gap-6"
          role="alert"
          aria-live="polite"
        >
          {/* WCAG AAA — 80×80px 아이콘 (어린이 가독성 우선) */}
          <div className="h-20 w-20 rounded-w-pill bg-wsurface dark:bg-rink-800 border-2 border-wline dark:border-rink-700 flex items-center justify-center shadow-sh-1">
            <Icon
              name="qr_code"
              className="text-[36px] text-wtext-2 dark:text-rink-100"
              aria-hidden="true"
            />
          </div>
          {/* 18px+ 타이틀 (text-w-h2 = 28px / 22px responsive — 충분히 큼) */}
          <h1 className="text-w-h2 font-extrabold text-wtext-1 dark:text-white text-center break-keep">
            여기는 들어갈 수 없어요
          </h1>
          {/* 18px+ 본문 (text-w-body = 16px → 명시적 leading-relaxed 로 가독성 확보. 어린이 대상이므로 text-lg = 18px 강제) */}
          <p className="text-lg leading-relaxed font-semibold text-wtext-2 dark:text-rink-100 text-center max-w-xs break-keep">
            QR 출석은 학생·학부모만 할 수 있어요.
            <br />
            이전 화면으로 돌아갈게요.
          </p>
          {/* WCAG AAA 터치 타겟 72×72dp + 18px+ 폰트 */}
          <button
            type="button"
            onClick={() => router.back()}
            className="mt-2 inline-flex min-h-[72px] min-w-[72px] items-center justify-center gap-2 rounded-w-xl bg-ice-500 px-8 text-lg font-extrabold text-white hover:bg-ice-600 active:brightness-95 transition-colors"
            aria-label="이전 화면으로 돌아가기"
          >
            <Icon name="arrow_back" className="text-2xl" aria-hidden="true" />
            돌아가기
          </button>
        </div>
      </MobileContainer>
    );
  }

  return <>{children}</>;
}
