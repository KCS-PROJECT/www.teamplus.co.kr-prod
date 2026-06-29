/**
 * Team Group 서비스 — `/api/v1/teams/:teamId/groups` & `/api/v1/team-groups/:id`
 *
 * 팀(상위) 안의 하위 그룹(예: 선수반 A조, U10 평일반) 관리.
 * 감독·코치만 생성/수정/삭제 가능 (백엔드 RolesGuard).
 */

import { api } from '@/services/api-client';

export type AgeGroup = 'U8' | 'U9' | 'U10' | 'U11' | 'U12';

export interface TeamGroupSummary {
  id: string;
  name: string;
  /** 대상 설명(자유 텍스트). 레거시 'U8'~'U12'·출생연도 문자열도 그대로 보존. */
  ageGroup: string | null;
  isActive: boolean;
  createdAt: string;
  _count: { members: number };
}

export interface TeamGroupMemberRow {
  groupMemberId: string;
  memberId: string;
  playerName: string;
  gender: 'M' | 'F' | string | null;
  playerAge: number;
  /** 생년월일 ISO (ChildProfile 우선, user 폴백) — 없으면 null. 트리 선수 행 "YYYY.MM.DD" 표시용. */
  birthDate: string | null;
  joinedAt: string;
}

export interface TeamGroupDetail {
  id: string;
  teamId: string;
  teamName: string;
  name: string;
  /** 대상 설명(자유 텍스트). */
  ageGroup: string | null;
  isActive: boolean;
  createdAt: string;
  members: TeamGroupMemberRow[];
}

export interface EligibleMemberRow {
  memberId: string;
  playerName: string;
  gender: 'M' | 'F' | string | null;
  playerAge: number;
  /** [추가 2026-04-30] 역할 필터 탭 — HEAD_COACH / COACH / MANAGER / PLAYER */
  roleInTeam?: string | null;
  /** ADMIN / DIRECTOR / COACH / PARENT / TEEN / CHILD / STUDENT 등 */
  userType?: string | null;
}

export interface CreateTeamGroupPayload {
  name: string;
  /** [2026-06-05] 연령대(U8~U12) → 참가 대상 출생연도 문자열(예: "2016"). 레거시 값도 허용. */
  ageGroup?: string;
  memberIds?: string[];
}

export const teamGroupService = {
  async listByTeam(teamId: string) {
    const res = await api.get<TeamGroupSummary[]>(`/teams/${teamId}/groups`);
    if (!res.success) throw new Error(res.error?.message ?? '그룹 목록을 불러오지 못했습니다.');
    return res.data ?? [];
  },

  async listEligibleMembers(teamId: string) {
    const res = await api.get<EligibleMemberRow[]>(
      `/teams/${teamId}/eligible-members`,
    );
    if (!res.success) throw new Error(res.error?.message ?? '회원 목록을 불러오지 못했습니다.');
    return res.data ?? [];
  },

  async findById(groupId: string) {
    const res = await api.get<TeamGroupDetail>(`/team-groups/${groupId}`);
    if (!res.success) throw new Error(res.error?.message ?? '그룹 정보를 불러오지 못했습니다.');
    return res.data!;
  },

  async create(teamId: string, payload: CreateTeamGroupPayload) {
    const res = await api.post<TeamGroupSummary>(
      `/teams/${teamId}/groups`,
      payload,
    );
    if (!res.success) throw new Error(res.error?.message ?? '그룹 생성에 실패했습니다.');
    return res.data!;
  },

  async update(groupId: string, payload: Partial<CreateTeamGroupPayload>) {
    const res = await api.put<TeamGroupSummary>(
      `/team-groups/${groupId}`,
      payload,
    );
    if (!res.success) throw new Error(res.error?.message ?? '그룹 수정에 실패했습니다.');
    return res.data!;
  },

  async delete(groupId: string) {
    const res = await api.delete<{ success: boolean }>(`/team-groups/${groupId}`);
    if (!res.success) throw new Error(res.error?.message ?? '그룹 삭제에 실패했습니다.');
    return true;
  },
};

export const AGE_GROUP_OPTIONS: { value: AgeGroup; label: string }[] = [
  { value: 'U8', label: 'U8 (8세 이하)' },
  { value: 'U9', label: 'U9 (9세 이하)' },
  { value: 'U10', label: 'U10 (10세 이하)' },
  { value: 'U11', label: 'U11 (11세 이하)' },
  { value: 'U12', label: 'U12 (12세 이하)' },
];

export function genderLabel(gender: string | null | undefined): string {
  if (gender === 'M') return '남';
  if (gender === 'F') return '여';
  return '-';
}
