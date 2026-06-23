/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TEAMPLUS Club Service
 * 클럽 관리 API 호출 (클럽 조회, 가입, 멤버 관리, 승인)
 */

import { api } from './api-client';
import { getApiErrorStatus, getApiErrorMessage, isAxiosError } from '@/lib/api-error';
import {
  Club,
  TeamMember,
  JoinClubRequest,
  ApproveMemberRequest,
  BulkApproveMembersRequest,
  PaginationParams,
  Status,
} from '../types';

/**
 * 모든 클럽 조회
 * @param params - 페이지네이션 파라미터 (옵션)
 * @returns 클럽 목록
 */
export const getClubs = async (
  params?: PaginationParams
): Promise<Club[]> => {
  try {
    const clubs = await api.get<Club[]>('/teams', { params });
    return clubs;
  } catch (error: unknown) {
    console.error('[Club Service] 클럽 조회 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '클럽 목록을 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * 단일 클럽 조회
 * @param clubId - 클럽 ID
 * @returns 클럽 상세 정보
 */
export const getClub = async (clubId: string): Promise<Club> => {
  try {
    const club = await api.get<Club>(`/teams/${clubId}`);
    return club;
  } catch (error: unknown) {
    console.error('[Club Service] 클럽 조회 실패:', error);

    if (getApiErrorStatus(error) === 404) {
      throw new Error('클럽을 찾을 수 없습니다.');
    }

    throw new Error(
      getApiErrorMessage(error, '클럽 정보를 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * 내가 속한 클럽 조회
 * @returns 가입한 클럽 목록
 */
export const getMyClubs = async (): Promise<Club[]> => {
  try {
    const clubs = await api.get<Club[]>('/teams/my/list');
    return clubs;
  } catch (error: unknown) {
    console.error('[Club Service] 내 클럽 조회 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '클럽 목록을 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * 코치가 관리하는 클럽 조회
 * @returns 관리 중인 클럽 목록
 */
export const getManagedClubs = async (): Promise<Club[]> => {
  try {
    const clubs = await api.get<Club[]>('/teams/managed/list');
    return clubs;
  } catch (error: unknown) {
    console.error('[Club Service] 관리 클럽 조회 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '클럽 목록을 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * 클럽 생성 (코치 전용)
 * @param clubData - 클럽 생성 데이터
 * @returns 생성된 클럽 정보
 */
export const createClub = async (clubData: {
  clubName: string;
  description?: string;
}): Promise<Club> => {
  try {
    const club = await api.post<Club>('/teams', clubData);
    return club;
  } catch (error: unknown) {
    console.error('[Club Service] 클럽 생성 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '클럽 생성에 실패했습니다.')
    );
  }
};

/**
 * 클럽 정보 수정 (코치 전용)
 * @param clubId - 클럽 ID
 * @param updates - 수정할 필드
 * @returns 수정된 클럽 정보
 */
export const updateClub = async (
  clubId: string,
  updates: Partial<Pick<Club, 'clubName' | 'description'>>
): Promise<Club> => {
  try {
    const club = await api.patch<Club>(`/teams/${clubId}`, updates);
    return club;
  } catch (error: unknown) {
    console.error('[Club Service] 클럽 수정 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '클럽 정보 수정에 실패했습니다.')
    );
  }
};

/**
 * 클럽 가입 (초대 코드 사용)
 * @param clubCode - 클럽 초대 코드 (예: ACE-hockey)
 * @param playerName - 선수 이름
 * @param playerAge - 선수 나이
 * @returns 클럽 멤버 정보 (승인 대기 상태)
 */
export const joinClub = async (
  clubCode: string,
  playerName: string,
  playerAge: number
): Promise<TeamMember> => {
  try {
    // 백엔드 DTO 표준 필드: teamCode (clubCode 는 alias 보존)
    const data: JoinClubRequest = { teamCode: clubCode, playerName, playerAge };
    const member = await api.post<TeamMember>('/teams/join', data);
    return member;
  } catch (error: unknown) {
    console.error('[Club Service] 클럽 가입 실패:', error);

    const errorMessage = isAxiosError(error)
      ? error.response?.data?.error?.message
      : undefined;
    if (errorMessage?.includes('code')) {
      throw new Error('올바른 클럽 코드를 입력해주세요.');
    } else if (errorMessage?.includes('already')) {
      throw new Error('이미 가입한 클럽입니다.');
    } else {
      throw new Error(errorMessage || '클럽 가입 신청에 실패했습니다.');
    }
  }
};

/**
 * 클럽 멤버 목록 조회
 * @param clubId - 클럽 ID
 * @param status - 승인 상태 필터 (옵션)
 * @returns 멤버 목록
 */
export const getMembers = async (
  clubId: string,
  status?: Status
): Promise<TeamMember[]> => {
  try {
    const params = status ? { status } : undefined;
    const members = await api.get<TeamMember[]>(`/teams/${clubId}/members`, {
      params,
    });
    return members;
  } catch (error: unknown) {
    console.error('[Club Service] 멤버 조회 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '멤버 목록을 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * 승인 대기 중인 멤버 조회
 * @param clubId - 클럽 ID
 * @returns 승인 대기 멤버 목록
 */
export const getPendingMembers = async (
  clubId: string
): Promise<TeamMember[]> => {
  return getMembers(clubId, Status.PENDING);
};

/**
 * 승인된 멤버 조회
 * @param clubId - 클럽 ID
 * @returns 승인된 멤버 목록
 */
export const getApprovedMembers = async (
  clubId: string
): Promise<TeamMember[]> => {
  return getMembers(clubId, Status.APPROVED);
};

/**
 * 단일 멤버 조회
 * @param memberId - 멤버 ID
 * @returns 멤버 상세 정보
 */
export const getMember = async (memberId: string): Promise<TeamMember> => {
  try {
    const member = await api.get<TeamMember>(`/members/${memberId}`);
    return member;
  } catch (error: unknown) {
    console.error('[Club Service] 멤버 조회 실패:', error);

    if (getApiErrorStatus(error) === 404) {
      throw new Error('멤버를 찾을 수 없습니다.');
    }

    throw new Error(
      getApiErrorMessage(error, '멤버 정보를 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * 멤버 승인/거절 (코치 전용)
 * @param memberId - 멤버 ID
 * @param approvalStatus - 승인 상태 (approved | rejected)
 * @returns 업데이트된 멤버 정보
 */
export const approveMember = async (
  memberId: string,
  approvalStatus: Status.APPROVED | Status.REJECTED = Status.APPROVED
): Promise<TeamMember> => {
  try {
    const data: ApproveMemberRequest = { memberId, approvalStatus };
    const member = await api.post<TeamMember>('/members/approve', data);
    return member;
  } catch (error: unknown) {
    console.error('[Club Service] 멤버 승인 실패:', error);

    if (getApiErrorStatus(error) === 403) {
      throw new Error('멤버 승인 권한이 없습니다.');
    }

    throw new Error(
      getApiErrorMessage(error, '멤버 승인에 실패했습니다.')
    );
  }
};

/**
 * 멤버 거절 (코치 전용)
 * @param memberId - 멤버 ID
 * @returns 업데이트된 멤버 정보
 */
export const rejectMember = async (memberId: string): Promise<TeamMember> => {
  return approveMember(memberId, Status.REJECTED);
};

/**
 * 대량 멤버 승인 (코치 전용)
 * @param memberIds - 멤버 ID 배열
 * @param approvalStatus - 승인 상태 (approved | rejected)
 * @returns 업데이트된 멤버 목록
 */
export const bulkApproveMembers = async (
  memberIds: string[],
  approvalStatus: Status.APPROVED | Status.REJECTED = Status.APPROVED
): Promise<TeamMember[]> => {
  try {
    const data: BulkApproveMembersRequest = { memberIds, approvalStatus };
    const members = await api.post<TeamMember[]>('/members/bulk-approve', data);
    return members;
  } catch (error: unknown) {
    console.error('[Club Service] 대량 멤버 승인 실패:', error);

    if (getApiErrorStatus(error) === 403) {
      throw new Error('멤버 승인 권한이 없습니다.');
    }

    throw new Error(
      getApiErrorMessage(error, '멤버 승인에 실패했습니다.')
    );
  }
};

/**
 * 멤버 삭제 (코치 전용)
 * @param memberId - 멤버 ID
 */
export const deleteMember = async (memberId: string): Promise<void> => {
  try {
    await api.delete(`/members/${memberId}`);
  } catch (error: unknown) {
    console.error('[Club Service] 멤버 삭제 실패:', error);

    if (getApiErrorStatus(error) === 403) {
      throw new Error('멤버 삭제 권한이 없습니다.');
    }

    throw new Error(
      getApiErrorMessage(error, '멤버 삭제에 실패했습니다.')
    );
  }
};

/**
 * Club Service Export
 */
export const clubService = {
  getClubs,
  getClub,
  getMyClubs,
  getManagedClubs,
  createClub,
  updateClub,
  joinClub,
  getMembers,
  getPendingMembers,
  getApprovedMembers,
  getMember,
  approveMember,
  rejectMember,
  bulkApproveMembers,
  deleteMember,
};

export default clubService;
