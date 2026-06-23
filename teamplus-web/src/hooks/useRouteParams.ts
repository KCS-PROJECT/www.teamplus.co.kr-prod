'use client';

/**
 * useRouteParams — 타입드 네비게이션 수신측 훅
 *
 * 송신 화면이 `navigate({ to, forward, onBack })` 으로 전달한 데이터를 읽고,
 * `sendBack(result)` 또는 `back({ result })` 로 결과를 부모에게 회수한다.
 *
 * @example
 * import { useRouteParams } from '@/hooks/useRouteParams';
 * import { useNavigation } from '@/hooks/useNavigation';
 *
 * type Forward  = { highlight?: 'roster' | 'rules' };
 * type Backward = { applied?: boolean };
 *
 * export default function MatchDetail() {
 *   const { forward } = useRouteParams<Forward, Backward>();
 *   const { back } = useNavigation();
 *
 *   useEffect(() => {
 *     if (forward?.highlight === 'roster') scrollToRoster();
 *   }, [forward]);
 *
 *   const handleApply = async () => {
 *     await applyToMatch();
 *     back({ result: { applied: true } });
 *   };
 *   ...
 * }
 *
 * 주의:
 *  - forward 는 SessionStorage 에 보존되어 새로고침 후에도 유지된다.
 *  - sendBack 으로 보낸 결과는 `back()` (또는 브라우저 뒤로가기) 시점에 발화된다.
 *  - 송신 화면이 새로고침으로 unmount 되면 onBack 콜백은 손실 (그 경우 송신 화면 자체가 사라져 무관).
 */

import { useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import {
  NAV_ID_PARAM,
  getNavEntry,
  setPendingBackward,
} from '@/lib/typed-navigation';

export interface UseRouteParamsReturn<TForward, TBackward> {
  /** 현재 화면의 nav id. typed nav 로 진입하지 않았으면 null. */
  navId: string | null;
  /** 송신 화면이 전달한 forward 데이터. 미전달 시 undefined. */
  forward: TForward | undefined;
  /**
   * 부모 화면 onBack 으로 보낼 결과를 큐잉. 실제 발화는 뒤로가기 시점.
   * 여러 번 호출하면 마지막 값으로 덮어쓴다.
   */
  sendBack: (result: TBackward) => void;
  /** typed nav 로 진입 + forward 가 존재하는지 여부. */
  hasForward: boolean;
}

/**
 * 타입드 네비게이션 수신측 훅.
 *
 * @template TForward  송신 화면이 보낸 forward 데이터 타입
 * @template TBackward 부모 onBack 으로 회수할 결과 타입
 */
export function useRouteParams<
  TForward = unknown,
  TBackward = unknown,
>(): UseRouteParamsReturn<TForward, TBackward> {
  const searchParams = useSearchParams();
  const navId = searchParams?.get(NAV_ID_PARAM) ?? null;

  // forward 는 navId 변경 시점에 SessionStorage 에서 한 번 읽는다.
  // 동일 navId 의 forward 가 외부 코드로 변경되는 케이스는 본 시스템에 없으므로
  // storage 이벤트 구독은 불필요하며, hydration mismatch 위험을 회피한다.
  const forward = useMemo<TForward | undefined>(() => {
    if (!navId) return undefined;
    const entry = getNavEntry(navId);
    return (entry?.forward as TForward | undefined) ?? undefined;
  }, [navId]);

  const sendBack = useCallback(
    (result: TBackward) => {
      setPendingBackward(navId, result);
    },
    [navId],
  );

  return {
    navId,
    forward,
    sendBack,
    hasForward: forward !== undefined,
  };
}
