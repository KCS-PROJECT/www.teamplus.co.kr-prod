'use client';

import { ReactNode } from 'react';
import { useRequireRole } from '@/contexts/AuthContext';
import { RoleBottomNav } from '@/components/layout/RoleBottomNav';
import { ShopClosedNotice } from '@/components/shop/ShopClosedNotice';
import { SHOP_ENABLED } from '@/components/shop/shop-feature-flag';

/**
 * 쇼핑몰 라우트 그룹 레이아웃.
 *
 * [2026-07-30 · 전자상거래법 리스크 차단]
 * 쇼핑몰은 1차 오픈 범위에서 제외되었으므로 피처 플래그 OFF 동안 8개 페이지 전체를
 * 렌더하지 않고 안내 화면으로 대체한다. `SHOP_ENABLED` 는 빌드 타임 상수라
 * 런타임 중 값이 바뀌지 않으므로, 분기별로 서로 다른 컴포넌트를 렌더해도
 * Hook 순서 규칙을 위반하지 않는다.
 *
 * 실질 차단의 SoT 는 백엔드 `SHOP_ENABLED` + `ShopEnabledGuard`(503 SHOP_DISABLED).
 * 오픈 전 필수 조치: docs/Planning/SHOP_LAUNCH_CHECKLIST.md
 */
export default function ShopLayout({ children }: { children: ReactNode }) {
  if (!SHOP_ENABLED) {
    return <ShopClosedNotice />;
  }
  return <ShopEnabledLayout>{children}</ShopEnabledLayout>;
}

function ShopEnabledLayout({ children }: { children: ReactNode }) {
  // 상품/결제권 충전은 결제 가능한 역할만 허용.
  // - parent: 기본 구매자
  // - teen: 열람·장바구니 (백엔드 주문 생성은 PARENT/COACH/ADMIN 만 허용)
  // - director/coach/admin/academy_director: 본인 결제권 충전 및 관리 목적
  //
  // [2026-07-30] `child` 제거 — 미성년자(특히 아동)에게 결제 화면을 노출하는 것은
  //   민법 §5 취소권 리스크이자 Apple Kids / Google Families 정책 리스크다.
  //   TEEN 도 미성년자이므로 오픈 시 열람 범위 재확정 필요 (CHECKLIST B-6).
  const { isLoading, isAllowed } = useRequireRole([
    'parent',
    'teen',
    'director',
    'coach',
    'admin',
    'academy_director',
  ]);

  if (isLoading) {
    return <div className="min-h-screen-safe bg-wbg dark:bg-rink-900" />;
  }

  if (!isAllowed) return null;

  return (
    <div className="min-h-screen-safe flex flex-col">
      <div className="flex-1 min-h-0">{children}</div>
      <RoleBottomNav />
    </div>
  );
}
