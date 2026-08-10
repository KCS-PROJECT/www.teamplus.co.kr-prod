/**
 * TeamNoticeListView — Phase 3 회귀 (P3-R1-06 · AC 3-1/3-2/3-3/3-12).
 *
 * 계약 고정:
 *   · mode="manage" → GET /notices/admin/list (scope=team) · 상태 배지 노출
 *   · mode 기본(audience) → GET /notices + isActive=true · 상태 배지 미노출
 *   · 상태 배지는 독립 조건 — 미게시+만료 공지는 두 배지가 **동시에** 붙는다
 *   · 더보기 → 다음 페이지 요청 + 기존 목록 뒤에 append
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MESSAGES } from '@/lib/messages';
import { apiRequest } from '@/services/api-client';
import { TeamNoticeListView } from '@/components/notice/TeamNoticeListView';

jest.mock('@/services/api-client', () => ({ apiRequest: jest.fn() }));
jest.mock('@/hooks/usePageReady', () => ({ usePageReady: () => {} }));
jest.mock('@/hooks/useNativeUI', () => ({ useNativeUI: () => {} }));
jest.mock('@/lib/refresh-bus', () => ({
  useRefreshSubscription: () => {},
  REFRESH_KEYS: { NOTICES: ['notices'] },
}));
jest.mock('@/components/ui/NavLink', () => ({
  NavLink: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  useNavigation: () => ({ navigate: jest.fn() }),
}));
// 실제 ToastProvider 는 toast 객체를 useMemo 로 안정화한다 — mock 도 참조를 고정해야
// fetchPage(useCallback deps: [mode, toast]) 가 렌더마다 재생성되어 effect 가 재발화하지 않는다.
const stableToastValue = {
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
};
jest.mock('@/components/ui/Toast', () => ({
  useToast: () => stableToastValue,
}));
jest.mock('@/components/layout/MobileContainer', () => ({
  MobileContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
jest.mock('@/components/layout/PageAppBar', () => ({
  PageAppBar: ({ title }: { title: string }) => <header>{title}</header>,
}));
jest.mock('@/components/director/ActionSheet', () => ({
  // 열림 상태를 검증할 수 있도록 isOpen 일 때 title 을 렌더
  ActionSheet: ({ isOpen, title }: { isOpen: boolean; title: string }) =>
    isOpen ? <div role="dialog">{title}</div> : null,
}));
jest.mock('@/components/shared/ConfirmSheet', () => ({
  ConfirmSheet: () => null,
}));
jest.mock('@/components/ui/FloatingActionButton', () => ({
  FloatingActionButton: () => null,
}));

const mockApiRequest = apiRequest as jest.Mock;

/** 백엔드 관리 목록 응답 형태의 공지 행 생성기 */
function makeNotice(
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    title: `공지 ${id}`,
    content: '본문',
    createdAt: '2026-08-01T00:00:00.000Z',
    isPinned: false,
    ...overrides,
  };
}

function listResponse(
  items: Array<Record<string, unknown>>,
  page: number,
  totalPages: number,
) {
  return {
    success: true,
    data: {
      data: items,
      pagination: { total: totalPages * 10, page, limit: 10, totalPages },
    },
  };
}

beforeEach(() => {
  mockApiRequest.mockReset();
});

describe('TeamNoticeListView — mode 별 데이터 계약', () => {
  it('manage 모드는 관리 목록 API 를 호출하고 isActive 를 강제하지 않는다', async () => {
    mockApiRequest.mockResolvedValue(listResponse([makeNotice('n1')], 1, 1));

    render(<TeamNoticeListView title="공지사항 관리" canManage mode="manage" />);

    await waitFor(() => expect(mockApiRequest).toHaveBeenCalled());
    const call = mockApiRequest.mock.calls[0][0];
    expect(call.url).toBe('/notices/admin/list');
    expect(call.params.scope).toBe('team');
    expect(call.params.isActive).toBeUndefined();
  });

  it('audience 모드(기본)는 공개 목록 API 에 isActive=true 로 호출한다', async () => {
    mockApiRequest.mockResolvedValue(listResponse([makeNotice('n1')], 1, 1));

    render(<TeamNoticeListView title="팀 공지사항" />);

    await waitFor(() => expect(mockApiRequest).toHaveBeenCalled());
    const call = mockApiRequest.mock.calls[0][0];
    expect(call.url).toBe('/notices');
    expect(call.params.isActive).toBe('true');
  });
});

