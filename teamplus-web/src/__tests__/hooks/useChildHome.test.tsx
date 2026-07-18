import { render, screen, waitFor } from '@testing-library/react';
import { useChildHome } from '@/hooks/useChildHome';

const apiRequestMock = jest.fn();

jest.mock('@/services/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));

function HookProbe({ isAuthenticated }: { isAuthenticated: boolean }) {
  const { isLoading, error, todayClass, weekDays, streakCount } = useChildHome(isAuthenticated);

  return (
    <>
      <div data-testid="loading">{String(isLoading)}</div>
      <div data-testid="error">{error ?? 'none'}</div>
      <div data-testid="today-class">{todayClass?.title ?? 'none'}</div>
      <div data-testid="weekdays">{String(weekDays.length)}</div>
      <div data-testid="streak">{String(streakCount)}</div>
    </>
  );
}

describe('useChildHome', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('비인증 상태에서는 API 호출 없이 로딩을 종료한다', async () => {
    render(<HookProbe isAuthenticated={false} />);

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('error')).toHaveTextContent('none');
    expect(screen.getByTestId('today-class')).toHaveTextContent('none');
    expect(screen.getByTestId('weekdays')).toHaveTextContent('7');
    expect(screen.getByTestId('streak')).toHaveTextContent('0');
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it('팀이 없으면 기본 상태로 종료한다', async () => {
    apiRequestMock.mockResolvedValueOnce({
      success: true,
      data: [],
    });

    render(<HookProbe isAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('today-class')).toHaveTextContent('none');
    expect(screen.getByTestId('weekdays')).toHaveTextContent('7');
    expect(screen.getByTestId('streak')).toHaveTextContent('0');
  });
});
