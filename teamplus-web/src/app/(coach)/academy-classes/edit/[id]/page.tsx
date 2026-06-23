'use client';

/**
 * 오픈클래스 수업 수정 페이지 (2026-05-15 신규).
 *
 * ClassCreatePage 와 동일 컴포넌트를 재사용한다 (코드 중복 방지).
 *  - 컴포넌트 내부 `isAcademyMode` 가 `usePathname()` 의 `/academy-classes` prefix 로 판정.
 *  - `editClassId` 는 `useParams().id` (동적 라우트) 로 잡힘 → isEditMode=true.
 *  - 따라서 본 페이지 진입 시 자동으로 "오픈클래스 수정" 분기로 동작한다.
 *  - usePageReady 신호는 ClassCreatePage 내부에서 발생.
 *
 * @check-usePageReady-skip — 래퍼 re-export. 실제 usePageReady 호출은 ClassCreatePage 내부.
 *
 * 수업 상세의 "수업 수정하기" 버튼이 academyId 수업이면 이 경로로 보낸다.
 */

import ClassCreatePage from '../../../classes-manage/create/page';

export default function AcademyClassEditPage() {
  return <ClassCreatePage />;
}