describe('TeamNoticeListView — 상태 배지 (AC 3-2)', () => {
  it('manage 모드에서 미게시+만료 공지는 두 배지가 동시에 붙는다', async () => {
    mockApiRequest.mockResolvedValue(
      listResponse(
        [
          makeNotice('n1', {
            isPublished: false,
            expiresAt: '2020-01-01T00:00:00.000Z',
          }),
        ],
        1,
        1,
      ),
    );

    render(<TeamNoticeListView title="공지사항 관리" canManage mode="manage" />);

    expect(
      await screen.findByText(MESSAGES.notice.badgeUnpublished),
    ).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.notice.badgeExpired)).toBeInTheDocument();
  });

  it('예약(startAt 미래) 공지는 예약 배지가 붙는다', async () => {
    mockApiRequest.mockResolvedValue(
      listResponse(
        [makeNotice('n1', { isPublished: true, startAt: '2999-01-01T00:00:00.000Z' })],
        1,
        1,
      ),
    );

    render(<TeamNoticeListView title="공지사항 관리" canManage mode="manage" />);

    expect(
      await screen.findByText(MESSAGES.notice.badgeScheduled),
    ).toBeInTheDocument();
  });

  it('audience 모드는 같은 데이터라도 상태 배지를 렌더하지 않는다', async () => {
    mockApiRequest.mockResolvedValue(
      listResponse(
        [
          makeNotice('n1', {
            isPublished: false,
            expiresAt: '2020-01-01T00:00:00.000Z',
          }),
        ],
        1,
        1,
      ),
    );

    render(<TeamNoticeListView title="팀 공지사항" />);

    expect(await screen.findByText('공지 n1')).toBeInTheDocument();
    expect(screen.queryByText(MESSAGES.notice.badgeUnpublished)).toBeNull();
    expect(screen.queryByText(MESSAGES.notice.badgeExpired)).toBeNull();
  });
});

describe('TeamNoticeListView — 케밥은 서버 canManage 단일 기준 (AC 5-1)', () => {
  it('canManage=true 행에만 관리 메뉴 버튼이 뜬다 — 역할 추정 없음', async () => {
    mockApiRequest.mockResolvedValue(
      listResponse(
        [
          makeNotice('mine', { canManage: true }),
          makeNotice('others', { canManage: false }),
        ],
        1,
        1,
      ),
    );

    render(<TeamNoticeListView title="공지사항 관리" canManage mode="manage" />);

    expect(await screen.findByText('공지 mine')).toBeInTheDocument();
    // 관리 가능 행 1개에만 케밥 노출
    expect(
      screen.getAllByRole('button', { name: MESSAGES.notice.manageMenuOpen }),
    ).toHaveLength(1);
  });

  it('audience 화면(canManage prop 없음)에서도 canManage=true 행 케밥 → 시트가 열린다 — P5-R1-01', async () => {
    mockApiRequest.mockResolvedValue(
      listResponse([makeNotice('mine', { canManage: true })], 1, 1),
    );

    // /team-notices 와 동일 조건 — 화면 prop canManage 미전달(audience)
    render(<TeamNoticeListView title="팀 공지사항" />);

    fireEvent.click(
      await screen.findByRole('button', { name: MESSAGES.notice.manageMenuOpen }),
    );

    // 시트 gate 가 화면 prop 에 남아 있으면 이 시트는 열리지 않는다
    expect(
      await screen.findByRole('dialog'),
    ).toHaveTextContent(MESSAGES.notice.manage);
  });
});

describe('TeamNoticeListView — 페이지 append (AC 3-12)', () => {
  it('더보기 클릭 시 다음 페이지를 요청하고 기존 목록 뒤에 이어붙인다', async () => {
    const page1 = Array.from({ length: 10 }, (_, i) => makeNotice(`p1-${i}`));
    const page2 = [makeNotice('p2-0')];
    mockApiRequest
      .mockResolvedValueOnce(listResponse(page1, 1, 2))
      .mockResolvedValueOnce(listResponse(page2, 2, 2));

    render(<TeamNoticeListView title="공지사항 관리" canManage mode="manage" />);

    expect(await screen.findByText('공지 p1-0')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', {
        name: MESSAGES.notice.list.loadMoreAriaLabel,
      }),
    );

    // append — 2페이지 항목이 추가되고 1페이지 항목도 그대로 남는다
    expect(await screen.findByText('공지 p2-0')).toBeInTheDocument();
    expect(screen.getByText('공지 p1-0')).toBeInTheDocument();
    expect(mockApiRequest).toHaveBeenCalledTimes(2);
    expect(mockApiRequest.mock.calls[1][0].params.page).toBe('2');
  });
});
