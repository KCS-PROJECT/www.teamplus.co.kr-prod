/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TEAMPLUS Class Service
 * 수업 관리 API 호출 (수업 조회, 상품 조회, 등록)
 */

import { api } from './api-client';
import { getApiErrorStatus, getApiErrorMessage, isAxiosError } from '@/lib/api-error';
import {
  Class,
  ClassSchedule,
  ClassProduct,
  EnrollClassRequest,
  PaginationParams,
} from '../types';

/**
 * 클럽의 모든 수업 조회
 * @param clubId - 클럽 ID
 * @param params - 페이지네이션 파라미터 (옵션)
 * @returns 수업 목록
 */
export const getClasses = async (
  clubId: string,
  params?: PaginationParams
): Promise<Class[]> => {
  try {
    const classes = await api.get<Class[]>(`/teams/${clubId}/classes`, {
      params,
    });
    return classes;
  } catch (error: unknown) {
    console.error('[Class Service] 수업 조회 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '수업 목록을 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * 단일 수업 조회 (상세 정보)
 * @param classId - 수업 ID
 * @returns 수업 상세 정보 (일정 및 상품 포함)
 */
export const getClass = async (classId: string): Promise<Class> => {
  try {
    const classData = await api.get<Class>(`/classes/${classId}`);
    return classData;
  } catch (error: unknown) {
    console.error('[Class Service] 수업 조회 실패:', error);

    if (getApiErrorStatus(error) === 404) {
      throw new Error('수업을 찾을 수 없습니다.');
    }

    throw new Error(
      getApiErrorMessage(error, '수업 정보를 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * 수업 생성 (코치 전용)
 * @param clubId - 클럽 ID
 * @param classData - 수업 생성 데이터
 * @returns 생성된 수업 정보
 */
export const createClass = async (
  clubId: string,
  classData: {
    className: string;
    description?: string;
    ageMin?: number;
    ageMax?: number;
    capacity: number;
  }
): Promise<Class> => {
  try {
    const newClass = await api.post<Class>(`/teams/${clubId}/classes`, classData);
    return newClass;
  } catch (error: unknown) {
    console.error('[Class Service] 수업 생성 실패:', error);

    if (getApiErrorStatus(error) === 403) {
      throw new Error('수업 생성 권한이 없습니다.');
    }

    throw new Error(
      getApiErrorMessage(error, '수업 생성에 실패했습니다.')
    );
  }
};

/**
 * 수업 정보 수정 (코치 전용)
 * @param classId - 수업 ID
 * @param updates - 수정할 필드
 * @returns 수정된 수업 정보
 */
export const updateClass = async (
  classId: string,
  updates: Partial<
    Pick<Class, 'className' | 'description' | 'ageMin' | 'ageMax' | 'capacity'>
  >
): Promise<Class> => {
  try {
    const updatedClass = await api.patch<Class>(`/classes/${classId}`, updates);
    return updatedClass;
  } catch (error: unknown) {
    console.error('[Class Service] 수업 수정 실패:', error);

    if (getApiErrorStatus(error) === 403) {
      throw new Error('수업 수정 권한이 없습니다.');
    }

    throw new Error(
      getApiErrorMessage(error, '수업 정보 수정에 실패했습니다.')
    );
  }
};

/**
 * 수업 삭제 (코치 전용)
 * @param classId - 수업 ID
 */
export const deleteClass = async (classId: string): Promise<void> => {
  try {
    await api.delete(`/classes/${classId}`);
  } catch (error: unknown) {
    console.error('[Class Service] 수업 삭제 실패:', error);

    if (getApiErrorStatus(error) === 403) {
      throw new Error('수업 삭제 권한이 없습니다.');
    }

    throw new Error(
      getApiErrorMessage(error, '수업 삭제에 실패했습니다.')
    );
  }
};

/**
 * 수업 일정 조회
 * @param classId - 수업 ID
 * @param startDate - 시작 날짜 (옵션, ISO 8601)
 * @param endDate - 종료 날짜 (옵션, ISO 8601)
 * @returns 수업 일정 목록
 */
export const getClassSchedules = async (
  classId: string,
  startDate?: string,
  endDate?: string
): Promise<ClassSchedule[]> => {
  try {
    const params: Record<string, unknown> = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;

    const schedules = await api.get<ClassSchedule[]>(
      `/classes/${classId}/schedules`,
      { params }
    );
    return schedules;
  } catch (error: unknown) {
    console.error('[Class Service] 일정 조회 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '수업 일정을 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * 수업 일정 생성 (코치 전용)
 * @param classId - 수업 ID
 * @param scheduledDate - 수업 날짜 (ISO 8601)
 * @returns 생성된 일정 정보
 */
export const createClassSchedule = async (
  classId: string,
  scheduledDate: string
): Promise<ClassSchedule> => {
  try {
    const schedule = await api.post<ClassSchedule>(
      `/classes/${classId}/schedules`,
      { scheduledDate }
    );
    return schedule;
  } catch (error: unknown) {
    console.error('[Class Service] 일정 생성 실패:', error);

    if (getApiErrorStatus(error) === 403) {
      throw new Error('일정 생성 권한이 없습니다.');
    }

    throw new Error(
      getApiErrorMessage(error, '수업 일정 생성에 실패했습니다.')
    );
  }
};

/**
 * 수업 일정 취소 (코치 전용)
 * @param scheduleId - 일정 ID
 * @returns 취소된 일정 정보
 */
export const cancelClassSchedule = async (
  scheduleId: string
): Promise<ClassSchedule> => {
  try {
    const schedule = await api.post<ClassSchedule>(
      `/schedules/${scheduleId}/cancel`
    );
    return schedule;
  } catch (error: unknown) {
    console.error('[Class Service] 일정 취소 실패:', error);

    if (getApiErrorStatus(error) === 403) {
      throw new Error('일정 취소 권한이 없습니다.');
    }

    throw new Error(
      getApiErrorMessage(error, '수업 일정 취소에 실패했습니다.')
    );
  }
};

/**
 * 수업 상품 조회 (가격 정보)
 * @param classId - 수업 ID
 * @returns 상품 목록
 */
export const getClassProducts = async (
  classId: string
): Promise<ClassProduct[]> => {
  try {
    const products = await api.get<ClassProduct[]>(
      `/classes/${classId}/products`
    );
    return products;
  } catch (error: unknown) {
    console.error('[Class Service] 상품 조회 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '수업 상품을 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * 단일 상품 조회
 * @param productId - 상품 ID
 * @returns 상품 상세 정보
 */
export const getClassProduct = async (
  productId: string
): Promise<ClassProduct> => {
  try {
    const product = await api.get<ClassProduct>(`/products/${productId}`);
    return product;
  } catch (error: unknown) {
    console.error('[Class Service] 상품 조회 실패:', error);

    if (getApiErrorStatus(error) === 404) {
      throw new Error('상품을 찾을 수 없습니다.');
    }

    throw new Error(
      getApiErrorMessage(error, '상품 정보를 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * 수업 상품 생성 (코치 전용)
 * @param classId - 수업 ID
 * @param productData - 상품 생성 데이터
 * @returns 생성된 상품 정보
 */
export const createClassProduct = async (
  classId: string,
  productData: {
    productName: string;
    price: number;
    sessionsPerMonth: number;
    description?: string;
    // PACKAGE_WEEKS_SPEC §3 — 정기권 단위 명시 입력 (선택, 누락 시 BE 폴백).
    packageWeeks?: number;
    packageTotalSessions?: number;
    packageSessionsPerWeek?: number;
  }
): Promise<ClassProduct> => {
  try {
    const product = await api.post<ClassProduct>(
      `/classes/${classId}/products`,
      productData
    );
    return product;
  } catch (error: unknown) {
    console.error('[Class Service] 상품 생성 실패:', error);

    if (getApiErrorStatus(error) === 403) {
      throw new Error('상품 생성 권한이 없습니다.');
    }

    throw new Error(
      getApiErrorMessage(error, '상품 생성에 실패했습니다.')
    );
  }
};

/**
 * 수업 상품 수정 (코치 전용)
 * @param productId - 상품 ID
 * @param updates - 수정할 필드
 * @returns 수정된 상품 정보
 */
export const updateClassProduct = async (
  productId: string,
  updates: Partial<
    Pick<
      ClassProduct,
      | 'productName'
      | 'price'
      | 'sessionsPerMonth'
      | 'description'
      | 'packageWeeks'
      | 'packageTotalSessions'
      | 'packageSessionsPerWeek'
    >
  >
): Promise<ClassProduct> => {
  try {
    const product = await api.patch<ClassProduct>(
      `/products/${productId}`,
      updates
    );
    return product;
  } catch (error: unknown) {
    console.error('[Class Service] 상품 수정 실패:', error);

    if (getApiErrorStatus(error) === 403) {
      throw new Error('상품 수정 권한이 없습니다.');
    }

    throw new Error(
      getApiErrorMessage(error, '상품 정보 수정에 실패했습니다.')
    );
  }
};

/**
 * 수업 상품 삭제 (코치 전용)
 * @param productId - 상품 ID
 */
export const deleteClassProduct = async (productId: string): Promise<void> => {
  try {
    await api.delete(`/products/${productId}`);
  } catch (error: unknown) {
    console.error('[Class Service] 상품 삭제 실패:', error);

    if (getApiErrorStatus(error) === 403) {
      throw new Error('상품 삭제 권한이 없습니다.');
    }

    throw new Error(
      getApiErrorMessage(error, '상품 삭제에 실패했습니다.')
    );
  }
};

/**
 * 수업 등록 (결제 필요)
 * @param classId - 수업 ID
 * @param memberId - 멤버 ID
 * @param productId - 상품 ID
 * @returns 등록 완료 메시지 및 결제 정보
 */
export const enrollClass = async (
  classId: string,
  memberId: string,
  productId: string
): Promise<{ message: string; paymentId?: string }> => {
  try {
    const data: EnrollClassRequest = { classId, memberId, productId };
    const result = await api.post<{ message: string; paymentId?: string }>(
      `/classes/${classId}/enroll`,
      data
    );
    return result;
  } catch (error: unknown) {
    console.error('[Class Service] 수업 등록 실패:', error);

    const errorMessage = isAxiosError(error)
      ? error.response?.data?.error?.message
      : undefined;
    if (errorMessage?.includes('full')) {
      throw new Error('수업 정원이 초과되었습니다.');
    } else if (errorMessage?.includes('already')) {
      throw new Error('이미 등록한 수업입니다.');
    } else {
      throw new Error(errorMessage || '수업 등록에 실패했습니다.');
    }
  }
};

/**
 * 내가 등록한 수업 조회
 * @returns 등록한 수업 목록
 */
export const getMyEnrolledClasses = async (): Promise<Class[]> => {
  try {
    const classes = await api.get<Class[]>('/classes/my-enrolled');
    return classes;
  } catch (error: unknown) {
    console.error('[Class Service] 등록 수업 조회 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '등록한 수업을 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * Class Service Export
 */
export const classService = {
  getClasses,
  getClass,
  createClass,
  updateClass,
  deleteClass,
  getClassSchedules,
  createClassSchedule,
  cancelClassSchedule,
  getClassProducts,
  getClassProduct,
  createClassProduct,
  updateClassProduct,
  deleteClassProduct,
  enrollClass,
  getMyEnrolledClasses,
};

export default classService;
/* eslint-disable @typescript-eslint/no-explicit-any */
