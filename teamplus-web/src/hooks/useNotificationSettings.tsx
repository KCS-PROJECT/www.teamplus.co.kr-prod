"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  NotificationSettings,
  DEFAULT_NOTIFICATION_SETTINGS,
} from "@/types/notification";
import { api } from "@/services/api-client";
import { useAuth } from "@/contexts/AuthContext";

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
}

interface UseNotificationSettingsReturn {
  settings: NotificationSettings;
  isLoading: boolean;
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
  return {
    pushEnabled: server.pushEnabled,
    categories: {
      class: cats.class ?? true,
      payment: cats.payment ?? true,
      notice: cats.notice ?? true,
      system: cats.system ?? true,
      marketing: cats.marketing ?? true,
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
  return patch;
}

export function useNotificationSettings(): UseNotificationSettingsReturn {
  const { isAuthenticated } = useAuth();
  const [settings, setSettings] = useState<NotificationSettings>(
    DEFAULT_NOTIFICATION_SETTINGS,
  );
  const [isLoading, setIsLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPatchRef = useRef<ServerPatch>({});

  // 서버에서 로드
  useEffect(() => {
    if (!isAuthenticated) {
      // 비로그인 시 기본값 유지, 로딩 종료
      setSettings(DEFAULT_NOTIFICATION_SETTINGS);
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
        setSettings(fromServer(res.data));
      }
      // 실패 시 기본값 유지 (토스트는 페이지 레벨에서 처리)
      setIsLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // 서버 저장 (디바운스)
  const flushToServer = useCallback(() => {
    if (!isAuthenticated) return;
    const patch = pendingPatchRef.current;
    if (Object.keys(patch).length === 0) return;
    pendingPatchRef.current = {};
    void api.patch("/notifications/preferences/me", patch);
  }, [isAuthenticated]);

  const applyChange = useCallback(
    (updater: (prev: NotificationSettings) => NotificationSettings) => {
      setSettings((prev) => {
        const next = updater(prev);
        const patch = toServerPatch(prev, next);
        // 누적 병합 (여러 토글 연속 호출 대응)
        pendingPatchRef.current = { ...pendingPatchRef.current, ...patch };
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(flushToServer, 500);
        return next;
      });
    },
    [flushToServer],
  );

  // 언마운트 시 남은 변경사항 flush
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        flushToServer();
      }
    };
  }, [flushToServer]);

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
    applyChange(() => DEFAULT_NOTIFICATION_SETTINGS);
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
