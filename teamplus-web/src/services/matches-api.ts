/**
 * Matches API 서비스
 *
 * 백엔드 /api/v1/matches 엔드포인트와 통신하는 함수 모음.
 * 모든 함수는 `apiRequest`를 경유하여 자동으로 토큰을 첨부하고
 * 환경(Web/Native)에 따라 올바른 통신 경로를 선택합니다.
 *
 * Phase 2-A에서 추가된 엔드포인트:
 *   PATCH  /matches/:id                        — 매치 수정
 *   POST   /matches/:id/applicants/bulk-reject  — 일괄 거절
 *   POST   /matches/:id/view                    — 조회수 증가
 *   POST   /matches/:id/cancel                  — 매치 취소 + 환불
 */

import { apiRequest } from '@/services/api-client';
import type {
  MatchDetail,
  MatchListQuery,
  MatchListResponse,
  CreateMatchPayload,
  UpdateMatchPayload,
  ApplyMatchPayload,
  MatchApplicant,
  MatchApplicantsResponse,
  MatchRoster,
  UpdateApplicantStatusPayload,
  BulkRejectApplicantsPayload,
  BulkRejectResult,
  CancelMatchPayload,
  CancelMatchResult,
  IncrementViewResult,
} from '@/types/match';

// ============================================
// 매치 목록 / 상세
// ============================================

/**
 * 매치 목록 조회.
 * @param query 필터 및 페이지네이션 파라미터
 */
export async function fetchMatches(query?: MatchListQuery): Promise<MatchListResponse> {
  const params = new URLSearchParams();
  if (query?.status) params.set('status', query.status);
  if (query?.level) params.set('level', query.level);
  if (query?.gender) params.set('gender', query.gender);
  if (query?.dateFrom) params.set('dateFrom', query.dateFrom);
  if (query?.dateTo) params.set('dateTo', query.dateTo);
  if (query?.page != null) params.set('page', String(query.page));
  if (query?.pageSize != null) params.set('pageSize', String(query.pageSize));
  if (query?.limit != null) params.set('limit', String(query.limit));
  if (query?.search) params.set('search', query.search);

  const qs = params.toString();
  const url = `/matches${qs ? `?${qs}` : ''}`;

  const res = await apiRequest<MatchListResponse>({
    method: 'GET',
    url,
    retry: false,
  });
  if (!res.success || !res.data) {
    throw new Error(res.error?.message ?? '매치 목록을 불러오지 못했습니다.');
  }
  return res.data;
}

/**
 * 내가 주최하거나 참가 신청한 매치 목록 조회.
 */
export async function fetchMyMatches(): Promise<MatchListResponse> {
  const res = await apiRequest<MatchListResponse>({
    method: 'GET',
    url: '/matches/my',
    retry: false,
  });
  if (!res.success || !res.data) {
    throw new Error(res.error?.message ?? '내 매치 목록을 불러오지 못했습니다.');
  }
  return res.data;
}

/**
 * 매치 상세 조회.
 * @param id 매치 ID
 */
export async function fetchMatchDetail(id: string): Promise<MatchDetail> {
  const res = await apiRequest<MatchDetail>({
    method: 'GET',
    url: `/matches/${id}`,
    retry: false,
  });
  if (!res.success || !res.data) {
    throw new Error(res.error?.message ?? '매치 정보를 불러오지 못했습니다.');
  }
  return res.data;
}

// ============================================
// 매치 생성 / 수정 / 취소
// ============================================

/**
 * 매치 생성.
 * @param payload 생성 데이터
 */
export async function createMatch(payload: CreateMatchPayload): Promise<MatchDetail> {
  const res = await apiRequest<MatchDetail>({
    method: 'POST',
    url: '/matches',
    data: payload,
    retry: false,
  });
  if (!res.success || !res.data) {
    throw new Error(res.error?.message ?? '매치를 생성하지 못했습니다.');
  }
  return res.data;
}

/**
 * 매치 수정 (PATCH /matches/:id).
 * UpdatePickupMatchDto = PartialType(CreatePickupMatchDto) — 모든 필드 선택적.
 * @param id 매치 ID
 * @param payload 수정할 필드만 포함
 */
export async function updateMatch(id: string, payload: UpdateMatchPayload): Promise<MatchDetail> {
  const res = await apiRequest<MatchDetail>({
    method: 'PATCH',
    url: `/matches/${id}`,
    data: payload,
    retry: false,
  });
  if (!res.success || !res.data) {
    throw new Error(res.error?.message ?? '매치를 수정하지 못했습니다.');
  }
  return res.data;
}

/**
 * 매치 취소 + 환불 (POST /matches/:id/cancel).
 * DELETE /matches/:id 레거시 대신 이 엔드포인트를 권장합니다.
 * @param id 매치 ID
 * @param payload 취소 사유 (선택)
 */
