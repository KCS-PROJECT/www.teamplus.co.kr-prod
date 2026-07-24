import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { formatTimeLabel, TimePicker } from '@/components/ui/TimePicker';

jest.mock('@/hooks/useNativeScrim', () => ({
  useNativeScrim: jest.fn(),
}));

describe('TimePicker', () => {
  it('좁은 입력에서도 선택된 시간을 짧은 24시간 형식으로 표시한다', () => {
    render(
      <TimePicker
        value="17:40"
        onChange={jest.fn()}
        ariaLabel="시작 시간"
      />,
    );

    const trigger = screen.getByRole('button', { name: '시작 시간' });
    expect(trigger).toHaveTextContent('17:40');
    expect(trigger).not.toHaveTextContent('오후');
  });

  it('기본 분 선택지를 10분 단위로 제공하고 확인할 때만 값을 변경한다', () => {
    const onChange = jest.fn();
    render(
      <TimePicker
        value="17:40"
        onChange={onChange}
        ariaLabel="시작 시간"
        stepMinutes={10}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '시작 시간' }));

    const hourList = screen.getByRole('group', { name: '시' });
    const minuteList = screen.getByRole('group', { name: '분' });
    expect(hourList).toHaveClass('h-72');
    expect(minuteList).toHaveClass('h-72');
    expect(
      within(minuteList).getAllByRole('button').map((item) => item.textContent),
    ).toEqual(['00', '10', '20', '30', '40', '50']);

    fireEvent.click(within(hourList).getByRole('button', { name: '18' }));
    fireEvent.click(within(minuteList).getByRole('button', { name: '50' }));
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(onChange).toHaveBeenCalledWith('18:50');
  });

  it('바깥 영역으로 닫으면 선택 중인 값을 반영하지 않는다', () => {
    const onChange = jest.fn();
    render(
      <TimePicker
        value="09:20"
        onChange={onChange}
        ariaLabel="종료 시간"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '종료 시간' }));
    const minuteList = screen.getByRole('group', { name: '분' });
    fireEvent.click(within(minuteList).getByRole('button', { name: '30' }));

    const dialog = screen.getByRole('dialog', { name: '시간을 선택해주세요.' });
    const dim = dialog.querySelector('[data-bottom-sheet-dim]');
    expect(dim).toBeInstanceOf(HTMLElement);
    fireEvent.click(dim as HTMLElement);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('기존 선택 시간이 보이도록 시간 목록의 초기 스크롤을 중앙에 맞춘다', async () => {
    render(
      <TimePicker
        value="23:40"
        onChange={jest.fn()}
        ariaLabel="늦은 시간"
        startHour={0}
        stepMinutes={10}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '늦은 시간' }));

    const hourList = screen.getByRole('group', { name: '시' });
    const selectedHour = within(hourList).getByRole('button', { name: '23' });
    Object.defineProperty(hourList, 'clientHeight', {
      configurable: true,
      value: 264,
    });
    jest.spyOn(hourList, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      height: 264,
    } as DOMRect);
    jest.spyOn(selectedHour, 'getBoundingClientRect').mockReturnValue({
      top: 600,
      height: 44,
    } as DOMRect);

    await waitFor(() => expect(hourList.scrollTop).toBe(390));
    expect(selectedHour).toHaveAttribute('aria-pressed', 'true');
  });

  it('기존 비정규 분 값은 열기만 해서는 변경하지 않고 확인 시 10분 단위로 정규화한다', () => {
    const onChange = jest.fn();
    render(
      <TimePicker
        value="17:44"
        onChange={onChange}
        ariaLabel="기존 시간"
        stepMinutes={10}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '기존 시간' }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '확인' }));

    expect(onChange).toHaveBeenCalledWith('17:40');
  });

  it('빈 값이면 defaultHour 없이도 9시를 기준으로 열린다', () => {
    render(
      <TimePicker
        value=""
        onChange={jest.fn()}
        ariaLabel="새 시간"
        startHour={0}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '새 시간' }));

    const hourList = screen.getByRole('group', { name: '시' });
    expect(within(hourList).getByRole('button', { name: '09' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('빈 값 기준 시(9시)가 선택 범위 밖이면 범위 안으로 클램프한다', () => {
    render(
      <TimePicker
        value=""
        onChange={jest.fn()}
        ariaLabel="저녁 시간"
        startHour={18}
        endHour={23}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '저녁 시간' }));

    const hourList = screen.getByRole('group', { name: '시' });
    expect(within(hourList).getByRole('button', { name: '18' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('비활성화 상태에서는 선택기를 열지 않는다', () => {
    render(
      <TimePicker
        value=""
        onChange={jest.fn()}
        ariaLabel="비활성 시간"
        disabled
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '비활성 시간' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('잘못된 분 간격은 기존 기본값인 30분 단위로 대체한다', () => {
    render(
      <TimePicker
        value=""
        onChange={jest.fn()}
        ariaLabel="잘못된 간격"
        stepMinutes={-10}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '잘못된 간격' }));
    const minuteList = screen.getByRole('group', { name: '분' });
    expect(
      within(minuteList).getAllByRole('button').map((item) => item.textContent),
    ).toEqual(['00', '30']);
  });

  it('유효하지 않은 시각 문자열은 표시 과정에서 임의 변환하지 않는다', () => {
    expect(formatTimeLabel('24:00')).toBe('24:00');
    expect(formatTimeLabel('17:60')).toBe('17:60');
  });
});
