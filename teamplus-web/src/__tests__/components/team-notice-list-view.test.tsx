/**
 * TeamNoticeListView — TeamPost 통합 feed 단일 소스 계약.
 *
 * 계약 고정 ([Phase 3] manage 모드는 이관 완결로 제거 — feed 전용):
 *   · TeamPost 통합 feed(fetchUnitNoticeFeed) — 출처 칩(팀/훈련/대회) +
 *     /community-notice/{id} 상세 링크 · 상태 배지 미노출(feed 는 게시 중만 서빙)
 *   · 더보기 → offset append
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MESSAGES } from '@/lib/messages';
import { apiRequest } from '@/services/api-client';
import { fetchUnitNoticeFeed } from '@/services/community-notice.service';
import { TeamNoticeListView } from '@/components/notice/TeamNoticeListView';

jest.mock('@/services/api-client', () => ({ apiRequest: jest.fn() }));
jest.mock('@/services/community-notice.service', () => ({
  fetchUnitNoticeFeed: jest.fn(),
}));
jest.mock('@/hooks/usePageReady', () => ({ usePageReady: () => {} }));
jest.mock('@/hooks/useNativeUI', () => ({ useNativeUI: () => {} }));
jest.mock('@/lib/refresh-bus', () => ({
  useRefreshSubscription: () => {},
  REFRESH_KEYS: { NOTICES: ['notices'], UNIT_NOTICES: ['unit-notices'] },
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
jest.mock('@/components/ui/FloatingActionButton', () => ({
  FloatingActionButton: () => null,
}));

const mockApiRequest = apiRequest as jest.Mock;
const mockFetchFeed = fetchUnitNoticeFeed as jest.Mock;

/** [Phase 2] feed(UnitNoticePost) 형태의 행 생성기 */
function makeFeedPost(
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    title: `공지 ${id}`,
    content: '본문',
    createdAt: '2026-08-01T00:00:00.000Z',
    isPinned: false,
    teamId: 'team-1',
    targetClassId: null,
    targetTournamentId: null,
    targetName: '블랭크',
    isReadByMe: false,
    startAt: null,
    expiresAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockApiRequest.mockReset();
  mockFetchFeed.mockReset();
  mockFetchFeed.mockResolvedValue({ success: true, data: [] });
});

describe('TeamNoticeListView — 데이터 계약', () => {
  it('[Phase 2] audience 모드(기본)는 TeamPost 통합 feed 를 호출한다', async () => {
    mockFetchFeed.mockResolvedValue({
      success: true,
      data: { data: [makeFeedPost('n1')], total: 1 },
    });

    render(<TeamNoticeListView title="팀 공지사항" />);

    await waitFor(() => expect(mockFetchFeed).toHaveBeenCalled());
    // [P2-R1-M01] offset 페이지 계약
    expect(mockFetchFeed).toHaveBeenCalledWith({ limit: 10, offset: 0 });
    // 구 SystemNotice 목록 API 는 더 이상 호출하지 않는다
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it('[Phase 2] audience 행은 출처 칩과 /community-notice 상세 링크를 가진다', async () => {
    mockFetchFeed.mockResolvedValue({
      success: true,
      data: {
        data: [
          makeFeedPost('t1'),
          makeFeedPost('c1', {
            teamId: null,
            targetClassId: 'class-1',
            targetName: '주말 훈련',
            audienceChildNames: ['김민준'],
          }),
        ],
        total: 2,
      },
    });

    render(<TeamNoticeListView title="팀 공지사항" showReadState iceTheme />);

    expect(await screen.findByText('공지 t1')).toBeInTheDocument();
    // 출처 칩 — 팀 [팀이름][전체] · 훈련 [훈련 배지][단위 이름][참가 자녀 이름]
    expect(screen.getByText('블랭크')).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.unitNotice.audienceAll)).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.unitNotice.classChip)).toBeInTheDocument();
    expect(screen.getByText('주말 훈련')).toBeInTheDocument();
    expect(screen.getByText('김민준')).toBeInTheDocument();
    // 팀 행에는 축 텍스트 배지가 붙지 않는다 (이름+전체로 충분 — 중복 제거)
    expect(screen.queryByText(MESSAGES.unitNotice.teamChip)).toBeNull();
    // 상세 링크 — feed 항목은 TeamPost 상세로 직행 (마커 리다이렉트 이중 홉 없음)
    const links = screen.getAllByRole('link');
    expect(
      links.some(
        (a) => a.getAttribute('href') === '/community-notice/t1',
      ),
    ).toBe(true);
  });
});

describe('TeamNoticeListView — 상태 배지 (AC 3-2)', () => {
  it('audience 모드는 상태 배지를 렌더하지 않는다 (feed 는 게시 중만 서빙)', async () => {
    mockFetchFeed.mockResolvedValue({
      success: true,
      data: { data: [makeFeedPost('n1')], total: 1 },
    });

    render(<TeamNoticeListView title="팀 공지사항" />);

    expect(await screen.findByText('공지 n1')).toBeInTheDocument();
    expect(screen.queryByText(MESSAGES.notice.badgeUnpublished)).toBeNull();
    expect(screen.queryByText(MESSAGES.notice.badgeExpired)).toBeNull();
  });
});

describe('TeamNoticeListView — 케밥은 서버 canManage 단일 기준 (AC 5-1)', () => {
  it('[Phase 2] audience(feed) 행에는 케밥이 없다 — 관리는 /director-notices 가 담당', async () => {
    mockFetchFeed.mockResolvedValue({
      success: true,
      data: { data: [makeFeedPost('mine')], total: 1 },
    });

    render(<TeamNoticeListView title="팀 공지사항" />);

    expect(await screen.findByText('공지 mine')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: MESSAGES.notice.manageMenuOpen }),
    ).toBeNull();
  });
});

describe('TeamNoticeListView — 페이지 append (AC 3-12)', () => {
  it('더보기 클릭 시 feed 다음 offset 을 요청하고 기존 목록 뒤에 이어붙인다', async () => {
    const page1 = Array.from({ length: 10 }, (_, i) => makeFeedPost(`p1-${i}`));
    const page2 = [makeFeedPost('p2-0')];
    mockFetchFeed
      .mockResolvedValueOnce({ success: true, data: { data: page1, total: 11 } })
      .mockResolvedValueOnce({ success: true, data: { data: page2, total: 11 } });

    render(<TeamNoticeListView title="팀 공지사항" />);

    expect(await screen.findByText('공지 p1-0')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', {
        name: MESSAGES.notice.list.loadMoreAriaLabel,
      }),
    );

    // append — 2페이지 항목이 추가되고 1페이지 항목도 그대로 남는다
    expect(await screen.findByText('공지 p2-0')).toBeInTheDocument();
    expect(screen.getByText('공지 p1-0')).toBeInTheDocument();
    expect(mockFetchFeed).toHaveBeenCalledTimes(2);
    expect(mockFetchFeed.mock.calls[1][0]).toEqual(
      expect.objectContaining({ offset: 10 }),
    );
  });

});
