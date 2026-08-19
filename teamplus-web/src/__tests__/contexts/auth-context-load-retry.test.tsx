/**
 * AuthContext loadUser — 프로필 조회 실패 시 재시도 회귀 테스트.
 *
 * 결함: getProfile 이 일시 오류로 1회 실패하면 globalLoadAttempted latch 때문에
 * 그 탭이 새로고침 전까지 "토큰 유효 + 상태 미인증" 으로 굳고, 클라이언트 가드
 * (/login 이동)와 미들웨어(유효 쿠키 → 대시보드 반사)가 서로 반대로 던지는
 * 무한 리다이렉트가 성립했다 (개발서버 /director 왕복 실측).
 *
 * 계약: 실패는 latch 하지 않으며, 지연 재시도(4초 backoff)로 스스로 복구한다.
 */
import { render, screen, act } from '@testing-library/react';
import {
  AuthProvider,
  useAuth,
  resetAuthStateForTests,
} from '@/contexts/AuthContext';

const getProfileMock = jest.fn();
const getTokenMock = jest.fn();

jest.mock('@/components/ui/NavLink', () => ({
  useNavigation: () => ({ replace: jest.fn(), navigate: jest.fn() }),
}));

jest.mock('@/services/auth', () => ({
  __esModule: true,
  default: {
    getProfile: (...args: unknown[]) => getProfileMock(...args),
    login: jest.fn(),
    signup: jest.fn(),
    logout: jest.fn(),
  },
}));

jest.mock('@/services/hybrid-auth', () => ({
  hybridAuth: {
    getToken: (...args: unknown[]) => getTokenMock(...args),
    clearToken: jest.fn(),
  },
}));

jest.mock('@/services/api-client', () => ({
  ensureFreshAccessToken: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/services/api-lifecycle-defaults', () => ({
  resetAuthGuardRedirectFlag: jest.fn(),
}));

jest.mock('@/lib/jwt', () => ({
  // temp-user fast path 비활성 — getProfile 결과만으로 상태를 판정하게 한다
  decodeAccessTokenClaims: jest.fn().mockReturnValue(null),
  isAccessTokenExpired: jest.fn().mockReturnValue(true),
}));

jest.mock('@/hooks/useAppMenus', () => ({
  invalidateAppMenusCache: jest.fn(),
}));

jest.mock('@/lib/selected-child-storage', () => ({
  clearSelectedChildStorage: jest.fn(),
}));

jest.mock('@/hooks/useRoleSwitch', () => ({
  VIEW_AS_STORAGE_KEY: 'teamplus_view_as',
}));

jest.mock('@/lib/recent-menu', () => ({
  clearRecentMenu: jest.fn(),
}));

jest.mock('@/services/web-token-storage', () => ({
  TOKEN_EXPIRED_EVENT: 'teamplus:token-expired',
}));

const PROFILE_USER = {
  id: 'u1',
  email: 'director@test.com',
  firstName: '감독',
  lastName: '김',
  name: '김감독',
  userType: 'director',
  isVerified: true,
  avatarUrl: null,
  createdAt: '2026-01-01',
  updatedAt: null,
};

function Probe() {
  const { isAuthenticated, isLoading } = useAuth();
  return (
    <div data-testid="auth-state">
      {isLoading ? 'loading' : isAuthenticated ? 'authenticated' : 'unauthenticated'}
    </div>
  );
}

async function flushAsync(ms = 0) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

describe('AuthContext loadUser 실패 재시도', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    resetAuthStateForTests();
    sessionStorage.clear();
    getTokenMock.mockResolvedValue({
      accessToken: 'valid-access-token',
      refreshToken: 'valid-refresh-token',
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('프로필 조회 1회 실패 후 지연 재시도로 인증 상태가 복구된다', async () => {
    getProfileMock
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValue({ success: true, data: PROFILE_USER });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    // 최초 로드 — 실패 → 미인증 (단, latch 되지 않아야 함)
    await flushAsync(0);
    expect(screen.getByTestId('auth-state')).toHaveTextContent('unauthenticated');
    expect(getProfileMock).toHaveBeenCalledTimes(1);

    // 재시도 지연(4초) 경과 → 자동 재시도 성공 → 인증 복구
    await flushAsync(4_000);
    expect(getProfileMock).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('auth-state')).toHaveTextContent(/^authenticated$/);
  });

  it('프로필 조회 응답 실패(success=false)도 재시도 대상이다', async () => {
    getProfileMock
      .mockResolvedValueOnce({
        success: false,
        error: { code: 'INTERNAL', message: '오류', statusCode: 500 },
      })
      .mockResolvedValue({ success: true, data: PROFILE_USER });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await flushAsync(0);
    expect(screen.getByTestId('auth-state')).toHaveTextContent('unauthenticated');

    await flushAsync(4_000);
    expect(screen.getByTestId('auth-state')).toHaveTextContent(/^authenticated$/);
  });

  it('연속 실패 시 backoff 로 간격이 늘어나며 성공 시점에 복구된다', async () => {
    getProfileMock
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue({ success: true, data: PROFILE_USER });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await flushAsync(0);
    expect(getProfileMock).toHaveBeenCalledTimes(1);

    // 1차 재시도 4초 후 — 또 실패
    await flushAsync(4_000);
    expect(getProfileMock).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('auth-state')).toHaveTextContent('unauthenticated');

    // 2차 재시도는 8초(backoff) — 4초 시점엔 아직
    await flushAsync(4_000);
    expect(getProfileMock).toHaveBeenCalledTimes(2);

    await flushAsync(4_000);
    expect(getProfileMock).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId('auth-state')).toHaveTextContent(/^authenticated$/);
  });

  it('성공 로드 후에는 재시도 타이머가 돌지 않는다', async () => {
    getProfileMock.mockResolvedValue({ success: true, data: PROFILE_USER });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await flushAsync(0);
    expect(screen.getByTestId('auth-state')).toHaveTextContent(/^authenticated$/);
    expect(getProfileMock).toHaveBeenCalledTimes(1);

    // 충분한 시간이 지나도 추가 프로필 조회 없음
    await flushAsync(120_000);
    expect(getProfileMock).toHaveBeenCalledTimes(1);
  });

  it('토큰이 없으면 재시도 없이 미인증으로 확정된다', async () => {
    getTokenMock.mockResolvedValue(null);

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await flushAsync(0);
    expect(screen.getByTestId('auth-state')).toHaveTextContent('unauthenticated');
    expect(getProfileMock).not.toHaveBeenCalled();

    await flushAsync(120_000);
    expect(getProfileMock).not.toHaveBeenCalled();
  });
});
