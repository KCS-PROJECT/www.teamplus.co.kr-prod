/**
 * Tournament & Match Service Layer
 *
 * Backend `/api/v1/tournaments` 엔드포인트 전체를 Web에서 호출하기 위한 API 함수 모음.
 * 모든 함수는 `ApiResponse<T>` 형태(`{ success, data, error }`)를 반환한다.
 *
 * 엔드포인트 매핑:
 *   GET    /tournaments                             - 대회 목록
 *   GET    /tournaments/:id                         - 대회 상세
 *   POST   /tournaments                             - 대회 생성 (DIRECTOR/ADMIN)
 *   PATCH  /tournaments/:id                         - 대회 수정 (DIRECTOR/ADMIN)
 *   DELETE /tournaments/:id                         - 대회 삭제 (ADMIN)
 *   PATCH  /tournaments/:id/status                  - 대회 상태 변경
 *   GET    /tournaments/:id/summary                 - 대회 요약 통계
 *   GET    /tournaments/matches/list                - 경기 목록
 *   GET    /tournaments/matches/:id                 - 경기 상세
 *   POST   /tournaments/matches                     - 경기 생성
 *   PATCH  /tournaments/matches/:id                 - 경기 수정 (DIRECTOR/COACH/ADMIN)
 *   DELETE /tournaments/matches/:id                 - 경기 삭제 (ADMIN)
 *   GET    /tournaments/matches/:id/participants    - 경기 참가 팀
 *   POST   /tournaments/matches/:matchId/participants/:teamId?side=home|away
 *   DELETE /tournaments/matches/:matchId/participants/:teamId
 *
 *   -- 신규 (MatchEvent / MatchPeriod / Live State) --
 *   PATCH  /tournaments/matches/:id/score           - 스코어 즉시 업데이트
 *   PATCH  /tournaments/matches/:id/live-state      - 경기 상태 전환
 *   GET    /tournaments/matches/:id/periods         - 피리어드 조회
 *   POST   /tournaments/matches/:id/periods         - 피리어드 upsert
 *   GET    /tournaments/matches/:id/events          - 이벤트 조회
 *   POST   /tournaments/matches/:id/events          - 이벤트 생성
 *   PATCH  /tournaments/matches/:id/events/:eventId - 이벤트 수정
 *   DELETE /tournaments/matches/:id/events/:eventId - 이벤트 삭제
 */

import { api } from '@/services/api-client';
import type { ApiResponse } from '@/types';
import type { PlayerTournamentStats } from '@/types/portfolio';

// ============================================
// Types
// ============================================

export type TournamentStatus =
  | 'scheduled'
  | 'ongoing'
  | 'finished'
  | 'cancelled';

export type MatchStatus =
  | 'scheduled'
  | 'warmup'
  | 'in_progress'
  | 'intermission'
  | 'completed'
  | 'postponed'
  | 'cancelled';

export type MatchEventType =
  | 'goal'
  | 'assist'
  | 'penalty'
  | 'shot'
  | 'save'
  | 'timeout'
  | 'period_start'
  | 'period_end';

export type PenaltyType =
  | 'minor'
  | 'major'
  | 'misconduct'
  | 'game_misconduct';

export type MatchRound = 'group' | 'quarter' | 'semi' | 'third' | 'final';

/**
 * 대회 결제 모드 — 백엔드 Tournament.billingMode 와 1:1.
 *  · PREPAID(선불): 참가 신청 시 토스 위젯으로 즉시 결제.
 *  · POSTPAID(후불): 신청만 받고, 대회 종료 후 감독이 1인당 금액을 일괄 청구.
 */
export type TournamentBillingMode = 'PREPAID' | 'POSTPAID';

