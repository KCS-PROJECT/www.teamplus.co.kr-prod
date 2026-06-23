'use client';

/**
 * 오픈클래스 수업 관리 페이지 (P2 — 2026-05-13).
 *
 * ClassManagePage 와 동일 컴포넌트를 사용한다 (코드 중복 방지).
 * 컴포넌트 내부의 `isAcademyMode` 가 `usePathname()` 기준으로 URL prefix 를 판정하므로
 * 본 페이지로 진입한 경우 자동으로 오픈클래스 수업 fetch 분기로 동작한다.
 * usePageReady 신호는 ClassManagePage 내부에서 발생.
 *
 * @check-usePageReady-skip — 래퍼 re-export. 실제 usePageReady 호출은 ClassManagePage 내부.
 *
 * 관련 라우팅:
 *   - DASHBOARD_PATHS.academy_director = '/academy-director'
 *   - academyDirectorNavItems "수업" → '/academy-classes'
 *   - 오픈클래스 감독이 /classes-manage 진입 시 안전망 redirect → '/academy-classes'
 */

import ClassManagePage from '../classes-manage/page';

export default function AcademyClassesPage() {
  return <ClassManagePage />;
}
