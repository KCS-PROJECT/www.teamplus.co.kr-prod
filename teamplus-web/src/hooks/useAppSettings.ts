'use client';

import { useEffect, useState } from 'react';
import { fetchAppSettings, AppSettings } from '@/services/app-settings';

interface UseAppSettingsReturn {
  settings: AppSettings | null;
  isLoading: boolean;
  isMaintenanceMode: boolean;
  isSignupEnabled: boolean;
  isSocialLoginEnabled: boolean;
}

/**
 * 앱 설정 조회 훅 (useState + useEffect 기반)
 *
 * 참고: AppSettingsContext 가 있으면 `useAppSettingsContext()` 사용을 권장합니다.
 * 이 훅은 Context 외부 또는 Context 미사용 위치에서 독립적으로 사용할 때 쓰세요.
 */
export function useAppSettings(): UseAppSettingsReturn {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  return {
    settings,
    isLoading,
    isMaintenanceMode: settings?.maintenanceMode ?? false,
    isSignupEnabled: settings?.signupEnabled ?? true,
    isSocialLoginEnabled: settings?.socialLoginEnabled ?? true,
  };
}
