/**
 * TEAMPLUS Parent Components
 *
 * 학부모(parent) 역할 페이지에서 공통으로 사용하는 컴포넌트 모음입니다.
 * 각 컴포넌트는 TEAMPLUS 디자인 시스템을 준수합니다.
 *
 * - 그라디언트/블러/컬러 그림자 사용 금지
 * - 다크모드(dark:) 완전 지원
 * - MESSAGES 상수 기반 텍스트 사용
 * - WCAG 2.1 AA 접근성 준수
 */

// 레이아웃 & 애니메이션
export { AnimatedSection } from './AnimatedSection';
export { BottomFixedButton } from './BottomFixedButton';
export { RefreshSpinner } from './RefreshSpinner';

// 상태 표시
export { ErrorState } from './ErrorState';
export { ErrorBanner } from './ErrorBanner';
export { EmptySection } from './EmptySection';
export { StatusBadge, STATUS_BADGE_CLASSES } from './StatusBadge';
export type { BadgeVariant } from './StatusBadge';

// 데이터 카드
export { ChildInfoCard } from './ChildInfoCard';
export { CreditBalanceCard } from './CreditBalanceCard';
export { WeeklyAttendanceGrid } from './WeeklyAttendanceGrid';
export type { AttendanceDay } from './WeeklyAttendanceGrid';

// 프로그레스 & 인디케이터
export { AttendanceProgressBar, getAttendanceColor } from './AttendanceProgressBar';
export { SwipeIndicator } from './SwipeIndicator';
export { ChildLevelProgress } from './ChildLevelProgress';
export type { ChildLevelProgressProps } from './ChildLevelProgress';
export { GrowthTrendChart } from './GrowthTrendChart';
export type { GrowthTrendChartProps, TrendDataPoint } from './GrowthTrendChart';

// 내비게이션 & 섹션
export { ParentSectionTitle } from './ParentSectionTitle';
export { TabSelector } from './TabSelector';
export type { TabItem } from './TabSelector';
