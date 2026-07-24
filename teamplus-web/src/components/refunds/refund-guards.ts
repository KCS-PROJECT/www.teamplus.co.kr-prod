/**
 * refund-guards — 환불 UI 의 stale 응답/전환 가드 판정(순수 함수)
 *
 * 컴포넌트(RefundPendingBanner / RefundRequestDetailView)의 render-time·응답 반영 가드를
 * 순수 함수로 추출해, RTL 통합 테스트가 passive effect flush 로 대신 막아 검출하지 못하는
 * "가드 로직 자체"를 단위 테스트로 직접 고정한다(mutation-sensitive). 각 함수의 가드 조건을
 * 제거하면 대응 단위 테스트가 즉시 실패한다.
 */

/** 상세 fetch 응답의 세대(generation) 스냅샷 — requestId(라우트) + gen(요청 세대). */
export interface DetailFetchToken {
  requestId: string;
  gen: number;
}

/**
 * 배너 count 를 scopeKey 에 귀속시키는 render-time fail-closed 판정.
 * state 가 현재 scopeKey 에 귀속됐을 때만 count 를 노출하고, 불일치(scope/scopeId 전환의
 * render~passive-effect 구간)면 0 을 반환해 이전 scope 의 count 가 새 링크와 결합되지 않게 한다.
 */
export function resolveBannerCount(
  state: { scopeKey: string; count: number },
  currentScopeKey: string,
): number {
  if (state.scopeKey !== currentScopeKey) return 0; // 가드: scopeKey 불일치 → fail-closed
  return state.count;
}

/**
 * 상세 fetch 응답을 현재 화면에 반영해도 되는지 판정(초기/retry/refresh/reload 4경로 공용).
 * 현재 라우트 requestId 와 자기 세대(gen)가 **모두** 일치할 때만 true. 특히 "세대는 최신인데
 * requestId 만 다른"(전환 render~effect 구간) 경우 false — requestId 비교를 제거하면 이 케이스가
 * 통과해버리므로, 동기 requestId 가드의 필요성을 이 판정이 보장한다.
 */
export function shouldApplyDetailResponse(
  captured: DetailFetchToken,
  current: DetailFetchToken,
): boolean {
  return captured.requestId === current.requestId && captured.gen === current.gen;
}

/**
 * 액션(승인/거절/재처리/정산) 응답·부수효과를 현재 화면에 적용해도 되는지 판정.
 * 액션은 세대를 쓰지 않고 캡처한 라우트 requestId 와 현재 라우트만 대조한다(다른 상세로 전환 시 억제).
 */
export function isActionStillCurrent(
  capturedRequestId: string,
  currentRequestId: string,
): boolean {
  return capturedRequestId === currentRequestId;
}
