/**
 * /director-payments 중첩 layout 가드 테스트 (Codex Phase 3 MEDIUM-4)
 *
 * 핵심: 팀 전용 정산 센터는 오픈클래스 원장(academy_director)을 차단한다.
 *  - useRequireRole 은 팀 웹 역할만(['director','coach','admin']) 요구 — academy_director 제외.
 *  - isAllowed=false 면 children 미렌더(null), true 면 렌더, isLoading 이면 LoadingPuck.
 */

import { render, screen } from '@testing-library/react';

jest.mock('@/contexts/AuthContext', () => ({
  useRequireRole: jest.fn(),
}));
jest.mock('@/components/ui/LoadingPuck', () => ({
  LoadingPuck: () => <div data-testid="loading-puck" />,
}));

import { useRequireRole } from '@/contexts/AuthContext';
import DirectorPaymentsLayout from '@/app/(director)/director-payments/layout';

const mockUseRequireRole = useRequireRole as jest.Mock;

describe('DirectorPaymentsLayout — academy_director 차단', () => {
  beforeEach(() => mockUseRequireRole.mockReset());

  it('academy_director 를 제외한 팀 웹 역할만 요구한다', () => {
    mockUseRequireRole.mockReturnValue({ isLoading: false, isAllowed: true });

    render(
      <DirectorPaymentsLayout>
        <div>child</div>
      </DirectorPaymentsLayout>,
    );

    expect(mockUseRequireRole).toHaveBeenCalledWith(['director', 'coach', 'admin']);
    const roles = mockUseRequireRole.mock.calls[0][0] as string[];
    expect(roles).not.toContain('academy_director');
  });

  it('허용 역할이면 children 을 렌더한다', () => {
    mockUseRequireRole.mockReturnValue({ isLoading: false, isAllowed: true });

    render(
      <DirectorPaymentsLayout>
        <div>settlement-content</div>
      </DirectorPaymentsLayout>,
    );

    expect(screen.getByText('settlement-content')).toBeInTheDocument();
  });

  it('차단 역할(academy_director 등)이면 children 을 렌더하지 않는다', () => {
    mockUseRequireRole.mockReturnValue({ isLoading: false, isAllowed: false });

    render(
      <DirectorPaymentsLayout>
        <div>settlement-content</div>
      </DirectorPaymentsLayout>,
    );

    expect(screen.queryByText('settlement-content')).not.toBeInTheDocument();
  });

  it('로딩 중이면 LoadingPuck 을 표시한다', () => {
    mockUseRequireRole.mockReturnValue({ isLoading: true, isAllowed: false });

    render(
      <DirectorPaymentsLayout>
        <div>settlement-content</div>
      </DirectorPaymentsLayout>,
    );

    expect(screen.getByTestId('loading-puck')).toBeInTheDocument();
    expect(screen.queryByText('settlement-content')).not.toBeInTheDocument();
  });
});