/** 대회 목록 카드용 최소 DTO */
export interface TournamentListItem {
  id: string;
  name: string;
  description: string | null;
  clubId: string | null;
  teamId?: string | null;
  rinkId: string | null;
  startDate: string;
  endDate: string;
  status: TournamentStatus;
  eligibleBirthYearFrom: number | null;
  eligibleBirthYearTo: number | null;
  /** [추가 2026-06-16] 참가 자격 출생연도 개별 집합 — 비면 from/to 범위로 폴백.
   *  백엔드가 from/to 도 호환 파생해 함께 내려준다(레거시 표시/쿼리 호환). */
  eligibleBirthYears?: number[] | null;
  feePerGame: number | null;
  totalGames: number | null;
  feeType: 'PER_GAME' | 'TOTAL_FIXED' | null;
  /** [추가 2026-06-16] 결제 모드 — PREPAID(선불) | POSTPAID(후불). 미지정 시 PREPAID. */
  billingMode?: TournamentBillingMode | null;
  maxParticipants: number | null;
  registrationDeadline: string | null;
  /** [추가 2026-05-11] 참가 연령 그룹 (ALL/U8~U12) */
  ageGroup?: 'ALL' | 'U8' | 'U9' | 'U10' | 'U11' | 'U12' | null;
  /** [추가 2026-05-11] 사전 선택 선수 User.id 목록 */
  selectedParticipantIds?: string[] | null;
  /** [추가 2026-06-16] 내 자녀(또는 본인) 중 결제완료(PAID)한 참가자 id 목록 — 등록완료 표기·자녀별 필터용 */
  paidChildIds?: string[] | null;
  /** [추가 2026-06-17] 등록완료 표기용 — 후불(POSTPAID)은 신청 자녀(결제 전 포함), 선불은 결제완료만. */
  enrolledChildIds?: string[] | null;
  /** [추가 2026-06-05] 참가 자격 팀 하위그룹(TeamGroup) ID 목록 */
  eligibleGroupIds?: string[] | null;
  /** [추가 2026-05-15 T05-H · T03 협업] 대회 규정 (Text · 라인브레이크 보존). 선택. */
  rules?: string | null;
  /** [추가 2026-05-15 T05-H · T03 협업] 장소 상세 (String) — venue 풀텍스트. 선택.
   *  rink.location 보다 우선 표시. */
  location?: string | null;
  /** [추가 2026-05-15 T05-H · T03 협업] 우승/입상 상금 (Decimal · 원 단위).
   *  null 시 "미정" 표기. */
  prizeAmount?: number | string | null;
  /** [추가 2026-05-22] 개최 링크장 (Venue FK) */
  venueId?: string | null;
  venue?: { id: string; name: string } | null;
  createdAt: string;
  club: { id: string; clubName: string } | null;
  team?: { id: string; name: string } | null;
  rink: { id: string; name: string; location: string | null } | null;
  _count?: { matches: number; registrations: number };
}

/** 팀 뱃지용 미니 DTO */
export interface TeamBadge {
  id: string;
  name: string;
  shortName: string | null;
  logoUrl: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
}

/** 대회 상세 (matches 포함) */
export interface TournamentDetail extends TournamentListItem {
  matches: MatchSummary[];
  /** [추가 2026-06-15] 결제 완료(PAID)한 참가자 User.id 목록 — 결제 페이지 중복 결제 방지(선택 비활성화) */
  paidParticipantIds?: string[];
  /** [추가 2026-06-15] 결제 완료(PAID) 등록의 참가자→등록ID 매핑 — 결제 취소에 사용 */
  paidRegistrations?: Array<{ participantId: string; registrationId: string }>;
  /** [추가 2026-06-17] 요청자(학부모/학생) 자녀별 등록 상태 — 후불 결제내역·결제 버튼용.
   *  paymentStatus: UNPAID(후불 정산 전) · PENDING(정산 후 미결제/선불 결제대기) · PAID.
   *  후불결제 가능 = PENDING && orderNumber 존재. */
  myRegistrations?: Array<{
    participantId: string;
    registrationId: string;
    paymentStatus: 'UNPAID' | 'PENDING' | 'PAID' | string;
    amount: number;
    orderNumber: string | null;
  }>;
}

