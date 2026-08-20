/**
 * 수업/대회 단위 공지 스트림 서비스 — flat `api/v1/community/*` 계약.
 * 설계 SoT: claudedocs/unit-notice-stream-design-2026-08-19.md §4.5 (Phase 1)
 *
 * 축 배타: teamId | targetClassId | targetTournamentId 중 정확히 1개.
 */

import { api } from './api-client';

// ─── Types ──────────────────────────────────────────

export interface UnitNoticeAuthor {
  id: string;
  userType?: string;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
}

export interface UnitNoticeAttachment {
  id: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  displayOrder: number;
}

export interface UnitNoticeComment {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  author: UnitNoticeAuthor;
  isMine?: boolean;
}

export interface UnitNoticePost {
  id: string;
  teamId: string | null;
  targetClassId: string | null;
  targetTournamentId: string | null;
  title: string;
  content: string;
  isPinned: boolean;
  viewCount: number;
  startAt: string | null;
  expiresAt: string | null;
  isPublished: boolean;
  isScheduled: boolean;
  isExpired: boolean;
  createdAt: string;
  updatedAt: string;
  author: UnitNoticeAuthor;
  attachments: UnitNoticeAttachment[];
  commentCount: number;
  /** 목록 전용 — 내 읽음 여부 */
  isReadByMe?: boolean;
  /** managed/상세 전용 — 대상 수업·대회 이름 */
  targetName?: string | null;
  /** managed 전용 — 읽음 N/M */
  readCount?: number;
  recipientCount?: number;
}

export interface UnitNoticeDetail extends UnitNoticePost {
  comments: UnitNoticeComment[];
  canManage: boolean;
}

/**
 * 읽음 현황 — **미읽음자 명단만** 내려온다 (읽은 사람 목록·읽은 시각은 서버가 비노출).
 * 노출 축소 확정: 2026-08-20 사용자 (설계 v1.2.3 후속).
 */
export interface UnitNoticeReadsRecipient {
  userId: string;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  /** 수업 축 — 이 수업을 수강 중인 연결 자녀 이름 */
  childNames: string[];
}

export interface UnitNoticeReadsSummary {
  postId: string;
  recipientCount: number;
  readCount: number;
  unread: UnitNoticeReadsRecipient[];
  /** 재알림 쿨다운 만료 시각 — null 이면 즉시 가능 */
  remindAvailableAt: string | null;
}

export interface UnitNoticeTargets {
  classes: Array<{ id: string; name: string; isOpenClass: boolean }>;
  tournaments: Array<{ id: string; name: string; status: string }>;
}

export interface CreateUnitNoticeInput {
  title: string;
  content: string;
  teamId?: string;
  targetClassId?: string;
  targetTournamentId?: string;
  isPinned?: boolean;
  startAt?: string;
  expiresAt?: string;
  attachments?: Array<{
    fileUrl: string;
    fileName: string;
    fileType: string;
    fileSize: number;
  }>;
}

export type UpdateUnitNoticeInput = Partial<
  Pick<CreateUnitNoticeInput, 'title' | 'content' | 'isPinned'>
> & {
  startAt?: string | null;
  expiresAt?: string | null;
};

// ─── Role helper ──────────────────────────────────────────

/**
 * [Codex R3 H-05] 단위 공지 작성 후보 역할 — 백엔드 MANAGER_ROLES 와 동일 집합.
 * canWrite 는 후보 신호일 뿐, 최종 판정은 서버 `/community/targets` (UnitNoticeSection 검증).
 */
const UNIT_NOTICE_MANAGER_ROLES = [
  'coach',
  'director',
  'academy_director',
  'admin',
  'system',
  'oper',
] as const;

export function isUnitNoticeManagerRole(
  userType: string | null | undefined,
): boolean {
  return UNIT_NOTICE_MANAGER_ROLES.includes(
    (userType ?? '').toLowerCase() as (typeof UNIT_NOTICE_MANAGER_ROLES)[number],
  );
}

// ─── API ──────────────────────────────────────────

export async function fetchUnitNotices(params: {
  classId?: string;
  tournamentId?: string;
  teamId?: string;
  limit?: number;
}) {
  return api.get<UnitNoticePost[]>('/community/posts', {
    params: {
      ...(params.classId && { classId: params.classId }),
      ...(params.tournamentId && { tournamentId: params.tournamentId }),
      ...(params.teamId && { teamId: params.teamId }),
      ...(params.limit && { limit: String(params.limit) }),
    },
  });
}

export async function fetchManagedUnitNotices(params?: {
  axis?: 'class' | 'tournament';
  limit?: number;
}) {
  return api.get<UnitNoticePost[]>('/community/posts/managed', {
    params: {
      ...(params?.axis && { axis: params.axis }),
      ...(params?.limit && { limit: String(params.limit) }),
    },
  });
}

export async function fetchUnitNoticeTargets() {
  return api.get<UnitNoticeTargets>('/community/targets');
}

export async function fetchUnitNoticeDetail(postId: string) {
  return api.get<UnitNoticeDetail>(`/community/posts/${postId}`);
}

export async function createUnitNotice(input: CreateUnitNoticeInput) {
  return api.post<UnitNoticeDetail>('/community/posts', input);
}

export async function updateUnitNotice(
  postId: string,
  input: UpdateUnitNoticeInput,
) {
  return api.patch<UnitNoticeDetail>(`/community/posts/${postId}`, input);
}

export async function deleteUnitNotice(postId: string) {
  return api.delete<{ deleted: boolean }>(`/community/posts/${postId}`);
}

export async function fetchUnitNoticeReadsSummary(postId: string) {
  return api.get<UnitNoticeReadsSummary>(
    `/community/posts/${postId}/reads/summary`,
  );
}

/** 미읽음자에게 다시 알리기 — 게시글당 24시간 1회 */
export async function remindUnreadRecipients(postId: string) {
  return api.post<{ reminded: number }>(`/community/posts/${postId}/remind`);
}

/** 수업 참가자 연락 대상 — 명단 행 [1:1 문의]용, 부모 우선 규칙 (관할 감독·코치 전용) */
export interface ClassContact {
  memberId: string;
  contactUserId: string | null;
  contactName: string | null;
}

export async function fetchClassContacts(classId: string) {
  return api.get<{ classId: string; contacts: ClassContact[] }>(
    '/community/class-contacts',
    { params: { classId } },
  );
}

export async function addUnitNoticeComment(postId: string, content: string) {
  return api.post<UnitNoticeComment>(`/community/posts/${postId}/comments`, {
    content,
  });
}

export async function updateUnitNoticeComment(
  commentId: string,
  content: string,
) {
  return api.patch<UnitNoticeComment>(`/community/comments/${commentId}`, {
    content,
  });
}

export async function deleteUnitNoticeComment(commentId: string) {
  return api.delete<{ deleted: boolean }>(`/community/comments/${commentId}`);
}
