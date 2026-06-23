/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TEAMPLUS User Management Service
 * 관리자용 사용자 관리 API 호출
 */

import { api } from './api-client';
import { getApiErrorMessage } from '@/lib/api-error';
import type { User, UserType, PaginationParams, PaginatedResponse } from '../types';

/**
 * 사용자 필터 파라미터
 */
export interface UserFilterParams extends PaginationParams {
  userType?: UserType;
  search?: string;
  isActive?: boolean;
}

/**
 * 사용자 업데이트 요청
 */
export interface UpdateUserRequest {
  name?: string;
  phone?: string;
  userType?: UserType;
  department?: string;
  position?: string;
  isActive?: boolean;
}

/**
 * 사용자 목록 조회 (관리자용)
 */
export const getUsers = async (
  params?: UserFilterParams
): Promise<PaginatedResponse<User>> => {
  try {
    // 백엔드 API 파라미터 매핑 (pageSize → limit)
    const apiParams: Record<string, unknown> = {
      page: params?.page || 1,
      limit: params?.pageSize || 10,
    };
    if (params?.search) apiParams.search = params.search;
    if (params?.userType) apiParams.userType = params.userType.toUpperCase();

    const res = await api.get<{ data: any[]; pagination: any }>('/admin/users', { params: apiParams });
    const { data, pagination } = res;

    const users: User[] = (data || []).map((u: any) => ({
      id: u.id,
      email: u.email,
      phone: u.phone || '',
      username: u.username,
      userType: (u.userType?.toLowerCase() || 'parent') as UserType,
      name: u.username || '',
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      lastLoginAt: u.lastLoginAt,
    }));

    const page = pagination?.page || 1;
    const pageSize = pagination?.limit || 10;
    const totalItems = pagination?.total || 0;
    const totalPages = pagination?.totalPages || 1;

    return {
      data: users,
      meta: {
        page,
        pageSize,
        totalPages,
        totalItems,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };
  } catch (error: unknown) {
    console.error('[User Service] 사용자 목록 조회 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '사용자 목록을 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * 사용자 상세 조회
 */
export const getUser = async (userId: string): Promise<User> => {
  try {
    return api.get<User>(`/admin/users/${userId}`);
  } catch (error: unknown) {
    console.error('[User Service] 사용자 조회 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '사용자 정보를 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * 사용자 정보 수정
 */
export const updateUser = async (
  userId: string,
  updates: UpdateUserRequest
): Promise<User> => {
  try {
    return api.patch<User>(`/admin/users/${userId}`, updates);
  } catch (error: unknown) {
    console.error('[User Service] 사용자 수정 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '사용자 정보 수정에 실패했습니다.')
    );
  }
};

/**
 * 사용자 역할 변경
 */
export const changeUserRole = async (
  userId: string,
  userType: UserType
): Promise<User> => {
  try {
    return api.patch<User>(`/admin/users/${userId}/role`, { userType });
  } catch (error: unknown) {
    console.error('[User Service] 역할 변경 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '역할 변경에 실패했습니다.')
    );
  }
};

/**
 * 사용자 비활성화
 */
export const deactivateUser = async (userId: string): Promise<void> => {
  try {
    await api.post(`/admin/users/${userId}/deactivate`);
  } catch (error: unknown) {
    console.error('[User Service] 사용자 비활성화 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '사용자 비활성화에 실패했습니다.')
    );
  }
};

/**
 * 사용자 활성화
 */
export const activateUser = async (userId: string): Promise<void> => {
  try {
    await api.post(`/admin/users/${userId}/activate`);
  } catch (error: unknown) {
    console.error('[User Service] 사용자 활성화 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '사용자 활성화에 실패했습니다.')
    );
  }
};

/**
 * 사용자 삭제 (소프트 삭제)
 */
export const deleteUser = async (userId: string): Promise<void> => {
  try {
    await api.delete(`/admin/users/${userId}`);
  } catch (error: unknown) {
    console.error('[User Service] 사용자 삭제 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '사용자 삭제에 실패했습니다.')
    );
  }
};

/**
 * 사용자 통계 조회
 */
export const getUserStats = async (): Promise<{
  totalUsers: number;
  byType: { type: UserType; count: number }[];
  newUsersThisMonth: number;
  activeUsersToday: number;
}> => {
  try {
    // 전체 사용자 수를 limit=1로 빠르게 조회
    const res = await api.get<{ data: any[]; pagination: any }>('/admin/users', { params: { page: 1, limit: 1 } });
    const total = res.pagination?.total || 0;
    return {
      totalUsers: total,
      byType: [],
      newUsersThisMonth: 0,
      activeUsersToday: 0,
    };
  } catch (error: unknown) {
    console.error('[User Service] 사용자 통계 조회 실패:', error);
    return {
      totalUsers: 0,
      byType: [],
      newUsersThisMonth: 0,
      activeUsersToday: 0,
    };
  }
};

export const userService = {
  getUsers,
  getUser,
  updateUser,
  changeUserRole,
  deactivateUser,
  activateUser,
  deleteUser,
  getUserStats,
};

export default userService;
/* eslint-disable @typescript-eslint/no-explicit-any */
