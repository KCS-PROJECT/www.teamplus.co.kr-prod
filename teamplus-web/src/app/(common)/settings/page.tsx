"use client";

import { useState } from "react";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { useNativeUI } from '@/hooks/useNativeUI';
import { Icon } from "@/components/ui/Icon";
import { ConfirmDialog } from "@/components/ui/Modal/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { useAppSettings } from "@/hooks/useAppSettings";
import { SettingsSection, SettingsRow } from "@/components/settings";
import { MESSAGES } from "@/lib/messages";
import { usePageReady } from '@/hooks/usePageReady';

/**
 * 설정 메인 (시안 07 · 설정 화면 적용 — 2026-04-29).
 * - 5개 섹션으로 그룹화: 계정 / 알림 / 화면 / 보안 / 개인정보
 * - 시안 SettingsSection · SettingsRow 패턴 사용 (32×32 ice50/ice600 아이콘 + 14px 600w 라벨 + 11px sub)
 * - Footer: 로그아웃 + 앱 버전 표시
 * - 기존 라우팅 8개 항목 모두 보존, 기능 무수정 (디자인만 적용)
 */
export default function SettingsPage() {
  usePageReady(true); // 정적 페이지 — 마운트 즉시 ready
  // 공통 AppBar 사용 — Flutter 네이티브 AppBar 비활성화 (중복 헤더 방지)
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });


  const { logout } = useSessionAuth();
  const { toast } = useToast();
  const { settings } = useAppSettings();
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      // AuthContext logout()이 내부적으로 /login 으로 라우팅
      await logout();
    } catch {
      toast.error(MESSAGES.common.unknown);
      setIsLoggingOut(false);
    }
  };

  const S = MESSAGES.settings;
  const versionLabel = settings?.appVersion
    ? `${S.footer.brand} ${S.footer.versionPrefix}${settings.appVersion}`
    : S.footer.brand;

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title={S.title} forceNative />

      <main className="flex-1 overflow-y-auto bg-it-canvas dark:bg-puck pb-30">
        {/* SECTION 1: 계정 */}
        <SettingsSection title={S.sections.account} iceTheme>
          <SettingsRow
            icon="person"
            label={S.items.profile.label}
            sub={S.items.profile.sub}
            href="/settings/profile"
            iceTheme
          />
        </SettingsSection>

        {/* SECTION 2: 알림 */}
        <SettingsSection title={S.sections.notification} iceTheme>
          <SettingsRow
            icon="notifications"
            label={S.items.notification.label}
            sub={S.items.notification.sub}
            href="/notification-settings"
            iceTheme
          />
        </SettingsSection>

        {/* SECTION 3: 화면 */}
        <SettingsSection title={S.sections.display} iceTheme>
          <SettingsRow
            icon="palette"
            label={S.items.theme.label}
            sub={S.items.theme.sub}
            href="/settings/theme"
            iceTheme
          />
          <SettingsRow
            icon="accessibility_new"
            label={S.items.accessibility.label}
            sub={S.items.accessibility.sub}
            href="/settings/accessibility"
            iceTheme
          />
        </SettingsSection>

        {/* SECTION 4: 보안 */}
        <SettingsSection title={S.sections.security} iceTheme>
          <SettingsRow
            icon="shield"
            label={S.items.security.label}
            sub={S.items.security.sub}
            href="/security"
            iceTheme
          />
          <SettingsRow
            icon="block"
            label={S.items.block.label}
            sub={S.items.block.sub}
            href="/moderation/blocks"
            iceTheme
          />
        </SettingsSection>

        {/* SECTION 5: 개인정보 */}
        <SettingsSection title={S.sections.privacy} iceTheme>
          <SettingsRow
            icon="privacy_tip"
            label={S.items.privacyManage.label}
            sub={S.items.privacyManage.sub}
            href="/settings/privacy"
            iceTheme
          />
          {/* [복원 2026-06-04] 회원 탈퇴 — 앱 내 계정 삭제(Apple 5.1.1(v) / Google #9888076) */}
          <SettingsRow
            icon="person_remove"
            label={S.items.withdrawal.label}
            sub={S.items.withdrawal.sub}
            href="/withdrawal"
            iceTheme
          />
        </SettingsSection>

        {/* SECTION 6: 약관·정책 (앱 심사 Task 4 — 법무 문서 접근) */}
        <SettingsSection title={S.sections.legal} iceTheme>
          <SettingsRow
            icon="description"
            label={S.items.terms.label}
            sub={S.items.terms.sub}
            href="/terms?section=terms_of_service"
            iceTheme
          />
          <SettingsRow
            icon="policy"
            label={S.items.privacyPolicy.label}
            sub={S.items.privacyPolicy.sub}
            href="/terms?section=privacy_policy"
            iceTheme
          />
          <SettingsRow
            icon="receipt_long"
            label={S.items.refund.label}
            sub={S.items.refund.sub}
            href="/terms?section=refund"
            iceTheme
          />
        </SettingsSection>

        {/* Footer — 로그아웃 + 버전 */}
        <div className="px-5 pt-6 pb-8 flex flex-col gap-3.5">
          <button
            type="button"
            onClick={() => setIsLogoutOpen(true)}
            className="h-12 w-full inline-flex items-center justify-center gap-1.5 rounded-w-md bg-it-surface dark:bg-rink-800 border-[1.5px] border-it-line-strong dark:border-rink-700 text-card-body font-semibold text-it-ink-800 dark:text-rink-100 hover:bg-it-fill dark:hover:bg-rink-700/50 active:brightness-95 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-puck disabled:opacity-50"
            disabled={isLoggingOut}
            aria-label={MESSAGES.common.logoutConfirmButton}
          >
            <Icon name="logout" className="text-[16px]" aria-hidden="true" />
            {isLoggingOut
              ? S.footer.logoutInProgress
              : MESSAGES.common.logoutConfirmTitle}
          </button>
          <p className="text-center text-card-meta tabular-nums text-it-ink-400 dark:text-rink-300 font-num">
            {versionLabel}
          </p>
        </div>
      </main>

      <ConfirmDialog
        isOpen={isLogoutOpen}
        options={{
          title: MESSAGES.common.logoutConfirmTitle,
          message: MESSAGES.common.logoutConfirmMessage,
          confirmText: MESSAGES.common.logoutConfirmButton,
          cancelText: MESSAGES.common.cancel,
          variant: "warning",
          icon: "logout",
        }}
        onConfirm={() => {
          setIsLogoutOpen(false);
          void handleLogout();
        }}
        onCancel={() => setIsLogoutOpen(false)}
      />
    </MobileContainer>
  );
}
