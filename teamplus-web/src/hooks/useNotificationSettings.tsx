"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  NotificationSettings,
  DEFAULT_NOTIFICATION_SETTINGS,
} from "@/types/notification";
import { api } from "@/services/api-client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { MESSAGES } from "@/lib/messages";

/**
 * 알림 수신 설정 훅 — 서버 영속화 버전
 *
 * - 로그인 상태: GET /notifications/preferences/me → PATCH로 저장
 * - 비로그인: DEFAULT_NOTIFICATION_SETTINGS 반환, 변경은 로컬 state만(서버 호출 안 함)
 * - 저장은 500ms 디바운스 + optimistic update
 * - localStorage 사용 중지 (이전 버전의 teamplus_notification_settings 키는 레거시로 남지만 더 이상 읽지 않음)
 */

// 서버 응답 타입 (NotificationsService.getMyNotificationPreference)
interface ServerPreference {
  pushEnabled: boolean;
  smsEnabled: boolean;
  emailEnabled: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  categories: Record<string, boolean> | null;
  marketingConsent?: boolean;
  marketingConsentGrantAllowed?: boolean;
  marketingConsentTermsVersion?: string | null;
  updatedAt?: string;
}

interface ServerPatch {
  pushEnabled?: boolean;
  smsEnabled?: boolean;
  emailEnabled?: boolean;
  soundEnabled?: boolean;
  vibrationEnabled?: boolean;
  quietHoursEnabled?: boolean;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  categories?: Record<string, boolean>;
  marketingConsent?: boolean;
  marketingConsentTermsVersion?: string;
}

interface UseNotificationSettingsReturn {
  settings: NotificationSettings;
  isLoading: boolean;
  isSaving: boolean;
  marketingConsentGrantAllowed: boolean;
  marketingConsentTermsVersion: string | null;
  togglePush: () => void;
  toggleCategory: (category: keyof NotificationSettings["categories"]) => void;
  toggleSound: () => void;
  toggleVibration: () => void;
  toggleQuietHours: () => void;
  setQuietHoursStart: (time: string) => void;
  setQuietHoursEnd: (time: string) => void;
  resetSettings: () => void;
  isQuietTime: () => boolean;
  canNotify: (category?: keyof NotificationSettings["categories"]) => boolean;
}

// ─── 변환기: 서버 shape ↔ 클라이언트 NotificationSettings ─────
function fromServer(server: ServerPreference): NotificationSettings {
  const cats = server.categories ?? {};
  const marketingConsent = server.marketingConsent ?? cats.marketing ?? false;
  return {
    pushEnabled: server.pushEnabled,
    categories: {
      class: cats.class ?? true,
      payment: cats.payment ?? true,
      notice: cats.notice ?? true,
      system: cats.system ?? true,
      // User.marketingConsent가 법적 SoT이며 categories.marketing은 호환 미러다.
      marketing: marketingConsent,
    },
    soundEnabled: server.soundEnabled,
    vibrationEnabled: server.vibrationEnabled,
    quietHours: {
      enabled: server.quietHoursEnabled,
      startTime: server.quietHoursStart ?? "22:00",
      endTime: server.quietHoursEnd ?? "08:00",
    },
  };
}

// 변경분을 서버 patch 포맷으로 변환 (변경된 필드만)
function toServerPatch(
  prev: NotificationSettings,
  next: NotificationSettings,
  marketingConsentTermsVersion: string | null,
): ServerPatch {
  const patch: ServerPatch = {};
  if (prev.pushEnabled !== next.pushEnabled)
    patch.pushEnabled = next.pushEnabled;
  if (prev.soundEnabled !== next.soundEnabled)
    patch.soundEnabled = next.soundEnabled;
  if (prev.vibrationEnabled !== next.vibrationEnabled)
    patch.vibrationEnabled = next.vibrationEnabled;
  if (prev.quietHours.enabled !== next.quietHours.enabled) {
    patch.quietHoursEnabled = next.quietHours.enabled;
  }
  if (prev.quietHours.startTime !== next.quietHours.startTime) {
    patch.quietHoursStart = next.quietHours.startTime;
  }
  if (prev.quietHours.endTime !== next.quietHours.endTime) {
    patch.quietHoursEnd = next.quietHours.endTime;
  }
  const catsChanged =
    prev.categories.class !== next.categories.class ||
    prev.categories.payment !== next.categories.payment ||
    prev.categories.notice !== next.categories.notice ||
    prev.categories.system !== next.categories.system ||
    prev.categories.marketing !== next.categories.marketing;
  if (catsChanged) {
    patch.categories = {
      class: next.categories.class,
      payment: next.categories.payment,
      notice: next.categories.notice,
      system: next.categories.system,
      marketing: next.categories.marketing,
    };
  }
  if (prev.categories.marketing !== next.categories.marketing) {
    patch.marketingConsent = next.categories.marketing;
    if (next.categories.marketing && marketingConsentTermsVersion) {
      patch.marketingConsentTermsVersion = marketingConsentTermsVersion;
    }
  }
  return patch;
}

