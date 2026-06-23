"use client";

import { Icon } from "@/components/ui/Icon";
import { NavLink } from "@/components/ui/NavLink";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { useAppSettingsContext } from "@/contexts/AppSettingsContext";
import { useNativeUI } from "@/hooks/useNativeUI";
import { useState } from "react";
import { usePageReady } from '@/hooks/usePageReady';
import { resolveImageSrc } from "@/lib/image-url";

const ROLE_LABEL: Record<string, string> = {
  admin: "관리자",
  director: "감독",
  academy_director: "오픈클래스 감독",
  coach: "코치",
  parent: "학부모",
  teen: "선수",
  child: "선수",
};

export default function ProfileSettingsPage() {
  usePageReady(true); // 정적 페이지 — 마운트 즉시 ready
  const { user } = useSessionAuth();
  const { settings: appSettings } = useAppSettingsContext();
  const [pushEnabled, setPushEnabled] = useState(true);

  // 네이티브 AppBar 끄고 공통 컴포넌트 PageAppBar(forceNative) 사용
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });

  const displayName = user?.name ?? "";
  const displayEmail = user?.email ?? "";
  const roleLabel = user ? (ROLE_LABEL[user.userType] ?? "회원") : "회원";
  const appVersionLabel = appSettings?.appVersion
    ? `Version ${appSettings.appVersion}`
    : "";

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="마이페이지" showBack forceNative />

      <main className="flex-1 overflow-y-auto hide-scrollbar bg-wbg dark:bg-puck">
        {/* Profile Info */}
        <section className="px-5 py-8 flex flex-col items-center">
          <div className="w-24 h-24 rounded-w-pill bg-wbg dark:bg-rink-700 overflow-hidden border-4 border-wsurface dark:border-rink-800 shadow-sh-2 relative">
            {(() => {
              const avatarSrc = resolveImageSrc(
                user?.avatarUrl,
                user?.updatedAt,
              );
              return avatarSrc ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={avatarSrc}
                  src={avatarSrc}
                  alt={`${displayName || "사용자"} 프로필`}
                  className="w-full h-full object-cover"
                />
              ) : null;
            })() || (
              <Icon
                name="person"
                className="text-wtext-4 dark:text-rink-300 w-full h-full p-4"
                aria-hidden="true"
              />
            )}

            <button
              type="button"
              className="absolute bottom-0 right-0 w-8 h-8 bg-ice-500 hover:bg-ice-600 active:bg-ice-700 text-white rounded-w-pill flex items-center justify-center shadow-sh-2 border-2 border-wsurface dark:border-rink-800"
              aria-label="프로필 사진 변경"
            >
              <Icon name="camera_alt" className="text-w-small" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-4 text-center">
            <h2 className="text-xl font-semibold text-wtext-1 dark:text-white">
              {displayName ? `${displayName}님` : ""}
            </h2>
            <span className="inline-block px-2 py-0.5 mt-1 bg-wbg dark:bg-rink-700 rounded text-w-caption font-bold text-wtext-3 dark:text-rink-200">
              {roleLabel}
            </span>
            {displayEmail && (
              <p className="text-w-small text-wtext-3 dark:text-rink-300 mt-1">
                {displayEmail}
              </p>
            )}
          </div>
        </section>

        {/* Settings Menu */}
        <section className="px-4 space-y-4">
          <h3 className="px-1 text-w-small font-bold text-wtext-3 dark:text-rink-300">
            계정 설정
          </h3>

          <div className="bg-wsurface dark:bg-rink-800 rounded-w-xl overflow-hidden border border-wline-2 dark:border-rink-700 shadow-sh-1">
            <NavLink href="/profile/edit">
              <div className="w-full flex items-center justify-between px-4 py-3 min-h-[48px] border-b border-wline-2 dark:border-rink-700 last:border-0 hover:bg-wbg dark:hover:bg-rink-700/50 transition-colors motion-reduce:transition-none">
                <div className="flex items-center gap-3">
                  <Icon
                    name="person_outline"
                    className="text-wtext-4 dark:text-rink-300"
                    aria-hidden="true"
                  />
                  <span className="text-w-small font-medium text-wtext-1 dark:text-rink-100">
                    회원 정보 수정
                  </span>
                </div>
                <Icon
                  name="chevron_right"
                  className="text-wtext-4 dark:text-rink-400"
                  aria-hidden="true"
                />
              </div>
            </NavLink>

            <div className="w-full flex items-center justify-between px-4 py-3 min-h-[48px] border-b border-wline-2 dark:border-rink-700 last:border-0">
              <div className="flex items-center gap-3">
                <Icon
                  name="notifications_none"
                  className="text-wtext-4 dark:text-rink-300"
                  aria-hidden="true"
                />
                <span className="text-w-small font-medium text-wtext-1 dark:text-rink-100">
                  알림 설정
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={pushEnabled}
                  onChange={() => setPushEnabled(!pushEnabled)}
                  aria-label="알림 사용"
                />
                <div
                  className={`w-11 h-6 bg-wbg rounded-w-pill peer dark:bg-rink-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-wline-2 after:border after:rounded-w-pill after:h-5 after:w-5 after:transition-all motion-reduce:transition-none peer-checked:bg-ice-500`}
                />
              </label>
            </div>

            <NavLink href="/profile/password">
              <div className="w-full flex items-center justify-between px-4 py-3 min-h-[48px] hover:bg-wbg dark:hover:bg-rink-700/50 transition-colors motion-reduce:transition-none border-b border-wline-2 dark:border-rink-700 last:border-0">
                <div className="flex items-center gap-3">
                  <Icon
                    name="lock_outline"
                    className="text-wtext-4 dark:text-rink-300"
                    aria-hidden="true"
                  />
                  <span className="text-w-small font-medium text-wtext-1 dark:text-rink-100">
                    비밀번호 변경
                  </span>
                </div>
                <Icon
                  name="chevron_right"
                  className="text-wtext-4 dark:text-rink-400"
                  aria-hidden="true"
                />
              </div>
            </NavLink>
          </div>

          <h3 className="px-1 text-w-small font-bold text-wtext-3 dark:text-rink-300 pt-2">
            앱 설정
          </h3>

          <div className="bg-wsurface dark:bg-rink-800 rounded-w-xl overflow-hidden border border-wline-2 dark:border-rink-700 shadow-sh-1">
            <NavLink href="/terms">
              <div className="w-full flex items-center justify-between px-4 py-3 min-h-[48px] border-b border-wline-2 dark:border-rink-700 last:border-0 hover:bg-wbg dark:hover:bg-rink-700/50 transition-colors motion-reduce:transition-none">
                <div className="flex items-center gap-3">
                  <Icon
                    name="description"
                    className="text-wtext-4 dark:text-rink-300"
                    aria-hidden="true"
                  />
                  <span className="text-w-small font-medium text-wtext-1 dark:text-rink-100">
                    이용약관
                  </span>
                </div>
                <Icon
                  name="chevron_right"
                  className="text-wtext-4 dark:text-rink-400"
                  aria-hidden="true"
                />
              </div>
            </NavLink>

            <NavLink href="/settings/theme">
              <div className="w-full flex items-center justify-between px-4 py-3 min-h-[48px] border-b border-wline-2 dark:border-rink-700 last:border-0 hover:bg-wbg dark:hover:bg-rink-700/50 transition-colors motion-reduce:transition-none">
                <div className="flex items-center gap-3">
                  <Icon
                    name="palette"
                    className="text-wtext-4 dark:text-rink-300"
                    aria-hidden="true"
                  />
                  <span className="text-w-small font-medium text-wtext-1 dark:text-rink-100">
                    테마 설정
                  </span>
                </div>
                <Icon
                  name="chevron_right"
                  className="text-wtext-4 dark:text-rink-400"
                  aria-hidden="true"
                />
              </div>
            </NavLink>
          </div>

          <div className="pt-6 flex flex-col items-center gap-4">
            <button
              type="button"
              className="h-10 px-6 text-red-600 dark:text-red-400 text-w-small font-medium hover:bg-red-50 dark:hover:bg-red-900/20 rounded-w-md transition-colors motion-reduce:transition-none"
            >
              로그아웃
            </button>
            {appVersionLabel && (
              <p className="text-w-caption text-wtext-4 dark:text-rink-400">
                {appVersionLabel}
              </p>
            )}
          </div>
        </section>
      </main>
    </MobileContainer>
  );
}
