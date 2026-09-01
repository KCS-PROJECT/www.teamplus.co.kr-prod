/**
 * /tournaments/[id]/students — 대회 명단·정산 관리 페이지 회귀 테스트.
 *
 * 계약(상세 참가자 섹션에서 분리·승계):
 *   · 후불 대회: 5-state 칩(완납/청구/미정산/취소/환불) + POSTPAID 배지 + N경기 표기
 *     + 정산 액션(결제요청·체크박스). CANCELLED/REFUNDED 행은 명단 보존, 체크박스 미노출.
 *   · 선불 대회: PREPAID 배지 읽기전용 현황 — 정산 확정 액션(결제요청/체크박스) 미노출.
 *   · 필터 칩(전체/미수/완납)으로 명단 상태 필터.
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
  BottomSheet: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
}));

import TournamentStudentsPage from '@/app/(common)/tournaments/[id]/students/page';

const mockGetTournament = getTournament as jest.Mock;
const mockListRegs = listTournamentRegistrations as jest.Mock;

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
) {
  return {
    id,
    userId: `u-${id}`,
    childId: null,
    gamesCount: 1,
    calculatedFee: 30000,
    paymentStatus,
    registeredAt: '2026-07-01',
    user: { id: `u-${id}`, lastName, firstName },
    child: null,
    payment: { id: `p-${id}`, orderNumber: id, paymentStatus, amount: 30000 },
    billingStatus,
    billingTiming,
    billedAmount: billingStatus === 'PAID' || billingStatus === 'BILLED' ? 30000 : null,
    paidAmount: billingStatus === 'PAID' ? 30000 : 0,
    refundedAmount: 0,
    estimatedAmount: 30000,
    paidAt: billingStatus === 'PAID' ? '2026-07-02' : null,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'dir1', userType: 'DIRECTOR' };
});

describe('대회 명단·정산 관리 — 후불 (5-state · 정산 액션)', () => {
  beforeEach(() => {
    mockGetTournament.mockResolvedValue({ success: true, data: tournament('POSTPAID') });
    mockListRegs.mockResolvedValue({
      success: true,
      data: {
        tournamentId: 't1',
        total: 5,
        billingMode: 'POSTPAID',
        registrations: [
          reg('r1', '김', '완납', 'PAID', 'PAID', 'POSTPAID'),
          reg('r2', '이', '청구', 'PENDING', 'BILLED', 'POSTPAID'),
          reg('r3', '박', '미정산', 'UNPAID', 'UNSETTLED', 'POSTPAID'),
          reg('r4', '최', '취소', 'CANCELLED', 'CANCELLED', 'POSTPAID'),
          reg('r5', '정', '환불', 'REFUNDED', 'REFUNDED', 'POSTPAID'),
        ],
      },
    });
  });

  it('5-state 칩 5종 + POSTPAID 배지 + 결제요청 액션 노출', async () => {
    render(<TournamentStudentsPage />);
    await screen.findByText('김완납', undefined, { timeout: 4000 });

    // 5-state 칩 라벨(완납/청구/미정산/취소/환불) — 수업 축 MESSAGES.settlement 재사용.
    //   완납/청구/미정산은 요약 CountBlock·필터 칩에도 등장하므로 존재만 확인.
    expect(screen.getAllByText(MESSAGES.settlement.rowStatusPaid).length).toBeGreaterThan(0);
    expect(screen.getAllByText(MESSAGES.settlement.rowStatusBilled).length).toBeGreaterThan(0);
    expect(screen.getAllByText(MESSAGES.settlement.rowStatusUnsettled).length).toBeGreaterThan(0);
    expect(screen.getByText(MESSAGES.settlement.rowStatusCancelled)).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.settlement.rowStatusRefunded)).toBeInTheDocument();

    // POSTPAID 배지(후불) — 행마다 노출.
    expect(screen.getAllByText(MESSAGES.settlement.postpaid).length).toBe(5);

    // 정산 확정 액션(결제요청) 노출.
    expect(
      screen.getByRole('button', { name: MESSAGES.tournament.settleRequestCta }),
    ).toBeInTheDocument();
  });

  it('행 메타에 출전 경기 수(N경기) 표기', async () => {
    render(<TournamentStudentsPage />);
    await screen.findByText('김완납', undefined, { timeout: 4000 });
    expect(
      screen.getAllByText((content) =>
        content.includes(MESSAGES.tournament.rosterGamesCount(1)),
      ).length,
    ).toBeGreaterThan(0);
  });

  it('CANCELLED/REFUNDED 명단 보존하되 체크박스는 UNPAID·전체선택만', async () => {
    render(<TournamentStudentsPage />);
    await screen.findByText('김완납', undefined, { timeout: 4000 });

    expect(screen.getByText('최취소')).toBeInTheDocument();
    expect(screen.getByText('정환불')).toBeInTheDocument();

    // 체크박스 = 전체선택 1 + UNPAID(박미정산) 1 = 2개.
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });

  it('필터 칩(완납) 선택 시 완납 행만 표시', async () => {
    render(<TournamentStudentsPage />);
    await screen.findByText('김완납', undefined, { timeout: 4000 });

    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(MESSAGES.settlement.rowStatusPaid),
      }),
    );

    expect(screen.getByText('김완납')).toBeInTheDocument();
    expect(screen.queryByText('박미정산')).toBeNull();
    expect(screen.queryByText('최취소')).toBeNull();
  });
});

describe('대회 명단·정산 관리 — 선불 (읽기전용 현황)', () => {
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

  it('PREPAID 배지 노출 + 정산 확정 액션(결제요청·체크박스) 미노출', async () => {
    render(<TournamentStudentsPage />);
    await screen.findByText('김완납', undefined, { timeout: 4000 });

    expect(
      screen.getAllByText(MESSAGES.settlement.prepaid).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      screen.queryByRole('button', { name: MESSAGES.tournament.settleRequestCta }),
    ).toBeNull();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });
});

describe('대회 명단·정산 관리 — 비관리자 가드', () => {
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
