/**
 * /director-payments 페이지 — 월 race / 최초 로드 실패 / 미수금 배너 / 거래 내역 회귀 테스트
 *
 * 구조(2탭): 거래 내역(기본 — 결제 건별 장부 + 미수금 접이식 배너) / 정산 집계(훈련·대회 소계).
 * 검증:
 *  (a) 늦게 도착한 이전 월 응답이 최신 선택 월을 덮지 않는다(요청 시퀀스 가드).
 *  (b) 최초 로드 실패 시 에러+재시도 UI 를 노출하고 0원 Hero 를 렌더하지 않는다.
 *  (c) 미수금 배너가 인별 미수금 API 를 선택월로 소비하고 실패를 "미수 0"으로 위장하지 않는다.
 *  (d) 거래 내역 탭이 결제 건별 목록(일시·상태)을 렌더한다.
 *
 * 서비스는 지연 프로미스로 목킹하고, 렌더 부담을 줄이기 위해
 * useNavigation/useNativeUI/useToast/usePageReady/레이아웃/아이콘을 목킹한다.
 */

import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { MESSAGES } from '@/lib/messages';

// ── 서비스 목킹 ─────────────────────────────────────────
const getTeamSettlementSummaryMock = jest.fn();
const getTeamUnpaidMembersMock = jest.fn();
const getTeamTransactionsMock = jest.fn();

