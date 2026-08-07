/**
 * /tournaments/create 참가 대상 전체 토글 — 회귀 테스트.
 *
 * 계약 고정:
 *   · 전체(팀 선수 전원) 토글 기본 ON — 명단 없이 제출하면 selectedParticipantIds=[] 전송.
 *   · 직접 선택 모드(토글 OFF)에서 0명 제출은 participantRequired 로 차단.
 *   · 수정 프리필 — 명단 보유 대회는 토글 OFF, 빈 명단(전체/레거시) 대회는 토글 ON.
 *   · 명단 대회를 전체로 전환해 저장하면 updateTournament 에 빈 배열이 전달된다.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MESSAGES } from '@/lib/messages';
import {
  createTournament,
  getTournament,
  updateTournament,
} from '@/services/tournament.service';

// ── 목: 순수 헬퍼(canManageMatch 등)는 실제, I/O 만 목 ──
jest.mock('@/services/tournament.service', () => {
  const actual = jest.requireActual('@/services/tournament.service');
  return {
    ...actual,
    createTournament: jest.fn(),
    updateTournament: jest.fn(),
    getTournament: jest.fn(),
    createMatch: jest.fn().mockResolvedValue({ success: true, data: { id: 'm1' } }),
    deleteMatch: jest.fn().mockResolvedValue({ success: true }),
  };
});

let mockEditId: string | null = null;
jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'edit' ? mockEditId : null) }),
}));
jest.mock('@/hooks/useSessionAuth', () => ({
  useSessionAuth: () => ({ user: { id: 'dir1', userType: 'DIRECTOR' } }),
}));
jest.mock('@/hooks/usePageReady', () => ({ usePageReady: () => {} }));
jest.mock('@/hooks/useNativeUI', () => ({ useNativeUI: () => {} }));
jest.mock('@/components/ui/NavLink', () => ({
  useNavigation: () => ({ navigate: jest.fn(), replace: jest.fn() }),
}));
const mockToastError = jest.fn();
jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({
    toast: { success: jest.fn(), error: mockToastError, info: jest.fn() },
  }),
}));
jest.mock('@/services/api-client', () => ({
  api: {
    get: jest.fn().mockResolvedValue({ success: true, data: [{ id: 'team-1' }] }),
  },
}));
jest.mock('@/services/team.service', () => ({
  getTeamMembers: jest
    .fn()
    .mockResolvedValue({ success: true, data: { members: [] } }),
}));
jest.mock('@/services/team-group.service', () => ({
  teamGroupService: { listByTeam: jest.fn().mockResolvedValue([]) },
}));
jest.mock('@/lib/refresh-bus', () => ({
  emitRefresh: jest.fn(),
  REFRESH_KEYS: { TOURNAMENTS: 'tournaments' },
}));
jest.mock('@/components/layout/MobileContainer', () => ({
  MobileContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@/components/layout/PageAppBar', () => ({ PageAppBar: () => null }));
jest.mock('@/components/ui/Icon', () => ({ Icon: () => null }));
jest.mock('@/components/ui/BottomSheet', () => ({
  BottomSheet: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
}));
jest.mock('@/components/ui/TimePicker', () => ({ TimePicker: () => null }));
jest.mock('@/components/venue/VenueSearchSheet', () => ({
  VenueSearchSheet: () => null,
}));
jest.mock('@/components/ui/DatePickerModal', () => ({
  DatePickerModal: () => null,
  formatDateLabel: () => '',
}));

import TournamentCreatePage from '@/app/(common)/tournaments/create/page';

const mockCreate = createTournament as jest.Mock;
const mockUpdate = updateTournament as jest.Mock;
const mockGet = getTournament as jest.Mock;

/** 대회명 입력 후 제출 — 폼 최소 유효 조건 충족 헬퍼. */
function fillNameAndSubmit(name = '테스트 대회') {
  fireEvent.change(screen.getByPlaceholderText('예: 2026 TEAMPLUS 주니어 리그'), {
    target: { value: name },
  });
  fireEvent.click(screen.getByRole('button', { name: /등록하기|수정하기/ }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEditId = null;
  mockCreate.mockResolvedValue({ success: true, data: { id: 't-new' } });
  mockUpdate.mockResolvedValue({ success: true, data: { id: 't-edit' } });
});

describe('/tournaments/create — 참가 대상 전체 토글', () => {
  it('기본 ON — 명단 없이 제출하면 selectedParticipantIds=[] 로 생성', async () => {
    render(<TournamentCreatePage />);

    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    fillNameAndSubmit();

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ selectedParticipantIds: [] }),
    );
  });

  it('직접 선택 모드(OFF) + 0명 제출 — participantRequired 로 차단', async () => {
    render(<TournamentCreatePage />);

    fireEvent.click(screen.getByRole('switch'));
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');

    fillNameAndSubmit();

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        MESSAGES.tournament.participantRequired,
      ),
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('수정 프리필 — 명단 보유 대회는 토글 OFF 복원', async () => {
    mockEditId = 't-edit';
    mockGet.mockResolvedValue({
      success: true,
      data: {
        id: 't-edit',
        name: '명단 대회',
        selectedParticipantIds: ['u1', 'u2'],
        matches: [],
      },
    });

    render(<TournamentCreatePage />);

    await waitFor(() =>
      expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false'),
    );
  });

  it('수정 프리필 — 빈 명단(전체/레거시) 대회는 토글 ON, 전체 저장 시 [] 전송', async () => {
    mockEditId = 't-edit';
    mockGet.mockResolvedValue({
      success: true,
      data: {
        id: 't-edit',
        name: '전체 대회',
        selectedParticipantIds: [],
        matches: [],
      },
    });

    render(<TournamentCreatePage />);

    await waitFor(() =>
      expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true'),
    );

    fillNameAndSubmit('전체 대회');

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    expect(mockUpdate).toHaveBeenCalledWith(
      't-edit',
      expect.objectContaining({ selectedParticipantIds: [] }),
    );
  });
});
