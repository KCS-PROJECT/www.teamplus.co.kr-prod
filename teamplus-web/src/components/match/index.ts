/**
 * 매치(픽업 매치) 도메인 공통 컴포넌트.
 *
 * 모든 컴포넌트는 AI 스타일(gradient/blur) 금지 원칙을 준수하고,
 * Primary #1E3FAE · 포지션별 의미 컬러 · WCAG AA 대비율을 따릅니다.
 */
export { MatchStatusBadge, type MatchStatus } from './MatchStatusBadge';
export { MatchProgressBar } from './MatchProgressBar';
export { MatchPositionChip, type MatchPosition } from './MatchPositionChip';
export { MatchInfoRow } from './MatchInfoRow';
export { MatchStatGrid } from './MatchStatGrid';
export { MatchSegmentedTabs, type MatchTab } from './MatchSegmentedTabs';
export { MatchFilterChip } from './MatchFilterChip';
export { MatchCard, type MatchCardData } from './MatchCard';
export { MatchHeroCard, type TeamInfo } from './MatchHeroCard';
export {
  MatchParticipantRow,
  type MatchParticipantRowData,
} from './MatchParticipantRow';
export {
  MatchApplicantRow,
  type MatchApplicantRowData,
  type ApplicantStatus,
} from './MatchApplicantRow';
export { MatchPositionPicker } from './MatchPositionPicker';

// Phase 2-B 추가 공통 컴포넌트 (2026-04-12)
export {
  MatchCreateForm,
  type MatchFormValues,
  type LevelType as MatchLevelType,
  type GenderType as MatchGenderType,
  type LevelCodeType as MatchLevelCodeType,
} from './MatchCreateForm';
export { MatchStepIndicator, type MatchStep } from './MatchStepIndicator';
export { MatchVSCard } from './MatchVSCard';
export { MatchPaymentSummary } from './MatchPaymentSummary';
export { MatchRejectDialog } from './MatchRejectDialog';
export { MatchBulkActionBar } from './MatchBulkActionBar';

// Phase 7 Repair Loop 추가 (2026-04-12)
export { MatchErrorState } from './MatchErrorState';