/** 경기 summary — 대진표 카드용 */
export interface MatchSummary {
  id: string;
  tournamentId: string | null;
  scheduledAt: string;
  startedAt: string | null;
  endedAt: string | null;
  homeScore: number;
  awayScore: number;
  status: MatchStatus;
  currentPeriod: number | null;
  round: MatchRound | null;
  matchOrder: number | null;
  /** [추가 2026-06-15] 일정별 참가비 (원) — null/0=무료 */
  fee?: number | string | null;
  refereeMain: string | null;
  homeClub: { id: string; clubName: string } | null;
  awayClub: { id: string; clubName: string } | null;
  homeTeam: TeamBadge | null;
  awayTeam: TeamBadge | null;
  /** [추가 2026-06-05] 상대팀 자유 텍스트 (awayTeam 미등록 시 직접 입력값) */
  opponentName?: string | null;
  rink: { id: string; name: string } | null;
  venue: { id: string; name: string } | null;
}

/** 경기 상세 (periods + events 포함) */
export interface MatchDetail extends MatchSummary {
  tournament: { id: string; name: string } | null;
  periods: MatchPeriodRecord[];
  events: MatchEventRecord[];
}

export interface MatchPeriodRecord {
  id: string;
  periodNumber: number;
  startedAt: string | null;
  endedAt: string | null;
  homeScore: number;
  awayScore: number;
  homePenaltyMinutes: number;
  awayPenaltyMinutes: number;
}

export interface MatchEventRecord {
  id: string;
  periodNumber: number;
  eventTime: string;
  eventType: MatchEventType;
  teamId?: string | null;
  penaltyType: PenaltyType | null;
  penaltyMinutes: number | null;
  description: string | null;
  isGameWinner: boolean;
  isPowerPlay: boolean;
  isShortHanded: boolean;
  createdAt?: string;
  player: {
    id: string;
    jerseyNumber: number | null;
    position: string | null;
    member: { playerName: string | null };
  } | null;
  assistPlayer1: {
    id: string;
    jerseyNumber: number | null;
    member: { playerName: string | null };
  } | null;
  assistPlayer2: {
    id: string;
    jerseyNumber: number | null;
    member: { playerName: string | null };
  } | null;
}

// ============================================
// Request DTO Types (Backend DTO와 1:1 매핑)
// ============================================

export interface CreateTournamentInput {
  name: string;
  description?: string;
  clubId?: string;
  teamId?: string;
  rinkId?: string;
  /** [추가 2026-05-22] 개최 링크장 ID (Venue FK) */
  venueId?: string;
  /** [2026-06-05] 대회장소 — 자유 텍스트 직접 입력 (venueId 대체). Tournament.location 매핑. */
  location?: string;
  startDate: string;
  endDate: string;
  status?: TournamentStatus;
  eligibleBirthYearFrom?: number;
  eligibleBirthYearTo?: number;
  /** [추가 2026-06-16] 참가 자격 출생연도 개별 집합 — 백엔드가 from/to 를 자동 파생한다.
   *  미전송(undefined) 시 update 에서 기존 배열 보존(보존 가드). */
  eligibleBirthYears?: number[];
  feePerGame?: number;
  totalGames?: number;
  feeType?: 'PER_GAME' | 'TOTAL_FIXED';
  /** [추가 2026-06-16] 결제 모드 — PREPAID(선불) | POSTPAID(후불). 미지정 시 PREPAID. */
  billingMode?: TournamentBillingMode;
  maxParticipants?: number;
  registrationDeadline?: string;
  /** [추가 2026-05-11] 참가 연령 그룹 — UI 우선 노출 (ALL = 전체) */
  ageGroup?: 'ALL' | 'U8' | 'U9' | 'U10' | 'U11' | 'U12';
  /** [추가 2026-05-11] 코치/감독이 사전 선택한 참가 선수 User.id 목록 */
  selectedParticipantIds?: string[];
  /** [추가 2026-06-05] 참가 자격 팀 하위그룹(TeamGroup) ID 목록 */
  eligibleGroupIds?: string[];
}

export type UpdateTournamentInput = Partial<CreateTournamentInput>;

