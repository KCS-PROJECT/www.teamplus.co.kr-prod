/**
 * /director-payments 페이지 — 월 race / 최초 로드 실패 회귀 테스트
 * (Codex Phase 3 HIGH-1 · HIGH-2)
 *
 * 검증:
 *  (a) 늦게 도착한 이전 월 응답이 최신 선택 월을 덮지 않는다(요청 시퀀스 가드).
 *  (b) 최초 로드 실패 시 에러+재시도 UI 를 노출하고 0원 Hero 를 렌더하지 않는다.
 *
 * 서비스는 지연 프로미스로 목킹하고, 렌더 부담을 줄이기 위해
 * useNavigation/useNativeUI/useToast/usePageReady/레이아웃/아이콘을 목킹한다.
 */

import { render, screen, fireEvent, act } from '@testing-library/react';
import { MESSAGES } from '@/lib/messages';

// ── 서비스 목킹 ─────────────────────────────────────────
const getTeamSettlementSummaryMock = jest.fn();
const getDirectorPaymentSummaryMock = jest.fn();

jest.mock('@/services/payment', () => ({
  getTeamSettlementSummary: (...args: unknown[]) => getTeamSettlementSummaryMock(...args),
  getDirectorPaymentSummary: (...args: unknown[]) => getDirectorPaymentSummaryMock(...args),
  sendDirectorUnpaidReminder: jest.fn(),
}));

// ── KST 현재월 고정 ─────────────────────────────────────
jest.mock('@/lib/kst-month', () => ({
  kstYearMonth: () => '2026-07',
}));

// ── 훅/UI 목킹 ──────────────────────────────────────────
jest.mock('@/hooks/usePageReady', () => ({ usePageReady: () => {} }));
jest.mock('@/hooks/useNativeUI', () => ({ useNativeUI: () => {} }));
const navigateMock = jest.fn();
jest.mock('@/hooks/useNavigation', () => ({
  useNavigation: () => ({ navigate: navigateMock }),
}));
jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }),
}));
jest.mock('@/lib/logger', () => ({ devError: jest.fn() }));
jest.mock('@/components/director/UnpaidDetailSheet', () => ({
  UnpaidDetailSheet: () => null,
}));
jest.mock('@/components/layout/MobileContainer', () => ({
  MobileContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@/components/layout/PageAppBar', () => ({
  PageAppBar: () => null,
}));
jest.mock('@/components/ui/Icon', () => ({
  Icon: () => null,
}));

import DirectorPaymentsPage from '@/app/(director)/director-payments/page';

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

function makeSettlement(yearMonth: string, className: string) {
  return {
    yearMonth,
    classes: [
      {
        classId: className,
        className,
        teamId: null,
        teamName: null,
        billingMode: 'PREPAID',
        settlementStatus: 'NOT_REQUIRED',
        paymentStatus: 'NONE',
        total: 0,
        paidCount: 0,
        billedAmount: 0,
        paidAmount: 0,
        outstandingAmount: 0,
        estimatedAmount: 0,
        cancelledCount: 0,
        refundedCount: 0,
        refundedAmount: 0,
        mixedBilling: false,
        prepaidCount: 0,
        postpaidCount: 0,
        unassignedCount: 0,
        blockedReasonCode: null,
        detailPath: '/classes/x/students',
      },
    ],
    tournaments: [],
    unpaid: { amount: 0, count: 0 },
  };
}