jest.mock('@/services/payment', () => ({
  getTeamSettlementSummary: (...args: unknown[]) => getTeamSettlementSummaryMock(...args),
  getTeamUnpaidMembers: (...args: unknown[]) => getTeamUnpaidMembersMock(...args),
  getTeamTransactions: (...args: unknown[]) => getTeamTransactionsMock(...args),
  sendTeamUnpaidReminder: jest.fn(),
  // RefundPendingBanner(정산센터 상단 삽입)가 사용 — 0건 응답으로 미노출(테스트 무간섭).
  getRefundPendingCount: () => Promise.resolve({ success: true, data: { count: 0 } }),
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

interface MemberRow {
  memberId: string;
  name: string;
  teamName: string | null;
  outstandingAmount: number;
  sources: Array<'CLASS' | 'TOURNAMENT'>;
  classCount: number;
  tournamentCount: number;
}

/** 신규 인별 미수금 응답 — 선택월을 그대로 반영(unpaidMonthMatches 통과). */
function makeUnpaid(yearMonth: string, members: MemberRow[] = []) {
  return {
    yearMonth,
    members,
    totalOutstanding: members.reduce((a, m) => a + m.outstandingAmount, 0),
    totalCount: members.length,
  };
}

interface TxnItem {
  paymentId: string;
  amount: number;
  paymentStatus: string;
  completedAt: string;
  payerName: string | null;
  childName: string | null;
  subjectName: string | null;
  sourceType: 'CLASS' | 'TOURNAMENT' | null;
  billingTiming: 'PREPAID' | 'POSTPAID' | null;
}

/** 거래 내역 응답 — 선택월 그대로 반영(txnMonthMatches 통과). */
function makeTransactions(yearMonth: string, items: TxnItem[] = []) {
  return { yearMonth, items, totalCount: items.length };
}

/** 정산 집계 탭으로 전환 (기본 탭 = 거래 내역). */
async function openSettlementTab() {
  await act(async () => {
    fireEvent.click(
      screen.getByRole('tab', { name: new RegExp(MESSAGES.settlement.tabSettlementAgg) }),
    );
  });
}

beforeEach(() => {
  getTeamSettlementSummaryMock.mockReset();
  getTeamUnpaidMembersMock.mockReset();
  getTeamTransactionsMock.mockReset();
  navigateMock.mockReset();
  // 기본: 요청 월을 그대로 반영하는 빈 미수금/거래 응답.
  getTeamUnpaidMembersMock.mockImplementation((params: { yearMonth?: string }) =>
    Promise.resolve(makeUnpaid(params?.yearMonth ?? '')),
  );
  getTeamTransactionsMock.mockImplementation((params: { yearMonth?: string }) =>
    Promise.resolve(makeTransactions(params?.yearMonth ?? '')),
  );
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

    render(<DirectorPaymentsPage />);

    // 최초(7월) 로드 완료 → 정산 집계 탭에서 소계 카드 확인.
    await screen.findByText(MESSAGES.settlement.totalCollected);
    await openSettlementTab();
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

describe('DirectorPaymentsPage — 미수금 단독 재시도 격리 (FE I-1)', () => {
  it('미수금 재시도가 in-flight loadNew 를 폐기하지 않아 정산 집계가 새 월로 갱신된다', async () => {
    // 6월 소계는 응답을 지연(in-flight)시켜, 미수금 재시도 이후 도착시켜도 반영되는지 검증.
    const juneSettlement = makeDeferred<ReturnType<typeof makeSettlement>>();
    getTeamSettlementSummaryMock.mockImplementation((params: { yearMonth?: string }) => {
      const ym = params?.yearMonth;
      if (ym === '2026-07') return Promise.resolve(makeSettlement('2026-07', 'JULY_CLASS'));
      if (ym === '2026-06') return juneSettlement.promise;
      return Promise.resolve(makeSettlement(ym ?? '', 'X'));
    });
    // 미수금 — 7월 실패(에러 상태 진입), 6월은 영구 pending(월변경·재시도해도 미해결 → 재시도 버튼 유지).
    getTeamUnpaidMembersMock.mockImplementation((params: { yearMonth?: string }) => {
      if (params?.yearMonth === '2026-07') return Promise.reject(new Error('unpaid down'));
      return new Promise(() => {}); // 6월: never resolve
    });

    render(<DirectorPaymentsPage />);
    await screen.findByText(MESSAGES.settlement.totalCollected);

    // 정산 집계 탭 상단 미수금 배너 — 실패 문구로 노출 → 펼치면 재시도 UI.
    await openSettlementTab();
    await act(async () => {
      fireEvent.click(await screen.findByText(MESSAGES.settlement.unpaidLoadFailed));
    });
    expect(screen.getAllByText(MESSAGES.settlement.unpaidLoadFailed).length).toBeGreaterThan(1);

    // 월 변경 → 6월 (loadNew·loadUnpaid 동시 in-flight).
    const prevBtn = screen.getByLabelText(MESSAGES.settlement.prevMonth);
    await act(async () => {
      fireEvent.click(prevBtn);
    });

    // 소계 응답 도착 전, 미수금 단독 재시도 클릭 → settlementSeq 는 불변이어야(loadNew 생존).
    const retryBtn = await screen.findByText(MESSAGES.settlement.retry);
    await act(async () => {
      fireEvent.click(retryBtn);
    });

    // in-flight loadNew(6월) 응답 도착 → 폐기되지 않고 settlement 가 6월로 갱신되어야.
    await act(async () => {
      juneSettlement.resolve(makeSettlement('2026-06', 'JUNE_CLASS'));
    });

    // 정산 집계 탭 전환 → 6월 데이터 렌더(로딩 고정 아님).
    await openSettlementTab();
    expect(await screen.findByText('JUNE_CLASS')).toBeInTheDocument();
    expect(screen.queryByText(MESSAGES.settlement.monthLoading)).not.toBeInTheDocument();
  });
});

describe('DirectorPaymentsPage — 최초 로드 실패 (HIGH-2)', () => {
  it('신규 소계 실패 시 에러+재시도 UI 를 노출하고 0원 Hero 를 렌더하지 않는다', async () => {
    getTeamSettlementSummaryMock.mockRejectedValue(new Error('load failed'));

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

    render(<DirectorPaymentsPage />);

    const retryBtn = await screen.findByText(MESSAGES.settlement.retry);
    await act(async () => {
      fireEvent.click(retryBtn);
    });

    expect(await screen.findByText(MESSAGES.settlement.totalCollected)).toBeInTheDocument();
    await openSettlementTab();
    expect(await screen.findByText('JULY_CLASS')).toBeInTheDocument();
  });
});

describe('DirectorPaymentsPage — 미수금 로드 실패 (금융 위장 금지)', () => {
  it('미수금 실패 시 배너가 실패 문구를 노출하고, 펼치면 에러+재시도 UI(빈 상태 위장 금지)', async () => {
    getTeamSettlementSummaryMock.mockResolvedValue(makeSettlement('2026-07', 'JULY_CLASS'));
    getTeamUnpaidMembersMock.mockRejectedValue(new Error('unpaid down'));

    render(<DirectorPaymentsPage />);
    await screen.findByText(MESSAGES.settlement.totalCollected);
    await openSettlementTab();

    // 배너가 "미수금 0"이 아니라 실패 문구로 노출된다.
    const banner = await screen.findByText(MESSAGES.settlement.unpaidLoadFailed);
    expect(banner).toBeInTheDocument();

    // 펼치면 로드 실패 UI (빈 상태 문구 아님).
    await act(async () => {
      fireEvent.click(banner);
    });
    expect(screen.getAllByText(MESSAGES.settlement.unpaidLoadFailed).length).toBeGreaterThan(1);
    expect(screen.getByText(MESSAGES.settlement.retry)).toBeInTheDocument();
    expect(screen.queryByText(MESSAGES.settlement.emptyUnpaid)).not.toBeInTheDocument();
  });

  it('재시도 성공 시 미수금 목록으로 복구된다', async () => {
    getTeamSettlementSummaryMock.mockResolvedValue(makeSettlement('2026-07', 'JULY_CLASS'));
    getTeamUnpaidMembersMock
      .mockRejectedValueOnce(new Error('unpaid down'))
      .mockResolvedValueOnce(
        makeUnpaid('2026-07', [
          {
            memberId: 'm1',
            name: '홍길동',
            teamName: '팀A',
            outstandingAmount: 30000,
            sources: ['CLASS'],
            classCount: 1,
            tournamentCount: 0,
          },
        ]),
      );

    render(<DirectorPaymentsPage />);
    await screen.findByText(MESSAGES.settlement.totalCollected);
    await openSettlementTab();

    // 배너 펼침 → 재시도.
    await act(async () => {
      fireEvent.click(await screen.findByText(MESSAGES.settlement.unpaidLoadFailed));
    });
    const retryBtn = await screen.findByText(MESSAGES.settlement.retry);
    await act(async () => {
      fireEvent.click(retryBtn);
    });

    expect(await screen.findByText('홍길동')).toBeInTheDocument();
    expect(screen.queryByText(MESSAGES.settlement.unpaidLoadFailed)).not.toBeInTheDocument();
  });
});

describe('DirectorPaymentsPage — 미수금 배너 · 선택월 연동', () => {
  it('배너 펼침 시 출처별 건수(훈련·대회)·미납액 합계·발송 버튼을 표시한다', async () => {
    getTeamSettlementSummaryMock.mockResolvedValue(makeSettlement('2026-07', 'JULY_CLASS'));
    getTeamUnpaidMembersMock.mockImplementation((params: { yearMonth?: string }) =>
      Promise.resolve(
        makeUnpaid(params?.yearMonth ?? '', [
          {
            memberId: 'm1',
            name: '홍길동',
            teamName: '팀A',
            outstandingAmount: 30000,
            sources: ['CLASS', 'TOURNAMENT'],
            classCount: 1,
            tournamentCount: 1,
          },
        ]),
      ),
    );

    render(<DirectorPaymentsPage />);
    await screen.findByText(MESSAGES.settlement.totalCollected);
    await openSettlementTab();

    // 접힘 배너 — 미수 총액 + 미납 인원 요약 노출 → 클릭해 펼침.
    const bannerSummary = await screen.findByText(
      new RegExp(MESSAGES.settlement.unpaidMemberCount(1)),
    );
    await act(async () => {
      fireEvent.click(bannerSummary);
    });

    expect(await screen.findByText('홍길동')).toBeInTheDocument();
    const panel = screen.getByRole('tabpanel');
    // 출처 건수는 단일 메타 라인("훈련 1건 · 대회 1건")으로 합쳐 렌더된다.
    const sourceCountText = `${MESSAGES.settlement.sourceClassCount(1)} · ${MESSAGES.settlement.sourceTournamentCount(1)}`;
    expect(within(panel).getByText(sourceCountText)).toBeInTheDocument();
    expect(within(panel).getByText(MESSAGES.settlement.unpaidLabel)).toBeInTheDocument();
    expect(
      within(panel).getByRole('button', { name: MESSAGES.settlement.sendReminder }),
    ).toBeInTheDocument();
  });

  it('월 변경 시 미수금·거래 내역을 선택월로 재조회한다', async () => {
    getTeamSettlementSummaryMock.mockImplementation((params: { yearMonth?: string }) =>
      Promise.resolve(makeSettlement(params?.yearMonth ?? '', 'CLS')),
    );

    render(<DirectorPaymentsPage />);
    await screen.findByText(MESSAGES.settlement.totalCollected);

    // 최초 당월(2026-07) 조회
    expect(getTeamUnpaidMembersMock).toHaveBeenCalledWith({ yearMonth: '2026-07' });
    expect(getTeamTransactionsMock).toHaveBeenCalledWith({ yearMonth: '2026-07' });

    const prevBtn = screen.getByLabelText(MESSAGES.settlement.prevMonth);
    await act(async () => {
      fireEvent.click(prevBtn); // 2026-06
    });

    // 선택월이 바뀌면 미수금·거래도 그 달로 재조회
    expect(getTeamUnpaidMembersMock).toHaveBeenCalledWith({ yearMonth: '2026-06' });
    expect(getTeamTransactionsMock).toHaveBeenCalledWith({ yearMonth: '2026-06' });
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

    render(<DirectorPaymentsPage />);
    await screen.findByText(MESSAGES.settlement.totalCollected);
    await openSettlementTab();
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

describe('DirectorPaymentsPage — 정산 집계 탭 (훈련·대회 섹션)', () => {
  it('훈련 섹션 카드에 상태 배지·완납 인원·결제방식 요약을 표시한다', async () => {
    getTeamSettlementSummaryMock.mockResolvedValue(makeRichSettlement('2026-07'));

    render(<DirectorPaymentsPage />);
    await screen.findByText(MESSAGES.settlement.totalCollected);
    await openSettlementTab();

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

  it('같은 탭 안에서 대회 섹션 카드도 함께 렌더된다', async () => {
    getTeamSettlementSummaryMock.mockResolvedValue(makeRichSettlement('2026-07'));

    render(<DirectorPaymentsPage />);
    await screen.findByText(MESSAGES.settlement.totalCollected);
    await openSettlementTab();

    expect(await screen.findByText('TRAIN_A')).toBeInTheDocument();
    expect(screen.getByText('CUP_A')).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.settlement.statusConfirmed)).toBeInTheDocument();
  });

  it('한쪽만 없으면 그 섹션(타이틀 포함)을 숨기고, 둘 다 없으면 통합 빈 문구만 표시한다', async () => {
    // 훈련만 존재(대회 0) — 대회 섹션 타이틀·빈 문구 모두 미노출.
    getTeamSettlementSummaryMock.mockResolvedValue(makeSettlement('2026-07', 'ONLY_TRAIN'));

    const { unmount } = render(<DirectorPaymentsPage />);
    await screen.findByText(MESSAGES.settlement.totalCollected);
    await openSettlementTab();

    expect(await screen.findByText('ONLY_TRAIN')).toBeInTheDocument();
    expect(screen.queryByText(MESSAGES.settlement.tabTournament)).not.toBeInTheDocument();
    expect(screen.queryByText(MESSAGES.settlement.emptyTournament)).not.toBeInTheDocument();
    unmount();

    // 둘 다 없음 — 섹션 타이틀 없이 통합 빈 문구 1개만.
    getTeamSettlementSummaryMock.mockResolvedValue({
      ...makeSettlement('2026-07', 'X'),
      classes: [],
    });
    render(<DirectorPaymentsPage />);
    await screen.findByText(MESSAGES.settlement.totalCollected);
    await openSettlementTab();

    expect(await screen.findByText(MESSAGES.settlement.emptySettlement)).toBeInTheDocument();
    expect(screen.queryByText(MESSAGES.settlement.tabTraining)).not.toBeInTheDocument();
    expect(screen.queryByText(MESSAGES.settlement.emptyTraining)).not.toBeInTheDocument();
  });
});

describe('DirectorPaymentsPage — detailPath 네비게이션 (MEDIUM-3)', () => {
  it('훈련 카드 클릭 시 detailPath 로 navigate 한다', async () => {
    getTeamSettlementSummaryMock.mockResolvedValue(makeRichSettlement('2026-07'));

    render(<DirectorPaymentsPage />);
    await screen.findByText(MESSAGES.settlement.totalCollected);
    await openSettlementTab();

    const card = await screen.findByText('TRAIN_A');
    fireEvent.click(card);

    expect(navigateMock).toHaveBeenCalledWith('/classes/c1/students?yearMonth=2026-07');
  });
});

describe('DirectorPaymentsPage — 거래 내역 탭 (건별 장부)', () => {
  it('결제 건별 행에 자녀·수업명, 결제 일시(KST), 결제자, 상태를 표시한다', async () => {
    getTeamSettlementSummaryMock.mockResolvedValue(makeSettlement('2026-07', 'JULY_CLASS'));
    getTeamTransactionsMock.mockImplementation((params: { yearMonth?: string }) =>
      Promise.resolve(
        makeTransactions(params?.yearMonth ?? '', [
          {
            paymentId: 'pay-1',
            amount: 50000,
            paymentStatus: 'completed',
            completedAt: '2026-07-24T05:32:00Z', // KST 14:32
            payerName: '홍부모',
            childName: '홍길동',
            subjectName: '3월 정규수업',
            sourceType: 'CLASS',
            billingTiming: 'PREPAID',
          },
          {
            paymentId: 'pay-2',
            amount: 40000,
            paymentStatus: 'refunded',
            completedAt: '2026-07-20T02:00:00Z',
            payerName: '김부모',
            childName: null,
            subjectName: '여름컵',
            sourceType: 'TOURNAMENT',
            billingTiming: 'POSTPAID',
          },
        ]),
      ),
    );

    render(<DirectorPaymentsPage />);
    await screen.findByText(MESSAGES.settlement.totalCollected);

    // 일자 그룹 헤더 — "MM.DD (요일)" (연월 문맥은 Hero 월 선택기 담당 · 날짜 다른 두 건 → 헤더 2개).
    expect(await screen.findByText('07.24 (금)')).toBeInTheDocument();
    expect(screen.getByText('07.20 (월)')).toBeInTheDocument();
    // 행 1 — 타이틀 줄=선수명+결제 보호자, 메타 줄=상품명·시각(간격 구분·기호 없음).
    expect(screen.getByText('홍길동')).toBeInTheDocument();
    expect(screen.getByText('홍부모')).toBeInTheDocument();
    expect(screen.getByText('3월 정규수업')).toBeInTheDocument();
    expect(screen.getByText('14:32')).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.settlement.txnStatusCompleted)).toBeInTheDocument();
    // 행 2 — 선수 연결 없음 → 상품명(대회명)이 타이틀 승격 + 환불 상태.
    expect(screen.getByText('여름컵')).toBeInTheDocument();
    expect(screen.getByText('김부모')).toBeInTheDocument();
    expect(screen.getByText('11:00')).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.settlement.txnStatusRefunded)).toBeInTheDocument();
  });

  it('거래 로드 실패 시 에러+재시도, 성공 시 목록 복구(빈 목록 위장 금지)', async () => {
    getTeamSettlementSummaryMock.mockResolvedValue(makeSettlement('2026-07', 'JULY_CLASS'));
    getTeamTransactionsMock
      .mockRejectedValueOnce(new Error('txn down'))
      .mockResolvedValueOnce(
        makeTransactions('2026-07', [
          {
            paymentId: 'pay-1',
            amount: 30000,
            paymentStatus: 'completed',
            completedAt: '2026-07-10T01:00:00Z',
            payerName: '박부모',
            childName: '박선수',
            subjectName: '주말반',
            sourceType: 'CLASS',
            billingTiming: 'PREPAID',
          },
        ]),
      );

    render(<DirectorPaymentsPage />);
    await screen.findByText(MESSAGES.settlement.totalCollected);

    expect(
      await screen.findByText(MESSAGES.settlement.transactionsLoadFailed),
    ).toBeInTheDocument();
    expect(screen.queryByText(MESSAGES.settlement.emptyTransactions)).not.toBeInTheDocument();

    const retryBtn = screen.getByText(MESSAGES.settlement.retry);
    await act(async () => {
      fireEvent.click(retryBtn);
    });

    expect(await screen.findByText('박선수')).toBeInTheDocument();
    expect(screen.getByText(/주말반/)).toBeInTheDocument();
    expect(
      screen.queryByText(MESSAGES.settlement.transactionsLoadFailed),
    ).not.toBeInTheDocument();
  });
});
