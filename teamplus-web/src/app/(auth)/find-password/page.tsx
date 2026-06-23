'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';

/**
 * 비밀번호 찾기 페이지 - 통합 계정찾기 페이지로 리다이렉트
 * /find-id?tab=password 로 이동하여 탭 전환 애니메이션 지원
 */
export default function FindPasswordPage() {
  usePageReady(true); // 정적 페이지 — 마운트 즉시 ready
  const router = useRouter();

  // [정책 2026-06-15 사용자 직접 지시] 계정 찾기는 AppStatus(상단 상태바)를 표시한다.
  //   이 페이지는 /find-id?tab=password 로 즉시 리다이렉트되는 스텁이며, 리다이렉트 후
  //   find-id 도 동일 표시 정책이라 일관 유지. 예외 목록 SoT 는 @/lib/app-status.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
  });

  useEffect(() => {
    // 통합 페이지의 비밀번호 탭으로 리다이렉트
    router.replace('/find-id?tab=password', { scroll: false });
  }, [router]);

  // 리다이렉트 중 빈 화면 대신 로딩 표시
  return (
    <MobileContainer hasBottomNav={false} className="bg-wbg dark:bg-puck">
      <main data-no-enter className="flex flex-1 items-center justify-center" role="status" aria-live="polite" aria-busy="true">
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-8 h-8 border-2 border-ice-500 border-t-transparent rounded-w-pill animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          <p className="text-card-body text-wtext-3 dark:text-rink-300">로딩중...</p>
          <span className="sr-only">비밀번호 찾기 페이지로 이동 중입니다.</span>
        </div>
      </main>
    </MobileContainer>
  );
}
