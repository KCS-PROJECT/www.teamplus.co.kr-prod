/**
 * AcademySettlementTab — 렌더 · 월 race · 초기/월 실패 재시도 · detailPath 네비 회귀 테스트.
 *
 * 팀 허브(director-payments)와 동일한 금융 화면 계약을 오픈클래스 정산 탭에서도 검증:
 *  (a) 수업 카드 + 요약(총 수납) 렌더.
 *  (b) 늦게 도착한 이전 월 응답이 최신 선택 월을 덮지 않는다(요청 시퀀스 가드).
 *  (c) 초기 로드 실패 → 에러+재시도(0원 요약 렌더 금지).
 *  (d) 월 변경 실패 → 인라인 에러+재시도(직전 월 stale 카드 미표시).
 *  (e) 수업 카드 클릭 시 detailPath 로 navigate.
 */

import { render, screen, fireEvent, act } from '@testing-library/react';
import { MESSAGES } from '@/lib/messages';

// ── 서비스 목킹 ─────────────────────────────────────────
const getAcademySettlementSummaryMock = jest.fn();
jest.mock('@/services/payment', () => ({
  getAcademySettlementSummary: (...args: unknown[]) =>
    getAcademySettlementSummaryMock(...args),
  // RefundPendingBanner(아카데미 정산 상단 삽입)가 사용 — 0건 응답으로 미노출(테스트 무간섭).
  getRefundPendingCount: () => Promise.resolve({ success: true, data: { count: 0 } }),
}));

// ── KST 현재월 고정 ─────────────────────────────────────
jest.mock('@/lib/kst-month', () => ({
  kstYearMonth: () => '2026-07',
}));

// ── 훅/UI 목킹 ──────────────────────────────────────────
jest.mock('@/hooks/usePageReady', () => ({ usePageReady: () => {} }));
const navigateMock = jest.fn();
jest.mock('@/hooks/useNavigation', () => ({
  useNavigation: () => ({ navigate: navigateMock }),
}));
jest.mock('@/lib/logger', () => ({ devError: jest.fn() }));
jest.mock('@/components/ui/Icon', () => ({ Icon: () => null }));

import { AcademySettlementTab } from '@/components/academy/AcademySettlementTab';

// ── 헬퍼 ────────────────────────────────────────────────
function makeDeferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function makeAcademySettlement(yearMonth: string, className: string, paidAmount = 30000) {
  return {
    yearMonth,
    academyId: 'a1',
    classes: [
      {
        classId: className,
        className,
        teamId: null,
        teamName: '팀A',
        billingMode: 'PREPAID',
        settlementStatus: 'DRAFT',
        paymentStatus: 'PARTIAL_PAID',
        total: 5,
        paidCount: 3,
        billedAmount: 50000,
        paidAmount,
        outstandingAmount: 20000,
        estimatedAmount: 0,
        cancelledCount: 0,
        refundedCount: 0,
        refundedAmount: 0,
        mixedBilling: false,
        prepaidCount: 2,
        postpaidCount: 1,
        unassignedCount: 0,
        blockedReasonCode: null,
        detailPath: `/classes/${className}/students?yearMonth=${yearMonth}`,
      },
    ],
    unpaid: { amount: 20000, count: 1 },
  };
}

beforeEach(() => {
  getAcademySettlementSummaryMock.mockReset();
  navigateMock.mockReset();
});

describe('AcademySettlementTab — 렌더', () => {
  it('수업 카드와 총 수납 요약을 렌더한다', async () => {
    getAcademySettlementSummaryMock.mockResolvedValue(
      makeAcademySettlement('2026-07', 'JULY_CLASS'),
    );

    render(<AcademySettlementTab academyId="a1" />);

    expect(await screen.findByText('JULY_CLASS')).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.settlement.totalCollected)).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.settlement.paidRatio(3, 5))).toBeInTheDocument();
  });
});

