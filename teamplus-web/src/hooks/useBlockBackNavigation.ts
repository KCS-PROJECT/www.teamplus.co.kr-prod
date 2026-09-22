'use client';

import { useEffect, useRef } from 'react';
import { useNavigation } from '@/hooks/useNavigation';
import { stepsBackPastExternalReturn } from '@/lib/nav-stack';

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
  /**
   * 외부 도메인(결제창)을 거쳐 돌아온 페이지에서, 뒤로가기 시 `getRedirectTarget` 로
   * replace 하는 대신 **떠나기 전 실제 히스토리 항목**으로 `history.go(-n)` 한다
   * (`markExternalDeparture` 기록 기준). 기록이 없으면 replace 폴백. 결제 취소 복귀
   * 화면처럼 "결제 화면의 직전 화면으로 돌아가야" 하는 곳에서 켠다.
   */
  returnPastExternal?: boolean;
}

const SENTINEL_STATE = { teamplusBackBlock: true } as const;

/**
 * 웹이 뒤로가기를 관리 중(보초 쌓여 있음)이라는 표식. Flutter `_onHardwareBack` 이 읽어,
 * 켜져 있으면 히스토리를 여러 칸 되짚는 대신 **한 칸만** goBack 해 보초를 빼고 이 훅의
 * popstate 정책(완료 → 홈 / 취소 복귀 → 외부 블록 너머 원래 항목)에 맡긴다.
 */
const SENTINEL_FLAG = '__teamplusBackSentinelArmed';

function setSentinelFlag(on: boolean): void {
  (window as unknown as Record<string, unknown>)[SENTINEL_FLAG] = on;
}

export function useBlockBackNavigation({
  getRedirectTarget,
  enabled = true,
  returnPastExternal = false,
}: BlockBackNavigationOptions): void {
  const { replace } = useNavigation();
  // 마운트 시점에 현재 항목이 이미 보초인가 — 복귀 화면에서 새로고침한 경우다. 그 위에
  //   보초를 또 쌓으면 뒤로가기가 옛 보초에 착지해 되짚기 기준점이 한 칸 어긋난다.
  //   (첫 렌더에 읽으므로 브라우저가 복원한 state 그대로다.)
  const mountedOnSentinel =
    typeof window !== 'undefined' &&
    Boolean(window.history.state?.teamplusBackBlock);
  // 복귀 문서의 마운트 시점 history 길이 — 보초 push 전 값이어야 step 계산이 맞는다.
  //   새로고침 케이스는 현재 항목(보초)만큼 1 을 뺀다.
  const initialLengthRef = useRef(
    typeof window === 'undefined'
      ? 0
      : window.history.length - (mountedOnSentinel ? 1 : 0),
  );

  // 콜백/replace 를 ref 로 유지 — popstate 핸들러가 항상 최신 상태(결제 큐 등)를 평가.
  const getTargetRef = useRef(getRedirectTarget);
  getTargetRef.current = getRedirectTarget;
  const replaceRef = useRef(replace);
  replaceRef.current = replace;
  // 보초를 이미 쌓았는지 — React strict mode 는 마운트 효과를 정리 후 한 번 더 실행하는데
  //   컴포넌트 인스턴스(ref)는 그대로라 이 플래그로 두 번째 push 를 막는다. Next App Router 도
  //   현재 항목의 state 를 갱신하므로 state 에 실은 표식보다 ref 가 확실하다. 보초가 2개
  //   쌓이면 뒤로가기 replace 가 원 페이지 항목을 지우지 못해 "원 페이지 ↔ 리다이렉트 대상"
  //   을 무한 왕복한다.
  const armedRef = useRef(mountedOnSentinel);
  // 한 틱 미룬 replace 예약 — 연타·언마운트 시 방금 착지한 화면을 다시 replace 하지 않도록 취소한다.
  const pendingReplaceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const armSentinel = () => {
      if (armedRef.current) {
        setSentinelFlag(true);
        return;
      }
      armedRef.current = true;
      setSentinelFlag(true);
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
      if (pendingReplaceRef.current !== null) {
        clearTimeout(pendingReplaceRef.current);
        pendingReplaceRef.current = null;
      }
      // 보초가 소비됐다 — 유지(null)면 다시 쌓아야 하므로 플래그를 푼다.
      armedRef.current = false;
      setSentinelFlag(false);
      const target = getTargetRef.current();
      if (target) {
        // 외부 도메인 블록 너머의 실제 항목으로 복귀할 수 있으면 replace 대신 그리로 간다 —
        //   목록 → 상세 → 결제 → (결제창) → 복귀 에서 상세로 착지해, 이후 뒤로가기가
        //   목록으로 이어진다. 다른 문서로의 이동이라 Next 복원과 경쟁하지 않는다.
        const steps = returnPastExternal
          ? stepsBackPastExternalReturn(initialLengthRef.current)
          : null;
        if (steps) {
          window.history.go(-steps);
          return;
        }
        // 같은 popstate 를 Next App Router 도 받아 이전 화면 복원(RESTORE)을 큐에 넣는다.
        //   Next 액션 큐는 나중에 온 네비게이션이 대기 중인 것을 폐기하므로, 전체 로드로
        //   진입한 페이지(우리 리스너가 Next 보다 먼저 등록됨)에서는 우리 replace 가 먼저
        //   큐에 들어가 Next 의 복원에 버려진다 → 원 페이지가 다시 마운트되고 보초가 재무장
        //   되어 "원 페이지 ↔ 리다이렉트 대상" 을 무한 왕복한다. 한 틱 미뤄 Next 의 복원이
        //   먼저 큐에 들어가게 하면 우리 replace 가 항상 나중이라 결과가 결정적이다.
        pendingReplaceRef.current = setTimeout(() => {
          pendingReplaceRef.current = null;
          void replaceRef.current(target);
        }, 0);
      } else {
        armSentinel();
      }
    };

    armSentinel();
    window.addEventListener('popstate', handlePopstate);
    return () => {
      window.removeEventListener('popstate', handlePopstate);
      if (pendingReplaceRef.current !== null) {
        clearTimeout(pendingReplaceRef.current);
        pendingReplaceRef.current = null;
      }
      setSentinelFlag(false);
    };
  }, [enabled, returnPastExternal]);
}
