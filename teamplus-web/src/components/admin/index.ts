/**
 * TEAMPLUS Admin 공통 컴포넌트
 *
 * admin 관리 페이지에서 반복적으로 사용되는 UI 패턴을 컴포넌트화.
 * 모든 컴포넌트는 TEAMPLUS 디자인 시스템을 준수합니다.
 *
 * @example
 * import {
 *   AdminStatusBadge,
 *   AdminFilterChips,
 *   AdminEmptyState,
 *   AdminLoadingState,
 *   AdminListSummary,
 *   AdminFloatingAction,
 *   AdminSearchBar,
 *   AdminStatGrid,
 *   AdminActionBar,
 *   AdminCardActions,
 * } from '@/components/admin';
 *
 * Note: AdminPageHeader 는 PageAppBar 통합 (2026-05-07) 시 제거되었습니다.
 *       관리자 페이지 헤더는 `import { PageAppBar } from '@/components/layout/PageAppBar'` 사용.
 */

export { AdminStatusBadge } from './AdminStatusBadge';
export type { BadgeVariant } from './AdminStatusBadge';
export { AdminFilterChips } from './AdminFilterChips';
export type { FilterChip } from './AdminFilterChips';
export { AdminEmptyState } from './AdminEmptyState';
export { AdminLoadingState } from './AdminLoadingState';
export { AdminListSummary } from './AdminListSummary';
export { AdminFloatingAction } from './AdminFloatingAction';
export { AdminSearchBar } from './AdminSearchBar';
export { AdminStatGrid } from './AdminStatGrid';
export type { StatItem } from './AdminStatGrid';
export { AdminActionBar } from './AdminActionBar';
export type { ActionButton } from './AdminActionBar';
export { AdminCardActions } from './AdminCardActions';
export type { CardAction } from './AdminCardActions';
