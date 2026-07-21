/**
 * /tournaments/[id]/students — 대회 상세 #participants 통합 리다이렉트 회귀 테스트(SPEC §5-4).
 *
 * 계약: 진입 시 즉시 /tournaments/{id}#participants 로 replace(hash + 동적 id 보존).
 */

import { render, waitFor } from '@testing-library/react';

const mockReplace = jest.fn();

jest.mock('next/navigation', () => ({ useParams: () => ({ id: 't1' }) }));
jest.mock('@/hooks/useNavigation', () => ({
  useNavigation: () => ({ replace: mockReplace }),
}));
jest.mock('@/hooks/usePageReady', () => ({ usePageReady: () => {} }));
jest.mock('@/hooks/useNativeUI', () => ({ useNativeUI: () => {} }));
jest.mock('@/components/layout/MobileContainer', () => ({
  MobileContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import TournamentStudentsRedirectPage from '@/app/(common)/tournaments/[id]/students/page';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('대회 선수정보 페이지 — 상세 #participants 리다이렉트', () => {
  it('진입 시 /tournaments/{id}#participants 로 replace', async () => {
    render(<TournamentStudentsRedirectPage />);
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/tournaments/t1#participants');
    });
  });
});
