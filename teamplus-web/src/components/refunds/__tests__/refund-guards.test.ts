/**
 * refund-guards 단위 테스트 — 가드 판정 순수 함수(mutation-sensitive).
 *
 * RTL 통합 테스트는 rerender 의 passive-effect flush 가 초기화/세대 증가로 대신 막아,
 * 동기 가드 라인을 제거해도 통과할 수 있다. 여기서는 가드 로직 자체를 직접 검증한다 —
 * 각 테스트 옆 주석의 "가드 제거 시" 조건이 곧 그 테스트가 잡는 회귀다.
 */

import {
  resolveBannerCount,
  shouldApplyDetailResponse,
  isActionStillCurrent,
} from '@/components/refunds/refund-guards';

describe('resolveBannerCount', () => {
  it('scopeKey 일치 → count 그대로', () => {
    expect(resolveBannerCount({ scopeKey: 'academy:a1', count: 3 }, 'academy:a1')).toBe(3);
  });

  it('scopeKey 불일치 → 0 (가드: scopeKey 검사 제거 시 3 이 새 링크와 결합되어 실패)', () => {
    // team 에서 3건 표시 중 academy 로 전환된 render~effect 구간을 등가로 재현.
    expect(resolveBannerCount({ scopeKey: 'team:', count: 3 }, 'academy:a1')).toBe(0);
  });

  it('일치하지만 count 0 → 0 (미노출)', () => {
    expect(resolveBannerCount({ scopeKey: 'team:', count: 0 }, 'team:')).toBe(0);
  });
});

describe('shouldApplyDetailResponse', () => {
  it('requestId·gen 모두 일치 → true', () => {
    expect(
      shouldApplyDetailResponse({ requestId: 'req-2', gen: 5 }, { requestId: 'req-2', gen: 5 }),
    ).toBe(true);
  });

  it('세대는 최신인데 requestId 만 다름 → false (핵심: requestId 비교 제거 시 true 로 실패)', () => {
    // req-2 render 직후 effect 실행 전(세대 미증가) 이전 req-1 응답이 도착한 경합창의 등가물.
    expect(
      shouldApplyDetailResponse({ requestId: 'req-1', gen: 5 }, { requestId: 'req-2', gen: 5 }),
    ).toBe(false);
  });

  it('requestId 는 같은데 세대만 다름 → false (겹친 조회 out-of-order; gen 비교 제거 시 실패)', () => {
    expect(
      shouldApplyDetailResponse({ requestId: 'req-1', gen: 4 }, { requestId: 'req-1', gen: 5 }),
    ).toBe(false);
  });

  it('requestId·gen 모두 다름 → false', () => {
    expect(
      shouldApplyDetailResponse({ requestId: 'req-1', gen: 4 }, { requestId: 'req-2', gen: 5 }),
    ).toBe(false);
  });
});

describe('isActionStillCurrent', () => {
  it('캡처 requestId 가 현재 라우트와 같음 → true', () => {
    expect(isActionStillCurrent('req-1', 'req-1')).toBe(true);
  });

  it('다른 상세로 전환됨(다름) → false (가드 제거=항상 true 시 stale action 이 새 화면을 오염시켜 실패)', () => {
    expect(isActionStillCurrent('req-1', 'req-2')).toBe(false);
  });
});
