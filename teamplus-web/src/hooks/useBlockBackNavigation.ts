'use client';

import { useEffect, useRef } from 'react';
import { useNavigation } from '@/hooks/useNavigation';

/**
 * useBlockBackNavigation — 완료성 페이지 시스템 뒤로가기 차단 훅
 *
 * 결제 완료처럼 "되돌아가면 안 되는" 페이지에서 브라우저 뒤로가기와
 * Android 하드웨어 백키(Flutter 가 WebView history goBack 으로 위임 —
 * webview_screen.dart `_onHardwareBack`)를 가로채 지정 경로로 replace 한다.
 * iOS 인앱은 `allowsBackForwardNavigationGestures: false` 라 별도 처리 불요.
 *
 * 동작 (nav-stack.ts `markHomeSentinel` 과 동일한 sentinel 패턴):
 *  1) 마운트 시 동일 URL 의 sentinel 엔트리를 history 에 push.
 *  2) 뒤로가기 → sentinel pop → popstate 발생 → `getRedirectTarget()` 평가.
 *     - 경로 문자열 반환: 해당 경로로 replace (이전 결제 페이지 복귀 차단).
 *     - null 반환: sentinel 재무장으로 현재 페이지 유지 (복수 결제 큐 진행 중 등).
 *
 * 리스너는 마운트 범위에서만 등록/해제하므로 LoadingContext·typed-navigation 의
 * 전역 popstate 리스너와 충돌하지 않는다.
 */
export interface BlockBackNavigationOptions {
  /**
   * 뒤로가기 시도 시 이동할 경로를 반환.
   * null 이면 이동 없이 현재 페이지 유지 (sentinel 재무장).
   */
  getRedirectTarget: () => string | null;
  /** 차단 활성 여부 (기본 true) */
  enabled?: boolean;
}

const SENTINEL_STATE = { teamplusBackBlock: true } as const;

export function useBlockBackNavigation({
  getRedirectTarget,
  enabled = true,
}: BlockBackNavigationOptions): void {
  const { replace } = useNavigation();

  // 콜백/replace 를 ref 로 유지 — popstate 핸들러가 항상 최신 상태(결제 큐 등)를 평가.
  const getTargetRef = useRef(getRedirectTarget);
  getTargetRef.current = getRedirectTarget;
  const replaceRef = useRef(replace);
  replaceRef.current = replace;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const armSentinel = () => {
      try {
        window.history.pushState(
          SENTINEL_STATE,
          '',
          window.location.pathname + window.location.search + window.location.hash,
        );
      } catch {
        // 일부 WebView 에서 History API 가 보안상 차단될 수 있음 — 무시
      }
    };

    const handlePopstate = () => {
      const target = getTargetRef.current();
      if (target) {
        void replaceRef.current(target);
      } else {
        armSentinel();
      }
    };

    armSentinel();
    window.addEventListener('popstate', handlePopstate);
    return () => window.removeEventListener('popstate', handlePopstate);
  }, [enabled]);
}
