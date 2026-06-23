/**
 * TEAMPLUS Child Components
 *
 * 아동(4-7세, CHILD 역할) 전용 공통 UI 컴포넌트 모음.
 * 모든 컴포넌트는 WCAG AAA 기준을 준수합니다:
 * - 최소 터치 타겟: 72x72dp
 * - 색상 대비율: 7:1 이상
 * - 폰트 크기: 최소 18px (text-lg)
 * - 쉬운 한국어 텍스트
 */

// 레이아웃
// Note: ChildPageHeader 는 PageAppBar 통합 (2026-05-07) 시 제거되었습니다.
//       아동 헤더는 `<PageAppBar toneVariant="kid" />` 직접 사용.
export { ChildCard } from './ChildCard';
export { ChildBottomAction } from './ChildBottomAction';

// 인터랙션
export { ChildBigButton } from './ChildBigButton';
export { ChecklistItem } from './ChecklistItem';

// 표시
export { BadgeDisplay, RARITY_EMOJI } from './BadgeDisplay';
export { ChildProgressBar } from './ChildProgressBar';
export { ChildSectionTitle } from './ChildSectionTitle';
export { ChildEmptyState } from './ChildEmptyState';

// 애니메이션
export { AnimatedSection } from './AnimatedSection';

// 상태
export { ChildErrorState } from './ChildErrorState';