export interface CreateMatchInput {
  tournamentId?: string;
  rinkId?: string;
  venueId?: string;
  homeClubId?: string;
  awayClubId?: string;
  homeTeamId?: string;
  awayTeamId?: string;
  /** [추가 2026-06-05] 상대팀 자유 텍스트 — 등록 팀 없이 직접 입력 */
  opponentName?: string;
  scheduledAt: string;
  round?: MatchRound;
  matchOrder?: number;
  /** [추가 2026-06-15] 일정별 참가비 (원) — null/0=무료 */
  fee?: number;
  refereeMain?: string;
  refereeLines?: string;
}

export type UpdateMatchInput = Partial<
  CreateMatchInput & {
    startedAt: string;
    endedAt: string;
    homeScore: number;
    awayScore: number;
    status: MatchStatus;
    currentPeriod: number;
  }
>;

export interface UpdateMatchScoreInput {
  homeScore: number;
  awayScore: number;
}

export interface UpdateMatchLiveStateInput {
  status: MatchStatus;
  currentPeriod?: number;
  startedAt?: string;
  endedAt?: string;
}

export interface UpsertMatchPeriodInput {
  periodNumber: number;
  startedAt?: string;
  endedAt?: string;
  homeScore?: number;
  awayScore?: number;
  homePenaltyMinutes?: number;
  awayPenaltyMinutes?: number;
}

export interface CreateMatchEventInput {
  periodNumber: number;
  /** MM:SS 형식 (예: "12:45") */
  eventTime: string;
  eventType: MatchEventType;
  teamId?: string;
  playerId?: string;
  assistPlayer1Id?: string;
  assistPlayer2Id?: string;
  penaltyType?: PenaltyType;
  penaltyMinutes?: number;
  description?: string;
  isGameWinner?: boolean;
  isPowerPlay?: boolean;
  isShortHanded?: boolean;
}

export type UpdateMatchEventInput = Partial<CreateMatchEventInput>;

// ============================================
// Tournament CRUD
// ============================================

export async function listTournaments(params?: {
  clubId?: string;
  /**
   * [추가 2026-06-16] 학부모 자녀 선택 스코프 — 선택 자녀의 PAID 대회등록 OR
   *  selectedParticipantIds 포함 대회만 반환(백엔드 calendar.fetchTournaments 와 동일 기준).
   *  미전송 시 기존 동작(전체 자녀 통합 폴백). null/undefined 면 쿼리에서 생략.
   */
  childId?: string | null;
}): Promise<ApiResponse<TournamentListItem[]>> {
  const search = new URLSearchParams();
  if (params?.clubId) search.set('clubId', params.clubId);
  if (params?.childId) search.set('childId', params.childId);
  const qs = search.toString();
  return api.get<TournamentListItem[]>(`/tournaments${qs ? `?${qs}` : ''}`);
}

export async function getTournament(
  id: string,
): Promise<ApiResponse<TournamentDetail>> {
  return api.get<TournamentDetail>(`/tournaments/${encodeURIComponent(id)}`);
}

export async function createTournament(
  input: CreateTournamentInput,
): Promise<ApiResponse<TournamentDetail>> {
  return api.post<TournamentDetail>('/tournaments', input);
}

export async function updateTournament(
  id: string,
  input: UpdateTournamentInput,
): Promise<ApiResponse<TournamentDetail>> {
  return api.patch<TournamentDetail>(
    `/tournaments/${encodeURIComponent(id)}`,
    input,
  );
}

export async function deleteTournament(
  id: string,
): Promise<ApiResponse<{ id: string; deletedAt: string }>> {
  return api.delete<{ id: string; deletedAt: string }>(
    `/tournaments/${encodeURIComponent(id)}`,
  );
}

/** [2026-06-15] 대회 참가 결제 취소 — 결제 완료(PAID) 건도 환불 처리. */
export async function cancelTournamentRegistration(
  tournamentId: string,
  registrationId: string,
): Promise<ApiResponse<{ id: string; cancelledAt: string; refunded?: boolean }>> {
  return api.delete<{ id: string; cancelledAt: string; refunded?: boolean }>(
    `/tournaments/${encodeURIComponent(tournamentId)}/registrations/${encodeURIComponent(registrationId)}`,
  );
}