describe('AcademySettlementTab — 월 race', () => {
  it('늦게 도착한 이전 월 응답이 최신 선택 월을 덮지 않는다', async () => {
    const juneDeferred = makeDeferred<ReturnType<typeof makeAcademySettlement>>();
    const mayDeferred = makeDeferred<ReturnType<typeof makeAcademySettlement>>();

    getAcademySettlementSummaryMock.mockImplementation(
      (params: { yearMonth?: string }) => {
        const ym = params?.yearMonth;
        if (ym === '2026-07')
          return Promise.resolve(makeAcademySettlement('2026-07', 'JULY_CLASS'));
        if (ym === '2026-06') return juneDeferred.promise;
        if (ym === '2026-05') return mayDeferred.promise;
        return Promise.resolve(makeAcademySettlement(ym ?? '', 'X'));
      },
    );

    render(<AcademySettlementTab academyId="a1" />);
    expect(await screen.findByText('JULY_CLASS')).toBeInTheDocument();

    const prevBtn = screen.getByLabelText(MESSAGES.settlement.prevMonth);
    await act(async () => {
      fireEvent.click(prevBtn); // 2026-06
    });
    await act(async () => {
      fireEvent.click(prevBtn); // 2026-05
    });

    // 5월(최신) 먼저 도착 → 6월(이전 요청) 늦게 도착
    await act(async () => {
      mayDeferred.resolve(makeAcademySettlement('2026-05', 'MAY_CLASS'));
    });
    await act(async () => {
      juneDeferred.resolve(makeAcademySettlement('2026-06', 'JUNE_CLASS'));
    });

    expect(await screen.findByText('MAY_CLASS')).toBeInTheDocument();
    expect(screen.queryByText('JUNE_CLASS')).not.toBeInTheDocument();
  });
});

describe('AcademySettlementTab — 초기 로드 실패', () => {
  it('초기 실패 시 에러+재시도 UI 를 노출하고 0원 요약을 렌더하지 않는다', async () => {
    getAcademySettlementSummaryMock.mockRejectedValue(new Error('load failed'));

    render(<AcademySettlementTab academyId="a1" />);

    expect(
      await screen.findByText(MESSAGES.settlement.loadFailedTitle),
    ).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.settlement.retry)).toBeInTheDocument();
    // 0원 요약(총 수납)은 렌더되지 않아야 한다.
    expect(screen.queryByText(MESSAGES.settlement.totalCollected)).not.toBeInTheDocument();
  });

  it('재시도 성공 시 정상 화면으로 전환된다', async () => {
    getAcademySettlementSummaryMock
      .mockRejectedValueOnce(new Error('load failed'))
      .mockResolvedValueOnce(makeAcademySettlement('2026-07', 'JULY_CLASS'));

    render(<AcademySettlementTab academyId="a1" />);

    const retryBtn = await screen.findByText(MESSAGES.settlement.retry);
    await act(async () => {
      fireEvent.click(retryBtn);
    });

    expect(await screen.findByText('JULY_CLASS')).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.settlement.totalCollected)).toBeInTheDocument();
  });
});

describe('AcademySettlementTab — 월 새로고침 실패/재시도', () => {
  it('월 변경 실패 시 인라인 에러+재시도, 직전 월 카드 미표시 후 재시도 성공 복구', async () => {
    getAcademySettlementSummaryMock.mockImplementation((params: { yearMonth?: string }) => {
      if (params?.yearMonth === '2026-07') {
        return Promise.resolve(makeAcademySettlement('2026-07', 'JULY_CLASS'));
      }
      return Promise.reject(new Error('june down'));
    });

    render(<AcademySettlementTab academyId="a1" />);
    await screen.findByText('JULY_CLASS');

    const prevBtn = screen.getByLabelText(MESSAGES.settlement.prevMonth);
    await act(async () => {
      fireEvent.click(prevBtn); // 2026-06 → reject
    });

    expect(
      await screen.findByText(MESSAGES.settlement.monthLoadFailed),
    ).toBeInTheDocument();
    // 직전 유효월(7월) stale 카드 렌더 금지.
    expect(screen.queryByText('JULY_CLASS')).not.toBeInTheDocument();

    // 재시도 성공으로 전환.
    getAcademySettlementSummaryMock.mockImplementation((params: { yearMonth?: string }) =>
      Promise.resolve(makeAcademySettlement(params?.yearMonth ?? '', 'JUNE_CLASS')),
    );
    const retryBtn = screen.getByText(MESSAGES.settlement.retry);
    await act(async () => {
      fireEvent.click(retryBtn);
    });

    expect(await screen.findByText('JUNE_CLASS')).toBeInTheDocument();
    expect(screen.queryByText(MESSAGES.settlement.monthLoadFailed)).not.toBeInTheDocument();
  });
});

describe('AcademySettlementTab — detailPath 네비게이션', () => {
  it('수업 카드 클릭 시 detailPath 로 navigate 한다', async () => {
    getAcademySettlementSummaryMock.mockResolvedValue(
      makeAcademySettlement('2026-07', 'JULY_CLASS'),
    );

    render(<AcademySettlementTab academyId="a1" />);

    const card = await screen.findByText('JULY_CLASS');
    fireEvent.click(card);

    expect(navigateMock).toHaveBeenCalledWith(
      '/classes/JULY_CLASS/students?yearMonth=2026-07',
    );
  });
});
