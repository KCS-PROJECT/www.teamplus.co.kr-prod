/**
 * Team Service Layer
 *
 * Backend /api/v1/teams 엔드포인트를 Web에서 호출하기 위한 API 함수 모음.
 * 모든 함수는 `ApiResponse<T>` 형태(`{ success, data, error }`)를 반환한다.
 *
 * 엔드포인트:
 *   GET    /teams                               - 팀 목록 (teamId/division 필터)
 *   GET    /teams/my/managed                    - 내 관리 가능한 팀
 *   GET    /teams/my/parent                     - 학부모가 볼 수 있는 팀
 *   GET    /teams/:id                           - 팀 상세
 *   POST   /teams                               - 팀 생성
 *   PUT    /teams/:id                           - 팀 수정
 *   DELETE /teams/:id                           - 팀 삭제 (soft)
 *   GET    /teams/:id/roster                    - 선수 명단
 *   GET    /teams/:id/available-members         - 추가 가능한 팀 회원
 *   POST   /teams/:id/roster                    - 선수 추가
 *   PATCH  /teams/:id/roster/:rosterId          - 선수 정보 수정
 *   DELETE /teams/:id/roster/:rosterId          - 선수 제거
 */

import { apiRequest } from '@/services/api-client';
import type { ApiResponse } from '@/types';

// ============================================
// Types
// ============================================

export type TeamDivision = 'U8' | 'U9' | 'U10' | 'U11' | 'U12';
export type RosterPosition = 'goalie' | 'defense' | 'forward';
export type RosterStatus = 'active' | 'injured' | 'suspended';

export interface TeamListItem {
  id: string;
  /** 팀 고유 식별 코드 (Team.teamCode @unique) — 표시용 "팀명(BLZ001)" */
  teamCode?: string | null;
  /** 백엔드 신 표준 필드. 평탄화 응답에서는 clubName 으로 올 수 있음 */
  name?: string;
  shortName?: string | null;
  division?: TeamDivision | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  isActive?: boolean;
  /** 팀 감독 표시명 (getPublicTeams 응답) — 동명 팀 구분용 */
  coachName?: string | null;
  createdAt: string;
  updatedAt: string;
  club?: {
    id?: string;
    clubName?: string | null;
    location?: string | null;
  };
  _count?: {
    roster?: number;
  };
  /** 04c 카드 — 승인 대기 중인 가입 신청 수 (백엔드 합성) */
  pendingApplications?: number;
  /** 04c 카드 — 다음 예정된 팀 이벤트 (가장 가까운 미래) */
  nextEvent?: {
    id: string;
    title: string;
    eventType: string;
    startAt: string;
    endAt: string;
    location: string | null;
    isUrgent: boolean;
  } | null;
  /** 04c 카드 — 팀 성별 구성 */
  genderType?: 'MIX' | 'M' | 'F' | null;
  /** 04c 카드 — 시즌 승무패 누적 */
  seasonWins?: number;
  seasonLosses?: number;
  seasonDraws?: number;
  /** 04c 카드 — 최근 30일 평균 출석률 (%, null = 데이터 부족) */
  recentAttendanceRate?: number | null;
  /**
   * 본인 멤버십 상태 (2026-05-21 추가).
   *  - approved: 활성 멤버 또는 owner(DIRECTOR/ACADEMY_DIRECTOR)
   *  - pending:  감독 승인 대기 (코치 가입 직후 또는 수동 가입 신청 직후)
   *  - null:     관리 권한 없음 (단순 조회자) — `getTeam` 응답에서만 발생
   * `listManagedTeams({ includePending: true })` 호출 시 pending/approved 카드 구분에 사용.
   * `getTeam(teamId)` 응답에는 본인 멤버십 해석 결과가 합성되어 내려오며,
   * 프론트 `isTeamManagerOf(user, team)` 가 'approved' 만 통과시켜 pending 코치의
   * 수정 UI 를 차단한다.
   */
  myApprovalStatus?: 'approved' | 'pending' | null;
}
/**
 * 학부모 팀 뷰에서 각 팀에 표시할 "내 자녀" 정보.
 * 여러 자녀가 같은 팀에 있을 수 있으므로 배열로 취급한다.
 */
export interface MyChildInTeam {
  rosterId: string;
  memberId: string;
  playerName: string | null;
  playerAge: number | null;
  playerLevel: string | null;
  position: RosterPosition | null;
  jerseyNumber: number | null;
  isCaptain: boolean;
  isAltCaptain: boolean;
  status: RosterStatus;
  joinedAt: string;
}

