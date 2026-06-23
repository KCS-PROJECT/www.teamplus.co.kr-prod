'use client';

import { useEffect, useState } from 'react';
import { useAppSettingsContext } from '@/contexts/AppSettingsContext';

export default function MaintenanceBanner() {
  const { settings, isLoading } = useAppSettingsContext();
  // SSR/CSR hydration mismatch 방지 — 점검 배너는 mount 후에만 평가.
  // 서버는 settings 미캐싱 가정 (= 배너 미표시) 이지만 모듈 캐시가 어긋날 수 있어 강제 결정적 렌더.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || isLoading || !settings?.maintenanceMode) return null;

  const message = settings.maintenanceMessage || '시스템 점검 중입니다. 잠시 후 다시 이용해주세요.';

  return (
    <div className="bg-amber-500 text-white px-4 py-3 text-center text-sm font-medium">
      <span className="mr-2">⚠️</span>
      {message}
    </div>
  );
}
