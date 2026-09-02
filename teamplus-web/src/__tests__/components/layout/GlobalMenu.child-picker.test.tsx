/**
 * GlobalMenu 자녀 선택 상태 전이 — DrawerChildPicker(프로필 아래 한 줄 + 가운데 모달) 계약 고정.
 *
 *  · 자녀 0명/선택 미확정 → 아무것도 없음 · 1명 → 정적 줄(버튼 없음) · 2명+ → 버튼
 *  · ✕·오버레이 탭 → 모달만 닫힘(onSelect 미호출)
 *  · 행 선택 → onSelect(id) 호출 + 모달 닫힘 (전역 자녀 변경·사이드 메뉴 닫기는 GlobalMenu 가 onSelect 안에서 수행)
 *  · 사이드 메뉴가 닫히면(drawerOpen=false) 열려 있던 모달도 닫힘
 *
 * 두 층으로 검증한다.
 *  ① DrawerChildPicker 단독 — 자녀 수 분기·모달 열림/닫힘 상태 전이.
 *  ② 실제 GlobalMenu 렌더(외부 의존성만 mock) — 행 선택 시 setSelectedChildId(id)와
 *     드로어 onClose() 가 함께 호출되는 production 배선.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { DrawerChildPicker } from '@/components/drawer/DrawerChildPicker';
import type { ChildPickerListItem } from '@/components/parent/ChildPickerList';
import type { Child } from '@/components/children/ChildCard';
import { MESSAGES } from '@/lib/messages';

jest.mock('@/hooks/useNativeScrim', () => ({ useNativeScrim: () => {} }));
jest.mock('@/lib/scroll-lock', () => ({ lockBodyScroll: () => {}, unlockBodyScroll: () => {} }));

// ── 실제 GlobalMenu 렌더용 mock — 자녀 선택 배선(setSelectedChildId · onClose) 외 의존성은 고정 ──
const mockSetSelectedChildId = jest.fn();
let mockSelectableChildren: Child[] = [];

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'parent-1', userType: 'PARENT', name: '강태영', email: 'parent@example.com' },
    isAuthenticated: true,
    logout: jest.fn(),
    refreshUser: jest.fn(),
  }),
}));
jest.mock('@/contexts/SelectedChildContext', () => ({
  useSelectedChild: () => ({
    selectedChildId: 'minjun',
    setSelectedChildId: mockSetSelectedChildId,
  }),
}));
jest.mock('@/hooks/useChildren', () => ({
  useChildren: () => ({ selectableChildren: mockSelectableChildren }),
}));
jest.mock('@/contexts/AppSettingsContext', () => ({
  useAppSettingsContext: () => ({ settings: null }),
}));
jest.mock('@/hooks/useNoticeUnreadCount', () => ({
  useNoticeUnreadCount: () => ({ unreadCount: 0, isLoading: false, refresh: jest.fn() }),
}));
jest.mock('@/components/ui/Modal', () => ({
  ...jest.requireActual('@/components/ui/Modal'),
  useModal: () => ({ modal: { confirm: jest.fn().mockResolvedValue(false) } }),
}));
jest.mock('@/services/api-client', () => ({
  api: { get: jest.fn().mockResolvedValue({ success: true, data: [] }), put: jest.fn() },
}));
jest.mock('@/services/upload.service', () => ({ uploadFile: jest.fn() }));
jest.mock('@/services/native-bridge', () => ({
  ui: { setConfig: jest.fn().mockResolvedValue(undefined) },
  getAppVersionInfo: jest.fn().mockResolvedValue({ source: 'web', version: null }),
}));
jest.mock('@/hooks/useNativeUI', () => ({
  getCurrentUIConfig: () => ({}),
  syncLastAppliedConfig: jest.fn(),
}));
jest.mock('@/components/layout/PageAppBar', () => ({ PageAppBar: () => null }));
jest.mock('@/hooks/useRoleSwitch', () => ({
  useRoleSwitch: () => ({ currentViewAs: null, setViewAs: jest.fn(), isReady: true }),
}));
jest.mock('@/hooks/useUserRoles', () => ({
  useUserRoles: () => ({
    primaryRole: 'parent',
    hasParentRole: true,
    hasCoachRole: false,
    hasMultipleRoles: false,
    availableRoles: ['parent'],
  }),
}));
jest.mock('@/hooks/useAppMenus', () => ({
  useAppMenus: () => ({ data: undefined, isLoading: false, isError: false, error: null }),
}));
jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }),
}));
jest.mock('@/components/ui/NavLink', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));
jest.mock('@/lib/recent-menu', () => ({ addRecentMenu: jest.fn(), getRecentMenus: () => [] }));

// mock 선언 뒤에 import — jest.mock 은 hoist 되지만 가독성을 위해 아래에 둔다.
// eslint-disable-next-line import/first
import { GlobalMenu } from '@/components/layout/GlobalMenu';

function childFixture(id: string, name: string): Child {
  return {
    id,
    name,
    age: 0,
    club: '서울아이스하키클럽',
    clubIds: ['team-a'],
    teamLogoUrl: null,
    teams: [{ id: 'team-a', name: '서울아이스하키클럽', logoUrl: null }],
    isActive: true,
    imageUrl: null,
  };
}

const A = { teamId: 'team-a', teamName: '서울아이스하키클럽', logoUrl: null, otherTeamNames: [] };
const MINJUN: ChildPickerListItem = { id: 'minjun', name: '민준', ...A };
const SEOYEON: ChildPickerListItem = { id: 'seoyeon', name: '서연', ...A };
const DOYUN: ChildPickerListItem = {
  id: 'doyun',
  name: '도윤',
  teamId: null,
  teamName: null,
  logoUrl: null,
  otherTeamNames: [],
};

function renderPicker(
  items: ChildPickerListItem[],
  selectedChildId: string | null,
  overrides: { drawerOpen?: boolean; onSelect?: jest.Mock } = {},
) {
  const onSelect = overrides.onSelect ?? jest.fn();
  const utils = render(
    <DrawerChildPicker
      items={items}
      selectedChildId={selectedChildId}
      drawerOpen={overrides.drawerOpen ?? true}
      onSelect={onSelect}
    />,
  );
  return { ...utils, onSelect };
}

describe('DrawerChildPicker — 자녀 수 분기', () => {
  it('renders nothing with no children', () => {
    renderPicker([], null);
    expect(screen.queryByTestId('drawer-child-line')).toBeNull();
  });

  it('renders nothing while the selected child is not resolved yet', () => {
    renderPicker([MINJUN, SEOYEON], null);
    expect(screen.queryByTestId('drawer-child-line')).toBeNull();
  });

  it('renders a static line without a button for a single child', () => {
    renderPicker([MINJUN], 'minjun');
    const line = screen.getByTestId('drawer-child-line');
    expect(line.tagName).toBe('SPAN');
    expect(line).toHaveTextContent('민준');
    expect(line).toHaveTextContent(A.teamName);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders the no-team label for a single unaffiliated child', () => {
    renderPicker([DOYUN], 'doyun');
    expect(screen.getByTestId('drawer-child-line')).toHaveTextContent(MESSAGES.drawer.childNoTeam);
  });

  it('renders a button with the current child for two or more children', () => {
    renderPicker([MINJUN, SEOYEON], 'seoyeon');
    const button = screen.getByRole('button', { name: MESSAGES.drawer.changeChild });
    expect(button).toHaveTextContent('서연');
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('DrawerChildPicker — 모달 상태 전이', () => {
  it('opens the picker modal listing every child', () => {
    renderPicker([MINJUN, SEOYEON, DOYUN], 'minjun');
    fireEvent.click(screen.getByRole('button', { name: MESSAGES.drawer.changeChild }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.drawer.selectChild)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1);
    expect(screen.getByRole('button', { pressed: true })).toHaveTextContent('민준');
    expect(screen.getByRole('button', { name: MESSAGES.drawer.changeChild })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('close button closes only the modal and does not select', () => {
    const { onSelect } = renderPicker([MINJUN, SEOYEON], 'minjun');
    fireEvent.click(screen.getByRole('button', { name: MESSAGES.drawer.changeChild }));
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
    // 사이드 메뉴 줄은 그대로 남아 있다(사이드 메뉴 유지)
    expect(screen.getByTestId('drawer-child-line')).toBeInTheDocument();
  });

  it('overlay tap closes only the modal and does not select', () => {
    const { onSelect } = renderPicker([MINJUN, SEOYEON], 'minjun');
    fireEvent.click(screen.getByRole('button', { name: MESSAGES.drawer.changeChild }));
    fireEvent.click(screen.getByRole('dialog'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByTestId('drawer-child-line')).toBeInTheDocument();
  });

  it('selecting a row calls onSelect with the child id and closes the modal', () => {
    const { onSelect } = renderPicker([MINJUN, SEOYEON], 'minjun');
    fireEvent.click(screen.getByRole('button', { name: MESSAGES.drawer.changeChild }));
    fireEvent.click(screen.getByRole('button', { pressed: false, name: /서연/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('seoyeon');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes the modal when the drawer closes', () => {
    const onSelect = jest.fn();
    const { rerender } = render(
      <DrawerChildPicker items={[MINJUN, SEOYEON]} selectedChildId="minjun" drawerOpen onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByRole('button', { name: MESSAGES.drawer.changeChild }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    rerender(
      <DrawerChildPicker
        items={[MINJUN, SEOYEON]}
        selectedChildId="minjun"
        drawerOpen={false}
        onSelect={onSelect}
      />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('GlobalMenu — 자녀 선택 배선 (실제 컴포넌트)', () => {
  // jsdom 은 window.scrollTo 미구현 — GlobalMenu 언마운트 시 스크롤 복원 호출이 콘솔 에러로만 남는다.
  const originalScrollTo = window.scrollTo;
  beforeAll(() => {
    window.scrollTo = jest.fn();
  });
  afterAll(() => {
    window.scrollTo = originalScrollTo;
  });

  beforeEach(() => {
    mockSetSelectedChildId.mockReset();
    mockSelectableChildren = [childFixture('minjun', '민준'), childFixture('seoyeon', '서연')];
  });

  async function renderMenu(onClose = jest.fn()) {
    await act(async () => {
      render(<GlobalMenu isOpen onClose={onClose} />);
    });
    return onClose;
  }

  it('selecting a child row updates the global selection and closes the drawer', async () => {
    const onClose = await renderMenu();

    fireEvent.click(screen.getByRole('button', { name: MESSAGES.drawer.changeChild }));
    expect(screen.getByRole('dialog', { name: MESSAGES.drawer.selectChild })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { pressed: false, name: /서연/ }));

    expect(mockSetSelectedChildId).toHaveBeenCalledTimes(1);
    expect(mockSetSelectedChildId).toHaveBeenCalledWith('seoyeon');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: MESSAGES.drawer.selectChild })).toBeNull();
  });

  it('closing the picker with ✕ keeps the drawer open and does not change selection', async () => {
    const onClose = await renderMenu();

    fireEvent.click(screen.getByRole('button', { name: MESSAGES.drawer.changeChild }));
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));

    expect(screen.queryByRole('dialog', { name: MESSAGES.drawer.selectChild })).toBeNull();
    expect(mockSetSelectedChildId).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: MESSAGES.drawer.changeChild })).toBeInTheDocument();
  });

  it('shows a static child line (no picker button) for a single child', async () => {
    mockSelectableChildren = [childFixture('minjun', '민준')];
    await renderMenu();

    expect(screen.queryByRole('button', { name: MESSAGES.drawer.changeChild })).toBeNull();
    expect(screen.getByTestId('drawer-child-line')).toHaveTextContent('민준');
  });
});
