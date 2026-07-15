"use client";

import { Suspense } from "react";
import { useDeeplinkRouter } from "@/hooks/useDeeplinkRouter";

/**
 * DeeplinkRouterMount — `useDeeplinkRouter` 를 전역 1회 마운트해 자동 딥링크 라우팅 활성화.
 *
 * SNS 공유 링크(`https://teamplusweb.icetimes.co.kr/...?deeplink=/classes/123`)나
 * 외부 진입 URL 의 `?deeplink=` 쿼리를 감지 → 안전성 검사 → 내부 라우팅한다.
 *
 * ⚠️ `queryKeys` 를 `['deeplink']` 로 제한한다. 기본값(`['deeplink','redirect']`)을 쓰면
 *    로그인 인증 리다이렉트(`?redirect=`)를 가로채 인증 플로우를 깨뜨리므로,
 *    딥링크 전용 키만 소비한다. (auth 는 `?redirect=` 를 독점 사용)
 *
 * `useDeeplinkRouter` 내부의 `useSearchParams` 는 Suspense 경계를 요구하므로 감싼다.
 */
function DeeplinkRouterInner() {
  useDeeplinkRouter({ queryKeys: ["deeplink"] });
  return null;
}

export function DeeplinkRouterMount() {
  return (
    <Suspense fallback={null}>
      <DeeplinkRouterInner />
    </Suspense>
  );
}

export default DeeplinkRouterMount;
