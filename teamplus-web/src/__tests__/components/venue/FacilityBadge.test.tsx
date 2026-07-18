import { render, screen } from '@testing-library/react';
import { FacilityBadge } from '@/components/venue/FacilityBadge';

describe('FacilityBadge', () => {
  it('amenity 이름을 한국어 라벨로 렌더한다', () => {
    render(<FacilityBadge amenity="locker_room" />);
    expect(screen.getByText('라커룸')).toBeInTheDocument();
  });

  it('available=false 인 경우 block 아이콘이 사용되고 취소선이 적용된다', () => {
    render(<FacilityBadge amenity="shower" available={false} />);
    const label = screen.getByText('샤워실');
    expect(label.className).toMatch(/line-through/);
  });

  it('size=tile 은 72px 정사각 타일로 렌더된다', () => {
    const { container } = render(
      <FacilityBadge amenity="parking" size="tile" />,
    );
    const tile = container.querySelector('.w-\\[72px\\]');
    expect(tile).not.toBeNull();
  });
});