/** [2026-06-16] 대회 참가자(등록) 1건 — 선수정보/결제현황 페이지용. */
export interface TournamentRegistrationRow {
  id: string;
  userId: string | null;
  childId: string | null;
  gamesCount: number | null;
  calculatedFee: number | string | null;
  paymentStatus: string;
  registeredAt: string;
  user: { id: string; firstName?: string | null; lastName?: string | null } | null;
  child: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    childProfile?: { birthDate?: string | null } | null;
  } | null;
  payment: {
    id: string;
    orderNumber: string;
    paymentStatus: string;
    amount: number | null;
  } | null;
}

/** [2026-06-16] 대회 참가자 목록 조회 (감독/코치) — GET /tournaments/:id/registrations */
export async function listTournamentRegistrations(
  tournamentId: string,
): Promise<
  ApiResponse<{
    tournamentId: string;
    total: number;
    registrations: TournamentRegistrationRow[];
  }>
> {
  return api.get(
    `/tournaments/${encodeURIComponent(tournamentId)}/registrations`,
  );
}

/**
 * [추가 2026-05-15] 대회 참가 결제 시작 — 학부모 전용.
 *  · backend: POST /tournaments/:id/payment/initiate
 *  · 응답의 orderNumber 를 토스 위젯 requestPayment 의 orderId 로 사용.
 */
export async function initiateTournamentPayment(
  tournamentId: string,
  body: { childId: string; amount: number; gamesCount?: number },
): Promise<ApiResponse<{ id: string; orderNumber: string; amount: number }>> {
  return api.post<{ id: string; orderNumber: string; amount: number }>(
    `/tournaments/${encodeURIComponent(tournamentId)}/payment/initiate`,
    body,
  );
}

/**
 * [추가 2026-06-16] 대회 참가 신청 (결제 없음) — 후불(POSTPAID) 대회 전용.
 *  · backend: POST /tournaments/:id/register
 *  · 후불 대회는 신청 시점에 금액 미확정 → TournamentRegistration(UNPAID) 만 생성.
 *  · 대회 종료 후 감독이 1인당 금액을 입력해 일괄 청구(/payment/postpaid 흐름)한다.
 *  · 선불(PREPAID) 대회는 이 함수 대신 initiateTournamentPayment + 토스 위젯을 사용한다.
 */
export async function registerTournament(
  tournamentId: string,
  body: { childId: string; gamesCount: number },
): Promise<ApiResponse<{ id: string; paymentStatus: string }>> {
  return api.post<{ id: string; paymentStatus: string }>(
    `/tournaments/${encodeURIComponent(tournamentId)}/register`,
    body,
  );
}

/**
 * [추가 2026-06-16] 대회 참가자 목록 조회 — DIRECTOR/COACH/ADMIN 전용.
 *  · backend: GET /tournaments/:id/registrations
 *  · 후불 정산 대상 카운트(paymentStatus ∈ {UNPAID, PENDING})용으로 사용.
 */
export type TournamentRegistrationPaymentStatus =
  | 'UNPAID'
  | 'PENDING'
  | 'PAID'
  | 'CANCELLED';

export interface TournamentRegistrationItem {
  id: string;
  participantId?: string | null;
  childId?: string | null;
  participantName?: string | null;
  paymentStatus: TournamentRegistrationPaymentStatus;
}

export async function getTournamentRegistrations(
  tournamentId: string,
): Promise<ApiResponse<TournamentRegistrationItem[]>> {
  return api.get<TournamentRegistrationItem[]>(
    `/tournaments/${encodeURIComponent(tournamentId)}/registrations`,
  );
}

/**
 * [추가 2026-06-16] 후불 대회 정산 확정 — DIRECTOR/COACH/ADMIN 전용.
 *  · backend: POST /tournaments/:id/postpaid/confirm
 *  · body: { feePerPerson } (정수 ≥ 1) — 1인당 단일 금액.
 *  · 정산 대상(paymentStatus ∈ {UNPAID, PENDING}) 전원에게 일괄 청구한다.
 */