export async function cancelMatch(id: string, payload?: CancelMatchPayload): Promise<CancelMatchResult> {
  const res = await apiRequest<CancelMatchResult>({
    method: 'POST',
    url: `/matches/${id}/cancel`,
    data: payload ?? {},
    retry: false,
  });
  if (!res.success || !res.data) {
    throw new Error(res.error?.message ?? '매치를 취소하지 못했습니다.');
  }
  return res.data;
}

// ============================================
// 신청 (참가 신청 / 취소)
// ============================================

/**
 * 매치 참가 신청 (POST /matches/:id/apply).
 * @param id 매치 ID
 * @param payload 포지션, 레벨, 메모
 */
export async function applyToMatch(id: string, payload: ApplyMatchPayload): Promise<unknown> {
  const res = await apiRequest<unknown>({
    method: 'POST',
    url: `/matches/${id}/apply`,
    data: payload,
    retry: false,
  });
  if (!res.success) {
    throw new Error(res.error?.message ?? '매치 신청에 실패했습니다.');
  }
  return res.data;
}

/**
 * 매치 참가 취소 (DELETE /matches/:id/apply 또는 /matches/:id/leave).
 * @param id 매치 ID
 */
export async function leaveMatch(id: string): Promise<void> {
  const res = await apiRequest<unknown>({
    method: 'DELETE',
    url: `/matches/${id}/leave`,
    retry: false,
  });
  if (!res.success) {
    throw new Error(res.error?.message ?? '매치 참가 취소에 실패했습니다.');
  }
}

// ============================================
// 신청자 관리
// ============================================

/**
 * 신청자 목록 조회 (GET /matches/:id/applicants).
 * @param id 매치 ID
 */
export async function fetchMatchApplicants(id: string): Promise<MatchApplicantsResponse> {
  const res = await apiRequest<MatchApplicantsResponse>({
    method: 'GET',
    url: `/matches/${id}/applicants`,
    retry: false,
  });
  if (!res.success || !res.data) {
    throw new Error(res.error?.message ?? '신청자 목록을 불러오지 못했습니다.');
  }

  // 방어 처리: applicants가 배열이 아닌 경우 빈 배열 보장
  const data = res.data;
  return {
    ...data,
    applicants: Array.isArray(data.applicants) ? data.applicants : [],
  };
}

/**
 * 신청자 상태 변경 (PATCH /matches/:id/applicants/:applicantId).
 * @param matchId 매치 ID
 * @param applicantId 신청자 ID
 * @param payload 상태 및 거절 사유
 */
export async function updateApplicantStatus(
  matchId: string,
  applicantId: string,
  payload: UpdateApplicantStatusPayload
): Promise<MatchApplicant> {
  const res = await apiRequest<MatchApplicant>({
    method: 'PATCH',
    url: `/matches/${matchId}/applicants/${applicantId}`,
    data: payload,
    retry: false,
  });
  if (!res.success || !res.data) {
    throw new Error(res.error?.message ?? '신청자 상태를 변경하지 못했습니다.');
  }
  return res.data;
}

/**
 * 신청자 일괄 거절 (POST /matches/:id/applicants/bulk-reject).
 * Phase 2-A 신규 엔드포인트 — PATCH 반복 호출 대신 사용을 권장합니다.
 * @param matchId 매치 ID
 * @param payload 거절할 신청자 ID 목록과 사유
 */
export async function bulkRejectApplicants(
  matchId: string,
  payload: BulkRejectApplicantsPayload
): Promise<BulkRejectResult> {
  const res = await apiRequest<BulkRejectResult>({
    method: 'POST',
    url: `/matches/${matchId}/applicants/bulk-reject`,
    data: payload,
    retry: false,
  });
  if (!res.success || !res.data) {
    throw new Error(res.error?.message ?? '일괄 거절에 실패했습니다.');
  }
  return res.data;
}

// ============================================
// 로스터
// ============================================

/**
 * 확정 참가자 명단 조회 (GET /matches/:id/roster).
 * @param id 매치 ID
 */
export async function fetchMatchRoster(id: string): Promise<MatchRoster> {
  const res = await apiRequest<MatchRoster>({
    method: 'GET',
    url: `/matches/${id}/roster`,
    retry: false,
  });
  if (!res.success || !res.data) {
    throw new Error(res.error?.message ?? '참여 명단을 불러오지 못했습니다.');
  }
  return res.data;
}

// ============================================
// 조회수
// ============================================

/**
 * 매치 조회수 증가 (POST /matches/:id/view).
 * OptionalJwtAuthGuard — 비로그인도 허용, 로그인은 1일 1회 제한.
 * best-effort 호출: 실패해도 사용자에게 영향 없음.
 * @param id 매치 ID
 */
export async function incrementMatchView(id: string): Promise<IncrementViewResult> {
  const res = await apiRequest<IncrementViewResult>({
    method: 'POST',
    url: `/matches/${id}/view`,
    retry: false,
  });
  if (!res.success || !res.data) {
    throw new Error(res.error?.message ?? '조회수 업데이트에 실패했습니다.');
  }
  return res.data;
}
