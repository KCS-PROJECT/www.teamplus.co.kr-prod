'use client';

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { TimePicker } from '@/components/ui/TimePicker';
import { Toggle } from '@/components/ui/Toggle';
import { useModal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useNativeUI } from '@/hooks/useNativeUI';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import { usePageReady } from '@/hooks/usePageReady';
import { NavLink } from '@/components/ui/NavLink';
import {
  getPlatform,
  isNativeApp,
  upload as nativeUpload,
} from '@/services/native-bridge';

export default function NotificationSettingsPage() {
  // 공통 AppBar 사용 — Flutter 네이티브 AppBar 비활성화 (중복 헤더 방지)
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });


  const { modal } = useModal();
  const { toast } = useToast();
  const [canOpenDeviceSettings, setCanOpenDeviceSettings] = useState(false);
  const [isNativeMobile, setIsNativeMobile] = useState(false);
  const [isOpeningDeviceSettings, setIsOpeningDeviceSettings] = useState(false);
  const {
    settings,
    isLoading,
    isSaving,
    marketingConsentGrantAllowed,
    marketingConsentTermsVersion,
    togglePush,
    toggleCategory,
    toggleQuietHours,
    setQuietHoursStart,
    setQuietHoursEnd,
    resetSettings,
  } = useNotificationSettings();

  const canGrantMarketingConsent =
    marketingConsentGrantAllowed && Boolean(marketingConsentTermsVersion);

  useEffect(() => {
    const platform = getPlatform();
    const nativeMobile =
      isNativeApp() && (platform === 'ios' || platform === 'android');
    setIsNativeMobile(nativeMobile);
    setCanOpenDeviceSettings(
      nativeMobile && nativeUpload.canOpenSettings()
    );
  }, []);

  const handleOpenDeviceSettings = useCallback(async () => {
    if (isOpeningDeviceSettings) return;
    setIsOpeningDeviceSettings(true);
    try {
      const opened = await nativeUpload.openSettings();
      if (opened) {
        toast.info(MESSAGES.notification.openingDeviceSettings);
      } else {
        toast.warning(MESSAGES.notification.deviceSettingsUnavailable);
      }
    } catch {
      toast.error(MESSAGES.notification.deviceSettingsOpenFailed);
    } finally {
      setIsOpeningDeviceSettings(false);
    }
  }, [isOpeningDeviceSettings, toast]);

  const handleMarketingToggle = useCallback(async () => {
    if (!settings.pushEnabled || isSaving) return;

    if (settings.categories.marketing) {
      toggleCategory('marketing');
      return;
    }

    const confirmed = await modal.confirm({
      title: MESSAGES.notification.marketingConsentTitle,
      message: MESSAGES.notification.marketingConsentSummary,
      confirmText: MESSAGES.notification.marketingConsentConfirm,
      cancelText: MESSAGES.common.cancel,
    });
    if (confirmed) {
      toggleCategory('marketing');
    }
  }, [
    isSaving,
    modal,
    settings.categories.marketing,
    settings.pushEnabled,
    toggleCategory,
  ]);

  // v18 (2026-05-20, audit §4 C #2): isLoading 도착 후 ready — 이중 로더 race 차단.
  usePageReady(!isLoading);

  if (isLoading) {
    return (
      <MobileContainer hasBottomNav={false}>
        <div className="flex items-center justify-center h-full">
          <div className="w-8 h-8 border-2 border-it-blue-500 border-t-transparent rounded-w-pill animate-spin motion-reduce:animate-none" />
        </div>
      </MobileContainer>
    );
  }

  return (
    <MobileContainer hasBottomNav={false} className="bg-it-canvas dark:bg-puck">
      <PageAppBar title={MESSAGES.notification.pageTitle} forceNative />

      {/* 설정 목록 — ICETIMES flat: full-bleed 흰 섹션 + hairline 행 */}
      <main className="flex-1 overflow-y-auto pb-8">
        {/* 푸시 알림 마스터 토글 */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950">
          <div className="px-5 py-4">
            <Toggle
              checked={settings.pushEnabled}
              onChange={togglePush}
              disabled={isSaving}
              label={MESSAGES.notification.pushLabel}
              description={MESSAGES.notification.pushDescription}
            />
          </div>
        </section>

        {/* 카테고리별 설정 */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950">
          <h2 className="text-card-meta font-bold text-it-ink-500 dark:text-rink-300 uppercase tracking-wider px-5 pt-4 pb-1">
            {MESSAGES.notification.categoryTitle}
          </h2>
          <div className="divide-y divide-it-line dark:divide-rink-700 px-1">
            <div className="px-4 py-4">
              <Toggle
                checked={settings.categories.class}
                onChange={() => toggleCategory('class')}
                disabled={!settings.pushEnabled || isSaving}
                label={MESSAGES.notification.classLabel}
                description={MESSAGES.notification.classDescription}
              />
            </div>
            <div className="px-4 py-4">
              <Toggle
                checked={settings.categories.payment}
                onChange={() => toggleCategory('payment')}
                disabled={!settings.pushEnabled || isSaving}
                label={MESSAGES.notification.paymentLabel}
                description={MESSAGES.notification.paymentDescription}
              />
            </div>
            <div className="px-4 py-4">
              <Toggle
                checked={settings.categories.notice}
                onChange={() => toggleCategory('notice')}
                disabled={!settings.pushEnabled || isSaving}
                label={MESSAGES.notification.noticeLabel}
                description={MESSAGES.notification.noticeDescription}
              />
            </div>
            <div className="px-4 py-4">
              <Toggle
                checked={settings.categories.system}
                onChange={() => toggleCategory('system')}
                disabled={!settings.pushEnabled || isSaving}
                label={MESSAGES.notification.systemLabel}
                description={MESSAGES.notification.systemDescription}
              />
            </div>
            <div className="px-4 py-4">
              <Toggle
                checked={settings.categories.marketing}
                onChange={() => void handleMarketingToggle()}
                disabled={
                  !settings.pushEnabled ||
                  isSaving ||
                  (!settings.categories.marketing &&
                    !canGrantMarketingConsent)
                }
                label={MESSAGES.notification.marketingLabel}
                description={
                  !settings.categories.marketing &&
                  !marketingConsentGrantAllowed
                    ? MESSAGES.notification.marketingGuardianDescription
                    : !settings.categories.marketing &&
                        !marketingConsentTermsVersion
                      ? MESSAGES.notification.marketingTermsUnavailableDescription
                      : MESSAGES.notification.marketingDescription
                }
              />
              <NavLink
                href="/terms?section=marketing"
                className="mt-2 inline-flex min-h-11 items-center text-card-meta font-semibold text-ice-500 hover:text-ice-600 dark:text-ice-300 dark:hover:text-ice-200"
              >
                {MESSAGES.notification.marketingTermsLink}
              </NavLink>
            </div>
          </div>
        </section>

        {/* 방해금지 모드 */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950">
          <h2 className="text-card-meta font-bold text-it-ink-500 dark:text-rink-300 uppercase tracking-wider px-5 pt-4 pb-1">
            {MESSAGES.notification.quietHoursTitle}
          </h2>
          <div className="px-1">
            <div className="px-4 py-4">
              <Toggle
                checked={settings.quietHours.enabled}
                onChange={toggleQuietHours}
                disabled={!settings.pushEnabled || isSaving}
                label={MESSAGES.notification.quietHoursTitle}
                description={MESSAGES.notification.quietHoursDescription}
              />
            </div>

            {settings.quietHours.enabled && settings.pushEnabled && (
              <div className="mx-3 px-4 pb-4 pt-2 border-t border-it-line dark:border-rink-700">
                {/* 시간 input 박스 — 작은 화면(360px)에서 종료 시간이 우측 외곽으로 튕겨나가지
                    않도록 `flex-1 min-w-0` 적용. 부모 컨테이너는 gap-2 + items-center 로
                    아이콘과 input 정렬. (이슈 W2.C #8: 방해 금지 모드 종료 시간 박스 외곽 노출 해결) */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <label className="block text-card-meta text-it-ink-500 dark:text-rink-300 mb-1">
                      {MESSAGES.notification.quietHoursStart}
                    </label>
                    <TimePicker
                      value={settings.quietHours.startTime}
                      onChange={setQuietHoursStart}
                      disabled={isSaving}
                      startHour={0}
                      stepMinutes={10}
                      placeholder={MESSAGES.class.dayDefaults.startTime}
                      sheetTitle={MESSAGES.common.timePicker.quietHoursStart}
                      ariaLabel={MESSAGES.common.timePicker.quietHoursStart}
                      className={cn(
                        'w-full min-w-0 px-3 py-2 rounded-w-md text-card-body',
                        'bg-it-fill dark:bg-rink-700',
                        'text-it-ink-800 dark:text-white',
                        'border-[1.5px] border-it-line-strong dark:border-rink-600',
                        'focus:outline-none focus:ring-2 focus:ring-it-blue-500 focus:border-transparent'
                      )}
                    />
                  </div>
                  <Icon
                    name="arrow_forward"
                    className="shrink-0 text-it-ink-400 mt-5"
                    aria-hidden="true"
                  />
                  <div className="flex-1 min-w-0">
                    <label className="block text-card-meta text-it-ink-500 dark:text-rink-300 mb-1">
                      {MESSAGES.notification.quietHoursEnd}
                    </label>
                    <TimePicker
                      value={settings.quietHours.endTime}
                      onChange={setQuietHoursEnd}
                      disabled={isSaving}
                      startHour={0}
                      stepMinutes={10}
                      placeholder={MESSAGES.class.dayDefaults.endTime}
                      sheetTitle={MESSAGES.common.timePicker.quietHoursEnd}
                      ariaLabel={MESSAGES.common.timePicker.quietHoursEnd}
                      className={cn(
                        'w-full min-w-0 px-3 py-2 rounded-w-md text-card-body',
                        'bg-it-fill dark:bg-rink-700',
                        'text-it-ink-800 dark:text-white',
                        'border-[1.5px] border-it-line-strong dark:border-rink-600',
                        'focus:outline-none focus:ring-2 focus:ring-it-blue-500 focus:border-transparent'
                      )}
                    />
                  </div>
                </div>
                <p className="text-card-meta text-it-ink-500 dark:text-rink-300 mt-3 tabular-nums">
                  {MESSAGES.notification.quietHoursRange(
                    settings.quietHours.startTime,
                    settings.quietHours.endTime
                  )}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* 설정 초기화 */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-4 py-3">
          <button
            onClick={async () => {
              const confirmed = await modal.confirm({
                title: MESSAGES.notification.resetTitle,
                message: MESSAGES.notification.settingsReset,
                confirmText: MESSAGES.notification.resetConfirm,
                cancelText: MESSAGES.common.cancel,
                variant: 'danger',
              });
              if (confirmed) {
                resetSettings();
              }
            }}
            disabled={isSaving}
            aria-busy={isSaving}
            className="w-full py-3 text-card-body font-medium text-it-red-500 dark:text-it-red-300 hover:bg-it-red-50 dark:hover:bg-it-red-500/15 rounded-w-md transition-colors motion-reduce:transition-none"
          >
            {MESSAGES.notification.resetTitle}
          </button>
        </section>

        {/* 안내 문구 — it-fill 인셋 행 */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-4 py-4">
          <div className="flex items-start gap-3 p-4 bg-it-fill dark:bg-rink-800 rounded-w-md">
            <Icon name="info" className="text-it-ink-400 dark:text-rink-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-card-meta text-it-ink-500 dark:text-rink-300 leading-relaxed">
                {canOpenDeviceSettings
                  ? MESSAGES.notification.deviceSettingsHint
                  : isNativeMobile
                    ? MESSAGES.notification.legacyDeviceSettingsHint
                    : MESSAGES.notification.deviceSettingsHint}
              </p>
              {canOpenDeviceSettings && (
                <button
                  type="button"
                  onClick={() => void handleOpenDeviceSettings()}
                  disabled={isOpeningDeviceSettings}
                  aria-busy={isOpeningDeviceSettings}
                  className="mt-3 min-h-11 inline-flex items-center justify-center gap-2 rounded-w-md bg-ice-500 px-4 text-card-body font-bold text-white transition-colors hover:bg-ice-600 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
                >
                  <Icon name="settings" aria-hidden="true" />
                  {MESSAGES.notification.openDeviceSettings}
                </button>
              )}
            </div>
          </div>
        </section>
      </main>
    </MobileContainer>
  );
}
