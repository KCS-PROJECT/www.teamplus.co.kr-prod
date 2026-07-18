import { render, screen } from '@testing-library/react';
import { VenueStatusBadge } from '@/components/venue/VenueStatusBadge';

describe('VenueStatusBadge', () => {
  it('운영중 상태를 라벨과 함께 렌더한다', () => {
    render(<VenueStatusBadge status="active" />);
    const badge = screen.getByText('운영중');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('aria-label', '운영 상태: 운영중');
  });

  it('점검중 상태는 amber 계열 클래스를 사용한다', () => {
    render(<VenueStatusBadge status="maintenance" />);
    const badge = screen.getByText('점검중');
    expect(badge.className).toMatch(/amber/);
  });

  it('size=sm 은 px-2 py-0.5 스타일을 적용한다', () => {
    render(<VenueStatusBadge status="closed" size="sm" />);
    const badge = screen.getByText('운영종료');
    expect(badge.className).toMatch(/px-2/);
  });
});
