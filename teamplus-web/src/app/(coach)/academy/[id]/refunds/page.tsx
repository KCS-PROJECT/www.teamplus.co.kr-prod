'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { MESSAGES } from '@/lib/messages';
import { RefundRequestListView } from '@/components/refunds/RefundRequestListView';

/**
 * 오픈클래스 환불 요청 목록 (오픈클래스 감독/ADMIN) — /academy/[id]/refunds
 * scope='academy' + scopeId=academyId. 백엔드가 저장된 academy_id 스냅샷으로 필터.
 */
export default function AcademyRefundsPage() {
  const params = useParams();
  const academyId = typeof params?.id === 'string' ? params.id : '';

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
        <RefundRequestListView
          scope="academy"
          scopeId={academyId}
          onReady={() => setReady(true)}
        />
      </main>
    </MobileContainer>
  );
}
