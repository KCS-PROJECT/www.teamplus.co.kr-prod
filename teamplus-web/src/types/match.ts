/**
 * Match 도메인 타입 정의
 *
 * Phase 3 브릿지: NestJS PickupMatch DTO와 1:1 대응.
 * 백엔드 엔드포인트: /api/v1/matches
 */

// ============================================
// Enum / 상태 유니온 타입
// ============================================

/** 매치 진행 상태 (백엔드 PickupMatch.status와 동기화) */
export type MatchStatus = 'recruiting' | 'closing_soon' | 'closed' | 'cancelled';

/** 신청자 개별 상태 */
export type MatchApplicantStatus = 'pending' | 'approved' | 'rejected';

/** 신청자 결제 상태 */
export type MatchPaymentStatus = 'pending' | 'paid' | 'refunded';

/** 매치 포지션 */
export type MatchPosition = 'FW' | 'MF' | 'DF' | 'GK';

// ============================================
// 매치 상세 (GET /matches/:id)
// ============================================

/** 매치 주최자 요약 */
export interface MatchManager {
  id: string;
  name: string;
  profileImageUrl?: string | null;
}

/** 매치 상세 응답 (GET /matches/:id) */
export interface MatchDetail {
  id: string;
  managerId: string;
  title: string;
  scheduledAt: string; // ISO 8601 KST
  rinkName: string;
  rinkAddress?: string | null;
  rinkVenueInfo?: string | null;
  price: number;
  level: string;
  levelCode?: string | null;
  gender: string;
  maxParticipants: number;
  homeTeamName?: string | null;
  awayTeamName?: string | null;
  rules: string[];
  description?: string | null;
  status: MatchStatus;
  isFeatured: boolean;
  viewCount: number;
  cancelledAt?: string | null;
  cancelledReason?: string | null;
  updatedByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
  manager: MatchManager;
  /** 승인된 신청자 수 (선택적 — 상세 응답에만 포함될 수 있음) */
  approvedCount?: number;
  /** 대기 중 신청자 수 (선택적) */
  pendingCount?: number;
  /** 현재 참여 인원 (일부 응답에 포함) */
  currentParticipants?: number;
}

// ============================================
// 매치 목록 (GET /matches)
// ============================================

/** 매치 목록 아이템 (rules, description 제외) */
export interface MatchListItem extends Omit<MatchDetail, 'rules' | 'description'> {
  applicantCount?: number;
}

/** 매치 목록 쿼리 파라미터 */
export interface MatchListQuery {
  status?: MatchStatus;
  level?: string;
  gender?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
  limit?: number;
  search?: string;
}

/** 매치 목록 응답 */
export interface MatchListResponse {
  items: MatchListItem[];
  total: number;
  page: number;
  /** 백엔드에서 실제로 반환하는 페이지 크기 필드 */
  limit: number;
  /** @deprecated use `limit` — 백엔드 응답과 불일치로 2026-04-12 교체 */
  pageSize?: number;
}

// ============================================
// 신청자 (GET /matches/:id/applicants)
// ============================================

/** 신청자 상세 */
export interface MatchApplicant {
  id: string;
  matchId: string;
  userId: string;
  position?: MatchPosition | null;
  level?: string | null;
  paymentStatus: MatchPaymentStatus;
  status: MatchApplicantStatus;
  note?: string | null;
  rejectionReason?: string | null;
  rejectedAt?: string | null;
  refundedAt?: string | null;
  refundAmount?: number | null;
  appliedAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    profileImageUrl?: string | null;
  };
}

/** 신청자 목록 응답 */
export interface MatchApplicantsResponse {
  matchId: string;
  totalSlots: number;
  approvedCount: number;
  applicants: MatchApplicant[];
}

// ============================================
// 로스터 (GET /matches/:id/roster)
// ============================================

/** 로스터 참여자 엔트리 */
export interface MatchRosterEntry {
  applicantId: string;
  userId: string;
  name: string;
  profileImageUrl?: string | null;
  position?: MatchPosition | null;
  level?: string | null;
  isHost: boolean;
}

/** 로스터 참여자 (확정) */
export interface MatchRosterConfirmedPlayer {
  id: string;
  userId: string;
  name: string;
  position?: string | null;
  level?: string | null;
  isHost: boolean;
  order: number;
  appliedAt: string;
}

/** 로스터 대기자 */
export interface MatchRosterWaitlistPlayer {
  id: string;
  userId: string;
  name: string;
  position?: string | null;
  level?: string | null;
  waitNumber: number;
  appliedAt: string;
}

/** 로스터 응답 (GET /matches/:id/roster) */
export interface MatchRoster {
  matchId: string;
  matchTitle: string;
  totalSlots: number;
  currentCount: number;
  scheduledAt?: string;
  rinkName?: string;
  homeTeamName?: string | null;
  awayTeamName?: string | null;
  confirmedPlayers: MatchRosterConfirmedPlayer[];
  waitlistPlayers: MatchRosterWaitlistPlayer[];
}

// ============================================
// 요청 페이로드 (DTO)
// ============================================

/** 매치 생성 요청 (POST /matches) */
export interface CreateMatchPayload {
  title: string;
  scheduledAt: string; // ISO 8601
  rinkName: string;
  rinkAddress?: string;
  rinkVenueInfo?: string;
  price: number;
  level: string;
  levelCode?: string;
  gender?: string;
  maxParticipants: number;
  homeTeamName?: string;
  awayTeamName?: string;
  rules?: string[];
  description?: string;
}

/** 매치 수정 요청 (PATCH /matches/:id) */
export type UpdateMatchPayload = Partial<CreateMatchPayload>;

/** 매치 참가 신청 요청 (POST /matches/:id/apply) */
export interface ApplyMatchPayload {
  position?: MatchPosition;
  level?: string;
  note?: string;
}

/** 신청자 상태 변경 요청 (PATCH /matches/:id/applicants/:applicantId) */
export interface UpdateApplicantStatusPayload {
  status: 'approved' | 'rejected';
  rejectionReason?: string;
}

/** 일괄 거절 요청 (POST /matches/:id/applicants/bulk-reject) */
export interface BulkRejectApplicantsPayload {
  applicantIds: string[];
  rejectionReason: string;
}

/** 일괄 거절 응답 */
export interface BulkRejectResult {
  matchId: string;
  rejectedCount: number;
  skippedCount: number;
  reason: string;
}

/** 매치 취소 요청 (POST /matches/:id/cancel) */
export interface CancelMatchPayload {
  reason?: string;
}

/** 매치 취소 응답 */
export interface CancelMatchResult {
  id: string;
  status: 'cancelled';
  cancelledAt: string;
  cancelledReason?: string | null;
  refundedCount: number;
  notifiedCount: number;
}

/** 조회수 증가 응답 (POST /matches/:id/view) */
export interface IncrementViewResult {
  viewCount: number;
  incremented: boolean;
}