/** myChildTeams 각 요소: 기본 TeamListItem + 해당 팀에 속한 내 자녀 리스트 */
export interface ParentChildTeamItem extends TeamListItem {
  myChildren: MyChildInTeam[];
}

/** GET /team/my/parent 응답 DTO */
export interface ParentTeamsResponse {
  myChildTeams: ParentChildTeamItem[];
  /** 학부모 본인이 가입 승인된 팀 (회원가입 시 teamCode 로 자동 가입된 PARENT 멤버십).
   *  myChildTeams 가 비어있을 때(자녀 0명 또는 자녀 팀 미승인) 폴백으로 사용. */
  myParentTeams?: TeamListItem[];
  clubTeams: TeamListItem[];
  totalChildren: number;
}

interface PublicTeamsResponse {
  total: number;
  clubs: TeamListItem[];
}

function normalizeParentTeamsResponse(
  data: ParentTeamsResponse,
): ParentTeamsResponse {
  return {
    myChildTeams: Array.isArray(data.myChildTeams)
      ? data.myChildTeams.map((team) => ({
          ...team,
          myChildren: Array.isArray(team.myChildren) ? team.myChildren : [],
        }))
      : [],
    myParentTeams: Array.isArray(data.myParentTeams) ? data.myParentTeams : [],
    clubTeams: Array.isArray(data.clubTeams) ? data.clubTeams : [],
    totalChildren:
      typeof data.totalChildren === 'number' ? data.totalChildren : 0,
  };
}

// ─── 2026-04-12 재디자인 SPEC 추가 타입 ──────────────

/** 팀 수상(타임라인 데이터용) — Backend TeamAward 를 프론트 친화 형태로 */
export interface TeamAwardSummary {
  id: string;
  awardName: string;
  /** champion|runner_up|third_place|league_winner|fair_play|best_team|special */
  awardType: string;
  /** 수상일 (ISO string) */
  awardedAt: string;
  description: string | null;
  season: string | null;
}

/** 코치 정보(코치진 섹션용) — Team.coaches → CoachProfile + User */
export interface TeamCoachStaff {
  id: string;
  userId: string;
  /** 팀 오너 (Team.coachId === userId) 판별 플래그 — FE 계산 */
  isHead: boolean;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  };
}

export interface TeamDetail extends Omit<TeamListItem, '_count'> {
  /** 팀 소개 (자유 서술, optional) */
  description: string | null;
  /** 팀 슬로건 (Hero/Info 섹션 인용 표기) */
  slogan: string | null;
  /** 실제 창단일 (createdAt과 별개, ISO string) */
  foundingDate: string | null;
  /** 홈 경기장 (자유 기입 · 레거시) */
  homeArena: string | null;
  /** [추가 2026-05-22] 홈 링크장 ID (Venue FK) */
  venueId?: string | null;
  /** [추가 2026-05-23] 홈 링크장 venue 마스터 관계 — 정확한 이름·주소 표시.
   *  fallback 우선순위: venue.name → homeArena → club.location → club.clubName */
  venue?: {
    id: string;
    name: string;
    address: string | null;
  } | null;
  club: {
    id: string;
    clubName: string;
    location: string | null;
    coachId: string;
    /** 코치진 — 재디자인 필수 데이터 (Backend service 에서 select) */
    coaches: Array<{
      id: string;
      userId: string;
      createdAt: string;
      user: {
        id: string;
        firstName: string | null;
        lastName: string | null;
        email: string;
      };
    }>;
  };
  /** 주요 약력 데이터 (TeamAward 기반 최근 10건) */
  teamAwards: TeamAwardSummary[];
  /** [추가 2026-04-30] 활성 하위 그룹 목록 — 그룹 현황 섹션에서 이름 노출 */
  groups: { id: string; name: string; ageGroup: string | null }[];
  _count: {
    roster: number;
    homeMatches: number;
    awayMatches: number;
    /** 활성 하위 그룹 수 — 그룹 현황 섹션 카운트 배지 */
    groups: number;
  };
}

export interface RosterMember {
  /** 그룹 배정된 경우 TeamGroupMember.id, 아니면 "unassigned:<TeamMember.id>" sentinel */
  id: string;
  /** 그룹에 배정된 멤버인지 여부 — false 면 edit/remove 비활성 */
  isGrouped?: boolean;
  /** 그룹 배정된 경우 group.id (없으면 null) */
  groupId?: string | null;
  /** 그룹 배정된 경우 group.name (없으면 null) */
  groupName?: string | null;
  position: RosterPosition | null;
  jerseyNumber: number | null;
  isCaptain: boolean;
  isAltCaptain: boolean;
  status: RosterStatus;
  joinedAt: string;
  member: {
    id: string;
    playerName: string;
    playerAge: number;
    playerLevel: string | null;
    approvalStatus: string;
    user: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string;
      userType: string;
      phone: string | null;
    } | null;
  };
}

