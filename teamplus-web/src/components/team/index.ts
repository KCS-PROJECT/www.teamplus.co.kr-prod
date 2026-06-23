/**
 * Team 컴포넌트 Barrel Export
 *
 * 2026-04-12 재디자인으로 신규 추가된 공통 컴포넌트들을
 * `@/components/team` 한 경로로 임포트 가능하게 제공한다.
 */

export { TeamHeroBanner } from './TeamHeroBanner';
export type { TeamHeroBannerProps } from './TeamHeroBanner';

export { TeamSloganCard } from './TeamSloganCard';

export { TeamStatGrid, TeamStatCell } from './TeamStatGrid';
export type { TeamStatCellProps } from './TeamStatGrid';

export { TeamHistoryTimeline } from './TeamHistoryTimeline';

export { TeamCoachStaffRow } from './TeamCoachStaffRow';

export { TeamTabBar } from './TeamTabBar';
export type { TeamTab } from './TeamTabBar';

export { TeamFilterChip } from './TeamFilterChip';

export { TeamSearchBar } from './TeamSearchBar';

export { TeamListCard, resolveLogoColor } from './TeamListCard';

// Legacy (아직 일부 페이지에서 사용 중일 수 있어 유지)
export { TeamHeaderCard } from './TeamHeaderCard';
export { MemberCard } from './MemberCard';
export { CoachCard } from './CoachCard';
export { TeamScheduleCard } from './TeamScheduleCard';
export { TeamForm } from './TeamForm';
