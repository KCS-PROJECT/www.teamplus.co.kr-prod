import { api } from './api-client';

export interface AppSettings {
  id: string;
  // 앱 기본 정보
  appName: string;
  appVersion: string;
  apiUrl: string;
  // 고객 지원
  supportEmail: string;
  supportPhone: string | null;
  // 시스템 모드
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
  debugMode: boolean;
  // 서버 설정
  maxUploadSize: number;
  sessionTimeout: number;
  // 앱 버전 관리
  minimumAppVersionIos: string;
  minimumAppVersionAnd: string;
  forceUpdateMessage: string | null;
  // 회원/인증
  signupEnabled: boolean;
  socialLoginEnabled: boolean;
  maxLoginAttempts: number;
  // 결제권/QR
  creditExpireDays: number;
  qrExpireMinutes: number;
  // 약관 버전
  termsVersion: string;
  privacyVersion: string;
}

let cachedSettings: AppSettings | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5분

export async function fetchAppSettings(): Promise<AppSettings | null> {
  // 캐시 히트
  if (cachedSettings && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedSettings;
  }
  const res = await api.get<AppSettings>('/app/settings');
  if (res.success && res.data) {
    cachedSettings = res.data;
    cacheTimestamp = Date.now();
    return res.data;
  }
  return null;
}

export function invalidateAppSettingsCache() {
  cachedSettings = null;
  cacheTimestamp = 0;
}
