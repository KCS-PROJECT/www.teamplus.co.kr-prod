/**
 * TeamClassesSummary — myOnly 빈 상태 '수업 둘러보기' CTA 노출 제어 회귀 테스트 (Codex R1-3·6).
 * 계약: showEmptyCta 기본 true(기존 사용처 무영향) · false 면 안내문구+CTA 숨김(제목 유지).
 */

import { render, screen, waitFor } from '@testing-library/react';

jest.mock('@/services/api-client', () => ({
  api: { get: jest.fn(async () => ({ success: true, data: [] })) },
}));
jest.mock('@/services/tournament.service', () => ({
  listTournaments: jest.fn(async () => ({ success: true, data: [] })),
}));
jest.mock('@/components/wallet', () => ({
  SectionHead: ({ title }: { title: string }) => <div>{title}</div>,
}));
jest.mock('@/components/ui/NavLink', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

import { TeamClassesSummary } from '@/components/dashboard/TeamClassesSummary';
import { MESSAGES } from '@/lib/messages';

describe('TeamClassesSummary — myOnly 빈 상태 CTA', () => {
  it('기본값(true): 빈 상태에서 안내문구와 수업 둘러보기 CTA 를 노출한다 (기존 동작)', async () => {
    render(<TeamClassesSummary myOnly />);
    await waitFor(() =>
      expect(
        screen.getByText(MESSAGES.dashboard.myClasses.emptyTitle),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText(MESSAGES.dashboard.myClasses.emptyCta),
    ).toBeInTheDocument();
    expect(
      screen.getByText(MESSAGES.dashboard.myClasses.emptyDescription),
    ).toBeInTheDocument();
  });

  it('showEmptyCta=false: 제목만 남기고 안내문구·CTA 를 숨긴다 (자녀 0명 확정)', async () => {
    render(<TeamClassesSummary myOnly showEmptyCta={false} />);
    await waitFor(() =>
      expect(
        screen.getByText(MESSAGES.dashboard.myClasses.emptyTitle),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByText(MESSAGES.dashboard.myClasses.emptyCta),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(MESSAGES.dashboard.myClasses.emptyDescription),
    ).not.toBeInTheDocument();
  });
});
