import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { upload } from '@/services/native-bridge-api';
import { BRIDGE_WEB_VERSION } from '@/services/native-bridge-core';
import { isFlutterBridgeAvailable } from '@/lib/environment';
import { MESSAGES } from '@/lib/messages';
import NotificationSettingsPage from '@/app/(common)/notification-settings/page';

const mockPageCanOpenSettings = jest.fn(() => true);
const mockPageOpenSettings = jest.fn();
const mockToastInfo = jest.fn();
const mockToastWarning = jest.fn();
const mockToastError = jest.fn();
const mockModalConfirm = jest.fn();
const mockToggleCategory = jest.fn();
let mockPushEnabled = true;
let mockMarketingEnabled = false;
let mockMarketingConsentGrantAllowed = true;
let mockMarketingConsentTermsVersion: string | null = '1.1.0';
let mockPlatform: 'android' | 'ios' = 'android';

jest.mock('@/hooks/useNativeUI', () => ({ useNativeUI: jest.fn() }));
jest.mock('@/hooks/usePageReady', () => ({ usePageReady: jest.fn() }));
jest.mock('@/components/layout/MobileContainer', () => ({
  MobileContainer: ({ children }: { children: React.ReactNode }) =>
    children,
}));
jest.mock('@/components/layout/PageAppBar', () => ({
  PageAppBar: ({ title }: { title: string }) => title,
}));
jest.mock('@/components/ui/Modal', () => ({
  useModal: () => ({ modal: { confirm: mockModalConfirm } }),
}));
jest.mock('@/components/ui/NavLink', () => ({
  NavLink: ({ href, children, ...props }: React.ComponentProps<'a'>) =>
    React.createElement('a', { href, ...props }, children),
}));
jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({
    toast: {
      info: mockToastInfo,
      warning: mockToastWarning,
      error: mockToastError,
    },
  }),
}));
jest.mock('@/hooks/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: {
      pushEnabled: mockPushEnabled,
      categories: {
        class: true,
        payment: true,
        notice: true,
        system: true,
        marketing: mockMarketingEnabled,
      },
      soundEnabled: true,
      vibrationEnabled: true,
      quietHours: { enabled: false, startTime: '22:00', endTime: '08:00' },
    },
    isLoading: false,
    isSaving: false,
    marketingConsentGrantAllowed: mockMarketingConsentGrantAllowed,
    marketingConsentTermsVersion: mockMarketingConsentTermsVersion,
    togglePush: jest.fn(),
    toggleCategory: mockToggleCategory,
    toggleQuietHours: jest.fn(),
    setQuietHoursStart: jest.fn(),
    setQuietHoursEnd: jest.fn(),
    resetSettings: jest.fn(),
  }),
}));
jest.mock('@/services/native-bridge', () => ({
  getPlatform: () => mockPlatform,
  isNativeApp: () => true,
  upload: {
    canOpenSettings: () => mockPageCanOpenSettings(),
    openSettings: () => mockPageOpenSettings(),
  },
}));

jest.mock('@/lib/environment', () => ({
  isFlutterBridgeAvailable: jest.fn(),
}));

const isBridgeAvailableMock = isFlutterBridgeAvailable as jest.Mock;