/** 훈련 1건(선불 2·후불 1·혼합, DRAFT) + 대회 1건(CONFIRMED) 을 담은 소계 — 카드/배지/네비 검증용. */
function makeRichSettlement(yearMonth: string) {
  return {
    yearMonth,
    classes: [
      {
        classId: 'c1',
        className: 'TRAIN_A',
        teamId: null,
        teamName: '팀A',
        billingMode: 'PREPAID',
        settlementStatus: 'DRAFT',
        paymentStatus: 'PARTIAL_PAID',
        total: 5,
        paidCount: 3,
        billedAmount: 50000,
        paidAmount: 30000,
        outstandingAmount: 20000,
        estimatedAmount: 0,
        cancelledCount: 0,
        refundedCount: 0,
        refundedAmount: 0,
        mixedBilling: true,
        prepaidCount: 2,
        postpaidCount: 1,
        unassignedCount: 0,
        blockedReasonCode: null,
        detailPath: `/classes/c1/students?yearMonth=${yearMonth}`,
      },
    ],
    tournaments: [
      {
        tournamentId: 't1',
        tournamentName: 'CUP_A',
        teamId: null,
        teamName: '팀A',
        billingMode: 'PREPAID',
        settlementStatus: 'CONFIRMED',
        paymentStatus: 'PAID_ALL',
        total: 4,
        paidCount: 4,
        billedAmount: 40000,
        paidAmount: 40000,
        outstandingAmount: 0,
        estimatedAmount: 0,
        cancelledCount: 0,
        refundedCount: 0,
        refundedAmount: 0,
        mixedBilling: false,
        blockedReasonCode: null,
        detailPath: '/tournaments/t1#settlement',
      },
    ],
    unpaid: { amount: 20000, count: 1 },
  };
}

const legacyOk = {
  summary: {
    totalRevenue: 0,
    unpaid: 0,
    pendingSettlement: 0,
    completedCount: 0,
    unpaidCount: 0,
  },
  unpaidMembers: [],
};

beforeEach(() => {
  getTeamSettlementSummaryMock.mockReset();
  getDirectorPaymentSummaryMock.mockReset();
  navigateMock.mockReset();
});

describe('DirectorPaymentsPage — 월 race (HIGH-1)', () => {
  it('늦게 도착한 이전 월 응답이 최신 선택 월을 덮지 않는다', async () => {
    const juneDeferred = makeDeferred<ReturnType<typeof makeSettlement>>();
    const mayDeferred = makeDeferred<ReturnType<typeof makeSettlement>>();

    getTeamSettlementSummaryMock.mockImplementation((params: { yearMonth?: string }) => {
      const ym = params?.yearMonth;
      if (ym === '2026-07') return Promise.resolve(makeSettlement('2026-07', 'JULY_CLASS'));
      if (ym === '2026-06') return juneDeferred.promise;
      if (ym === '2026-05') return mayDeferred.promise;
      return Promise.resolve(makeSettlement(ym ?? '', 'X'));
    });
    getDirectorPaymentSummaryMock.mockResolvedValue(legacyOk);

    render(<DirectorPaymentsPage />);

    // 최초(7월) 로드 완료
    expect(await screen.findByText('JULY_CLASS')).toBeInTheDocument();

    // 이전 달 → 6월 (요청 먼저 발생), 이어서 5월 (최신 요청)
    const prevBtn = screen.getByLabelText(MESSAGES.settlement.prevMonth);
    await act(async () => {
      fireEvent.click(prevBtn); // 2026-06
    });
    await act(async () => {
      fireEvent.click(prevBtn); // 2026-05
    });

    // 5월(최신) 먼저 도착 → 6월(이전 요청) 늦게 도착
    await act(async () => {
      mayDeferred.resolve(makeSettlement('2026-05', 'MAY_CLASS'));
    });
    await act(async () => {
      juneDeferred.resolve(makeSettlement('2026-06', 'JUNE_CLASS'));
    });

    // 최신 선택 월(5월) 데이터만 보이고, 늦게 온 6월 데이터는 폐기되어야 한다.
    expect(await screen.findByText('MAY_CLASS')).toBeInTheDocument();
    expect(screen.queryByText('JUNE_CLASS')).not.toBeInTheDocument();
  });
});

