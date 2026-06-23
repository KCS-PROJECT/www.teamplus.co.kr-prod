/**
 * TEAMPLUS Coach Components
 *
 * 코치(COACH) 역할 페이지에서 공통으로 사용하는 UI 컴포넌트 모음.
 * 7개 코치 페이지(dashboard, members, schedules, attendance, classes-manage,
 * classes-organize, profile-edit)에서 반복되는 패턴을 추출하여 생성.
 *
 * 사용 예시:
 * ```tsx
 * import {
 *   CoachSearchInput,
 *   CoachFilterTabs,
 *   CoachMemberCard,
 *   CoachEmptyState,
 *   CoachLoadingSpinner,
 * } from '@/components/coach';
 * ```
 */

// 검색 입력 필드
export { CoachSearchInput } from './CoachSearchInput';
export type { CoachSearchInputProps } from './CoachSearchInput';

// 필터 탭
export { CoachFilterTabs } from './CoachFilterTabs';
export type { CoachFilterTabsProps, FilterTabItem } from './CoachFilterTabs';

// 회원 카드
export { CoachMemberCard } from './CoachMemberCard';
export type { CoachMemberCardProps } from './CoachMemberCard';

// 수업 카드
export { CoachClassCard } from './CoachClassCard';
export type { CoachClassCardProps } from './CoachClassCard';

// 통계 카드
export { CoachStatCard } from './CoachStatCard';
export type { CoachStatCardProps } from './CoachStatCard';

// 출석률 바
export { CoachAttendanceBar } from './CoachAttendanceBar';
export type { CoachAttendanceBarProps } from './CoachAttendanceBar';

// 빈 상태 표시
export { CoachEmptyState } from './CoachEmptyState';
export type { CoachEmptyStateProps } from './CoachEmptyState';

// 로딩 스피너
export { CoachLoadingSpinner } from './CoachLoadingSpinner';
export type { CoachLoadingSpinnerProps } from './CoachLoadingSpinner';

// 에러 상태 (전체 화면)
export { CoachErrorState } from './CoachErrorState';
export type { CoachErrorStateProps } from './CoachErrorState';

// 애니메이션 섹션 래퍼
export { CoachAnimatedSection } from './CoachAnimatedSection';
export type { CoachAnimatedSectionProps } from './CoachAnimatedSection';
