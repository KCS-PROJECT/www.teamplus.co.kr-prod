/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tournament Registration Service
 * 대회 등록 API 호출
 */

import { api } from './api-client';
import {
  TournamentRegistration,
  TournamentRegistrationStatus,
  CreateTournamentRegistrationRequest,
  TournamentRegistrationFilterParams,
  FeePreview,
} from '../types/tournament-registration';
import { PaginatedResponse } from '../types';
import { getApiErrorMessage } from '@/lib/api-error';

/**
 * 대회 등록 목록 조회
 */
export const getTournamentRegistrations = async (
  params?: TournamentRegistrationFilterParams
): Promise<PaginatedResponse<TournamentRegistration>> => {
  try {
    return await api.get<PaginatedResponse<TournamentRegistration>>(
      '/tournaments/registrations',
      { params }
    );
  } catch (error: unknown) {
    console.error('[Tournament Registration Service] 목록 조회 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '대회 등록 목록을 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * 대회별 등록 목록 조회
 */
export const getRegistrationsByTournament = async (
  tournamentId: string
): Promise<TournamentRegistration[]> => {
  try {
    return await api.get<TournamentRegistration[]>(
      `/tournaments/${tournamentId}/registrations`
    );
  } catch (error: unknown) {
    console.error('[Tournament Registration Service] 대회별 조회 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '대회 등록 목록을 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * 대회 등록
 */
export const createTournamentRegistration = async (
  data: CreateTournamentRegistrationRequest
): Promise<TournamentRegistration> => {
  try {
    return await api.post<TournamentRegistration>('/tournaments/registrations', data);
  } catch (error: unknown) {
    console.error('[Tournament Registration Service] 등록 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '대회 등록에 실패했습니다.')
    );
  }
};

/**
 * 등록 상태 변경
 */
export const updateRegistrationStatus = async (
  registrationId: string,
  status: TournamentRegistrationStatus
): Promise<TournamentRegistration> => {
  try {
    return await api.patch<TournamentRegistration>(
      `/tournaments/registrations/${registrationId}`,
      { status }
    );
  } catch (error: unknown) {
    console.error('[Tournament Registration Service] 상태 변경 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '등록 상태 변경에 실패했습니다.')
    );
  }
};

/**
 * 등록 취소
 */
export const cancelTournamentRegistration = async (
  registrationId: string
): Promise<TournamentRegistration> => {
  return updateRegistrationStatus(registrationId, TournamentRegistrationStatus.CANCELLED);
};

/**
 * 참가비 미리보기
 */
export const getFeePreview = async (
  tournamentId: string,
  memberId: string
): Promise<FeePreview> => {
  try {
    return await api.get<FeePreview>(
      `/tournaments/${tournamentId}/fee-preview`,
      { params: { memberId } }
    );
  } catch (error: unknown) {
    console.error('[Tournament Registration Service] 요금 미리보기 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '참가비 정보를 불러오는 데 실패했습니다.')
    );
  }
};

export const tournamentRegistrationService = {
  getTournamentRegistrations,
  getRegistrationsByTournament,
  createTournamentRegistration,
  updateRegistrationStatus,
  cancelTournamentRegistration,
  getFeePreview,
};

export default tournamentRegistrationService;