export interface ConfirmTournamentSettlementResult {
  tournamentId: string;
  billedCount: number;
  feePerPerson: number;
  totalAmount: number;
}

export async function confirmTournamentSettlement(
  tournamentId: string,
  feePerPerson: number,
): Promise<ApiResponse<ConfirmTournamentSettlementResult>> {
  return api.post<ConfirmTournamentSettlementResult>(
    `/tournaments/${encodeURIComponent(tournamentId)}/postpaid/confirm`,
    { feePerPerson },
  );
}

/**
 * [2026-06-17] 후불 대회 결제요청 취소 — DIRECTOR/COACH/ADMIN.
 *  · backend: POST /tournaments/:id/postpaid/cancel
 *  · 정산(결제요청)으로 청구한 미결제(PENDING) 참가자를 UNPAID 로 환원. 결제완료 건 제외.
 */
export async function cancelTournamentSettlement(
  tournamentId: string,
): Promise<ApiResponse<{ tournamentId: string; revertedCount: number }>> {
  return api.post<{ tournamentId: string; revertedCount: number }>(
    `/tournaments/${encodeURIComponent(tournamentId)}/postpaid/cancel`,
    {},
  );
}

export async function changeTournamentStatus(
  id: string,
  status: TournamentStatus,
): Promise<ApiResponse<TournamentDetail>> {
  return api.patch<TournamentDetail>(
    `/tournaments/${encodeURIComponent(id)}/status`,
    { status },
  );
}

// ============================================
// Match CRUD
// ============================================

export async function listMatches(params?: {
  tournamentId?: string;
}): Promise<ApiResponse<MatchSummary[]>> {
  const qs = params?.tournamentId
    ? `?tournamentId=${encodeURIComponent(params.tournamentId)}`
    : '';
  return api.get<MatchSummary[]>(`/tournaments/matches/list${qs}`);
}

export async function getMatch(
  id: string,
): Promise<ApiResponse<MatchDetail>> {
  return api.get<MatchDetail>(
    `/tournaments/matches/${encodeURIComponent(id)}`,
  );
}

export async function createMatch(
  input: CreateMatchInput,
): Promise<ApiResponse<MatchDetail>> {
  return api.post<MatchDetail>('/tournaments/matches', input);
}

export async function updateMatch(
  id: string,
  input: UpdateMatchInput,
): Promise<ApiResponse<MatchDetail>> {
  return api.patch<MatchDetail>(
    `/tournaments/matches/${encodeURIComponent(id)}`,
    input,
  );
}

export async function deleteMatch(
  id: string,
): Promise<ApiResponse<{ id: string; deletedAt: string }>> {
  return api.delete<{ id: string; deletedAt: string }>(
    `/tournaments/matches/${encodeURIComponent(id)}`,
  );
}

// ============================================
// Match Score & Live State (실시간 스코어보드)
// ============================================

export async function updateMatchScore(
  matchId: string,
  input: UpdateMatchScoreInput,
): Promise<ApiResponse<MatchSummary>> {
  return api.patch<MatchSummary>(
    `/tournaments/matches/${encodeURIComponent(matchId)}/score`,
    input,
  );
}

export async function updateMatchLiveState(
  matchId: string,
  input: UpdateMatchLiveStateInput,
): Promise<ApiResponse<MatchSummary>> {
  return api.patch<MatchSummary>(
    `/tournaments/matches/${encodeURIComponent(matchId)}/live-state`,
    input,
  );
}

// ============================================
// Match Periods
// ============================================

export async function listMatchPeriods(
  matchId: string,
): Promise<ApiResponse<MatchPeriodRecord[]>> {
  return api.get<MatchPeriodRecord[]>(
    `/tournaments/matches/${encodeURIComponent(matchId)}/periods`,
  );
}

export async function upsertMatchPeriod(
  matchId: string,
  input: UpsertMatchPeriodInput,
): Promise<ApiResponse<MatchPeriodRecord>> {
  return api.post<MatchPeriodRecord>(
    `/tournaments/matches/${encodeURIComponent(matchId)}/periods`,
    input,
  );
}

