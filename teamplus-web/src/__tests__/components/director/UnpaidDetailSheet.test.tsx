/**
 * UnpaidDetailSheet — 상세 시트 요청 시퀀스(race) 가드 회귀 테스트
 *
 * 검증(MEDIUM-1):
 *  (a) 회원 전환 후 B→A 순서로 응답이 역전 도착해도 최종 상세=B 만 반영(늦은 A 무시).
 *  (b) 늦게 도착한 이전 요청의 실패가 최신 요청의 성공 상태(에러/로딩)를 덮지 않는다.
 *  (c) 시트 닫힘 후 늦게 도착한 응답이 state 를 오염시키지 않는다(닫힐 때 in-flight 무효화).
 *
 * 서비스는 지연 프로미스로 목킹하고, portal/native 의존을 제거하기 위해
 * BottomSheet/Icon 을 목킹한다. BottomSheet 목은 isOpen 과 무관하게 children 을
 * 항상 렌더해 닫힘 이후의 state(회원명) 도 관찰 가능하게 한다.
 */

import { render, screen, act } from '@testing-library/react';
import { MESSAGES } from '@/lib/messages';
import type { UnpaidMemberDetailResponse } from '@/services/payment';

// ── 서비스 목킹 ─────────────────────────────────────────
const getTeamUnpaidMemberDetailMock = jest.fn();

jest.mock('@/services/payment', () => ({
  getTeamUnpaidMemberDetail: (...args: unknown[]) => getTeamUnpaidMemberDetailMock(...args),
}));

// ── UI 목킹(portal/native 제거) ─────────────────────────
// BottomSheet 목: isOpen 과 무관하게 children 을 항상 렌더 → 닫힘 후 state 관찰 가능.
jest.mock('@/components/ui/BottomSheet', () => ({
  BottomSheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@/components/ui/Icon', () => ({
  Icon: () => null,
}));

import { UnpaidDetailSheet } from '@/components/director/UnpaidDetailSheet';

// ── 헬퍼 ────────────────────────────────────────────────
function makeDeferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeDetail(memberName: string): UnpaidMemberDetailResponse {
  return {
    member: { id: memberName, name: memberName, totalOutstanding: 10000 },
    parents: [],
    details: [],
  };
}

const noop = () => {};

beforeEach(() => {
  getTeamUnpaidMemberDetailMock.mockReset();
});

describe('UnpaidDetailSheet — 요청 시퀀스 가드', () => {
  it('(a) 회원 전환 후 응답 역전(B→A) 시 최종 상세=B 만 반영하고 늦은 A 는 무시한다', async () => {
    const dA = makeDeferred<UnpaidMemberDetailResponse>();
    const dB = makeDeferred<UnpaidMemberDetailResponse>();
    getTeamUnpaidMemberDetailMock
      .mockReturnValueOnce(dA.promise) // 회원 A 요청
      .mockReturnValueOnce(dB.promise); // 회원 B 요청

    const { rerender } = render(
      <UnpaidDetailSheet isOpen memberId="A" yearMonth="2026-07" onClose={noop} />,
    );
    // A 요청 in-flight 상태에서 회원 B 로 전환 → B 요청 in-flight.
    rerender(<UnpaidDetailSheet isOpen memberId="B" yearMonth="2026-07" onClose={noop} />);

    // 최신 요청 B 를 먼저 resolve → 상세=B.
    await act(async () => {
      dB.resolve(makeDetail('회원B'));
    });
    expect(screen.getByText('회원B')).toBeInTheDocument();

    // 늦은 이전 요청 A 를 뒤늦게 resolve → seq 불일치로 폐기(setDetail 미호출).
    await act(async () => {
      dA.resolve(makeDetail('회원A'));
    });
    expect(screen.queryByText('회원A')).not.toBeInTheDocument();
    expect(screen.getByText('회원B')).toBeInTheDocument();
  });

  it('(b) 늦은 이전 요청의 실패가 최신 요청의 성공(에러/로딩)을 덮지 않는다', async () => {
    const dA = makeDeferred<UnpaidMemberDetailResponse>();
    const dB = makeDeferred<UnpaidMemberDetailResponse>();
    getTeamUnpaidMemberDetailMock
      .mockReturnValueOnce(dA.promise)
      .mockReturnValueOnce(dB.promise);

    const { rerender } = render(
      <UnpaidDetailSheet isOpen memberId="A" yearMonth="2026-07" onClose={noop} />,
    );
    rerender(<UnpaidDetailSheet isOpen memberId="B" yearMonth="2026-07" onClose={noop} />);

    // 최신 요청 B 성공.
    await act(async () => {
      dB.resolve(makeDetail('회원B'));
    });
    expect(screen.getByText('회원B')).toBeInTheDocument();

    // 늦은 이전 요청 A 실패 → seq 불일치로 폐기(setHasError/setIsLoading 미호출).
    await act(async () => {
      dA.reject(new Error('late failure'));
    });
    expect(screen.queryByText(MESSAGES.director2.unpaidDetailFailed)).not.toBeInTheDocument();
    // 로딩 스피너(role=status) 미노출 — 늦은 A 가 로딩을 되살리지 않음.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('회원B')).toBeInTheDocument();
  });

  it('(c) 시트 닫힘 후 늦게 도착한 응답이 state 를 오염시키지 않는다', async () => {
    const dA = makeDeferred<UnpaidMemberDetailResponse>();
    getTeamUnpaidMemberDetailMock.mockReturnValueOnce(dA.promise);

    const { rerender } = render(
      <UnpaidDetailSheet
        isOpen
        memberId="A"
        yearMonth="2026-07"
        fallbackName="폴백회원"
        onClose={noop}
      />,
    );
    // 시트 닫힘 → effect else 분기가 reqSeq 증가로 in-flight A 무효화.
    rerender(
      <UnpaidDetailSheet
        isOpen={false}
        memberId="A"
        yearMonth="2026-07"
        fallbackName="폴백회원"
        onClose={noop}
      />,
    );

    // 닫힌 뒤 A 가 뒤늦게 resolve → seq 불일치로 setDetail 폐기.
    await act(async () => {
      dA.resolve(makeDetail('회원A'));
    });
    expect(screen.queryByText('회원A')).not.toBeInTheDocument();
    // 회원명은 detail 미설정 → fallbackName 유지(늦은 A 가 헤더를 덮지 않음).
    expect(screen.getByText('폴백회원')).toBeInTheDocument();
  });
});