export interface RosterResponse {
  total: number;
  roster: RosterMember[];
}

export interface AvailableMember {
  id: string;
  playerName: string;
  playerAge: number;
  playerLevel: string | null;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    userType: string;
  } | null;
}

export interface AvailableMembersResponse {
  total: number;
  members: AvailableMember[];
}

/**
 * 팀 회원 목록(`GET /teams/:teamId/members`) 각 항목.
 *
 * ⚠️ `selectedParticipantIds` 값으로는 반드시 `userId`(선수 User.id)를 사용한다.
 *    `id`(TeamMember.id)와 혼동 금지.
 */
export interface TeamMemberRow {
  /** TeamMember.id (참가대상 선택에는 사용하지 않음) */
  id: string;
  /** 선수 User.id — selectedParticipantIds 의 값 */
  userId: string;
  playerName: string;
  playerAge: number | null;
  playerLevel: string | null;
  approvalStatus: string;
  /** HEAD_COACH / COACH / MANAGER / PLAYER 등 — 비-선수 필터용 */
  roleInTeam: string | null;
  /** 출생연도(20XX). birthDate 없으면 null → 연도칩 미상 묶음 처리 */
  birthYear: number | null;
  /** 소속 활성 하위그룹 id 목록 — 그룹칩 → 멤버 매핑용 */
  groupIds: string[];
  joinedAt: string;
  paymentStatus?: 'paid' | 'unpaid' | 'pending';
  hasUnpaidBalance?: boolean;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    phone: string | null;
    /** ADMIN/DIRECTOR/COACH/PARENT/TEEN/CHILD/STUDENT 등 — 비-선수 필터용 */
    userType: string | null;
  } | null;
}

export interface TeamMembersResponse {
  total: number;
  members: TeamMemberRow[];
}

export type MatchStatus =
  | 'scheduled'
  | 'warmup'
  | 'in_progress'
  | 'intermission'
  | 'completed'
  | 'postponed'
  | 'cancelled';

export interface TeamMatchSummary {
  id: string;
  name: string;
  shortName: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
}

export interface TeamMatch {
  id: string;
  scheduledAt: string;
  startedAt: string | null;
  endedAt: string | null;
  homeScore: number;
  awayScore: number;
  status: MatchStatus;
  round: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeam: TeamMatchSummary | null;
  awayTeam: TeamMatchSummary | null;
  venue: { id: string; name: string } | null;
  rink: { id: string; name: string } | null;
  tournament: { id: string; name: string } | null;
}

export interface TeamMatchesResponse {
  total: number;
  matches: TeamMatch[];
}

// ============================================
// DTO Types
// ============================================

export interface CreateTeamPayload {
  clubId: string;
  name: string;
  // [제거 2026-05-21 시나리오 B] shortName — Phase 2 (2026-04-29) Club↔Team 통합 잔재.
  //   백엔드 createTeam(teams.service.ts:165-175) 이 data 객체에 포함시키지 않아 저장되지 않음.
  //   표시 폴백(BracketMatchCard · team-groups · TeamListCard)을 위해 Team 조회 타입에는 유지되나,
  //   신규 입력 페이로드에서는 제거. admin bulk-import 만 정상 작동.
  division?: TeamDivision;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  // ─── 2026-04-12 재디자인 ──────────────
  description?: string;
  slogan?: string;
  /** YYYY-MM-DD */
  foundingDate?: string;
  homeArena?: string;
  /** [추가 2026-05-22] 홈 링크장 ID (Venue FK) */
  venueId?: string;
}

export interface UpdateTeamPayload {
  clubName?: string;
  /** 팀 초대 코드 (선택, 고유). 빈 문자열이면 해제(null) */
  teamCode?: string;
  division?: TeamDivision;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  // ─── 2026-04-12 재디자인 ──────────────
  description?: string;
  slogan?: string;
  /** YYYY-MM-DD */
  foundingDate?: string;
  homeArena?: string;
  /** [추가 2026-05-22] 홈 링크장 ID (Venue FK) */
  venueId?: string;
}

// ─── 2026-04-12 재디자인 - 디스플레이 헬퍼 ──────────

/**
 * TeamDetail → 코치진 배열 변환 (Head 플래그 포함)
 * Team.coachId 와 일치하는 프로필을 Head 로 표시한다.
 */
