'use client';

/**
 * 오픈클래스 수업 등록 페이지 (P2 — 2026-05-13).
 *
 * ClassCreatePage 와 동일 컴포넌트를 사용한다 (코드 중복 방지).
 * 컴포넌트 내부의 `isAcademyMode` 가 `usePathname()` 기준 URL prefix 를 판정하므로
 * 본 페이지 진입 시 자동으로 오픈클래스 등록 분기로 동작 (academyId 자동 사용).
 * usePageReady 신호는 ClassCreatePage 내부에서 발생.
 *
 * @check-usePageReady-skip — 래퍼 re-export. 실제 usePageReady 호출은 ClassCreatePage 내부.
 *
 * 오픈클래스 감독이 /classes-manage/create 진입 시 안전망 redirect → '/academy-classes/create'.
 */

import ClassCreatePage from '../../classes-manage/create/page';

export default function AcademyClassesCreatePage() {
  return <ClassCreatePage />;
}