describe('기기 설정 bridge capability', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isBridgeAvailableMock.mockReturnValue(true);
    window.FlutterBridge = undefined;
    mockPageCanOpenSettings.mockReturnValue(true);
    mockPushEnabled = true;
    mockMarketingEnabled = false;
    mockMarketingConsentGrantAllowed = true;
    mockMarketingConsentTermsVersion = '1.1.0';
    mockPlatform = 'android';
  });

  it('Web bridge 계약 버전은 App과 맞춘 1.1.1이다', () => {
    expect(BRIDGE_WEB_VERSION).toBe('1.1.1');
  });

  it('레거시 앱처럼 openSettings 함수가 없으면 capability를 false로 반환한다', () => {
    window.FlutterBridge = { upload: {} } as never;

    expect(upload.canOpenSettings()).toBe(false);
  });

  it('주입된 openSettings 함수를 호출하고 opened 결과를 반환한다', async () => {
    const openSettings = jest.fn().mockResolvedValue({ opened: true });
    window.FlutterBridge = { upload: { openSettings } } as never;

    expect(upload.canOpenSettings()).toBe(true);
    await expect(upload.openSettings()).resolves.toBe(true);
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it.each(['android', 'ios'] as const)(
    '최신 %s 앱에는 설정 버튼을 표시하고 알림음·진동 UI는 숨긴다',
    async (platform) => {
      mockPlatform = platform;
      render(React.createElement(NotificationSettingsPage));

      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: '기기 알림 설정 열기' }),
        ).toBeInTheDocument(),
      );
      expect(screen.queryByText('알림음')).not.toBeInTheDocument();
      expect(screen.queryByText('진동')).not.toBeInTheDocument();
    },
  );

  it('마케팅 수신을 켤 때 동의 내용을 확인한 뒤에만 변경한다', async () => {
    mockModalConfirm.mockResolvedValue(true);
    render(React.createElement(NotificationSettingsPage));
    const marketingSwitch = await screen.findByRole('switch', {
      name: MESSAGES.notification.marketingLabel,
    });

    fireEvent.click(marketingSwitch);

    await waitFor(() => expect(mockModalConfirm).toHaveBeenCalledTimes(1));
    expect(mockModalConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: MESSAGES.notification.marketingConsentTitle,
        message: MESSAGES.notification.marketingConsentSummary,
      }),
    );
    expect(mockToggleCategory).toHaveBeenCalledWith('marketing');
  });

  it('마케팅 동의를 취소하면 설정을 변경하지 않는다', async () => {
    mockModalConfirm.mockResolvedValue(false);
    render(React.createElement(NotificationSettingsPage));
    const marketingSwitch = await screen.findByRole('switch', {
      name: MESSAGES.notification.marketingLabel,
    });

    fireEvent.click(marketingSwitch);

    await waitFor(() => expect(mockModalConfirm).toHaveBeenCalledTimes(1));
    expect(mockToggleCategory).not.toHaveBeenCalled();
  });

  it('푸시를 끄면 마케팅 변경을 차단하고 다시 켜면 기존 값을 보존해 조작할 수 있다', async () => {
    mockPushEnabled = false;
    mockMarketingEnabled = true;
    const { rerender } = render(
      React.createElement(NotificationSettingsPage),
    );
    const marketingSwitch = await screen.findByRole('switch', {
      name: MESSAGES.notification.marketingLabel,
    });

    expect(marketingSwitch).toBeDisabled();
    expect(marketingSwitch).toBeChecked();

    fireEvent.click(marketingSwitch);

    expect(mockModalConfirm).not.toHaveBeenCalled();
    expect(mockToggleCategory).not.toHaveBeenCalled();

    mockPushEnabled = true;
    rerender(React.createElement(NotificationSettingsPage));

    expect(marketingSwitch).toBeEnabled();
    expect(marketingSwitch).toBeChecked();

    fireEvent.click(marketingSwitch);

    expect(mockModalConfirm).not.toHaveBeenCalled();
    expect(mockToggleCategory).toHaveBeenCalledTimes(1);
    expect(mockToggleCategory).toHaveBeenCalledWith('marketing');
  });

  it('동의할 수 없는 계정은 마케팅 켜기를 막고 보호자 안내를 표시한다', async () => {
    mockMarketingConsentGrantAllowed = false;
    render(React.createElement(NotificationSettingsPage));

    const marketingSwitch = await screen.findByRole('switch', {
      name: MESSAGES.notification.marketingLabel,
    });
    expect(marketingSwitch).toBeDisabled();
    expect(
      screen.getByText(MESSAGES.notification.marketingGuardianDescription),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: MESSAGES.notification.marketingTermsLink,
      }),
    ).toHaveAttribute('href', '/terms?section=marketing');
  });

  it('레거시 앱에는 버튼 대신 수동 설정 경로를 안내한다', async () => {
    mockPageCanOpenSettings.mockReturnValue(false);
    render(React.createElement(NotificationSettingsPage));

    await waitFor(() =>
      expect(
        screen.getByText(/현재 앱에서는 바로 열 수 없습니다/),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('button', { name: '기기 알림 설정 열기' }),
    ).not.toBeInTheDocument();
  });

  it('네이티브가 설정 화면을 열지 못하면 수동 경로를 안내한다', async () => {
    mockPageOpenSettings.mockResolvedValue(false);
    render(React.createElement(NotificationSettingsPage));
    const button = await screen.findByRole('button', {
      name: '기기 알림 설정 열기',
    });

    fireEvent.click(button);

    await waitFor(() => expect(mockToastWarning).toHaveBeenCalledTimes(1));
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('네이티브 설정 호출 예외를 오류로 안내한다', async () => {
    mockPageOpenSettings.mockRejectedValue(new Error('bridge failed'));
    render(React.createElement(NotificationSettingsPage));
    const button = await screen.findByRole('button', {
      name: '기기 알림 설정 열기',
    });

    fireEvent.click(button);

    await waitFor(() => expect(mockToastError).toHaveBeenCalledTimes(1));
    expect(mockToastWarning).not.toHaveBeenCalled();
  });
});