// ============================================
// Match Events (골/페널티 타임라인)
// ============================================

export async function listMatchEvents(
  matchId: string,
): Promise<ApiResponse<MatchEventRecord[]>> {
  return api.get<MatchEventRecord[]>(
    `/tournaments/matches/${encodeURIComponent(matchId)}/events`,
  );
}

export async function createMatchEvent(
  matchId: string,
  input: CreateMatchEventInput,
): Promise<ApiResponse<MatchEventRecord>> {
  return api.post<MatchEventRecord>(
    `/tournaments/matches/${encodeURIComponent(matchId)}/events`,
    input,
  );
}

export async function updateMatchEvent(
  matchId: string,
  eventId: string,
  input: UpdateMatchEventInput,
): Promise<ApiResponse<MatchEventRecord>> {
  return api.patch<MatchEventRecord>(
    `/tournaments/matches/${encodeURIComponent(matchId)}/events/${encodeURIComponent(eventId)}`,
    input,
  );
}

export async function deleteMatchEvent(
  matchId: string,
  eventId: string,
): Promise<ApiResponse<{ id: string; deletedAt: string }>> {
  return api.delete<{ id: string; deletedAt: string }>(
    `/tournaments/matches/${encodeURIComponent(matchId)}/events/${encodeURIComponent(eventId)}`,
  );
}

// ============================================
// Player Tournament Stats (선수별 대회 참가 이력/통계)
// ============================================

/**
 * 선수의 대회 참가 이력 + 합산 스탯 조회.
 *
 * Backend: GET /api/v1/tournaments/player-stats/:memberId
 * - memberId 는 `TeamMember.id` (Child.memberId)
 * - 포지션/등번호는 해당 선수의 TeamRoster 에서 집계
 */
export async function getPlayerTournamentStats(
  memberId: string,
): Promise<ApiResponse<PlayerTournamentStats>> {
  return api.get<PlayerTournamentStats>(
    `/tournaments/player-stats/${encodeURIComponent(memberId)}`,
  );
}

// ============================================
// Helpers — UI 매핑
// ============================================

/**
 * 관리자 권한(팀/대회/경기 관리) 여부 판정.
 * DIRECTOR / COACH / ADMIN 만 true.
 * PARENT / TEEN / CHILD / ACADEMY_DIRECTOR 는 조회만 가능.
 */
export function canManageMatch(
  role: string | undefined | null,
): boolean {
  if (!role) return false;
  const normalized = role.toString().toUpperCase();
  return (
    normalized === 'ADMIN' ||
    normalized === 'DIRECTOR' ||
    normalized === 'COACH'
  );
}

/**
 * 대회 목록 카드용 D-Day 계산 (등록 마감일 기준)
 * - 마감일 없거나 이미 지난 경우 undefined 반환
 */
export function calculateDDay(
  registrationDeadline: string | null,
  now: Date = new Date(),
): number | undefined {
  if (!registrationDeadline) return undefined;
  const deadline = new Date(registrationDeadline);
  if (isNaN(deadline.getTime())) return undefined;
  const ms = deadline.getTime() - now.getTime();
  if (ms < 0) return undefined;
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

/**
 * 대회 상태를 UI 표시용 라벨 키로 매핑
 */
export type TournamentUiStatus =
  | 'recruiting'
  | 'closing_soon'
  | 'closed'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export function mapTournamentUiStatus(
  raw: TournamentStatus,
  _registrationDeadline: string | null,
  _now: Date = new Date(),
): TournamentUiStatus {
  if (raw === 'cancelled') return 'cancelled';
  if (raw === 'finished') return 'completed';
  if (raw === 'ongoing') return 'in_progress';

  // [2026-06-08] 모집마감일 폐지 — scheduled 대회는 마감일 유무·과거 여부와 무관하게
  //   항상 모집중(recruiting). 참가 신청(결제)은 종료(finished)/취소(cancelled) 대회만 차단.
  //   (기존엔 과거 deadline → closed 판정으로 "조회만 가능합니다" 안내가 떠 결제 불가하던 회귀)
  return 'recruiting';
}
