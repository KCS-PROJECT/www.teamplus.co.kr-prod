'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import { MESSAGES } from '@/lib/messages';

/** 토스가 사용자 취소에 붙이는 실패 코드. 나이스 취소 판정은 서버가 `cancel=1` 로 실어 보낸다. */
const TOSS_USER_CANCEL_CODE = 'PAY_PROCESS_CANCELED';

/**
 * 이번 문서 로드가 결제창 리다이렉트로 처음 도착한 것인지.
 *  `?error=fail` 은 새로고침·앞뒤 이동 뒤에도 URL 에 남는데, 그 파라미터는 뒤로가기 차단
 *  (`useBlockBackNavigation`)의 스위치라 지울 수 없다. 대신 로드 종류로 가른다 —
 *  reload / back_forward 면 이미 안내한 복귀라 다시 띄우지 않는다.
 *  Navigation Timing 을 못 주는 환경은 판별 불가 → 종전대로 띄운다.
 */
function isFirstArrival(): boolean {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') {
    return true;
  }
  const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
  if (!entry) return true;
  return entry.type !== 'reload' && entry.type !== 'back_forward';
}

/**
 * 결제창에서 결제 화면으로 돌아온 진입(`error=fail`)에 안내 토스트를 1회 띄운다.
 * 같은 URL 을 새로고침하거나 앞뒤 이동으로 다시 열면 띄우지 않는다(`isFirstArrival`).
 *
 *  결제창 단계 실패는 종류를 불문하고 승인이 없어 돈이 나가지 않았고, 결제창이 이미 팝업으로
 *  이유를 알린 뒤다. 그래서 우리는 한 줄만 보탠다(토스 failUrl·포트원 redirect 관행).
 *  - 서버가 `cancel=1` 로 판정(나이스)·토스 취소 코드·코드 없음 → "결제를 취소했어요"
 *  - 그 외 코드(카드사 인증 실패·최소 금액·시간 초과·카드 거절 등) → "결제가 진행되지 않았어요"
 *
 *  결제 화면 3곳(수업·후불·대회)이 공유한다. 뒤로가기 차단은 각 화면의
 *  `useBlockBackNavigation` 이 그대로 맡는다.
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

  useEffect(() => {
    if (!isFailReturn || shownRef.current) return;
    shownRef.current = true;
    if (!isFirstArrival()) return;
    toast.info(
      isUserCancel
        ? MESSAGES.payment2.paymentCancelledReturn
        : MESSAGES.payment2.paymentFailedReturn,
    );
  }, [isFailReturn, isUserCancel, toast]);
}
