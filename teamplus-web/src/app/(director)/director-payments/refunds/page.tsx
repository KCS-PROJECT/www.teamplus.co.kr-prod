'use client';

import { useState } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { MESSAGES } from '@/lib/messages';
import { RefundRequestListView } from '@/components/refunds/RefundRequestListView';

/**
 * 팀 환불 요청 목록 (감독/ADMIN) — /director-payments/refunds
 * 소속 팀 스코프는 백엔드가 저장된 team_id 스냅샷으로 해석한다(scope='team').
 */
export default function DirectorRefundsPage() {
  const [ready, setReady] = useState(false);
  usePageReady(ready);

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    appBarTitle: MESSAGES.refund.listTitle,
    showBottomNav: true,
    showBackButton: true,
  });

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title={MESSAGES.refund.listTitle} forceNative />
      <main
        className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck"
        role="main"
        aria-label={MESSAGES.refund.listTitle}
      >
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
        <RefundRequestListView scope="team" onReady={() => setReady(true)} />
      </main>
    </MobileContainer>
  );
}
