'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import { MESSAGES } from '@/lib/messages';

/** 토스가 사용자 취소에 붙이는 실패 코드. 나이스 취소 판정은 서버가 `cancel=1` 로 실어 보낸다. */
const TOSS_USER_CANCEL_CODE = 'PAY_PROCESS_CANCELED';

/**
 * 첫 렌더 시점에 현재 히스토리 항목이 `useBlockBackNavigation` 의 보초인지.
 *  `?error=fail` 은 새로고침·앞뒤 이동 뒤에도 URL 에 남는데, 그 파라미터는 뒤로가기 차단의
 *  스위치라 지울 수 없다. 대신 차단 훅이 처음 도착 때 쌓는 보초 항목(state
 *  `teamplusBackBlock` — useBlockBackNavigation `SENTINEL_STATE`)을 본다. 처음 도착한
 *  문서는 서버 리다이렉트 항목이라 state 가 비어 있고, 새로고침·앞뒤 이동으로 다시 연
 *  문서는 브라우저가 보초 항목의 state 를 복원해 첫 렌더부터 표식이 보인다.
 *  effect 안에서 읽으면 안 된다 — 차단 훅의 effect 가 먼저 실행돼 보초를 쌓은 뒤라
 *  처음 도착도 표식이 보인다. (`useBlockBackNavigation` 의 `mountedOnSentinel` 과 동일 기준.)
 *  Navigation Timing 의 로드 종류(reload/back_forward)는 Android WebView 가 `reload()` 를
 *  `navigate` 로 보고해 단독으로는 쓸 수 없고, 보조 신호로만 둔다.
 */
function readMountedOnSentinel(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(
      (window.history.state as { teamplusBackBlock?: unknown } | null)?.teamplusBackBlock,
    );
  } catch {
    return false;
  }
}

function isReloadOrHistoryTraversal(): boolean {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') {
    return false;
  }
  const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
  if (!entry) return false;
  return entry.type === 'reload' || entry.type === 'back_forward';
}

/**
 * 결제창에서 결제 화면으로 돌아온 진입(`error=fail`)에 안내 토스트를 1회 띄운다.
 * 같은 URL 을 새로고침하거나 앞뒤 이동으로 다시 열면 띄우지 않는다.
 *
 *  결제창 단계 실패는 종류를 불문하고 승인이 없어 돈이 나가지 않았고, 결제창이 이미 팝업으로
 *  이유를 알린 뒤다. 그래서 우리는 한 줄만 보탠다(토스 failUrl·포트원 redirect 관행).
 *  - 서버가 `cancel=1` 로 판정(나이스)·토스 취소 코드·코드 없음 → "결제를 취소했어요"
 *  - 그 외 코드(카드사 인증 실패·최소 금액·시간 초과·카드 거절 등) → "결제가 진행되지 않았어요"
 *
 *  결제 화면 3곳(수업·후불·대회)이 공유한다. 뒤로가기 차단은 각 화면의
 *  `useBlockBackNavigation` 이 그대로 맡는다. 이 훅은 그 차단 훅과 같은 화면에서
 *  함께 쓰는 것을 전제한다(보초 표식을 새로고침 판별에 쓴다).
 */
export function usePaymentCancelReturnNotice(): void {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const isFailReturn = (searchParams?.get('error') ?? '') === 'fail';
  const failCode = searchParams?.get('code') ?? '';
  const isUserCancel =
    !failCode ||
    searchParams?.get('cancel') === '1' ||
    failCode === TOSS_USER_CANCEL_CODE;
  const shownRef = useRef(false);
  // 첫 렌더에서 한 번만 읽는다 — 이후에는 차단 훅이 보초를 쌓아 값이 바뀐다.
  const reopenedRef = useRef(readMountedOnSentinel() || isReloadOrHistoryTraversal());

  useEffect(() => {
    if (!isFailReturn || shownRef.current) return;
    shownRef.current = true;
    if (reopenedRef.current) return;
    toast.info(
      isUserCancel
        ? MESSAGES.payment2.paymentCancelledReturn
        : MESSAGES.payment2.paymentFailedReturn,
    );
  }, [isFailReturn, isUserCancel, toast]);
}
