// Teen (10세 이상 학생) 공통 컴포넌트
// 학생 역할 페이지에서 반복되는 UI 패턴을 컴포넌트로 분리

// 레이아웃 & 구조
export { AnimatedSection } from './AnimatedSection';
export { SubPageHeader } from './SubPageHeader';

// 상태 표시
export { EmptyState } from './EmptyState';
export { ErrorState } from './ErrorState';
export { ProgressBar } from './ProgressBar';

// 수업 & 출석
export { NextClassCard } from './NextClassCard';
export { WeeklyStreak } from './WeeklyStreak';
export type { WeekDay } from './WeeklyStreak';

// 배지 & 랭킹
export { BadgeCard } from './BadgeCard';
export type { BadgeData } from './BadgeCard';
export { RankingItem } from './RankingItem';
export { MyRankingSummary } from './MyRankingSummary';

// 준비물
export { ChecklistItem } from './ChecklistItem';
export type { ChecklistItemData } from './ChecklistItem';
