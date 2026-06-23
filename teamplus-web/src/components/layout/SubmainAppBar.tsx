'use client';

import { PageAppBar } from './PageAppBar';
import { useNavigation } from '@/components/ui/NavLink';
import { useNotificationCount } from '@/hooks/useNotificationCount';

/**
 * SubmainAppBar — BottomNav 탭 허브 화면 전용 thin wrapper (2026-04-30)
 *
 * 메인 대시보드(`<PageAppBar variant="main" />`) 와 **시각적으로 100% 동일**한 디자인을
 * BottomNav 탭으로 진입하는 ~26개 허브 화면(자녀관리·일정·회원·정산 등) 에 일괄 적용.
 *
 * 4-액션 핸들러 표준:
 *   검색   → /search
 *   타임라인 → /notifications  (미읽음 카운트 자동 배지)
 *   알림(prop명 onMy) → /notifications  (2026-05-07 변경 — 우측 3번째 액션 "마이" → "알림" 영역)
 *   메뉴   → PageAppBar 내부 GlobalMenu 자동 활성 (onMenu undefined)
 *
 * 사용 예:
 *   import { SubmainAppBar } from '@/components/layout/SubmainAppBar';
 *   <SubmainAppBar title="자녀 관리" />
 *
 * 관계:
 *   - WalletAppBar (메인 대시보드 6종) → variant="main"
 *   - SubmainAppBar (BottomNav 탭 허브 ~26개) → variant="submain"
 *   - PageAppBar (직접) — 일반 서브 페이지 215+ 개 → variant="default"
 */
export interface SubmainAppBarProps {
  title: string;
  forceNative?: boolean;
}

export function SubmainAppBar({ title, forceNative = true }: SubmainAppBarProps) {
  const { navigate } = useNavigation();
  const { unreadCount } = useNotificationCount();

  return (
    <PageAppBar
      variant="submain"
      title={title}
      // [수정 2026-05-07] Flutter WebView(Native) 환경에서도 4-icon 헤더 강제 표시.
      // SubmainAppBar 사용 페이지는 useNativeUI({ showAppBar: false }) 로 네이티브 AppBar 도
      // 끄므로, forceNative 없이는 isNative 가드(PageAppBar.tsx:207)에 의해 헤더가 통째로
      // 사라지는 회귀 발생. WalletAppBar(main) 와 동일 처리.
      forceNative={forceNative}
      mainActions={{
        onSearch: () => navigate('/search'),
        // [변경 2026-05-17] 타임라인/알림 destination 분리:
        //   타임라인(시계) → /timeline, 알림(벨) → /notifications
        //   (이전 /notices 오라우팅 일괄 정정 — onTimeline 12개 호출부 동기화)
        onTimeline: () => navigate('/timeline'),
        timelineBadge: unreadCount > 0 ? unreadCount : null,
        onMy: () => navigate('/notifications'),
        onMenu: undefined,
      }}
    />
  );
}

export default SubmainAppBar;
