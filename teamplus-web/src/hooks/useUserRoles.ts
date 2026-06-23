'use client';

import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { ViewAsRole } from './useRoleSwitch';

export interface UserRolesInfo {
  primaryRole: ViewAsRole | null;
  hasParentRole: boolean;
  hasCoachRole: boolean;
  hasMultipleRoles: boolean;
  availableRoles: ViewAsRole[];
}

/**
 * 사용자가 보유한 역할(학부모/코치) 식별 훅
 *
 * Stage 1(현재): AuthUser.userType 기반 단일 역할 식별
 * Stage 2(BE Task #39 완료 후): `clubMemberships`/`parentChildren` 응답 기반 겸직 판단
 *
 * 현재 Primary role:
 * - userType='parent' → hasParentRole
 * - userType='coach' → hasCoachRole
 * - 기타 역할은 겸직 범위 밖으로 처리 (드롭다운 미노출)
 */
export function useUserRoles(): UserRolesInfo {
  const { user } = useAuth();

  return useMemo<UserRolesInfo>(() => {
    if (!user) {
      return {
        primaryRole: null,
        hasParentRole: false,
        hasCoachRole: false,
        hasMultipleRoles: false,
        availableRoles: [],
      };
    }

    // Stage 2: clubMemberships / parentChildren 기반 겸직 판단 (BE Task #39 완료)
    const extended = user as typeof user & {
      clubMemberships?: { memberId: string; teamId: string; teamName: string; roleInTeam?: string | null; approvalStatus: string }[];
      parentChildren?: { id: string; name?: string }[];
    };

    const primaryRole: ViewAsRole | null =
      user.userType === 'parent'
        ? 'parent'
        : user.userType === 'coach'
        ? 'coach'
        : null;

    const hasCoachByMembership = Array.isArray(extended.clubMemberships)
      ? extended.clubMemberships.some(
          (m) => m.approvalStatus === 'approved' && (m.roleInTeam === 'COACH' || m.roleInTeam === 'HEAD_COACH'),
        )
      : false;
    const hasParentByChildren = Array.isArray(extended.parentChildren)
      ? extended.parentChildren.length > 0
      : false;

    const hasParentRole = primaryRole === 'parent' || hasParentByChildren;
    const hasCoachRole = primaryRole === 'coach' || hasCoachByMembership;
    const hasMultipleRoles = hasParentRole && hasCoachRole;

    const availableRoles: ViewAsRole[] = [];
    if (hasParentRole) availableRoles.push('parent');
    if (hasCoachRole) availableRoles.push('coach');

    return {
      primaryRole,
      hasParentRole,
      hasCoachRole,
      hasMultipleRoles,
      availableRoles,
    };
  }, [user]);
}