export function toCoachStaff(team: TeamDetail): TeamCoachStaff[] {
  if (!team.club.coaches?.length) return [];
  return team.club.coaches.map((c) => ({
    id: c.id,
    userId: c.userId,
    isHead: c.userId === team.club.coachId,
    user: c.user,
  }));
}

/** TeamAward.awardType → 뱃지 라벨 (Tone & Manner 준수) */
const AWARD_TYPE_LABELS: Record<string, string> = {
  champion: '우승',
  runner_up: '준우승',
  third_place: '3위',
  league_winner: '리그 우승',
  fair_play: '페어플레이상',
  best_team: '베스트 팀',
  special: '특별상',
};

export function awardTypeLabel(type: string | null | undefined): string {
  if (!type) return '수상';
  return AWARD_TYPE_LABELS[type] ?? '수상';
}

/**
 * 팀의 "창단" 표시 문자열.
 * foundingDate 가 있으면 그것을, 없으면 createdAt 을 사용.
 * 예: "2018년 5월"
 */
export function formatFoundingDate(
  foundingDate: string | null | undefined,
  createdAt: string,
): string {
  const iso = foundingDate ?? createdAt;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
}

export interface AddRosterPayload {
  memberId: string;
  position?: RosterPosition;
  jerseyNumber?: number;
  isCaptain?: boolean;
  isAltCaptain?: boolean;
}

export interface UpdateRosterPayload {
  position?: RosterPosition;
  jerseyNumber?: number;
  isCaptain?: boolean;
  isAltCaptain?: boolean;
  status?: RosterStatus;
}

// ============================================
// API Functions
// ============================================

// apiClient의 baseURL이 이미 `${API_BASE_URL}/api/v1`을 포함하므로 리소스 경로만 사용
const BASE = '/teams';

// ============================================
// Utility: Division 라벨 변환 (공용)
// ============================================

/**
 * Division 코드를 사용자 노출 라벨로 변환.
 * U8~U12는 그대로 노출. 값이 없으면 '-'.
 */
export function divisionLabel(division: string | null | undefined): string {
  if (!division) return '-';
  return division;
}


/**
 * 팀 목록 조회 (필터 지원)
 */
export function listTeams(params?: {
  clubId?: string;
  division?: TeamDivision;
  includeInactive?: boolean;
}): Promise<ApiResponse<TeamListItem[]>> {
  return apiRequest<TeamListItem[]>({
    method: 'GET',
    url: BASE,
    params: {
      ...(params?.clubId && { clubId: params.clubId }),
      ...(params?.division && { division: params.division }),
      ...(params?.includeInactive && { includeInactive: 'true' }),
    },
  });
}

/**
 * 공개 팀 목록 조회.
 *
 * `/teams` 는 admin 전용이므로 일반 Web `/team` 화면의 조회 폴백에서는
 * 권한이 열린 `/teams/public` 을 사용한다.
 */
