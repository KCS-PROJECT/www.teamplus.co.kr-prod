/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * RSVP Service
 * 수업 일정 예약 응답 API 호출
 */

import { api } from './api-client';
import {
  RsvpResponse,
  RsvpSummary,
  CreateRsvpRequest,
  UpdateRsvpRequest,
  RsvpStatus,
} from '../types/rsvp';
import { PaginatedResponse, PaginationParams } from '../types';
import { getApiErrorMessage } from '@/lib/api-error';

/**
 * 일정별 RSVP 목록 조회
 */
export const getRsvpsBySchedule = async (
  scheduleId: string,
  params?: PaginationParams & { status?: RsvpStatus }
): Promise<PaginatedResponse<RsvpResponse>> => {
  try {
    return await api.get<PaginatedResponse<RsvpResponse>>(
      `/rsvp/schedule/${scheduleId}`,
      { params }
    );
  } catch (error: unknown) {
    console.error('[RSVP Service] 목록 조회 실패:', error);
    throw new Error(getApiErrorMessage(error, 'RSVP 목록을 불러오는 데 실패했습니다.'));
  }
};

/**
 * 일정 RSVP 요약 조회
 */
export const getRsvpSummary = async (scheduleId: string): Promise<RsvpSummary> => {
  try {
    return await api.get<RsvpSummary>(`/rsvp/schedule/${scheduleId}/summary`);
  } catch (error: unknown) {
    console.error('[RSVP Service] 요약 조회 실패:', error);
    throw new Error(getApiErrorMessage(error, 'RSVP 요약을 불러오는 데 실패했습니다.'));
  }
};

/**
 * RSVP 생성 (관리자용)
 */
export const createRsvp = async (data: CreateRsvpRequest): Promise<RsvpResponse> => {
  try {
    return await api.post<RsvpResponse>('/rsvp', data);
  } catch (error: unknown) {
    console.error('[RSVP Service] 생성 실패:', error);
    throw new Error(getApiErrorMessage(error, 'RSVP 생성에 실패했습니다.'));
  }
};

/**
 * RSVP 상태 수정
 */
export const updateRsvp = async (
  rsvpId: string,
  data: UpdateRsvpRequest
): Promise<RsvpResponse> => {
  try {
    return await api.patch<RsvpResponse>(`/rsvp/${rsvpId}`, data);
  } catch (error: unknown) {
    console.error('[RSVP Service] 수정 실패:', error);
    throw new Error(getApiErrorMessage(error, 'RSVP 수정에 실패했습니다.'));
  }
};

/**
 * RSVP 삭제
 */
export const deleteRsvp = async (rsvpId: string): Promise<void> => {
  try {
    await api.delete(`/rsvp/${rsvpId}`);
  } catch (error: unknown) {
    console.error('[RSVP Service] 삭제 실패:', error);
    throw new Error(getApiErrorMessage(error, 'RSVP 삭제에 실패했습니다.'));
  }
};

export const rsvpService = {
  getRsvpsBySchedule,
  getRsvpSummary,
  createRsvp,
  updateRsvp,
  deleteRsvp,
};

export default rsvpService;
