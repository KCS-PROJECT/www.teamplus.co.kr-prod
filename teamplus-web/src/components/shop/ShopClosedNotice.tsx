'use client';

import { Icon } from '@/components/ui/Icon';
import { NavLink } from '@/components/ui/NavLink';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { MESSAGES } from '@/lib/messages';

/**
 * 쇼핑몰 미오픈 안내 화면.
 *
 * `(shop)` 레이아웃이 피처 플래그 OFF 시 children 대신 이 화면을 렌더한다
 * (`shop-feature-flag.ts` 참조). 실질 차단은 백엔드 `ShopEnabledGuard`(503) 가
 * 담당하고, 이 화면은 URL 직접 접근한 사용자에게 깨진 화면·동작하지 않는 버튼
 * 대신 상태를 알린다.
 *
 * 주의:
 *   - children 이 마운트되지 않으므로 각 page 의 `usePageReady` 가 호출되지 않는다.
 *     풀스크린 로더가 MAX_WAIT(5s) 까지 남지 않도록 여기서 직접 ready 를 신호한다.
 *   - 네이티브 AppBar 는 숨기고 자체 안내 카드 + 돌아가기 CTA 만 노출한다.
 */
export function ShopClosedNotice() {
  useNativeUI({ showStatusBar: true, showAppBar: false, showBottomNav: false });
  usePageReady(true);

  return (
    <main className="min-h-screen-safe bg-wbg dark:bg-rink-900 flex items-center justify-center px-6">
      <div className="w-full max-w-sm bg-wsurface dark:bg-rink-800 rounded-w-2xl shadow-sh-1 border border-wline dark:border-white/10 p-8 text-center">
        <div className="mx-auto mb-5 w-16 h-16 rounded-w-pill bg-wline-2 dark:bg-rink-900 flex items-center justify-center">
          <Icon
            name="storefront"
            className="text-3xl text-wtext-3 dark:text-rink-300"
            aria-hidden
          />
        </div>
        <p className="text-w-body font-bold text-wtext-1 dark:text-white">
          {MESSAGES.common.featureComingSoon('쇼핑몰')}
        </p>
        <p className="mt-2 text-w-small text-wtext-3 dark:text-rink-300 leading-relaxed">
          {MESSAGES.attendance2.comingSoonSub}
        </p>
        <NavLink
          href="/"
          className="mt-7 inline-flex w-full items-center justify-center rounded-w-lg bg-ice-500 px-5 py-4 text-w-body font-bold text-white transition-colors motion-reduce:transition-none active:brightness-95"
        >
          {MESSAGES.common.goBack}
        </NavLink>
      </div>
    </main>
  );
}

export default ShopClosedNotice;
