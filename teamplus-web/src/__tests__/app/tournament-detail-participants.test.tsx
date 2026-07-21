/**
 * /tournaments/[id] 참가자 섹션 — 대회 축 정합(작업 A) 회귀 테스트.
 *
 * 계약 고정(SPEC §5-1 · §5-2 · §5-3):
 *   · 후불 대회: 5-state 칩(완납/청구/미정산/취소/환불) + POSTPAID 배지 + 정산 액션(결제요청·체크박스).
 *   · CANCELLED/REFUNDED 행: 명단 표시(보존)하되 결제요청 체크박스 미노출.
 *   · 선불 대회: 감독 참가자 섹션 노출 + PREPAID 배지, 정산 확정 액션(결제요청/체크박스) 미노출.
 *   · 해시 앵커(#participants·#settlement) 진입 시 scrollIntoView, 요소 없으면 no-op.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { MESSAGES } from '@/lib/messages';
import {
  getTournament,
  listTournamentRegistrations,
} from '@/services/tournament.service';

// ── 목: 순수 헬퍼(canManageMatch 등)는 실제, I/O 2종만 목 ──
jest.mock('@/services/tournament.service', () => {
  const actual = jest.requireActual('@/services/tournament.service');
  return {
    ...actual,
    getTournament: jest.fn(),
    listTournamentRegistrations: jest.fn(),
  };
});

let mockUser: { id: string; userType: string } | null = {
  id: 'dir1',
  userType: 'DIRECTOR',
};

jest.mock('next/navigation', () => ({ useParams: () => ({ id: 't1' }) }));
jest.mock('@/hooks/useSessionAuth', () => ({
  useSessionAuth: () => ({ user: mockUser }),
}));
jest.mock('@/hooks/usePageReady', () => ({ usePageReady: () => {} }));
jest.mock('@/hooks/useNativeUI', () => ({ useNativeUI: () => {} }));
jest.mock('@/components/ui/NavLink', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));
jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }),
}));
jest.mock('@/components/ui/Modal', () => ({
  useModal: () => ({ modal: { confirm: jest.fn() } }),
}));
jest.mock('@/services/api-client', () => ({
  api: { get: jest.fn().mockResolvedValue({ success: true, data: { children: [] } }) },
}));
jest.mock('@/services/team.service', () => ({
  getTeamMembers: jest.fn().mockResolvedValue({ success: true, data: { members: [] } }),
}));
jest.mock('@/components/tournament', () => ({
  TournamentHeroSection: () => null,
  ChildPaymentRow: () => null,
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
jest.mock('@/lib/gradeToBirthYear', () => ({
  formatEligibleBirthYearsLabel: () => '',
}));

import TournamentDetailPage from '@/app/(common)/tournaments/[id]/page';

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
  window.location.hash = '';
  Element.prototype.scrollIntoView = jest.fn();
});

describe('대회 상세 — 후불 참가자 섹션 (5-state · 정산 액션)', () => {
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
    render(<TournamentDetailPage />);
    await screen.findByText(MESSAGES.tournament.rosterSectionTitle, undefined, {
      timeout: 4000,
    });

    // 5-state 칩 라벨(완납/청구/미정산/취소/환불) — 수업 축 MESSAGES.settlement 재사용.
    expect(screen.getByText(MESSAGES.settlement.rowStatusPaid)).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.settlement.rowStatusBilled)).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.settlement.rowStatusUnsettled)).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.settlement.rowStatusCancelled)).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.settlement.rowStatusRefunded)).toBeInTheDocument();

    // POSTPAID 배지(후불) — 행마다 노출.
    expect(screen.getAllByText(MESSAGES.settlement.postpaid).length).toBe(5);

    // 정산 확정 액션(결제요청) 노출.
    expect(
      screen.getByRole('button', { name: MESSAGES.tournament.settleRequestCta }),
    ).toBeInTheDocument();
  });

  it('CANCELLED/REFUNDED 명단 보존하되 체크박스는 UNPAID·전체선택만', async () => {
    render(<TournamentDetailPage />);
    await screen.findByText(MESSAGES.tournament.rosterSectionTitle, undefined, {
      timeout: 4000,
    });

    // 취소·환불 참가자 이름도 명단에 표시(보존).
    expect(screen.getByText('최취소')).toBeInTheDocument();
    expect(screen.getByText('정환불')).toBeInTheDocument();

    // 체크박스 = 전체선택 1 + UNPAID(박미정산) 1 = 2개. CANCELLED/REFUNDED/PAID/BILLED 미노출.
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });

  it('#participants 해시 진입 시 scrollIntoView 호출', async () => {
    window.location.hash = '#participants';
    render(<TournamentDetailPage />);
    await screen.findByText(MESSAGES.tournament.rosterSectionTitle, undefined, {
      timeout: 4000,
    });
    await waitFor(() => {
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    });
  });

  it('해시 없는 진입은 자동 스크롤 없음(회귀)', async () => {
    render(<TournamentDetailPage />);
    await screen.findByText(MESSAGES.tournament.rosterSectionTitle, undefined, {
      timeout: 4000,
    });
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
});

describe('대회 상세 — 선불 참가자 섹션 (읽기전용 현황)', () => {
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

  it('선불 대회 감독 참가자 섹션 노출 + PREPAID 배지', async () => {
    render(<TournamentDetailPage />);
    await screen.findByText(MESSAGES.tournament.rosterSectionTitle, undefined, {
      timeout: 4000,
    });
    expect(screen.getAllByText(MESSAGES.settlement.prepaid).length).toBeGreaterThanOrEqual(2);
  });

  it('선불 대회는 정산 확정 액션(결제요청·체크박스) 미노출', async () => {
    render(<TournamentDetailPage />);
    await screen.findByText(MESSAGES.tournament.rosterSectionTitle, undefined, {
      timeout: 4000,
    });
    expect(
      screen.queryByRole('button', { name: MESSAGES.tournament.settleRequestCta }),
    ).toBeNull();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('#settlement 해시는 선불 대회에서 #participants 로 폴백 스크롤', async () => {
    window.location.hash = '#settlement';
    render(<TournamentDetailPage />);
    await screen.findByText(MESSAGES.tournament.rosterSectionTitle, undefined, {
      timeout: 4000,
    });
    await waitFor(() => {
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    });
  });
});
