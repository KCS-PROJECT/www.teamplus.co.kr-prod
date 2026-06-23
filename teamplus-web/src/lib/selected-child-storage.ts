/**
 * 학부모 선택 자녀 영속 — userId 스코프 localStorage 키 + 순수 read/write/clear.
 *  React Context(SelectedChildContext)와 AuthContext(로그아웃 정리)가 공유하므로
 *  순환 import 를 피하기 위해 hook/context 비의존 순수 모듈로 분리.
 */

import { devWarn } from '@/lib/logger';

const PREFIX = 'teamplus_selected_child:';

/** userId 스코프 영속 키 — 사용자별로 마지막 선택 자녀를 분리 저장. */
export function selectedChildStorageKey(userId: string): string {
  return `${PREFIX}${userId}`;
}

export function readSelectedChild(userId: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(selectedChildStorageKey(userId));
  } catch (err) {
    devWarn('[SelectedChild] localStorage read failed:', err);
    return null;
  }
}

export function writeSelectedChild(userId: string, childId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(selectedChildStorageKey(userId), childId);
  } catch (err) {
    devWarn('[SelectedChild] localStorage write failed:', err);
  }
}

/**
 * 로그아웃 시 선택 자녀 영속값 정리. AuthContext.logout 에서 호출.
 *  userId 미상이면 prefix 매칭으로 전체 스코프 키를 제거(잔여 방지).
 */
export function clearSelectedChildStorage(userId?: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (userId) {
      window.localStorage.removeItem(selectedChildStorageKey(userId));
      return;
    }
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(PREFIX)) keys.push(key);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch (err) {
    devWarn('[SelectedChild] localStorage clear failed:', err);
  }
}
