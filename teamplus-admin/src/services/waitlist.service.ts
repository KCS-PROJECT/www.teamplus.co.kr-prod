/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Waitlist Service
 * 대기자 명단 API 호출
 */

import { api } from './api-client';
import { getApiErrorMessage } from '@/lib/api-error';
import {
  WaitlistEntry,
  WaitlistStatus,
  CreateWaitlistRequest,
  WaitlistFilterParams,
} from '../types/waitlist';
import { PaginatedResponse } from '../types';

/**
 * 대기자 목록 조회
 */
export const getWaitlistEntries = async (
  params?: WaitlistFilterParams
): Promise<PaginatedResponse<WaitlistEntry>> => {
  try {
    return await api.get<PaginatedResponse<WaitlistEntry>>('/waitlist', { params });
  } catch (error: unknown) {
    console.error('[Waitlist Service] 목록 조회 실패:', error);
    throw new Error(getApiErrorMessage(error, '대기자 목록을 불러오는 데 실패했습니다.'));
  }
};

/**
 * 수업별 대기자 목록 조회
 */
export const getWaitlistByClass = async (
  classId: string
): Promise<WaitlistEntry[]> => {
  try {
    return await api.get<WaitlistEntry[]>(`/waitlist/class/${classId}`);
  } catch (error: unknown) {
    console.error('[Waitlist Service] 수업 대기자 조회 실패:', error);
    throw new Error(getApiErrorMessage(error, '대기자 목록을 불러오는 데 실패했습니다.'));
  }
};

/**
 * 대기자 등록
 */
export const createWaitlistEntry = async (
  data: CreateWaitlistRequest
): Promise<WaitlistEntry> => {
  try {
    return await api.post<WaitlistEntry>('/waitlist', data);
  } catch (error: unknown) {
    console.error('[Waitlist Service] 등록 실패:', error);
    throw new Error(getApiErrorMessage(error, '대기자 등록에 실패했습니다.'));
  }
};

/**
 * 대기자 상태 변경 (알림 전송, 등록 처리 등)
 */
export const updateWaitlistStatus = async (
  entryId: string,
  status: WaitlistStatus
): Promise<WaitlistEntry> => {
  try {
    return await api.patch<WaitlistEntry>(`/waitlist/${entryId}`, { status });
  } catch (error: unknown) {
    console.error('[Waitlist Service] 상태 변경 실패:', error);
    throw new Error(getApiErrorMessage(error, '상태 변경에 실패했습니다.'));
  }
};

/**
 * 대기자 삭제
 */
export const deleteWaitlistEntry = async (entryId: string): Promise<void> => {
  try {
    await api.delete(`/waitlist/${entryId}`);
  } catch (error: unknown) {
    console.error('[Waitlist Service] 삭제 실패:', error);
    throw new Error(getApiErrorMessage(error, '대기자 삭제에 실패했습니다.'));
  }
};

export const waitlistService = {
  getWaitlistEntries,
  getWaitlistByClass,
  createWaitlistEntry,
  updateWaitlistStatus,
  deleteWaitlistEntry,
};

export default waitlistService;
