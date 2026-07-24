'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { MESSAGES } from '@/lib/messages';
import { RefundRequestDetailView } from '@/components/refunds/RefundRequestDetailView';
import { useRouteUser } from '../../../route-auth-context';

/**
 * 팀 환불 요청 상세 + 승인/거절/재처리 — /director-payments/refunds/[requestId]
 */
export default function DirectorRefundDetailPage() {
  const params = useParams();
  const requestId = typeof params?.requestId === 'string' ? params.requestId : '';
  // 역할은 (director) layout 이 해석해 RouteUserProvider 로 전달 — page 는 파생 컨텍스트만 읽음.
  //   승인 권한은 DetailView 가 sourceType(DIRECT=admin 전용)과 함께 판정한다.
  const user = useRouteUser();

  const [ready, setReady] = useState(false);
  usePageReady(ready);

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    appBarTitle: MESSAGES.refund.detailTitle,
    showBottomNav: true,
    showBackButton: true,
  });

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title={MESSAGES.refund.detailTitle} forceNative />
      <main
        className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck"
        role="main"
        aria-label={MESSAGES.refund.detailTitle}
      >
        <RefundRequestDetailView
          key={requestId}
          requestId={requestId}
          scope="team"
          userType={user?.userType}
          onReady={() => setReady(true)}
        />
      </main>
    </MobileContainer>
  );
}
