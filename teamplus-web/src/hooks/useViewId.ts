/**
 * useViewId — 현재 화면/컴포넌트의 viewId 를 apiClient 에 등록
 *
 * 목적: API 호출이 어느 화면/컴포넌트에서 발생했는지 서버 로그에 기록.
 * 자동 fallback(`pathname` 기반)으로 페이지 단위까지는 추적 가능하지만,
 * 컴포넌트 단위 정확한 식별이 필요하면 본 훅을 사용해 수동 등록.
 *
 * 사용 예 (page):
 *   useViewId('teamplus-web/src/app/(coach)/classes-manage/page.tsx');
 *
 * 사용 예 (컴포넌트):
 *   useViewId('teamplus-web/src/components/classes/PackageEditSheet.tsx');
 *
 * mount 시 setCurrentViewId 호출, unmount 시 null 로 복원 (스택 보존을 위해
 * 이전 값을 기억해 복귀 — 부모 페이지 viewId 가 다시 활성화됨).
 *
 * SoT: docs/Guides/CLAUDE_OPERATIONS.md (v8.7 2026-05-23 신규)
 */
"use client";

import { useEffect } from "react";
import {
  setCurrentViewId,
  getCurrentViewId,
} from "@/services/api-client";

/**
 * @param viewId 프로젝트 루트 기준 파일 경로 (예: `teamplus-web/src/.../File.tsx`)
 */
export function useViewId(viewId: string): void {
  useEffect(() => {
    const previous = getCurrentViewId();
    setCurrentViewId(viewId);
    return () => {
      // 부모/이전 화면의 viewId 로 복귀 — 모달이나 자식 컴포넌트가 unmount 되어도
      // 페이지의 viewId 가 다시 활성화되도록 스택형 동작.
      setCurrentViewId(previous);
    };
  }, [viewId]);
}
