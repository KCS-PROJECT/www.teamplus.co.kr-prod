// 오픈클래스 감독(ACADEMY_DIRECTOR) 전용 일정 페이지.
// director-schedules 의 페이지 컴포넌트를 그대로 재사용 — 컴포넌트 내부
// usePathname() 기반 isAcademyMode 분기로 다음을 자동 적용한다.
//   1) useCalendar({ clubFetchStrategy: 'academy-only' })  — 팀 fetch 완전 스킵
//   2) ACADEMY_CATEGORY_TABS (전체/오픈클래스/대회) 노출 — 정규 탭 제거
// usePageReady 신호는 원본 director-schedules 페이지에서 발생.
export { default } from '@/app/(director)/director-schedules/page';
