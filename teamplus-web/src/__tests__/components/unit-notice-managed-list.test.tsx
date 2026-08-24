/**
 * UnitNoticeManagedList — [Phase 2 · P2-R1-M02] 비동기 응답 역전 회귀.
 *
 * 계약 고정:
 *   · axis='unit' 은 서버 필터로 전달 — 클라이언트 팀 제외 없음 (P2-R1-M01)
 *   · 재로드(refresh) 가 겹칠 때 늦게 도착한 이전 요청 응답은 무시 — 최신 요청만 반영
 */

import { act, render, screen, waitFor } from '@testing-library/react';
import { fetchManagedUnitNotices } from '@/services/community-notice.service';
import { UnitNoticeManagedList } from '@/components/notice/UnitNoticeManagedList';

jest.mock('@/services/community-notice.service', () => ({
  fetchManagedUnitNotices: jest.fn(),
  deleteUnitNotice: jest.fn(),
}));
jest.mock('@/hooks/usePageReady', () => ({ usePageReady: () => {} }));

// refresh-bus — 구독 콜백을 캡처해 테스트가 재로드를 유발할 수 있게 한다
let refreshCallback: (() => void) | null = null;
jest.mock('@/lib/refresh-bus', () => ({
  useRefreshSubscription: (_key: unknown, cb: () => void) => {
    refreshCallback = cb;
  },
  REFRESH_KEYS: { UNIT_NOTICES: ['unit-notices'] },
}));
jest.mock('@/components/ui/NavLink', () => ({
  NavLink: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  useNavigation: () => ({ navigate: jest.fn() }),
}));
const stableToastValue = {
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
};
jest.mock('@/components/ui/Toast', () => ({ useToast: () => stableToastValue }));
jest.mock('@/components/director/ActionSheet', () => ({ ActionSheet: () => null }));
jest.mock('@/components/shared/ConfirmSheet', () => ({ ConfirmSheet: () => null }));
jest.mock('@/components/ui/BottomSheet', () => ({ BottomSheet: () => null }));
jest.mock('@/components/ui/FloatingActionButton', () => ({
  FloatingActionButton: () => null,
}));

const mockFetch = fetchManagedUnitNotices as jest.Mock;

function makePost(id: string, title: string): Record<string, unknown> {
  return {
    id,
    title,
    content: '본문',
    createdAt: '2026-08-01T00:00:00.000Z',
    isPinned: false,
    teamId: 'team-1',
    targetClassId: null,
    targetTournamentId: null,
    targetName: '블랭크',
    startAt: null,
    expiresAt: null,
    commentCount: 0,
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  refreshCallback = null;
});

it("axis='unit' 은 서버 필터 파라미터로 전달된다 (클라이언트 제외 아님)", async () => {
  mockFetch.mockResolvedValue({ success: true, data: { data: [], total: 0 } });

  render(<UnitNoticeManagedList axis="unit" />);

  await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  expect(mockFetch).toHaveBeenCalledWith({ axis: 'unit', limit: 50 });
});

it('만료 공지가 없으면(전량 로드) 만료 칩이 비활성화된다', async () => {
  // 게시 중 2건뿐 — 만료 0건, total=2 로 전량 로드(complete)
  mockFetch.mockResolvedValue({
    success: true,
    data: {
      data: [makePost('a', '공지 A'), makePost('b', '공지 B')],
      total: 2,
    },
  });

  render(<UnitNoticeManagedList axis="team" />);
  await screen.findByText('공지 A');

  expect(screen.getByRole('button', { name: '만료' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '게시 중' })).not.toBeDisabled();
});

it('만료 공지가 있으면 만료 칩이 활성이다', async () => {
  mockFetch.mockResolvedValue({
    success: true,
    data: {
      data: [
        makePost('a', '공지 A'),
        { ...makePost('b', '지난 공지'), expiresAt: '2020-01-01T00:00:00.000Z' },
      ],
      total: 2,
    },
  });

  render(<UnitNoticeManagedList axis="team" />);
  await screen.findByText('공지 A');

  expect(screen.getByRole('button', { name: '만료' })).not.toBeDisabled();
});

it('재조회 중에도 기존 목록을 unmount 하지 않는다 — 진입 모션 재생 방지', async () => {
  let resolveReload: (v: unknown) => void = () => {};
  mockFetch
    .mockResolvedValueOnce({
      success: true,
      data: { data: [makePost('a', '기존 공지')], total: 1 },
    })
    .mockImplementationOnce(
      () => new Promise((resolve) => (resolveReload = resolve)),
    );

  render(<UnitNoticeManagedList axis="team" />);
  expect(await screen.findByText('기존 공지')).toBeInTheDocument();

  // 재조회 시작(상태 필터·refresh) — 응답 전에도 화면이 사라지면 안 된다
  await act(async () => {
    refreshCallback?.();
  });
  expect(screen.getByText('기존 공지')).toBeInTheDocument();
  expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');

  await act(async () => {
    resolveReload({
      success: true,
      data: { data: [makePost('b', '갱신 공지')], total: 1 },
    });
  });
  expect(screen.getByText('갱신 공지')).toBeInTheDocument();
  expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'false');
});