describe('DirectorPaymentsPage — 최초 로드 실패 (HIGH-2)', () => {
  it('신규 API 실패 시 에러+재시도 UI 를 노출하고 0원 Hero 를 렌더하지 않는다', async () => {
    getTeamSettlementSummaryMock.mockRejectedValue(new Error('load failed'));
    getDirectorPaymentSummaryMock.mockResolvedValue(legacyOk);

    render(<DirectorPaymentsPage />);

    // 명시적 실패 UI + 재시도 버튼
    expect(await screen.findByText(MESSAGES.settlement.loadFailedTitle)).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.settlement.retry)).toBeInTheDocument();

    // 0원 Hero(총 수납/미납 요약)는 렌더되지 않아야 한다.
    expect(screen.queryByText(MESSAGES.settlement.totalCollected)).not.toBeInTheDocument();
  });

  it('재시도 성공 시 정상 화면으로 전환된다', async () => {
    getTeamSettlementSummaryMock
      .mockRejectedValueOnce(new Error('load failed'))
      .mockResolvedValueOnce(makeSettlement('2026-07', 'JULY_CLASS'));
    getDirectorPaymentSummaryMock.mockResolvedValue(legacyOk);

    render(<DirectorPaymentsPage />);

    const retryBtn = await screen.findByText(MESSAGES.settlement.retry);
    await act(async () => {
      fireEvent.click(retryBtn);
    });

    expect(await screen.findByText('JULY_CLASS')).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.settlement.totalCollected)).toBeInTheDocument();
  });
});

describe('DirectorPaymentsPage — 미수금(레거시) 로드 실패 (HIGH-1)', () => {
  it('레거시 실패 시 미수금 탭은 에러+재시도 UI, 탭 카운트는 실패 표식(미수금 0 금지)', async () => {
    getTeamSettlementSummaryMock.mockResolvedValue(makeSettlement('2026-07', 'JULY_CLASS'));
    getDirectorPaymentSummaryMock.mockRejectedValue(new Error('legacy down'));

    render(<DirectorPaymentsPage />);
    await screen.findByText('JULY_CLASS');

    // 탭 카운트가 "미수금 0" 이 아니라 실패 표식으로 노출된다.
    const errLabel = `${MESSAGES.settlement.tabUnpaid} ${MESSAGES.settlement.tabErrorMark}`;
    expect(screen.getByRole('tab', { name: new RegExp(errLabel) })).toBeInTheDocument();
    expect(
      screen.queryByText(`${MESSAGES.settlement.tabUnpaid} 0`),
    ).not.toBeInTheDocument();

    // 미수금 탭으로 전환 → 로드 실패 UI (빈 상태 문구 아님).
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: new RegExp(MESSAGES.settlement.tabUnpaid) }));
    });
    expect(
      await screen.findByText(MESSAGES.settlement.unpaidLoadFailed),
    ).toBeInTheDocument();
    expect(screen.queryByText(MESSAGES.settlement.emptyUnpaid)).not.toBeInTheDocument();
  });

  it('재시도 성공 시 미수금 목록으로 복구된다', async () => {
    getTeamSettlementSummaryMock.mockResolvedValue(makeSettlement('2026-07', 'JULY_CLASS'));
    getDirectorPaymentSummaryMock
      .mockRejectedValueOnce(new Error('legacy down'))
      .mockResolvedValueOnce({
        summary: { ...legacyOk.summary, unpaidCount: 1 },
        unpaidMembers: [
          { id: 'm1', name: '홍길동', teamName: '팀A', amount: 30000, billingType: 'POSTPAID' },
        ],
      });

    render(<DirectorPaymentsPage />);
    await screen.findByText('JULY_CLASS');

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: new RegExp(MESSAGES.settlement.tabUnpaid) }));
    });
    const retryBtn = await screen.findByText(MESSAGES.settlement.retry);
    await act(async () => {
      fireEvent.click(retryBtn);
    });

    expect(await screen.findByText('홍길동')).toBeInTheDocument();
    expect(screen.queryByText(MESSAGES.settlement.unpaidLoadFailed)).not.toBeInTheDocument();
  });
});

