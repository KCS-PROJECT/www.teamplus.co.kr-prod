import { fireEvent, render, screen } from '@testing-library/react';
import { Toggle } from '@/components/ui/Toggle';

describe('Toggle', () => {
  it('보이는 라벨과 설명을 switch의 접근 가능한 이름·설명으로 연결한다', () => {
    const onChange = jest.fn();
    render(
      <Toggle
        checked={false}
        onChange={onChange}
        label="푸시 알림"
        description="모든 알림을 한 번에 켜거나 끕니다"
      />,
    );

    const toggle = screen.getByRole('switch', { name: '푸시 알림' });
    expect(toggle).toHaveAccessibleDescription(
      '모든 알림을 한 번에 켜거나 끕니다',
    );
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(screen.getByText('푸시 알림'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('switch와 thumb 모두 reduced-motion 전환 해제를 제공한다', () => {
    render(<Toggle checked onChange={jest.fn()} label="공지 알림" />);

    const toggle = screen.getByRole('switch', { name: '공지 알림' });
    expect(toggle).toHaveClass('motion-reduce:transition-none');
    expect(toggle.firstElementChild).toHaveClass(
      'motion-reduce:transition-none',
    );
  });
});