it('51건 이상이면 더보기로 다음 페이지를 offset append 한다 (P2-R2-M01)', async () => {
  const firstPage = Array.from({ length: 50 }, (_, i) =>
    makePost(`p${i}`, `공지 ${i}`),
  );
  mockFetch
    .mockResolvedValueOnce({
      success: true,
      data: { data: firstPage, total: 51 },
    })
    .mockResolvedValueOnce({
      success: true,
      data: { data: [makePost('p50', '51번째 공지')], total: 51 },
    });

  render(<UnitNoticeManagedList axis="team" />);
  await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
  expect(mockFetch).toHaveBeenCalledWith({ axis: 'team', limit: 50 });

  // 50건 로드 + 잔여 1건 → 더보기 버튼 노출, 51번째는 아직 없음
  expect(await screen.findByText('공지 49')).toBeInTheDocument();
  expect(screen.queryByText('51번째 공지')).toBeNull();
  const moreButton = screen.getByRole('button', { name: '공지 더보기' });

  await act(async () => {
    moreButton.click();
  });

  // offset=현재 건수(50)로 다음 페이지 요청 → 기존 목록 뒤에 이어 붙는다
  expect(mockFetch).toHaveBeenLastCalledWith({
    axis: 'team',
    limit: 50,
    offset: 50,
  });
  expect(await screen.findByText('51번째 공지')).toBeInTheDocument();
  expect(screen.getByText('공지 0')).toBeInTheDocument();
  // 전량 로드 완료 — 더보기 버튼 소멸
  expect(screen.queryByRole('button', { name: '공지 더보기' })).toBeNull();
});

it('더보기 진행 중 refresh 발생 — isLoadingMore 해제·늦은 더보기 응답 폐기 (P2-R3-M01)', async () => {
  const firstPage = Array.from({ length: 50 }, (_, i) =>
    makePost(`p${i}`, `공지 ${i}`),
  );
  let resolveMore: (v: unknown) => void = () => {};
  mockFetch
    .mockResolvedValueOnce({
      success: true,
      data: { data: firstPage, total: 51 },
    })
    .mockImplementationOnce(
      () => new Promise((resolve) => (resolveMore = resolve)),
    )
    .mockResolvedValueOnce({
      success: true,
      data: { data: firstPage, total: 51 },
    });

  render(<UnitNoticeManagedList axis="team" />);
  const moreButton = await screen.findByRole('button', { name: '공지 더보기' });

  // 더보기 시작 — 응답 보류 중이라 로딩 상태
  await act(async () => {
    moreButton.click();
  });
  expect(screen.getByRole('button', { name: '공지 더보기' })).toHaveAttribute(
    'aria-busy',
    'true',
  );

  // 더보기 응답 전에 refresh(작성 완료 등) — 로딩 플래그가 반드시 해제돼야 한다
  await act(async () => {
    refreshCallback?.();
  });
  const afterRefresh = screen.getByRole('button', { name: '공지 더보기' });
  expect(afterRefresh).toHaveAttribute('aria-busy', 'false');
  expect(afterRefresh).not.toBeDisabled();

  // 늦게 도착한 더보기 응답은 폐기 — append 도, 로딩 재점등도 없어야 한다
  await act(async () => {
    resolveMore({
      success: true,
      data: { data: [makePost('p50', '51번째 공지')], total: 51 },
    });
  });
  expect(screen.queryByText('51번째 공지')).toBeNull();
  expect(screen.getByRole('button', { name: '공지 더보기' })).toHaveAttribute(
    'aria-busy',
    'false',
  );
});

it('재로드 중 늦게 도착한 이전 응답은 무시된다 — 최신 요청만 반영 (P2-R1-M02)', async () => {
  // 1차 요청은 지연(수동 resolve), 2차(재로드) 요청은 즉시 응답
  let resolveFirst: (v: unknown) => void = () => {};
  mockFetch
    .mockImplementationOnce(
      () => new Promise((resolve) => (resolveFirst = resolve)),
    )
    .mockResolvedValueOnce({
      success: true,
      data: { data: [makePost('new', '최신 공지')], total: 1 },
    });

  render(<UnitNoticeManagedList axis="team" />);
  await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

  // 재로드(작성 완료 refresh) — 2차 요청이 먼저 완료된다
  await act(async () => {
    refreshCallback?.();
  });
  expect(await screen.findByText('최신 공지')).toBeInTheDocument();

  // 1차(오래된) 응답이 뒤늦게 도착 — 화면을 덮으면 안 된다
  await act(async () => {
    resolveFirst({
      success: true,
      data: { data: [makePost('stale', '이전 공지')], total: 1 },
    });
  });

  expect(screen.queryByText('이전 공지')).toBeNull();
  expect(screen.getByText('최신 공지')).toBeInTheDocument();
});