describe('DirectorPaymentsPage — 월 새로고침 실패/재시도 (MEDIUM-3)', () => {
  it('월 변경 실패 시 인라인 에러+재시도, 직전 월 카드 미표시 후 재시도 성공 복구', async () => {
    getTeamSettlementSummaryMock.mockImplementation((params: { yearMonth?: string }) => {
      if (params?.yearMonth === '2026-07') {
        return Promise.resolve(makeSettlement('2026-07', 'JULY_CLASS'));
      }
      return Promise.reject(new Error('june down'));
    });
    getDirectorPaymentSummaryMock.mockResolvedValue(legacyOk);

    render(<DirectorPaymentsPage />);
    await screen.findByText('JULY_CLASS');

    const prevBtn = screen.getByLabelText(MESSAGES.settlement.prevMonth);
    await act(async () => {
      fireEvent.click(prevBtn); // 2026-06 → reject
    });

    // 인라인 월 에러 + 재시도. 직전 유효월(7월) stale 카드 렌더 금지.
    expect(await screen.findByText(MESSAGES.settlement.monthLoadFailed)).toBeInTheDocument();
    expect(screen.queryByText('JULY_CLASS')).not.toBeInTheDocument();

    // 재시도 성공으로 전환.
    getTeamSettlementSummaryMock.mockImplementation((params: { yearMonth?: string }) =>
      Promise.resolve(makeSettlement(params?.yearMonth ?? '', 'JUNE_CLASS')),
    );
    const retryBtn = screen.getByText(MESSAGES.settlement.retry);
    await act(async () => {
      fireEvent.click(retryBtn);
    });

    expect(await screen.findByText('JUNE_CLASS')).toBeInTheDocument();
    expect(screen.queryByText(MESSAGES.settlement.monthLoadFailed)).not.toBeInTheDocument();
  });
});

describe('DirectorPaymentsPage — 훈련/대회 탭 렌더 (MEDIUM-3)', () => {
  it('훈련 카드에 상태 배지·완납 인원·결제방식 요약을 표시한다', async () => {
    getTeamSettlementSummaryMock.mockResolvedValue(makeRichSettlement('2026-07'));
    getDirectorPaymentSummaryMock.mockResolvedValue(legacyOk);

    render(<DirectorPaymentsPage />);

    expect(await screen.findByText('TRAIN_A')).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.settlement.statusDraft)).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.settlement.paidRatio(3, 5))).toBeInTheDocument();
    // 선불 2명 · 후불 1명 요약
    expect(
      screen.getByText(
        `${MESSAGES.settlement.prepaid} 2${MESSAGES.settlement.person} · ${MESSAGES.settlement.postpaid} 1${MESSAGES.settlement.person}`,
      ),
    ).toBeInTheDocument();
  });

  it('대회 탭으로 전환하면 대회 카드가 렌더된다', async () => {
    getTeamSettlementSummaryMock.mockResolvedValue(makeRichSettlement('2026-07'));
    getDirectorPaymentSummaryMock.mockResolvedValue(legacyOk);

    render(<DirectorPaymentsPage />);
    await screen.findByText('TRAIN_A');

    await act(async () => {
      fireEvent.click(
        screen.getByRole('tab', { name: new RegExp(MESSAGES.settlement.tabTournament) }),
      );
    });

    expect(await screen.findByText('CUP_A')).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.settlement.statusConfirmed)).toBeInTheDocument();
  });
});

describe('DirectorPaymentsPage — detailPath 네비게이션 (MEDIUM-3)', () => {
  it('훈련 카드 클릭 시 detailPath 로 navigate 한다', async () => {
    getTeamSettlementSummaryMock.mockResolvedValue(makeRichSettlement('2026-07'));
    getDirectorPaymentSummaryMock.mockResolvedValue(legacyOk);

    render(<DirectorPaymentsPage />);

    const card = await screen.findByText('TRAIN_A');
    fireEvent.click(card);

    expect(navigateMock).toHaveBeenCalledWith('/classes/c1/students?yearMonth=2026-07');
  });
});
