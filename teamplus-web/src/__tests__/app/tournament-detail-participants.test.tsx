/**
 * /tournaments/[id] — 명단·정산 관리 분리 후 상세 페이지 회귀 테스트.
 *
 * 계약:
 *   · 감독/코치: 관리 진입 카드(명단·정산 관리 + 활성 참가 인원) 노출,
 *     탭 시 /tournaments/{id}/students 이동. 명단 행·정산 액션은 상세에 없음.
 *   · 구 앵커(#participants·#settlement) 진입 시 관리 페이지로 replace(하위호환).
 *   · 학부모: 진입 카드 미노출(공용 조회 화면) + 앵커 진입 no-op.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
//   매 렌더 변해 재조회 루프가 돈다(실구현은 안정 참조).
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
const mockModal = { confirm: jest.fn() };
jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));
jest.mock('@/components/ui/Modal', () => ({
  useModal: () => ({ modal: mockModal }),
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
jest.mock('@/components/notice/UnitNoticeSection', () => ({
  UnitNoticeSection: () => null,
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

function reg(id: string, paymentStatus: string, billingStatus: string) {
  return {
    id,
    userId: `u-${id}`,
    childId: null,
    gamesCount: 1,
    calculatedFee: 30000,
    paymentStatus,
    registeredAt: '2026-07-01',
    user: { id: `u-${id}`, lastName: '김', firstName: id },
    child: null,
    payment: { id: `p-${id}`, orderNumber: id, paymentStatus, amount: 30000 },
    billingStatus,
    billingTiming: 'POSTPAID',
    billedAmount: 30000,
    paidAmount: billingStatus === 'PAID' ? 30000 : 0,
    refundedAmount: 0,
    estimatedAmount: 30000,
    paidAt: null,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'dir1', userType: 'DIRECTOR' };
  window.location.hash = '';
  mockGetTournament.mockResolvedValue({ success: true, data: tournament('POSTPAID') });
  mockListRegs.mockResolvedValue({
    success: true,
    data: {
      tournamentId: 't1',
      total: 5,
      billingMode: 'POSTPAID',
      registrations: [
        reg('r1', 'PAID', 'PAID'),
        reg('r2', 'PENDING', 'BILLED'),
        reg('r3', 'UNPAID', 'UNSETTLED'),
        reg('r4', 'CANCELLED', 'CANCELLED'),
        reg('r5', 'REFUNDED', 'REFUNDED'),
      ],
    },
  });
});

describe('대회 상세 — 감독 관리 진입 카드', () => {
  it('진입 카드 노출(활성 참가 인원) + 탭 시 관리 페이지 이동', async () => {
    render(<TournamentDetailPage />);
    await screen.findByText(MESSAGES.tournament.rosterManageCta, undefined, {
      timeout: 4000,
    });

    // 활성(취소·환불 제외) 3명 표기 — regRows 로드 완료 대기.
    await screen.findByText(MESSAGES.tournament.rosterParticipantCount(3));

    fireEvent.click(screen.getByText(MESSAGES.tournament.rosterManageCta));
    expect(mockNavigate).toHaveBeenCalledWith('/tournaments/t1/students');
  });

  it('명단 행·정산 액션(체크박스·결제요청)은 상세에 없음', async () => {
    render(<TournamentDetailPage />);
    await screen.findByText(MESSAGES.tournament.rosterManageCta, undefined, {
      timeout: 4000,
    });

    expect(
      screen.queryByText(MESSAGES.tournament.rosterSectionTitle),
    ).toBeNull();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(
      screen.queryByRole('button', { name: MESSAGES.tournament.settleRequestCta }),
    ).toBeNull();
  });

  it('구 앵커(#settlement) 진입 시 관리 페이지로 replace', async () => {
    window.location.hash = '#settlement';
    render(<TournamentDetailPage />);
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/tournaments/t1/students');
    });
  });

  it('구 앵커(#participants) 진입 시 관리 페이지로 replace', async () => {
    window.location.hash = '#participants';
    render(<TournamentDetailPage />);
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/tournaments/t1/students');
    });
  });
});

describe('대회 상세 — 학부모(비관리자)', () => {
  beforeEach(() => {
    mockUser = { id: 'p1', userType: 'PARENT' };
  });

  it('관리 진입 카드 미노출', async () => {
    render(<TournamentDetailPage />);
    await screen.findByText('대회 기간', undefined, { timeout: 4000 });
    expect(screen.queryByText(MESSAGES.tournament.rosterManageCta)).toBeNull();
  });

  it('구 앵커 진입 no-op(replace 미호출)', async () => {
    window.location.hash = '#participants';
    render(<TournamentDetailPage />);
    await screen.findByText('대회 기간', undefined, { timeout: 4000 });
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
