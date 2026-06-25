'use client';

import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { MemberPushComposer } from '@/components/notification/MemberPushComposer';
import { useNativeUI } from '@/hooks/useNativeUI';
import { MESSAGES } from '@/lib/messages';

/**
 * 코치 — 팀 회원 푸시 알림 발송.
 * 인증/권한 체크는 (coach)/layout.tsx 에서 단 한 번 수행됨 (중복 호출 금지).
 * 로더 타이밍(usePageReady)은 MemberPushComposer 내부에서 처리.
 */
export default function CoachMemberPushPage() {
  // 폼 페이지 — Native AppBar OFF + DOM PageAppBar forceNative, BottomNav 숨김.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
    pullToRefreshEnabled: false,
  });

  return (
    <MobileContainer hasBottomNav={false}>
      <PageAppBar title={MESSAGES.memberPush.pageTitle} forceNative />
      <MemberPushComposer context="coach" iceTheme />
    </MobileContainer>
  );
}
