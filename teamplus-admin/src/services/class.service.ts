/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TEAMPLUS Class Service
 * 수업 조회 API 호출 (수업·일정·상품 조회 전용)
 */

import { api } from './api-client';
import { getApiErrorStatus, getApiErrorMessage } from '@/lib/api-error';
import {
  Class,
  ClassSchedule,
  ClassProduct,
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
 * Class Service Export
 */
export const classService = {
  getClasses,
  getClass,
  getClassSchedules,
  getClassProducts,
};

export default classService;
/* eslint-disable @typescript-eslint/no-explicit-any */
