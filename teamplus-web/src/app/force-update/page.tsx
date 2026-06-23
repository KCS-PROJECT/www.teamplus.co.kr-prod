"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useAppSettingsContext } from "@/contexts/AppSettingsContext";
import { isNativeApp } from "@/lib/environment";
import { ui } from "@/services/native-bridge";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { useFullscreen } from "@/hooks/useNativeUI";
import { usePageReady } from "@/hooks/usePageReady";

/**
 * ForceUpdatePage - 강제 업데이트 안내 gate
 * Route: /force-update
 *
 * AppSettingsContext가 감지한 버전 미달 상황에서 이 경로로 리다이렉트된다.
 * - 웹 단독: 새로고침 안내
 * - 앱 내부: native getAppVersion()으로 현재 버전 확인 + 스토어 이동
 */
export default function ForceUpdatePage() {
  const { settings } = useAppSettingsContext();
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [platform, setPlatform] = useState<"ios" | "android" | "web">("web");
  // SSR/CSR hydration mismatch 방지 — settings 의존 값은 client 마운트 후로 미룬다.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useFullscreen();
  usePageReady(currentVersion !== null); // app version 조회 완료 시 ready

  useEffect(() => {
    if (isNativeApp()) {
      void ui.getAppVersion().then((result) => {
        if (result) {
          setCurrentVersion(result.version);
          setPlatform(result.platform);
        }
      });
    } else {
      setCurrentVersion(process.env.NEXT_PUBLIC_APP_VERSION ?? "—");
      setPlatform("web");
    }
  }, []);

  const requiredVersion =
    platform === "ios"
      ? (settings?.minimumAppVersionIos ?? "—")
      : (settings?.minimumAppVersionAnd ?? "—");

  const message =
    settings?.forceUpdateMessage ??
    "원활한 서비스 이용을 위해 최신 버전으로 업데이트해주세요.";

  const handleUpdate = () => {
    if (isNativeApp()) {
      // 네이티브 환경: 추후 스토어 URL 브릿지 필요 — 현재는 로드 새로고침으로 폴백
      if (typeof window !== "undefined") window.location.reload();
    } else {
      if (typeof window !== "undefined") window.location.reload();
    }
  };

  return (
    <MobileContainer hasBottomNav={false} className="bg-white dark:bg-rink-900">
      <main className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="w-20 h-20 rounded-w-pill bg-ice-500/10 dark:bg-ice-500/20 flex items-center justify-center mb-6">
          <Icon name="system_update" className="text-5xl text-ice-500" />
        </div>

        <h1 className="text-2xl font-bold text-wtext-1 dark:text-white mb-3 text-center">
          업데이트가 필요해요
        </h1>

        <p className="text-w-small text-wtext-2 dark:text-rink-100 text-center max-w-xs mb-8 leading-relaxed whitespace-pre-wrap">
          {message}
        </p>

        <div className="w-full max-w-xs rounded-xl bg-wbg dark:bg-rink-800 p-4 mb-6">
          <div className="flex items-center justify-between py-1">
            <span className="text-w-caption text-wtext-3 dark:text-rink-300">
              현재 버전
            </span>
            <span className="text-w-small font-mono font-semibold text-wtext-1 dark:text-white">
              v{currentVersion ?? "—"}
            </span>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-w-caption text-wtext-3 dark:text-rink-300">
              필요 버전
            </span>
            <span className="text-w-small font-mono font-semibold text-ice-500">
              v{requiredVersion}
            </span>
          </div>
        </div>

        <button
          onClick={handleUpdate}
          className="w-full max-w-xs h-12 rounded-xl bg-ice-500 hover:bg-ice-700 text-white text-w-small font-bold transition-colors motion-reduce:transition-none"
        >
          {isNativeApp() ? "스토어에서 업데이트" : "새로고침"}
        </button>

        <p className="mt-6 text-[11px] text-wtext-3 dark:text-rink-300 text-center">
          문제가 계속되면{" "}
          {mounted
            ? (settings?.supportEmail ?? "support@teamplus.com")
            : "support@teamplus.com"}
          로 연락해주세요.
        </p>
      </main>
    </MobileContainer>
  );
}
