import { act, renderHook, waitFor } from '@testing-library/react';
import { useNotificationSettings } from '../useNotificationSettings';
import { api } from '@/services/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { MESSAGES } from '@/lib/messages';

jest.mock('@/services/api-client', () => ({
  api: {
    get: jest.fn(),
    patch: jest.fn(),
  },
}));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('@/components/ui/Toast', () => ({ useToast: jest.fn() }));

const apiGet = api.get as jest.Mock;
const apiPatch = api.patch as jest.Mock;
const useAuthMock = useAuth as jest.Mock;
const useToastMock = useToast as jest.Mock;
const toastError = jest.fn();

const serverPreference = {
  pushEnabled: true,
  smsEnabled: false,
  emailEnabled: false,
  soundEnabled: true,
  vibrationEnabled: true,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
  categories: {
    class: true,
    payment: true,
    notice: true,
    system: true,
    marketing: true,
  },
  marketingConsent: false,
  marketingConsentGrantAllowed: true,
  marketingConsentTermsVersion: '1.1.0',
};

describe('useNotificationSettings', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    useAuthMock.mockReturnValue({ isAuthenticated: true });
    useToastMock.mockReturnValue({ toast: { error: toastError } });
    apiGet.mockResolvedValue({ success: true, data: serverPreference });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('서버 marketingConsent를 마케팅 토글의 법적 SoT로 사용한다', async () => {
    const { result } = renderHook(() => useNotificationSettings());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings.categories.marketing).toBe(false);
    expect(result.current.marketingConsentGrantAllowed).toBe(true);
    expect(result.current.marketingConsentTermsVersion).toBe('1.1.0');
  });

  it('서버 조회 실패 시 선택 동의를 임의로 켜서 표시하지 않는다', async () => {
    apiGet.mockResolvedValue({
      success: false,
      error: { message: 'failed' },
    });

    const { result } = renderHook(() => useNotificationSettings());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.settings.categories.marketing).toBe(false);
  });

  it('구버전 응답에 마케팅 값이 없으면 선택 동의를 꺼짐으로 표시한다', async () => {
    apiGet.mockResolvedValue({
      success: true,
      data: {
        ...serverPreference,
        categories: { class: true },
        marketingConsent: undefined,
      },
    });

    const { result } = renderHook(() => useNotificationSettings());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.settings.categories.marketing).toBe(false);
  });

  it('마케팅 변경 시 marketingConsent와 호환 categories 값을 함께 저장한다', async () => {
    apiPatch.mockResolvedValue({
      success: true,
      data: { ...serverPreference, marketingConsent: true },
    });
    const { result } = renderHook(() => useNotificationSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.toggleCategory('marketing'));
    act(() => jest.advanceTimersByTime(500));

    await waitFor(() => expect(apiPatch).toHaveBeenCalledTimes(1));
    expect(apiPatch).toHaveBeenCalledWith('/notifications/preferences/me', {
      categories: expect.objectContaining({ marketing: true }),
      marketingConsent: true,
      marketingConsentTermsVersion: '1.1.0',
    });
    await waitFor(() => expect(result.current.isSaving).toBe(false));
    expect(result.current.settings.categories.marketing).toBe(true);
  });

  it('일반 설정 저장 뒤에도 확인한 약관 버전으로 마케팅 동의를 보낸다', async () => {
    apiPatch
      .mockResolvedValueOnce({
        success: true,
        data: { ...serverPreference, pushEnabled: false },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { ...serverPreference, marketingConsent: true },
      });
    const { result } = renderHook(() => useNotificationSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.togglePush());
    act(() => jest.advanceTimersByTime(500));
    await waitFor(() => expect(result.current.isSaving).toBe(false));

    act(() => result.current.toggleCategory('marketing'));
    act(() => jest.advanceTimersByTime(500));
    await waitFor(() => expect(apiPatch).toHaveBeenCalledTimes(2));
    expect(apiPatch).toHaveBeenLastCalledWith(
      '/notifications/preferences/me',
      expect.objectContaining({
        marketingConsent: true,
        marketingConsentTermsVersion: '1.1.0',
      }),
    );
  });

  it('PATCH 실패 시 마지막 서버 확정 snapshot으로 rollback하고 오류를 한 번 알린다', async () => {
    apiPatch.mockResolvedValue({ success: false, error: { message: 'failed' } });
    const { result } = renderHook(() => useNotificationSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.togglePush());
    expect(result.current.settings.pushEnabled).toBe(false);
    act(() => jest.advanceTimersByTime(500));

    await waitFor(() => expect(result.current.isSaving).toBe(false));
    expect(result.current.settings.pushEnabled).toBe(true);
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledWith(MESSAGES.notification.saveFailed);
  });

  it('500ms 안의 연속 변경은 병합하고 실제 저장 중에는 새 입력을 차단한다', async () => {
    let resolvePatch!: (value: unknown) => void;
    apiPatch.mockReturnValue(
      new Promise((resolve) => {
        resolvePatch = resolve;
      }),
    );
    const { result } = renderHook(() => useNotificationSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.togglePush();
      result.current.toggleCategory('class');
    });
    act(() => jest.advanceTimersByTime(500));
    await waitFor(() => expect(result.current.isSaving).toBe(true));

    expect(apiPatch).toHaveBeenCalledWith('/notifications/preferences/me', {
      pushEnabled: false,
      categories: expect.objectContaining({ class: false }),
    });
    act(() => result.current.toggleCategory('payment'));
    expect(result.current.settings.categories.payment).toBe(true);

    await act(async () => {
      resolvePatch({
        success: true,
        data: {
          ...serverPreference,
          pushEnabled: false,
          categories: { ...serverPreference.categories, class: false },
        },
      });
    });
    expect(result.current.isSaving).toBe(false);
  });
});
