"use client";

import { useCallback, useEffect, useState } from "react";

export type ViewAsRole = "parent" | "coach";

const STORAGE_KEY = "teamplus_current_view_as";
const CHANGE_EVENT = "teamplus:view-as-changed";

function readStorage(): ViewAsRole | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "parent" || raw === "coach") return raw;
  } catch {
    // localStorage 접근 불가 (private mode 등) — null 반환
  }
  return null;
}

function writeStorage(value: ViewAsRole) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: value }));
  } catch {
    // 저장 실패 무시 (quota·private mode)
  }
}

export interface UseRoleSwitchResult {
  currentViewAs: ViewAsRole | null;
  setViewAs: (role: ViewAsRole) => void;
  isReady: boolean;
}

/**
 * 겸직 사용자의 현재 보기 모드(parent/coach) 관리 훅
 *
 * - localStorage `teamplus_current_view_as` 영속화
 * - 전환 시 커스텀 이벤트 `teamplus:view-as-changed` 브로드캐스트
 * - 토큰 재발급 없음 — UI 모드만 전환
 */
export function useRoleSwitch(defaultRole?: ViewAsRole): UseRoleSwitchResult {
  const [currentViewAs, setCurrentViewAs] = useState<ViewAsRole | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const stored = readStorage();
    setCurrentViewAs(stored ?? defaultRole ?? null);
    setIsReady(true);

    const handleChange = (e: Event) => {
      const custom = e as CustomEvent<ViewAsRole>;
      if (custom.detail === "parent" || custom.detail === "coach") {
        setCurrentViewAs(custom.detail);
      }
    };

    window.addEventListener(CHANGE_EVENT, handleChange);
    return () => window.removeEventListener(CHANGE_EVENT, handleChange);
  }, [defaultRole]);

  const setViewAs = useCallback((role: ViewAsRole) => {
    writeStorage(role);
    setCurrentViewAs(role);
  }, []);

  return { currentViewAs, setViewAs, isReady };
}

export {
  STORAGE_KEY as VIEW_AS_STORAGE_KEY,
  CHANGE_EVENT as VIEW_AS_CHANGE_EVENT,
};
