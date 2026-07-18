'use client';

import {
  createContext,
  useContext,
  useEffect,
  ReactNode,
  useRef,
  useCallback,
  useState,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { fetchAppSettings, AppSettings } from '@/services/app-settings';
import { isBelowMinimum } from '@/lib/version';
import { isNativeApp } from '@/lib/environment';

interface AppSettingsContextValue {
  settings: AppSettings | null;
  isLoading: boolean;
  refresh: () => void;
}

const AppSettingsContext = createContext<AppSettingsContextValue>({
  settings: null,
  isLoading: true,
  refresh: () => {},
});

// 버전 체크 제외 경로 (force-update 페이지 자체 + 진입 화면)
// AppUpdatePrompt(소프트 업데이트 팝업)도 동일 제외 목록을 공유한다.
export const VERSION_CHECK_EXEMPT_PATHS = [
  '/force-update',
  '/splash',
  '/onboarding',
];

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const versionCheckedRef = useRef(false);

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await fetchAppSettings();
      setSettings(result);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const result = await fetchAppSettings();
        if (mounted) setSettings(result);
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // ── Sprint 5: 강제 업데이트 체크 ───
  // settings 로드 완료 시 1회만 실행. 미들웨어와 충돌 없이 client-side redirect.
  useEffect(() => {
    if (isLoading || !settings) return;
    if (versionCheckedRef.current) return;

    // 제외 경로는 체크 skip (force-update 페이지 자체, splash 등)
    if (VERSION_CHECK_EXEMPT_PATHS.some((p) => pathname?.startsWith(p))) {
      return;
    }

    versionCheckedRef.current = true;

    const checkVersion = async () => {
      try {
        if (isNativeApp()) {
          // native 앱은 여기서 강제 업데이트 게이트를 걸지 않는다 (Bridge RPC 중복 호출 방지).
          // ⚠️ 2026-07-16 실측: Flutter 쪽 버전 체크(AppVersionService/AppUpdateDialog)는 정의만
          //    있고 어디서도 호출되지 않아 native 강제 업데이트 게이트는 현재 미배선 상태다.
          //    소프트 업데이트 유도는 AppUpdatePrompt(전역 컨펌 팝업)가 담당한다.
          return;
        }

        // 웹은 android 기준 사용 (기본) — ios 분기는 native 전담 경로로 이미 처리됨.
        const currentVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? null;
        if (!currentVersion) return;

        const required = settings.minimumAppVersionAnd;
        if (!required) return;

        if (isBelowMinimum(currentVersion, required)) {
          router.replace('/force-update');
        }
      } catch {
        // 체크 실패 시 gate 강제 안 함 (사용자 이탈 방지)
      }
    };

    void checkVersion();
  }, [settings, isLoading, pathname, router]);

  return (
    <AppSettingsContext.Provider value={{ settings, isLoading, refresh: () => void load() }}>
      {children}
    </AppSettingsContext.Provider>
  );
}

export const useAppSettingsContext = () => useContext(AppSettingsContext);
