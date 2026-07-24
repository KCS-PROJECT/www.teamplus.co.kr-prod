/**
 * RefundPendingBanner — scope 전환 fail-closed 가드 테스트(RTL).
 *
 * scope/scopeId 가 바뀌면 이전 scope 의 대기 건수가 새 scope 링크와 결합되어 표시되면 안 된다.
 * ① 전환 직후 새 조회 pending 동안 이전 배너 즉시 미노출(fail-closed 초기화).
 * ② 전환 후 새 조회 reject → 미노출(이전 count 잔존 금지).
 * ③ 전환 후 새 조회 success:false → 미노출.
 * ④ 이전 scope 의 늦은 응답(count>0)이 새 scope 배너를 갱신하지 않는다(cancelled 가드).
 */

import { render, screen, act, waitFor, cleanup } from '@testing-library/react';
import { RefundPendingBanner } from '@/components/refunds/RefundPendingBanner';
import { MESSAGES } from '@/lib/messages';
import { getRefundPendingCount } from '@/services/payment';

jest.mock('@/services/payment', () => {
  const actual = jest.requireActual('@/services/payment');
  return { ...actual, getRefundPendingCount: jest.fn() };
});
jest.mock('@/hooks/useNavigation', () => ({ useNavigation: () => ({ navigate: jest.fn() }) }));
jest.mock('@/components/ui/Icon', () => ({ Icon: () => null }));

const getPending = getRefundPendingCount as jest.Mock;

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const waiting = (n: number) => MESSAGES.refund.bannerWaiting(n);

describe('RefundPendingBanner scope 전환 fail-closed', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => cleanup());

  it('① scope 전환 직후 새 조회 pending 동안 이전 배너 미노출', async () => {
    const bPending = deferred<unknown>();
    getPending
      .mockResolvedValueOnce({ success: true, data: { count: 3 } }) // team
      .mockReturnValueOnce(bPending.promise); // academy — 지연

    const { rerender } = render(<RefundPendingBanner scope="team" />);
    expect(await screen.findByText(waiting(3))).toBeInTheDocument();

    // academy 로 전환 — 새 조회 pending 동안 이전 3건 즉시 미노출.
    await act(async () => {
      rerender(<RefundPendingBanner scope="academy" scopeId="a1" />);
    });
    expect(screen.queryByText(waiting(3))).toBeNull();

    // 새 scope 조회가 5건을 응답하면 그때 노출.
    await act(async () => {
      bPending.resolve({ success: true, data: { count: 5 } });
    });
    expect(await screen.findByText(waiting(5))).toBeInTheDocument();
    expect(screen.queryByText(waiting(3))).toBeNull();
  });

  it('② 전환 후 새 조회 reject → 미노출(이전 count 잔존 금지)', async () => {
    const bDef = deferred<unknown>();
    getPending
      .mockResolvedValueOnce({ success: true, data: { count: 3 } })
      .mockReturnValueOnce(bDef.promise);

    const { rerender } = render(<RefundPendingBanner scope="team" />);
    expect(await screen.findByText(waiting(3))).toBeInTheDocument();

    await act(async () => {
      rerender(<RefundPendingBanner scope="academy" scopeId="a1" />);
    });
    await act(async () => {
      bDef.reject(new Error('network'));
    });
    await waitFor(() => expect(screen.queryByText(waiting(3))).toBeNull());
    // 0건도 미노출(배너 자체가 없음).
    expect(screen.queryByText(MESSAGES.refund.bannerAction)).toBeNull();
  });

  it('③ 전환 후 새 조회 success:false → 미노출', async () => {
    const bDef = deferred<unknown>();
    getPending
      .mockResolvedValueOnce({ success: true, data: { count: 3 } })
      .mockReturnValueOnce(bDef.promise);

    const { rerender } = render(<RefundPendingBanner scope="team" />);
    expect(await screen.findByText(waiting(3))).toBeInTheDocument();

    await act(async () => {
      rerender(<RefundPendingBanner scope="academy" scopeId="a1" />);
    });
    await act(async () => {
      bDef.resolve({ success: false, error: { statusCode: 500 } });
    });
    await waitFor(() => expect(screen.queryByText(waiting(3))).toBeNull());
    expect(screen.queryByText(MESSAGES.refund.bannerAction)).toBeNull();
  });

  it('④ 이전 scope 의 늦은 응답(count>0)이 새 scope 배너를 갱신하지 않음', async () => {
    const aDef = deferred<unknown>(); // team — 지연
    const bDef = deferred<unknown>(); // academy
    getPending
      .mockReturnValueOnce(aDef.promise) // team
      .mockReturnValueOnce(bDef.promise); // academy

    const { rerender } = render(<RefundPendingBanner scope="team" />);
    // team 조회 pending — 아직 미노출.
    expect(screen.queryByText(MESSAGES.refund.bannerAction)).toBeNull();

    // academy 로 전환(team effect cleanup → cancelled).
    await act(async () => {
      rerender(<RefundPendingBanner scope="academy" scopeId="a1" />);
    });
    // academy 5건 응답 → 노출.
    await act(async () => {
      bDef.resolve({ success: true, data: { count: 5 } });
    });
    expect(await screen.findByText(waiting(5))).toBeInTheDocument();

    // 뒤늦게 이전 scope(team) 7건 응답 — academy 배너를 덮으면 안 된다.
    await act(async () => {
      aDef.resolve({ success: true, data: { count: 7 } });
    });
    await waitFor(() => expect(screen.getByText(waiting(5))).toBeInTheDocument());
    expect(screen.queryByText(waiting(7))).toBeNull();
  });

  it('⑤ render-time 가드 — 새 scope 조회가 끝나기 전(전환 직후 렌더)에는 이전 count 미노출', async () => {
    const bPending = deferred<unknown>(); // academy — 끝까지 미완료(전환 직후 렌더 구간 고정)
    getPending
      .mockResolvedValueOnce({ success: true, data: { count: 3 } }) // team
      .mockReturnValueOnce(bPending.promise); // academy — pending 유지

    const { rerender } = render(<RefundPendingBanner scope="team" />);
    // team: count 3 + team href 배너 표시.
    expect(await screen.findByText(waiting(3))).toBeInTheDocument();
    const teamBtn = screen.getByRole('button', { name: waiting(3) });
    expect(teamBtn.getAttribute('aria-label')).toBe(waiting(3));

    // academy 로 전환 — 새 scope 조회는 완료되지 않는다. state 는 아직 team 귀속이지만
    //   scopeKey 불일치로 render-time fail-closed → 이전 count(3)가 academy 링크와 결합되지 않는다.
    await act(async () => {
      rerender(<RefundPendingBanner scope="academy" scopeId="a1" />);
    });
    expect(screen.queryByText(waiting(3))).toBeNull();
    expect(screen.queryByText(MESSAGES.refund.bannerAction)).toBeNull(); // 배너 자체 미노출
  });
});
