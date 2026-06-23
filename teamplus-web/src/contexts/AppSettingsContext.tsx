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
const VERSION_CHECK_EXEMPT_PATHS = [
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
          // ⚡ native 앱 Splash(_checkAppVersion in splash_screen.dart:117)에서 force-update 체크 완료.
          //    Bridge RPC(ui.getAppVersion) 중복 호출 방지 — 첫 진입 50-100ms 단축.
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