export function useNotificationSettings(): UseNotificationSettingsReturn {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState<NotificationSettings>(
    DEFAULT_NOTIFICATION_SETTINGS,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [marketingConsentGrantAllowed, setMarketingConsentGrantAllowed] =
    useState(false);
  const [marketingConsentTermsVersion, setMarketingConsentTermsVersion] =
    useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPatchRef = useRef<ServerPatch>({});
  const currentSettingsRef = useRef<NotificationSettings>(
    DEFAULT_NOTIFICATION_SETTINGS,
  );
  const confirmedSettingsRef = useRef<NotificationSettings>(
    DEFAULT_NOTIFICATION_SETTINGS,
  );
  const isSavingRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // 서버에서 로드
  useEffect(() => {
    if (!isAuthenticated) {
      // 비로그인 시 기본값 유지, 로딩 종료
      currentSettingsRef.current = DEFAULT_NOTIFICATION_SETTINGS;
      confirmedSettingsRef.current = DEFAULT_NOTIFICATION_SETTINGS;
      setSettings(DEFAULT_NOTIFICATION_SETTINGS);
      setMarketingConsentGrantAllowed(false);
      setMarketingConsentTermsVersion(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      const res = await api.get<ServerPreference>(
        "/notifications/preferences/me",
      );
      if (cancelled) return;
      if (res.success && res.data) {
        const confirmed = fromServer(res.data);
        currentSettingsRef.current = confirmed;
        confirmedSettingsRef.current = confirmed;
        setSettings(confirmed);
        setMarketingConsentGrantAllowed(
          res.data.marketingConsentGrantAllowed ?? true,
        );
        setMarketingConsentTermsVersion(
          res.data.marketingConsentTermsVersion ?? null,
        );
      }
      // 실패 시 기본값 유지 (토스트는 페이지 레벨에서 처리)
      setIsLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // 서버 저장 (디바운스) — 응답의 전체 preference를 다음 rollback snapshot으로 확정한다.
  const flushToServer = useCallback(async () => {
    if (!isAuthenticated || isSavingRef.current) return;
    const patch = pendingPatchRef.current;
    if (Object.keys(patch).length === 0) return;
    pendingPatchRef.current = {};

    const rollbackSnapshot = confirmedSettingsRef.current;
    isSavingRef.current = true;
    if (isMountedRef.current) setIsSaving(true);

    try {
      const res = await api.patch<ServerPreference>(
        "/notifications/preferences/me",
        patch,
      );
      if (!res.success || !res.data) {
        throw new Error(res.error?.message ?? MESSAGES.notification.saveFailed);
      }

      const confirmed = fromServer(res.data);
      currentSettingsRef.current = confirmed;
      confirmedSettingsRef.current = confirmed;
      if (isMountedRef.current) {
        setSettings(confirmed);
        setMarketingConsentGrantAllowed(
          res.data.marketingConsentGrantAllowed ??
            marketingConsentGrantAllowed,
        );
        setMarketingConsentTermsVersion(
          res.data.marketingConsentTermsVersion ?? null,
        );
      }
    } catch {
      pendingPatchRef.current = {};
      if (isMountedRef.current) {
        currentSettingsRef.current = rollbackSnapshot;
        setSettings(rollbackSnapshot);
        toast.error(MESSAGES.notification.saveFailed);
      }
    } finally {
      isSavingRef.current = false;
      if (isMountedRef.current) setIsSaving(false);
    }
  }, [isAuthenticated, marketingConsentGrantAllowed, toast]);

  const applyChange = useCallback(
    (updater: (prev: NotificationSettings) => NotificationSettings) => {
      if (isSavingRef.current) return;
      const prev = currentSettingsRef.current;
      const next = updater(prev);
      const patch = toServerPatch(
        prev,
        next,
        marketingConsentTermsVersion,
      );
      currentSettingsRef.current = next;
      // 누적 병합 (여러 토글 연속 호출 대응)
      pendingPatchRef.current = { ...pendingPatchRef.current, ...patch };
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        void flushToServer();
      }, 500);
      setSettings(next);
    },
    [flushToServer, marketingConsentTermsVersion],
  );

  // 언마운트 시 남은 변경사항은 UI 갱신 없이 최종 전송한다.
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      const patch = pendingPatchRef.current;
      if (isAuthenticated && Object.keys(patch).length > 0) {
        pendingPatchRef.current = {};
        void api.patch("/notifications/preferences/me", patch);
      }
    };
  }, [isAuthenticated]);

  const togglePush = useCallback(() => {
    applyChange((prev) => ({ ...prev, pushEnabled: !prev.pushEnabled }));
  }, [applyChange]);

  const toggleCategory = useCallback(
    (category: keyof NotificationSettings["categories"]) => {
      applyChange((prev) => ({
        ...prev,
        categories: {
          ...prev.categories,
          [category]: !prev.categories[category],
        },
      }));
    },
    [applyChange],
  );

  const toggleSound = useCallback(() => {
    applyChange((prev) => ({ ...prev, soundEnabled: !prev.soundEnabled }));
  }, [applyChange]);

  const toggleVibration = useCallback(() => {
    applyChange((prev) => ({
      ...prev,
      vibrationEnabled: !prev.vibrationEnabled,
    }));
  }, [applyChange]);

  const toggleQuietHours = useCallback(() => {
    applyChange((prev) => ({
      ...prev,
      quietHours: { ...prev.quietHours, enabled: !prev.quietHours.enabled },
    }));
  }, [applyChange]);

  const setQuietHoursStart = useCallback(
    (time: string) => {
      applyChange((prev) => ({
        ...prev,
        quietHours: { ...prev.quietHours, startTime: time },
      }));
    },
    [applyChange],
  );

  const setQuietHoursEnd = useCallback(
    (time: string) => {
      applyChange((prev) => ({
        ...prev,
        quietHours: { ...prev.quietHours, endTime: time },
      }));
    },
    [applyChange],
  );

  const resetSettings = useCallback(() => {
    applyChange((prev) => ({
      ...DEFAULT_NOTIFICATION_SETTINGS,
      // 법적 동의와 숨긴 레거시 필드는 일반 설정 초기화로 변경하지 않는다.
      categories: {
        ...DEFAULT_NOTIFICATION_SETTINGS.categories,
        marketing: prev.categories.marketing,
      },
      soundEnabled: prev.soundEnabled,
      vibrationEnabled: prev.vibrationEnabled,
    }));
  }, [applyChange]);

  const isQuietTime = useCallback((): boolean => {
    if (!settings.quietHours.enabled) return false;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [startHour, startMin] = settings.quietHours.startTime
      .split(":")
      .map(Number);
    const [endHour, endMin] = settings.quietHours.endTime
      .split(":")
      .map(Number);

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }, [settings.quietHours]);

  const canNotify = useCallback(
    (category?: keyof NotificationSettings["categories"]): boolean => {
      if (!settings.pushEnabled) return false;
      if (isQuietTime()) return false;
      if (category && !settings.categories[category]) return false;
      return true;
    },
    [settings, isQuietTime],
  );

  return {
    settings,
    isLoading,
    isSaving,
    marketingConsentGrantAllowed,
    marketingConsentTermsVersion,
    togglePush,
    toggleCategory,
    toggleSound,
    toggleVibration,
    toggleQuietHours,
    setQuietHoursStart,
    setQuietHoursEnd,
    resetSettings,
    isQuietTime,
    canNotify,
  };
}

export default useNotificationSettings;
