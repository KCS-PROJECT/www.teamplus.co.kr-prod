'use client';

import { cn } from '@/lib/utils';
import { CSSProperties, ReactNode } from 'react';

interface MobileContainerProps {
  children: ReactNode;
  className?: string;
  /**
   * BottomNav 영역(60px + safe-area-inset-bottom) 만큼 컨테이너 하단에 padding 을 부여.
   * - `true` (기본): (parent)/(coach)/(director)/(student)/(child)/(admin)/(common) 그룹 layout 이
   *   `<RoleBottomNav />` 또는 명시적 *BottomNav 를 렌더하는 경우. 본문 컨텐츠가 BottomNav 에
   *   가리지 않도록 자동 하단 여백을 확보한다.
   * - `false`: 페이지가 자체 sticky/floating 액션 바를 사용하거나, BottomNav 자체가 없는 라우트
   *   (예: 로그인/onboarding/풀스크린 모달). 이 경우 페이지가 직접 `safe-area-inset-bottom`
   *   처리를 책임진다 — globals.css 의 `.pb-safe-3`/`.pb-safe-4` 유틸을 본문에,
   *   `.bottom-fab-safe` 유틸을 fixed 액션 버튼에 적용 권장.
   *
   * ⚠️ 페이지가 자체 sticky action bar 를 쓰는 경우(예: /children/[childId]/edit 의 "수정하기")
   *   hasBottomNav 를 그대로 `true` 로 두고 globals.css `.bottom-fab-safe` 유틸로 BottomNav 위
   *   12px 위치에 띄우는 패턴이 표준. (이렇게 하면 BottomNav 와 액션 버튼이 동일한
   *   `var(--safe-area-inset-bottom, env(...))` 우선순위를 공유하여 위치 불일치 회귀가 차단됨.)
   */
  hasBottomNav?: boolean;
  /**
   * 오버레이로 동작해야 할 때 z-index 지정 (예: BottomNav를 덮어야 하는 상세 페이지).
   * 생략하면 기본 stacking context(auto) 사용.
   */
  zIndex?: number;
  /**
   * 접근성 — Landmark label.
   * 페이지가 명시적으로 다른 ARIA region 임을 알려야 할 때 사용. 미지정 시 묵시적으로
   * page 의 <main> 이 landmark 역할을 한다 (RoleBottomNav 등 sibling 은 `<nav>` 로 처리).
   */
  ariaLabel?: string;
}

/**
 * MobileContainer - 네이티브 환경 인식 모바일 컨테이너
 *
 * - Native 환경: Flutter Shell이 제공하는 헤더/바텀네비 사용
 * - Web 환경: 웹용 헤더/바텀네비 사용
 */
export function MobileContainer({
  children,
  className,
  hasBottomNav = true,
  zIndex,
  ariaLabel,
}: MobileContainerProps) {
  const outerStyle: CSSProperties = {
    ...(zIndex !== undefined ? { zIndex } : {}),
    // 2026-05-12: status bar safe-area 통합.
    //   MobileContainer 가 `fixed inset-0` 이므로 globals.css `body` 의
    //   `padding-top: env(safe-area-inset-top)` 을 상속받지 못한다.
    //   → outer fixed 컨테이너 자체에 paddingTop 을 직접 적용해야 iPhone notch /
    //     Android punch-hole / Dynamic Island 와의 시각적 충돌이 차단된다.
    //
    //   Native (Flutter WebView) 환경: ClientProviders.subscribeToDeviceMetrics 가
    //   --safe-area-inset-top 을 0px 로 주입 (Flutter Scaffold 가 이미 status bar
    //   영역을 예약함) → padding 적용되지 않아 중복 마진 없음.
    //   Web/PWA 환경: env(safe-area-inset-top) 폴백 → 실제 notch 값만큼 push.
    //
    //   Android WebView 의 env() 0px 평가 회귀 회피를 위해 CSS 변수 우선 + env() 폴백.
    paddingTop: 'var(--safe-area-inset-top, env(safe-area-inset-top, 0px))',
    paddingLeft: 'var(--safe-area-inset-left, env(safe-area-inset-left, 0px))',
    paddingRight: 'var(--safe-area-inset-right, env(safe-area-inset-right, 0px))',
  };

  return (
    <div
      className="fixed inset-0 bg-wbg dark:bg-rink-900 flex justify-center overflow-hidden"
      style={outerStyle}
      suppressHydrationWarning
    >
      <div
        className={cn(
          'max-w-none bg-wbg dark:bg-rink-900 h-full min-h-0 relative shadow-md flex flex-col',
          // 공통 본문 하단 여백: 직계 자식 <main> 에 pb-30(7.5rem=120px) 자동 적용
          // CSS specificity (0,1,1) > 개별 페이지의 pb-* (0,1,0) 을 덮어씀
          '[&>*]:min-h-0 [&>main]:pb-30',
          // BottomNav 는 `position: fixed` 로 layout flow 에서 빠져있고 내부적으로
          // `h-[60px] + safe-area-inset-bottom` 높이를 가진다.
          // 외부 컨테이너에 고정 72px padding 을 주면 브라우저(safe-area=0)에서는
          // BottomNav 높이(60px)와 12px 차이가 생겨 slate-50 배경이
          // BottomNav 상단에 '줄무늬' 처럼 노출된다. (iOS PWA/WebView 에서는
          // safe-area-inset 이 34px+ 이라 반대로 BottomNav 가 콘텐츠를 덮는다.)
          // → 고정 72px 대신 실제 BottomNav 높이와 일치하는 calc 식 사용.
          //
          // 2026-05-08 v2: Android WebView 에서 var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)) 이 0px 로
          // 평가되어 BottomNav 가 navigation/indicator 영역을 침범하는 문제 해결.
          // --safe-area-inset-bottom (Native Bridge 주입) 우선, env() 폴백.
          hasBottomNav && 'pb-[calc(60px+var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)))]',
          className
        )}
        style={{ width: 'min(100%, var(--mobile-shell-width, 448px))' }}
        data-mobile-shell
        aria-label={ariaLabel}
        suppressHydrationWarning
      >
        {children}
      </div>
    </div>
  );
}
