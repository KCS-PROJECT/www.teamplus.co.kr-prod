/**
 * /tournaments/[id]/students — 대회 선수정보 페이지 회귀 테스트.
 *
 * 계약(수업 축과 동일 2탭 골격):
 *   · 네이비 히어로(대회명·상태·기간·참가/완납) + 탭바(선수정보/결제 현황).
 *   · 탭① 선수정보: 이름 검색 + 명단(생년월일·보호자·상태 칩) — 정산 요소 없음.
 *   · 탭② 결제 현황: 요약 → 필터 → 금액 행 + (후불) 체크박스·sticky 결제요청.
 *     선택 대상은 현재 필터로 보이는 행으로 한정(숨은 행 청구 방지).
 *   · 선불 대회: UNSETTLED 라벨 "미결제", 결제 탭 읽기전용(체크박스·CTA 없음).
 *   · 환불 행은 결제 탭에서 탭 시 결제·환불 금액 시트(평시 환불액 미노출).
 *   · 비관리자(학부모) 진입 시 대회 상세로 replace.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MESSAGES } from '@/lib/messages';
import {
  getTournament,
  listTournamentRegistrations,
} from '@/services/tournament.service';

// ── 목: 순수 헬퍼(canManageMatch 등)는 실제, I/O 만 목 ──
jest.mock('@/services/tournament.service', () => {
  const actual = jest.requireActual('@/services/tournament.service');
  return {
    ...actual,
    getTournament: jest.fn(),
    listTournamentRegistrations: jest.fn(),
    confirmTournamentSettlement: jest.fn(),
    cancelTournamentSettlement: jest.fn(),
  };
});

let mockUser: { id: string; userType: string } | null = {
  id: 'dir1',
  userType: 'DIRECTOR',
};

const mockNavigate = jest.fn();
const mockReplace = jest.fn();

jest.mock('next/navigation', () => ({ useParams: () => ({ id: 't1' }) }));
jest.mock('@/hooks/useSessionAuth', () => ({
  useSessionAuth: () => ({ user: mockUser }),
}));
jest.mock('@/hooks/usePageReady', () => ({ usePageReady: () => {} }));
jest.mock('@/hooks/useNativeUI', () => ({ useNativeUI: () => {} }));
jest.mock('@/components/ui/NavLink', () => ({
  useNavigation: () => ({ navigate: mockNavigate, replace: mockReplace }),
}));
// toast/modal 은 안정 참조 필수 — 렌더마다 새 객체면 load useCallback 의존성이
//   매 렌더 변해 재조회 루프가 돌며 로딩 상태로 되돌아간다(실구현은 안정 참조).
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
const mockModal = { confirm: jest.fn() };
jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));
jest.mock('@/components/ui/Modal', () => ({
  useModal: () => ({ modal: mockModal }),
}));
jest.mock('@/components/layout/MobileContainer', () => ({
  MobileContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@/components/layout/PageAppBar', () => ({ PageAppBar: () => null }));
jest.mock('@/components/ui/Icon', () => ({ Icon: () => null }));
jest.mock('@/components/ui/Button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));
jest.mock('@/components/ui/BottomSheet', () => ({
  BottomSheet: ({
    isOpen,
    children,
    footer,
  }: {
    isOpen: boolean;
    children: React.ReactNode;
    footer?: React.ReactNode;
  }) =>
    isOpen ? (
      <div>
        {children}
        {footer}
      </div>
    ) : null,
}));

import TournamentStudentsPage from '@/app/(common)/tournaments/[id]/students/page';

const mockGetTournament = getTournament as jest.Mock;
const mockListRegs = listTournamentRegistrations as jest.Mock;
const M = MESSAGES.academy.students;

function tournament(billingMode: 'PREPAID' | 'POSTPAID') {
  return {
    id: 't1',
    name: '여름 대회',
    club: { clubName: '아이스하키 클럽' },
    team: { name: '우리 팀' },
    teamId: null,
    startDate: '2026-07-10',
    endDate: '2026-07-10',
    registrationDeadline: '2026-07-05',
    status: 'ongoing',
    billingMode,
    feePerGame: 30000,
    feeType: 'TOTAL_FIXED',
    location: '아이스링크',
    venue: null,
    rink: null,
    description: null,
    selectedParticipantIds: [],
    eligibleBirthYears: null,
    eligibleBirthYearFrom: null,
    eligibleBirthYearTo: null,
    matches: [],
    myRegistrations: [],
  };
}

function reg(
  id: string,
  lastName: string,
  firstName: string,
  paymentStatus: string,
  billingStatus: string,
  billingTiming: 'PREPAID' | 'POSTPAID',
  withChild = false,
) {
  return {
    id,
    userId: `u-${id}`,
    // 자녀 참가 건 — 선수=child, 신청 보호자=user(김보호).
    childId: withChild ? `c-${id}` : null,
    gamesCount: 1,
    calculatedFee: 30000,
    paymentStatus,
    registeredAt: '2026-07-01T09:00:00.000Z',
    user: withChild
      ? { id: `u-${id}`, lastName: '김', firstName: '보호' }
      : { id: `u-${id}`, lastName, firstName },
    child: withChild
      ? {
          id: `c-${id}`,
          lastName,
          firstName,
          childProfile: { birthDate: '2017-03-15' },
        }
      : null,
    payment: { id: `p-${id}`, orderNumber: id, paymentStatus, amount: 30000 },
    billingStatus,
    billingTiming,
    billedAmount: billingStatus === 'PAID' || billingStatus === 'BILLED' ? 30000 : null,
    paidAmount: billingStatus === 'PAID' ? 30000 : 0,
    refundedAmount: billingStatus === 'REFUNDED' ? 30000 : 0,
    paidAt: billingStatus === 'PAID' ? '2026-07-02' : null,
  };
}

function openPaymentTab() {
  fireEvent.click(screen.getByRole('tab', { name: M.tabPayment }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'dir1', userType: 'DIRECTOR' };
});

describe('대회 선수정보 — 후불', () => {
  beforeEach(() => {
    mockGetTournament.mockResolvedValue({ success: true, data: tournament('POSTPAID') });
    mockListRegs.mockResolvedValue({
      success: true,
      data: {
        tournamentId: 't1',
        total: 5,
        billingMode: 'POSTPAID',
        registrations: [
          reg('r1', '김', '완납', 'PAID', 'PAID', 'POSTPAID', true),
          reg('r2', '이', '청구', 'PENDING', 'BILLED', 'POSTPAID'),
          reg('r3', '박', '미정산', 'UNPAID', 'UNSETTLED', 'POSTPAID'),
          reg('r4', '최', '취소', 'CANCELLED', 'CANCELLED', 'POSTPAID'),
          reg('r5', '정', '환불', 'REFUNDED', 'REFUNDED', 'POSTPAID'),
        ],
      },
    });
  });

  it('탭① 선수정보(기본) — 명단·메타·상태 칩만, 정산 요소 없음', async () => {
    render(<TournamentStudentsPage />);
    await screen.findByText('김완납', undefined, { timeout: 4000 });

    // 사람 축 메타 — 생년월일 · 보호자.
    const payer = M.payerLabel('김보호');
    expect(
      screen.getAllByText((c) => c.includes(payer)).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText((c) => c.includes('2017.03.15')).length,
    ).toBeGreaterThan(0);

    // 정산 요소(체크박스·결제요청·금액·배지) 미노출 — 결제 탭 몫.
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /결제요청/ })).toBeNull();
    expect(screen.queryByText(MESSAGES.settlement.postpaid)).toBeNull();
    expect(screen.queryByText(MESSAGES.settlement.totalCollected)).toBeNull();
  });

  it('탭① 이름 검색 — 부분일치 행만 표시', async () => {
    render(<TournamentStudentsPage />);
    await screen.findByText('김완납', undefined, { timeout: 4000 });

    fireEvent.change(
      screen.getByLabelText(MESSAGES.tournament.participantSearchPlaceholder),
      { target: { value: '박' } },
    );

    expect(screen.getByText('박미정산')).toBeInTheDocument();
    expect(screen.queryByText('김완납')).toBeNull();
  });

  it('탭② 결제 현황 — 5-state·배지·체크박스·sticky 결제요청(선택 1명)', async () => {
    render(<TournamentStudentsPage />);
    await screen.findByText('김완납', undefined, { timeout: 4000 });
    openPaymentTab();

    // 요약 + 5-state 칩(취소·환불 행 보존).
    expect(screen.getByText(MESSAGES.settlement.totalCollected)).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.settlement.rowStatusCancelled)).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.settlement.rowStatusRefunded)).toBeInTheDocument();

    // POSTPAID 배지 — 행마다 노출.
    expect(screen.getAllByText(MESSAGES.settlement.postpaid).length).toBe(5);

    // 체크박스 = 전체선택 1 + UNPAID(박미정산) 1.
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);

    // sticky 결제요청 — 기본 선택 = UNPAID 1명.
    expect(
      await screen.findByRole('button', {
        name: MESSAGES.tournament.settleRequestCtaCount(1),
      }),
    ).toBeInTheDocument();
  });

  it('탭② 필터(완납) — 완납 행만 + 숨은 UNPAID 선택 해제(청구 0명 비활성)', async () => {
    render(<TournamentStudentsPage />);
    await screen.findByText('김완납', undefined, { timeout: 4000 });
    openPaymentTab();

    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(`^${MESSAGES.settlement.rowStatusPaid}`),
      }),
    );

    expect(screen.getByText('김완납')).toBeInTheDocument();
    expect(screen.queryByText('박미정산')).toBeNull();
    expect(screen.queryByText('최취소')).toBeNull();

    expect(
      screen.getByRole('button', {
        name: MESSAGES.tournament.settleRequestCtaCount(0),
      }),
    ).toBeDisabled();
  });

  it('탭② 필터(미정산) — 정산 전만 표시 + 청구 대상 선택·결제요청 유지', async () => {
    render(<TournamentStudentsPage />);
    await screen.findByText('김완납', undefined, { timeout: 4000 });
    openPaymentTab();

    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(`^${MESSAGES.settlement.rowStatusUnsettled}`),
      }),
    );

    expect(screen.getByText('박미정산')).toBeInTheDocument();
    expect(screen.queryByText('이청구')).toBeNull();
    expect(screen.queryByText('김완납')).toBeNull();
    // 미정산 필터에서도 청구 대상(UNPAID) 선택이 유지되어 결제요청 가능.
    expect(
      await screen.findByRole('button', {
        name: MESSAGES.tournament.settleRequestCtaCount(1),
      }),
    ).toBeEnabled();
  });

  it('탭② 필터(미수) — 청구됨(BILLED)만 표시, 정산 전은 미수 아님', async () => {
    render(<TournamentStudentsPage />);
    await screen.findByText('김완납', undefined, { timeout: 4000 });
    openPaymentTab();

    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(`^${MESSAGES.settlement.outstanding}`),
      }),
    );

    expect(screen.getByText('이청구')).toBeInTheDocument();
    expect(screen.queryByText('박미정산')).toBeNull();
    expect(screen.queryByText('김완납')).toBeNull();
  });

  it('탭② 정산하기 — 확인창 승인 시에만 청구 실행', async () => {
    const { confirmTournamentSettlement } = jest.requireMock(
      '@/services/tournament.service',
    );
    render(<TournamentStudentsPage />);
    await screen.findByText('김완납', undefined, { timeout: 4000 });
    openPaymentTab();

    // sticky 결제요청 → 정산 시트 열림.
    fireEvent.click(
      await screen.findByRole('button', {
        name: MESSAGES.tournament.settleRequestCtaCount(1),
      }),
    );
    const settleBtn = await screen.findByRole('button', {
      name: MESSAGES.tournament.settleCta,
    });

    // 확인창 거절 → API 미호출.
    mockModal.confirm.mockResolvedValueOnce(false);
    fireEvent.click(settleBtn);
    await waitFor(() => expect(mockModal.confirm).toHaveBeenCalledTimes(1));
    expect(confirmTournamentSettlement).not.toHaveBeenCalled();

    // 확인창 승인 → 청구 실행(선택 1명 · 프리필 30,000원).
    mockModal.confirm.mockResolvedValueOnce(true);
    (confirmTournamentSettlement as jest.Mock).mockResolvedValueOnce({
      success: true,
      data: { billedCount: 1, totalAmount: 30000 },
    });
    fireEvent.click(settleBtn);
    await waitFor(() =>
      expect(confirmTournamentSettlement).toHaveBeenCalledWith(
        't1',
        30000,
        ['r3'],
      ),
    );
  });

  it('탭② 환불 행 탭 시 결제·환불 금액 시트 (평시 미노출)', async () => {
    render(<TournamentStudentsPage />);
    await screen.findByText('김완납', undefined, { timeout: 4000 });
    openPaymentTab();

    expect(
      screen.queryByText(MESSAGES.tournament.rosterRefundAmount(30000)),
    ).toBeNull();

    fireEvent.click(screen.getByText('정환불'));
    expect(
      await screen.findByText(MESSAGES.tournament.rosterRefundAmount(30000)),
    ).toBeInTheDocument();
    expect(
      screen.getByText(MESSAGES.tournament.settlePaidAmount(30000)),
    ).toBeInTheDocument();
  });
});

describe('대회 선수정보 — 선불 (읽기전용)', () => {
  beforeEach(() => {
    mockGetTournament.mockResolvedValue({ success: true, data: tournament('PREPAID') });
    mockListRegs.mockResolvedValue({
      success: true,
      data: {
        tournamentId: 't1',
        total: 2,
        billingMode: 'PREPAID',
        registrations: [
          reg('r1', '김', '완납', 'PAID', 'PAID', 'PREPAID'),
          reg('r2', '박', '미정산', 'UNPAID', 'UNSETTLED', 'PREPAID'),
        ],
      },
    });
  });

  it('탭① — UNSETTLED 는 "미결제" 라벨("미정산" 미노출)', async () => {
    render(<TournamentStudentsPage />);
    await screen.findByText('김완납', undefined, { timeout: 4000 });

    expect(screen.queryByText(MESSAGES.settlement.rowStatusUnsettled)).toBeNull();
    expect(
      screen.getAllByText(MESSAGES.tournament.rosterPrepaidUnpaid).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('탭② — 정산 액션(체크박스·결제요청) 없음 + 미결제 라벨 + 미수 미노출', async () => {
    render(<TournamentStudentsPage />);
    await screen.findByText('김완납', undefined, { timeout: 4000 });
    openPaymentTab();

    expect(screen.queryByRole('button', { name: /결제요청/ })).toBeNull();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    // 미정산(후불 용어)·미수 미노출, 미결제 = CountBlock + 필터 + 행 칩.
    expect(screen.queryByText(MESSAGES.settlement.rowStatusUnsettled)).toBeNull();
    expect(screen.queryByText(MESSAGES.settlement.outstanding)).toBeNull();
    expect(
      screen.getAllByText(MESSAGES.tournament.rosterPrepaidUnpaid).length,
    ).toBeGreaterThanOrEqual(3);
    // 결제 탭 요약(총 수납)은 선불도 노출(수업 결제 탭 동형).
    expect(screen.getByText(MESSAGES.settlement.totalCollected)).toBeInTheDocument();
  });
});

describe('대회 선수정보 — 비관리자 가드', () => {
  it('학부모 진입 시 대회 상세로 replace', async () => {
    mockUser = { id: 'p1', userType: 'PARENT' };
    mockGetTournament.mockResolvedValue({ success: true, data: tournament('POSTPAID') });
    mockListRegs.mockResolvedValue({
      success: true,
      data: { tournamentId: 't1', total: 0, billingMode: 'POSTPAID', registrations: [] },
    });

    render(<TournamentStudentsPage />);
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/tournaments/t1');
    });
  });
});
