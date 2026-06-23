/**
 * Academy Promotion Service
 * 오픈클래스 프로모션 API 호출
 */

import { api } from './api-client';
import { getApiErrorMessage } from '@/lib/api-error';
import {
  AcademyPromotion,
  PromotionStatus,
  CreateAcademyPromotionRequest,
  UpdateAcademyPromotionRequest,
  PromotionFilterParams,
} from '../types/academy-promotion';
import { PaginatedResponse } from '../types';

/**
 * 프로모션 목록 조회
 */
export const getAcademyPromotions = async (
  params?: PromotionFilterParams
): Promise<PaginatedResponse<AcademyPromotion>> => {
  try {
    return await api.get<PaginatedResponse<AcademyPromotion>>(
      '/academy-promotions',
      { params }
    );
  } catch (error: unknown) {
    console.error('[Academy Promotion Service] 목록 조회 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '프로모션 목록을 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * 프로모션 단일 조회
 */
export const getAcademyPromotion = async (
  promotionId: string
): Promise<AcademyPromotion> => {
  try {
    return await api.get<AcademyPromotion>(`/academy-promotions/${promotionId}`);
  } catch (error: unknown) {
    console.error('[Academy Promotion Service] 조회 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '프로모션 정보를 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * 프로모션 생성
 */
export const createAcademyPromotion = async (
  data: CreateAcademyPromotionRequest
): Promise<AcademyPromotion> => {
  try {
    return await api.post<AcademyPromotion>('/academy-promotions', data);
  } catch (error: unknown) {
    console.error('[Academy Promotion Service] 생성 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '프로모션 생성에 실패했습니다.')
    );
  }
};

/**
 * 프로모션 수정
 */
export const updateAcademyPromotion = async (
  promotionId: string,
  data: UpdateAcademyPromotionRequest
): Promise<AcademyPromotion> => {
  try {
    return await api.patch<AcademyPromotion>(
      `/academy-promotions/${promotionId}`,
      data
    );
  } catch (error: unknown) {
    console.error('[Academy Promotion Service] 수정 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '프로모션 수정에 실패했습니다.')
    );
  }
};

/**
 * 프로모션 활성화/비활성화
 */
export const updatePromotionStatus = async (
  promotionId: string,
  status: PromotionStatus
): Promise<AcademyPromotion> => {
  return updateAcademyPromotion(promotionId, { status });
};

/**
 * 프로모션 삭제
 */
export const deleteAcademyPromotion = async (promotionId: string): Promise<void> => {
  try {
    await api.delete(`/academy-promotions/${promotionId}`);
  } catch (error: unknown) {
    console.error('[Academy Promotion Service] 삭제 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '프로모션 삭제에 실패했습니다.')
    );
  }
};

export const academyPromotionService = {
  getAcademyPromotions,
  getAcademyPromotion,
  createAcademyPromotion,
  updateAcademyPromotion,
  updatePromotionStatus,
  deleteAcademyPromotion,
};

export default academyPromotionService;
