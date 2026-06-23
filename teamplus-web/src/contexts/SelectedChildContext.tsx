'use client';

/**
 * SelectedChildContext — 학부모 자녀 선택 전역 스코프 (단일 자녀 모델 · '전체' 없음).
 *
 * UX 결정: 항상 한 자녀가 선택된 상태.
 *  - 로그인·새로고침 등 세션 시작 시 항상 첫 번째 자녀(useChildren 출생연도 오름차순 → 가장 나이 많은
 *    자녀)를 기본 선택. (2026-06-17 사용자 직접 지시 — 마지막 선택 자녀 localStorage 복원 제거)
 *  - 앱 내 탐색 중에는 사용자가 선택한 자녀를 React state 로 보존(Provider 가 루트라 라우트 전환에도 유지).
 *  - 자녀 0명이면 selectedChildId=null (빈 상태).
 *  - 칩 데이터(selectableChildren)는 useChildren() 에서 가져와 검증.
 *
 * 백엔드 폴백("childId 없으면 모든 자녀")은 안전망으로 보존하되, 학부모 화면은 항상 childId 전송.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { useChildren } from '@/hooks/useChildren';

// 로그아웃 정리 유틸 re-export — 호출부 호환(AuthContext 는 lib 모듈에서 직접 import).
export {
  clearSelectedChildStorage,
  selectedChildStorageKey,
} from '@/lib/selected-child-storage';

interface SelectedChildState {
  /** null = 자녀 0명(빈 상태)에서만. 그 외 항상 특정 자녀. */
  selectedChildId: string | null;
  setSelectedChildId: (id: string) => void;
}

const SelectedChildContext = createContext<SelectedChildState | null>(null);

export function SelectedChildProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { selectableChildren } = useChildren();

  const userId = user?.id ?? null;
  const [selectedChildId, setSelectedChildIdState] = useState<string | null>(null);

  // 선택 대상 자녀 ID 목록 — 검증·폴백 판정용(무소속 포함, pending/rejected 제외).
  //  drawer·대시보드 칩과 동일 기준(useChildren.selectableChildren). 첫 번째는 정렬 기준 고정.
  const selectableIds = useMemo(
    () => selectableChildren.map((c) => c.id),
    [selectableChildren],
  );

  // 검증·기본 선택 — userId 또는 선택 대상 자녀 목록 변동 시 재평가.
  //  · 자녀 0명 → null (빈 상태)
  //  · 세션 내 현재 선택이 유효 → 유지 (앱 내 탐색 중 사용자 선택 보존)
  //  · 그 외(로그인·새로고침 등 세션 시작) → 항상 첫 번째 자녀 = 나이 많은 순(출생연도 오름차순) 기본 선택
  //
  // [2026-06-17 사용자 직접 지시] 로그인 시 마지막 선택 자녀(localStorage) 복원 제거.
  //   기존: 저장값 복원 → 로그아웃 후 재로그인 시 직전 선택(예: 강길동)이 기본이 되는 회귀.
  //   변경: 항상 selectableIds[0](useChildren 가 출생연도 오름차순 정렬 → 가장 나이 많은 자녀) 기본 선택.
  useEffect(() => {
    if (!userId) {
      setSelectedChildIdState(null);
      return;
    }
    if (selectableIds.length === 0) {
      setSelectedChildIdState(null);
      return;
    }
    setSelectedChildIdState((prev) => {
      if (prev && selectableIds.includes(prev)) return prev;
      return selectableIds[0];
    });
  }, [userId, selectableIds]);

  const setSelectedChildId = useCallback((id: string) => {
    setSelectedChildIdState(id);
  }, []);

  const value = useMemo<SelectedChildState>(
    () => ({ selectedChildId, setSelectedChildId }),
    [selectedChildId, setSelectedChildId],
  );

  return (
    <SelectedChildContext.Provider value={value}>
      {children}
    </SelectedChildContext.Provider>
  );
}

export function useSelectedChild(): SelectedChildState {
  const ctx = useContext(SelectedChildContext);
  if (!ctx) {
    throw new Error('useSelectedChild must be used within a SelectedChildProvider');
  }
  return ctx;
}
