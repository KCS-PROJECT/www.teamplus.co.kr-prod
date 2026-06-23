'use client';

import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { UserType } from '@/types';
import type { MatchStatus } from '@/types/match';

/**
 * 매치 기능 관리 권한을 가진 역할 목록.
 *
 * 백엔드 @Roles('ADMIN','DIRECTOR','ACADEMY_DIRECTOR','COACH')와 동기화되어야 함.
 */
const MATCH_MANAGER_ROLES: readonly UserType[] = [
  'admin',
  'director',
  'academy_director',
  'coach',
] as const;

/** useMatchPermissions 옵션 */
export interface UseMatchPermissionsOptions {
  /** 매치 주최자 ID — 소유권 판정에 사용 */
  matchManagerId?: string | null;
  /** 현재 매치 상태 — canEdit / canCancel 판정에 사용 */
  matchStatus?: MatchStatus;
  /** 대기 중 신청자 수 — canBulkReject 판정에 사용 */
  pendingApplicantCount?: number;
}

export interface MatchPermissions {
  /** 로그인 여부 */
  isAuthenticated: boolean;
  /** 현재 사용자의 역할 (미로그인 시 null) */
  role: UserType | null;
  /** 새 매치 생성 가능 여부 (admin/director/academy_director/coach) */
  canCreate: boolean;
  /**
   * 매치 관리(수정/취소/신청자 승인·거절) 가능 여부.
   *
   * matchManagerId가 주어지면: 본인 주최 매치이거나 admin/director 전체 권한.
   * matchManagerId가 없으면: 역할 기반으로 '매니저 역할'인지 여부만 반환.
   */
  canManage: boolean;
  /**
   * 매치 수정 가능 여부.
   * canManage와 동일하되, 매치 상태가 'cancelled'이면 false.
   */
  canEdit: boolean;
  /**
   * 매치 취소 가능 여부.
   * canManage와 동일하되, 이미 'cancelled' 상태이면 false.
   */
  canCancel: boolean;
  /**
   * 신청자 일괄 거절 가능 여부.
   * canManage가 true이고 pendingApplicantCount가 1 이상일 때 활성화.
   */
  canBulkReject: boolean;
  /**
   * 조회수 증가 호출 가능 여부.
   * 항상 true — 백엔드에서 1일 1회 제한을 자체 처리.
   */
  canIncrementView: boolean;
  /** 본인이 주최한 매치인지 (matchManagerId 전달 시에만 의미 있음) */
  isOwnMatch: boolean;
  /** 매치 참가 신청 가능 여부 (로그인한 모든 사용자) */
  canApply: boolean;
  /** 조회만 가능한 일반 사용자(parent/child/teen)인지 */
  isViewer: boolean;
}

/**
 * useMatchPermissions
 *
 * 매치 화면의 역할 기반 접근 제어를 단일 훅으로 제공.
 *
 * @example
 * ```tsx
 * const { canCreate, canManage, canEdit, canCancel } = useMatchPermissions();
 * {canCreate && <CreateMatchFab />}
 *
 * // 본인 매치 여부 + 상태 기반 판정
 * const { canEdit, canCancel } = useMatchPermissions({
 *   matchManagerId: match.manager.id,
 *   matchStatus: match.status,
 *   pendingApplicantCount: match.pendingCount,
 * });
 * {canEdit && <EditButton />}
 * {canCancel && <CancelButton />}
 * ```
 */
export function useMatchPermissions(options?: UseMatchPermissionsOptions): MatchPermissions {
  const { user, isAuthenticated } = useAuth();
  const matchManagerId = options?.matchManagerId ?? null;
  const matchStatus = options?.matchStatus ?? null;
  const pendingApplicantCount = options?.pendingApplicantCount ?? 0;

  return useMemo<MatchPermissions>(() => {
    const role = user?.userType ?? null;
    const authenticated = isAuthenticated && !!user;

    const isManagerRole =
      !!role && MATCH_MANAGER_ROLES.includes(role);

    const isOwnMatch =
      !!user && !!matchManagerId && user.id === matchManagerId;

    const isFullAdmin = role === 'admin' || role === 'director' || role === 'academy_director';

    // canManage:
    // - matchManagerId가 없으면: 매니저 역할인지 여부
    // - matchManagerId가 있으면: (본인 매치) OR (admin/director/academy_director)
    const canManage = matchManagerId
      ? isOwnMatch || isFullAdmin
      : isManagerRole;

    // canEdit: canManage와 동일하되, cancelled 상태이면 수정 불가
    const canEdit = canManage && matchStatus !== 'cancelled';

    // canCancel: canManage와 동일하되, 이미 cancelled이면 재취소 불가
    const canCancel = canManage && matchStatus !== 'cancelled';

    // canBulkReject: 관리 권한이 있고 대기 신청자가 1명 이상
    const canBulkReject = canManage && pendingApplicantCount > 0;

    return {
      isAuthenticated: authenticated,
      role,
      canCreate: isManagerRole,
      canManage,
      canEdit,
      canCancel,
      canBulkReject,
      canIncrementView: true,
      isOwnMatch,
      canApply: authenticated,
      isViewer: authenticated && !isManagerRole,
    };
  }, [user, isAuthenticated, matchManagerId, matchStatus, pendingApplicantCount]);
}
