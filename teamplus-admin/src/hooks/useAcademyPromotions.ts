/**
 * useAcademyPromotions - 오픈클래스 프로모션 TanStack Query 훅
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { academyPromotionService } from '../services/academy-promotion.service';
import {
  CreateAcademyPromotionRequest,
  UpdateAcademyPromotionRequest,
  PromotionFilterParams,
  PromotionStatus,
} from '../types/academy-promotion';

const PROMOTION_QUERY_KEYS = {
  all: ['academy-promotions'] as const,
  list: (params?: PromotionFilterParams) =>
    ['academy-promotions', 'list', params] as const,
  detail: (promotionId: string) =>
    ['academy-promotions', 'detail', promotionId] as const,
};

/**
 * 프로모션 목록 조회
 */
export function useAcademyPromotions(params?: PromotionFilterParams) {
  return useQuery({
    queryKey: PROMOTION_QUERY_KEYS.list(params),
    queryFn: () => academyPromotionService.getAcademyPromotions(params),
    staleTime: 60_000,
  });
}

/**
 * 프로모션 단일 조회
 */
export function useAcademyPromotion(promotionId: string) {
  return useQuery({
    queryKey: PROMOTION_QUERY_KEYS.detail(promotionId),
    queryFn: () => academyPromotionService.getAcademyPromotion(promotionId),
    enabled: !!promotionId,
    staleTime: 60_000,
  });
}

/**
 * 프로모션 생성
 */
export function useCreateAcademyPromotion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateAcademyPromotionRequest) =>
      academyPromotionService.createAcademyPromotion(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROMOTION_QUERY_KEYS.all });
    },
  });
}

/**
 * 프로모션 수정
 */
export function useUpdateAcademyPromotion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      promotionId,
      data,
    }: {
      promotionId: string;
      data: UpdateAcademyPromotionRequest;
    }) => academyPromotionService.updateAcademyPromotion(promotionId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: PROMOTION_QUERY_KEYS.all });
      queryClient.invalidateQueries({
        queryKey: PROMOTION_QUERY_KEYS.detail(variables.promotionId),
      });
    },
  });
}

/**
 * 프로모션 상태 변경
 */
export function useUpdatePromotionStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      promotionId,
      status,
    }: {
      promotionId: string;
      status: PromotionStatus;
    }) => academyPromotionService.updatePromotionStatus(promotionId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROMOTION_QUERY_KEYS.all });
    },
  });
}

/**
 * 프로모션 삭제
 */
export function useDeleteAcademyPromotion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (promotionId: string) =>
      academyPromotionService.deleteAcademyPromotion(promotionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROMOTION_QUERY_KEYS.all });
    },
  });
}