export async function listPublicTeams(params?: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<ApiResponse<TeamListItem[]>> {
  const res = await apiRequest<PublicTeamsResponse>({
    method: 'GET',
    url: `${BASE}/public`,
    params: {
      ...(params?.search && { search: params.search }),
      ...(params?.limit && { limit: params.limit }),
      ...(params?.offset && { offset: params.offset }),
    },
  });

  if (res.success) {
    return {
      ...res,
      data: Array.isArray(res.data?.clubs) ? res.data.clubs : [],
    };
  }

  return {
    success: false,
    error: res.error,
    message: res.message,
  };
}

/**
 * 내가 관리 가능한 팀 목록 (대시보드/홈 진입점용)
 *
 * @param options.includePending  true 면 본인 멤버십이 'pending' 인 팀도 함께 반환.
 *   코치 가입 직후 감독 승인 대기 안내용 (2026-05-21 추가).
 *   응답 항목의 `myApprovalStatus` 로 approved/pending 구분.
 */
export function listManagedTeams(options?: {
  includePending?: boolean;
}): Promise<ApiResponse<TeamListItem[]>> {
  return apiRequest<TeamListItem[]>({
    method: 'GET',
    url: `${BASE}/my/managed`,
    params: options?.includePending ? { includePending: 'true' } : undefined,
  });
}

/**
 * 학부모가 볼 수 있는 팀 목록
 *
 * 반환 구조:
 *   - `myChildTeams`: 로그인한 학부모의 자녀가 소속된 팀 (각 팀에 자녀의 등번호/포지션 포함)
 *   - `clubTeams`: 자녀가 속한 팀(들)의 다른 활성 팀
 *   - `totalChildren`: ParentChild 레코드 수 (자녀 등록 유무 판단용)
 *
 * PARENT 역할 전용. 다른 역할은 listTeams() 또는 listManagedTeams() 사용.
 */
export async function listParentVisibleTeams(): Promise<
  ApiResponse<ParentTeamsResponse>
> {
  const res = await apiRequest<ParentTeamsResponse>({
    method: 'GET',
    url: `${BASE}/my/parent`,
  });

  if (res.success && res.data) {
    return {
      ...res,
      data: normalizeParentTeamsResponse(res.data),
    };
  }

  return res;
}

/**
 * 팀 상세 조회
 */
export function getTeam(id: string): Promise<ApiResponse<TeamDetail>> {
  return apiRequest<TeamDetail>({
    method: 'GET',
    url: `${BASE}/${id}`,
  });
}

/**
 * 팀 생성 (DIRECTOR/COACH/ADMIN)
 */
export function createTeam(
  payload: CreateTeamPayload,
): Promise<ApiResponse<TeamListItem>> {
  return apiRequest<TeamListItem>({
    method: 'POST',
    url: BASE,
    data: payload,
    retry: false,
  });
}

/**
 * 팀 수정
 */
export function updateTeam(
  id: string,
  payload: UpdateTeamPayload,
): Promise<ApiResponse<TeamListItem>> {
  return apiRequest<TeamListItem>({
    method: 'PUT',
    url: `${BASE}/${id}`,
    data: payload,
    retry: false,
  });
}

/**
 * 팀 삭제 (soft delete)
 */
export function deleteTeam(
  id: string,
): Promise<ApiResponse<{ success: boolean; deletedTeamId: string }>> {
  return apiRequest({
    method: 'DELETE',
    url: `${BASE}/${id}`,
    retry: false,
  });
}

// ============================================
// Roster API
// ============================================

/**
 * 팀 로스터 조회
 */
export function getRoster(
  teamId: string,
): Promise<ApiResponse<RosterResponse>> {
  return apiRequest<RosterResponse>({
    method: 'GET',
    url: `${BASE}/${teamId}/roster`,
  });
}

/**
 * 팀 전체 회원 목록 조회 (상태 필터 지원).
 *
 * 대회 참가대상(선수) picker 에서 사용한다. 응답 각 항목의 `userId` 가
 * `selectedParticipantIds` 값이며, `birthYear`/`groupIds` 로 연도칩·그룹칩을 구성한다.
 * 비-선수(코치/매니저)도 포함되므로 호출 측에서 role 필터링이 필요하다.
 */
export function getTeamMembers(
  teamId: string,
  status: 'all' | 'approved' | 'pending' | 'rejected' = 'approved',
): Promise<ApiResponse<TeamMembersResponse>> {
  return apiRequest<TeamMembersResponse>({
    method: 'GET',
    url: `${BASE}/${teamId}/members`,
    params: { status },
  });
}

/**
 * 팀에 추가 가능한 팀 회원 조회
 */
export function getAvailableMembers(
  teamId: string,
  search?: string,
): Promise<ApiResponse<AvailableMembersResponse>> {
  return apiRequest<AvailableMembersResponse>({
    method: 'GET',
    url: `${BASE}/${teamId}/available-members`,
    params: search ? { search } : undefined,
  });
}

/**
 * 선수 추가
 */
export function addRosterMember(
  teamId: string,
  payload: AddRosterPayload,
): Promise<ApiResponse<RosterMember>> {
  return apiRequest<RosterMember>({
    method: 'POST',
    url: `${BASE}/${teamId}/roster`,
    data: payload,
    retry: false,
  });
}

/**
 * 선수 정보 수정
 */
export function updateRosterMember(
  teamId: string,
  rosterId: string,
  payload: UpdateRosterPayload,
): Promise<ApiResponse<RosterMember>> {
  return apiRequest<RosterMember>({
    method: 'PATCH',
    url: `${BASE}/${teamId}/roster/${rosterId}`,
    data: payload,
    retry: false,
  });
}

/**
 * 선수 제거 (soft delete)
 */
export function removeRosterMember(
  teamId: string,
  rosterId: string,
): Promise<ApiResponse<{ success: boolean; removedRosterId: string }>> {
  return apiRequest({
    method: 'DELETE',
    url: `${BASE}/${teamId}/roster/${rosterId}`,
    retry: false,
  });
}

// ============================================
// Matches API
// ============================================

/**
 * 팀 경기 목록 조회 (home + away)
 */
export function getTeamMatches(
  teamId: string,
  limit?: number,
): Promise<ApiResponse<TeamMatchesResponse>> {
  return apiRequest<TeamMatchesResponse>({
    method: 'GET',
    url: `${BASE}/${teamId}/matches`,
    params: limit ? { limit: String(limit) } : undefined,
  });
}
