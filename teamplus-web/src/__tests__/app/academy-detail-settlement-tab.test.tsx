/**
 * /academy/[id] 정산 탭 노출 게이팅 테스트
 *
 * 사용자 확정 결정: 정산 탭은 오픈클래스 감독(academy.director.id === user.id) + admin 만 노출.
 *  - 매니저(감독/admin)  → 정산 탭 노출(grid-cols-4).
 *  - 비매니저            → 정산 탭 미노출, ?tab=settlement 진입 시 overview 폴백(정산 본문 미렌더).
 */

import { render, screen } from '@testing-library/react';
import { MESSAGES } from '@/lib/messages';

// ── 가변 목 상태 ────────────────────────────────────────
let mockUser: { id: string; userType: string } | null = null;
let mockSearch = '';

const academy = {
  id: 'a1',
  name: '오픈클래스A',
  code: 'ABCD1234',
  region: '서울',
  description: null as string | null,
  director: { id: 'dir1', firstName: '길동', lastName: '홍', avatarUrl: null as string | null },
  createdAt: '2026-01-01T00:00:00Z',
  _count: { members: 3, coaches: 1, classes: 2 },
};

// ── 목킹 ────────────────────────────────────────────────
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'a1' }),
  useSearchParams: () => new URLSearchParams(mockSearch),
}));
jest.mock('@/hooks/useAcademy', () => ({
  useAcademyDetail: () => ({ academy, isLoading: false }),
}));
// 인증 훅은 layout 단일 소유자 원칙 — page 는 (coach) 라우트 컨텍스트에서 파생 user 를 소비.
jest.mock('@/app/(coach)/route-auth-context', () => ({
  useRouteUser: () => mockUser,
}));
jest.mock('@/components/academy/AcademySettlementTab', () => ({
  AcademySettlementTab: () => <div data-testid="settlement-tab-body">settlement-body</div>,
}));
jest.mock('@/components/academy/AcademyStudentsTab', () => ({
  AcademyStudentsTab: () => <div>students-body</div>,
}));
jest.mock('@/components/ui/NavLink', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));
jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }),
}));
jest.mock('@/hooks/useNativeUI', () => ({ useNativeUI: () => {} }));
jest.mock('@/hooks/usePageReady', () => ({ usePageReady: () => {} }));
jest.mock('@/components/layout/MobileContainer', () => ({
  MobileContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@/components/layout/PageAppBar', () => ({ PageAppBar: () => null }));
jest.mock('@/components/ui/Icon', () => ({ Icon: () => null }));
jest.mock('@/services/api-client', () => ({ api: { get: jest.fn(), post: jest.fn() } }));
jest.mock('@/lib/image-url', () => ({ resolveImageSrc: () => null }));

import AcademyDetailPage from '@/app/(coach)/academy/[id]/page';

beforeEach(() => {
  mockUser = null;
  mockSearch = '';
});

describe('AcademyDetailPage — 정산 탭 게이팅', () => {
  it('오픈클래스 감독(director.id === user.id)이면 정산 탭을 노출한다', () => {
    mockUser = { id: 'dir1', userType: 'academy_director' };
    render(<AcademyDetailPage />);
    expect(
      screen.getByRole('tab', { name: MESSAGES.settlement.tabSettlement }),
    ).toBeInTheDocument();
  });

  it('admin 이면 감독이 아니어도 정산 탭을 노출한다', () => {
    mockUser = { id: 'someone-else', userType: 'admin' };
    render(<AcademyDetailPage />);
    expect(
      screen.getByRole('tab', { name: MESSAGES.settlement.tabSettlement }),
    ).toBeInTheDocument();
  });

  it('비매니저(다른 감독/학부모)면 정산 탭을 노출하지 않는다', () => {
    mockUser = { id: 'someone-else', userType: 'parent' };
    render(<AcademyDetailPage />);
    expect(
      screen.queryByRole('tab', { name: MESSAGES.settlement.tabSettlement }),
    ).not.toBeInTheDocument();
  });

  it('비매니저가 ?tab=settlement 로 진입하면 overview 로 폴백하고 정산 본문을 렌더하지 않는다', () => {
    mockUser = { id: 'someone-else', userType: 'parent' };
    mockSearch = 'tab=settlement';
    render(<AcademyDetailPage />);

    // 정산 본문(탭 컴포넌트) 미렌더 + 정산 탭 버튼 미노출
    expect(screen.queryByTestId('settlement-tab-body')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: MESSAGES.settlement.tabSettlement }),
    ).not.toBeInTheDocument();
    // overview 폴백 — 개요 탭 내용(운영 현황) 노출
    expect(screen.getByText('운영 현황')).toBeInTheDocument();
  });

  it('매니저가 ?tab=settlement 로 진입하면 정산 본문을 렌더한다', () => {
    mockUser = { id: 'dir1', userType: 'academy_director' };
    mockSearch = 'tab=settlement';
    render(<AcademyDetailPage />);
    expect(screen.getByTestId('settlement-tab-body')).toBeInTheDocument();
  });
});
