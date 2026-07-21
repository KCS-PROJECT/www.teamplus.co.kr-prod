'use client';

/**
 * /tournaments/[id]/students — 대회 상세 참가자 섹션(#participants) 통합 리다이렉트.
 *
 * 선수정보·결제현황은 대회 상세(/tournaments/[id])의 참가자 섹션으로 통합되었다.
 * 이 경로는 외부 딥링크·북마크 안전망으로 유지하되, 진입 시 상세로 즉시 이동한다.
 *   · next.config redirects 는 hash(#participants) 를 목적지에 실을 수 없고 동적 [id]
 *     세그먼트 보존이 필요하므로, 클라이언트 in-page 리다이렉트를 사용한다.
 *   · usePageReady(true) 즉시 — 로더는 useNavigation.replace 가 관리한다.
 */

import { useEffect } from 'react';
import { useParams } from 'next/navigation';

import { MobileContainer } from '@/components/layout/MobileContainer';
import { useNavigation } from '@/hooks/useNavigation';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';

export default function TournamentStudentsRedirectPage() {
  const params = useParams();
  const { replace } = useNavigation();
  const id = (params?.id ?? '') as string;

  usePageReady(true);
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
    showBackButton: true,
  });

  useEffect(() => {
    if (!id) return;
    void replace(`/tournaments/${encodeURIComponent(id)}#participants`);
  }, [id, replace]);

  return (
    <MobileContainer hasBottomNav>
      <main className="flex-1 bg-it-canvas dark:bg-puck" aria-hidden="true" />
    </MobileContainer>
  );
}
