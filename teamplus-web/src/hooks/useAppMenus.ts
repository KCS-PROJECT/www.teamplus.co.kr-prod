'use client';

import { useState, useEffect } from 'react';
import { api } from '@/services/api-client';

export type AppMenuUserType =
  | 'ADMIN'
  | 'DIRECTOR'
  | 'ACADEMY_DIRECTOR'
  | 'COACH'
  | 'PARENT'
  | 'TEEN'
  | 'CHILD';

export interface AppMenuTreeNode {
  id: string;
  userType: AppMenuUserType;
  label: string;
  /** Lucide icon name (kebab-case), e.g. "users", "calendar" */
  icon: string;
  href: string;
  order: number;
  isActive: boolean;
  parentId: string | null;
  children: AppMenuTreeNode[];
}

// ─── 모듈 레벨 캐시 (staleTime: 1h, gcTime: 2h) ─────────────────────────────
const STALE_MS = 3_600_000;
const GC_MS = 7_200_000;

interface CacheEntry {
  data: AppMenuTreeNode[];
  fetchedAt: number;
}

// cacheKey = `my:${userId}` — 사용자별 분리. 미로그인 또는 사용자 전환 시
// 이전 사용자 메뉴가 노출되는 레이스를 방지한다.
const menuCache = new Map<string, CacheEntry>();

function pruneCache(): void {
  const now = Date.now();
  for (const [key, entry] of menuCache) {
    if (now - entry.fetchedAt > GC_MS) menuCache.delete(key);
  }
}

/**
 * 앱 메뉴 캐시를 비운다.
 * - 인자 없음: 모든 사용자 캐시 제거 (로그아웃 시)
 * - userId 지정: 해당 사용자 캐시만 제거 (역할 전환 등)
 */
export function invalidateAppMenusCache(userId?: string): void {
  if (userId) {
    menuCache.delete(`my:${userId}`);
    return;
  }
  menuCache.clear();
}

// ─── 훅 ──────────────────────────────────────────────────────────────────────

/**
 * 로그인 사용자의 앱 메뉴를 조회한다.
 * @param userId 로그인 사용자 ID. undefined 면 fetch 하지 않는다.
 */
export function useAppMenus(userId: string | undefined): {
  data: AppMenuTreeNode[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
} {
  const [data, setData] = useState<AppMenuTreeNode[] | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(userId !== undefined);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!userId) {
      // 미로그인: 상태를 idle 로 초기화
      setData(undefined);
      setIsLoading(false);
      setIsError(false);
      setError(null);
      return;
    }

    let cancelled = false;
    pruneCache();

    const cacheKey = `my:${userId}`;
    const cached = menuCache.get(cacheKey);

    if (cached && Date.now() - cached.fetchedAt < STALE_MS) {
      setData(cached.data);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setIsError(false);
    setError(null);

    (async () => {
      try {
        const response = await api.get<AppMenuTreeNode[]>('/menus/my');
        if (cancelled) return;

        if (response.success && Array.isArray(response.data)) {
          menuCache.set(cacheKey, { data: response.data, fetchedAt: Date.now() });
          setData(response.data);
        } else {
          setData([]);
        }
        setIsLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error('메뉴 로드 실패'));
        setIsError(true);
        setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { data, isLoading, isError, error };
}

// ─── 어댑터 유틸 ─────────────────────────────────────────────────────────────

export interface AdaptedMenuGroupItem {
  href: string;
  icon: string;
  label: string;
  badge?: boolean;
}

export interface AdaptedMenuGroup {
  title: string;
  items: AdaptedMenuGroupItem[];
  iconColor?: 'primary' | 'gray';
}

/**
 * 서버 AppMenuTreeNode[] → menuGroups 호환 형태로 변환.
 * 최상위 노드 = 그룹 제목, children = 메뉴 항목.
 * 비활성 항목은 제외한다.
 */
export function adaptMenusToGroups(serverMenus: AppMenuTreeNode[]): AdaptedMenuGroup[] {
  return serverMenus
    .filter((node) => node.isActive && node.children.length > 0)
    .map((node) => ({
      title: node.label,
      iconColor: 'primary' as const,
      items: node.children
        .filter((child) => child.isActive)
        .map((child) => ({ href: child.href, icon: child.icon, label: child.label })),
    }));
}
