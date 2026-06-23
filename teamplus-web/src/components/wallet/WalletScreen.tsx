'use client';

import { ReactNode, useState } from 'react';
import { WalletAppBar, type WalletAppBarProps } from './WalletAppBar';
import { WalletTabs, type WalletTab } from './WalletTabs';
import { WalletFloatingActions, type WalletFloatingActionsProps } from './WalletFloatingActions';

/**
 * WalletScreen — 월렛 4탭 컨테이너
 *
 * 5개 메인 페이지(parent/coach/director/admin/student)가 공통으로 사용.
 * 역할별 콘텐츠는 props로 주입.
 *
 * 레이아웃:
 *   ┌────────────────────────┐
 *   │ WalletAppBar           │  (sticky 영역 X — 본문 위 고정 높이)
 *   ├────────────────────────┤
 *   │ WalletTabs (underline) │
 *   ├────────────────────────┤
 *   │                        │
 *   │ tab body (overflow-y)  │
 *   │                        │
 *   │ ┌──QR──┐    ┌─아이스+─┐│  ← Floating
 *   └────────────────────────┘
 *   (BottomNav 는 layout.tsx 에서 fixed 로 별도 렌더)
 */
export interface WalletScreenProps<T extends string = string> {
  tabs: WalletTab<T>[];
  initialTab?: T;
  /** 탭별 본문 — { tabId: ReactNode } */
  tabContents: Record<string, ReactNode>;
  appBar?: WalletAppBarProps;
  floating?: WalletFloatingActionsProps | false; // false 면 미표시
  /** 페이지 상단 고정 노드 (예: 풀투리프레시 인디케이터) */
  stickyTop?: ReactNode;
}

export function WalletScreen<T extends string = string>({
  tabs,
  initialTab,
  tabContents,
  appBar,
  floating,
  stickyTop,
}: WalletScreenProps<T>) {
  const [tab, setTab] = useState<T>(initialTab ?? tabs[0]?.id);

  return (
    <div
      className="bg-wbg dark:bg-puck font-sans flex flex-col"
      style={{ width: '100%', minHeight: '100vh', position: 'relative' }}
    >
      {stickyTop}
      <WalletAppBar {...appBar} />
      {/* [2026-06-17] 탭이 1개면 탭 바 숨김 — 선택지가 없는 단일 탭 UI 군더더기 제거. */}
      {tabs.length > 1 && (
        <WalletTabs tabs={tabs} value={tab} onChange={setTab} />
      )}

      <main
        className="overflow-y-auto"
        style={{
          flex: 1,
          // BottomNav 60px + safe-area + Floating(52px) + breathing(20px)
          paddingBottom:
            'calc(60px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)) + 52px + 20px)',
        }}
        role="tabpanel"
      >
        {tabContents[tab as string] ?? null}
      </main>

      {floating !== false && <WalletFloatingActions {...floating} />}
    </div>
  );
}
