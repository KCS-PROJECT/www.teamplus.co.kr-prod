/**
 * RecentNoticesSection — [Phase 2 · P2-R1-M03] 자녀 변경 응답 역전 회귀.
 *
 * 계약 고정: 자녀 A 의 feed 요청이 진행 중일 때 자녀 B 로 변경하면
 *   ① 진행 중이던 A 요청 카운터가 즉시 무효화되어 늦게 완료돼도 반영되지 않고
 *   ② B 기준 새 요청이 시작되어 그 결과만 표시된다.
 */

import { act, render, screen, waitFor } from '@testing-library/react';
import { fetchUnitNoticeFeed } from '@/services/community-notice.service';
import { RecentNoticesSection } from '@/components/dashboard/RecentNoticesSection';

jest.mock('@/services/api-client', () => ({
  api: { get: jest.fn().mockResolvedValue({ success: true, data: [] }) },
}));
jest.mock('@/services/community-notice.service', () => ({
  fetchUnitNoticeFeed: jest.fn(),
}));
jest.mock('@/components/ui/NavLink', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));
jest.mock('@/components/ui/AnimatedTabIndicator', () => ({
  AnimatedTabIndicator: () => null,
  useAnimatedTabIndicator: () => ({
    registerTab: () => () => {},
    containerRef: { current: null },
    indicatorStyle: {},
    ready: true,
  }),
}));

// 선택 자녀 — 테스트가 rerender 로 전환을 유발할 수 있게 모듈 변수로 제어
let currentChildId: string | null = 'child-a';
jest.mock('@/contexts/SelectedChildContext', () => ({
  useSelectedChild: () => ({ selectedChildId: currentChildId }),
}));

const mockFeed = fetchUnitNoticeFeed as jest.Mock;

function feedPage(id: string, title: string) {
  return {
    success: true,
    data: {
      data: [
        {
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
        },
      ],
      total: 1,
    },
  };
}

beforeEach(() => {
  mockFeed.mockReset();
  currentChildId = 'child-a';
});

it('자녀 A 요청이 진행 중에 B 로 변경 — A 의 늦은 응답은 무시되고 B 결과만 표시 (P2-R1-M03)', async () => {
  let resolveA: (v: unknown) => void = () => {};
  mockFeed
    .mockImplementationOnce(
      () => new Promise((resolve) => (resolveA = resolve)),
    )
    .mockResolvedValueOnce(feedPage('b1', '자녀B 공지'));

  const { rerender } = render(<RecentNoticesSection defaultTab="team" />);
  await waitFor(() =>
    expect(mockFeed).toHaveBeenCalledWith(
      expect.objectContaining({ childId: 'child-a' }),
    ),
  );

  // 자녀 전환 — 진행 중인 A 요청은 카운터 무효화, B 요청이 바로 시작돼야 한다
  currentChildId = 'child-b';
  rerender(<RecentNoticesSection defaultTab="team" />);
  await waitFor(() =>
    expect(mockFeed).toHaveBeenCalledWith(
      expect.objectContaining({ childId: 'child-b' }),
    ),
  );
  expect(await screen.findByText('자녀B 공지')).toBeInTheDocument();

  // A 응답이 뒤늦게 도착 — 화면을 덮으면 안 된다
  await act(async () => {
    resolveA(feedPage('a1', '자녀A 공지'));
  });

  expect(screen.queryByText('자녀A 공지')).toBeNull();
  expect(screen.getByText('자녀B 공지')).toBeInTheDocument();
});
