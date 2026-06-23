// ─── Director 공통 컴포넌트 ─────────────────────────
// 감독(Director) 역할 페이지에서 공통으로 사용되는 UI 컴포넌트

// 레이아웃 & 네비게이션
// Note: DirectorPageHeader 는 PageAppBar 통합 (2026-05-07) 시 제거되었습니다.
//       감독 페이지 헤더는 `<PageAppBar showBack={false} showMenu={false} title="..." />` 사용.
export { TabBar } from './TabBar';
export type { TabItem } from './TabBar';

// 상태 표시
export { AnimatedSection } from './AnimatedSection';
export { EmptySection } from './EmptySection';
export { ErrorState } from './ErrorState';

// 대회 관련
export { TournamentCard, mapTournamentFromApi } from './TournamentCard';
export type { TournamentItem, TournamentStatus } from './TournamentCard';
export { MatchCard, MatchScheduleCard, TEAM_COLORS } from './MatchCard';
export type { MatchData, ParticipatingTeam } from './MatchCard';
export { TeamRankingRow } from './TeamRankingRow';

// 일정 관련
export { ScheduleItem } from './ScheduleItem';
export type { ScheduleData } from './ScheduleItem';

// 정보 표시
export { InfoRow } from './InfoRow';

// 인터랙션
export { ActionSheet } from './ActionSheet';
export type { ActionSheetItem } from './ActionSheet';
