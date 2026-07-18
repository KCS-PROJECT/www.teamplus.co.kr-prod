"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/Modal/ConfirmDialog";
import {
  useAppSettingsContext,
  VERSION_CHECK_EXEMPT_PATHS,
} from "@/contexts/AppSettingsContext";
import { fetchLatestAppVersion } from "@/services/app-settings";
import { getAppVersionInfo, navigation } from "@/services/native-bridge";
import { isNativeApp } from "@/lib/environment";
import { isBelowMinimum } from "@/lib/version";
import { MESSAGES } from "@/lib/messages";

/**
 * AppUpdatePrompt — 소프트 업데이트 유도 컨펌 팝업 (2026-07-16 신규).
 *
 * 앱(WebView) 최초 진입 시 네이티브 설치 버전(Bridge getAppVersionInfo → PackageInfo)과
 * 서버 공지 버전(appSettings.appVersion — 마이 footer 표시값과 동일 SoT)을 semver 비교하여:
 * - 동일하거나 설치본이 더 최신 → 아무것도 하지 않음
 * - 설치 버전이 낮음 → ConfirmDialog로 업데이트 유도, 확인 시 플랫폼별 스토어 이동
 *
 * 정책:
 * - native 전용 (웹 브라우저는 스토어 이동 대상이 아니므로 완전 제외)
 * - '나중에' 선택 시 세션당 1회 (sessionStorage에 서버 버전 기록, 앱 재시작 시 재안내)
 * - 강제 업데이트(minimumAppVersion) 하드 게이트와 별개인 소프트 안내 — 닫기 가능
 * - iOS는 서버 AppVersion.storeUrl 미등록 시 팝업 자체를 스킵 (미출시 상태에서 잘못된 링크 방지)
 *
 * 마운트: ClientProviders — GlobalEventPopup 옆 (auth 라우트는 구조상 제외됨).
 */

const DISMISSED_STORAGE_KEY = "teamplus:app-update-prompt:dismissed";

// Play 스토어 폴백 URL — 서버 AppVersion.storeUrl(android) 미등록 시 사용.
// applicationId 실측: teamplus-app/android/app/build.gradle.kts `kr.co.teamplus`.
const ANDROID_STORE_FALLBACK_URL =
  "https://play.google.com/store/apps/details?id=kr.co.teamplus";

interface UpdatePromptState {
  currentVersion: string;
  latestVersion: string;
  storeUrl: string;
}

function getDismissedVersion(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(DISMISSED_STORAGE_KEY);
  } catch {
    return null;
  }
}

function setDismissedVersion(version: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(DISMISSED_STORAGE_KEY, version);
  } catch {
    // storage 접근 불가 환경(프라이빗 모드 등) — 세션 내 재노출만 허용되는 것이므로 무시
  }
}

export function AppUpdatePrompt() {
  const pathname = usePathname();
  const { settings, isLoading } = useAppSettingsContext();
  const [prompt, setPrompt] = useState<UpdatePromptState | null>(null);
  // 조건(설정 로드 + 비제외 경로) 충족 후 1회만 검사 — 이후 라우팅 변경에는 반응하지 않음
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current) return;
    if (isLoading || !settings?.appVersion) return;
    // 제외 경로(/force-update, /splash, /onboarding)에서는 검사 유보 —
    // checkedRef 를 세우지 않으므로 본 화면 진입 시 이 effect 가 다시 검사한다.
    if (VERSION_CHECK_EXEMPT_PATHS.some((p) => pathname?.startsWith(p))) return;
    if (!isNativeApp()) return;

    checkedRef.current = true;
    const serverVersion = settings.appVersion;

    let cancelled = false;
    void (async () => {
      // 세션당 1회 — 이번 세션에 '나중에'를 선택했던 서버 버전이면 스킵
      if (getDismissedVersion() === serverVersion) return;

      const info = await getAppVersionInfo();
      if (cancelled || info.source !== "native" || !info.version) return;
      // 설치 버전이 서버 공지 버전보다 낮을 때만 (동일/설치본이 더 최신이면 조용히 통과)
      if (!isBelowMinimum(info.version, serverVersion)) return;

      const latest = await fetchLatestAppVersion();
      if (cancelled) return;
      const storeUrl =
        info.platform === "ios"
          ? latest?.iosStoreUrl
          : (latest?.androidStoreUrl ?? ANDROID_STORE_FALLBACK_URL);
      if (!storeUrl) return;

      setPrompt({
        currentVersion: info.version,
        latestVersion: serverVersion,
        storeUrl,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoading, settings, pathname]);

  if (!prompt) return null;

  const dismiss = () => {
    setDismissedVersion(prompt.latestVersion);
    setPrompt(null);
  };

  return (
    <ConfirmDialog
      isOpen
      options={{
        title: MESSAGES.appUpdate.title,
        message: MESSAGES.appUpdate.message(
          prompt.currentVersion,
          prompt.latestVersion,
        ),
        confirmText: MESSAGES.appUpdate.confirmText,
        cancelText: MESSAGES.appUpdate.cancelText,
        variant: "default",
      }}
      onConfirm={() => {
        void navigation.openExternal(prompt.storeUrl);
        dismiss();
      }}
      onCancel={dismiss}
    />
  );
}

export default AppUpdatePrompt;
