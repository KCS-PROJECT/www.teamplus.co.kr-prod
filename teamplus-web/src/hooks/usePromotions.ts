'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/services/api-client';

/**
 * AcademyPromotion (오픈클래스 광고) 도메인 훅
 *
 * Backend: /api/v1/academy-promotions
 * - GET    /                 : 공개 목록 (인증 불필요, clubId/lessonType 필터)
 * - GET    /:promotionId     : 상세 (viewCount 증가)
 * - POST   /                 : 등록 (COACH/DIRECTOR)
 * - PUT    /:promotionId     : 수정 (본인)
 * - DELETE /:promotionId     : 삭제 (본인 또는 ADMIN)
 */

export type LessonType = 'PRIVATE' | 'GROUP' | 'GAME_LESSON' | 'FUN';

export interface AcademyPromotion {
  id: string;
  coachId: string;
  clubId: string | null;
  title: string;
  content: string;
  imageUrl: string | null;
  lessonType: LessonType;
  scheduleInfo: string | null;
  priceInfo: string | null;
  capacity: number | null;
  venueInfo: string | null;
  contactPhone: string | null;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  coach?: {
    id: string;
    email: string;
    coachProfiles?: Array<{ firstName: string; lastName: string }>;
  };
}

export interface PromotionListFilters {
  page?: number;
  limit?: number;
  lessonType?: LessonType;
  clubId?: string;
}

export interface PromotionPagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PromotionFormInput {
  title: string;
  content: string;
  lessonType: LessonType;
  clubId?: string;
  imageUrl?: string;
  scheduleInfo?: string;
  priceInfo?: string;
  capacity?: number;
  venueInfo?: string;
  contactPhone?: string;
  startDate?: string;
  endDate?: string;
  isActive?: boolean;
}

/** 광고 목록 조회 (공개) */
export function usePromotions(filters: PromotionListFilters = {}) {
  const [promotions, setPromotions] = useState<AcademyPromotion[]>([]);
  const [pagination, setPagination] = useState<PromotionPagination>({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filterKey = JSON.stringify({
    page: filters.page ?? 1,
    limit: filters.limit ?? 10,
    lessonType: filters.lessonType,
    clubId: filters.clubId,
  });

  const fetchList = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(filters.page ?? 1));
      params.set('limit', String(filters.limit ?? 10));
      if (filters.lessonType) params.set('lessonType', filters.lessonType);
      if (filters.clubId) params.set('clubId', filters.clubId);

      const res = await api.get<{ data: AcademyPromotion[]; pagination: PromotionPagination }>(
        `/academy-promotions?${params.toString()}`,
      );
      if (res.success && res.data) {
        setPromotions(res.data.data ?? []);
        setPagination(
          res.data.pagination ?? { total: 0, page: 1, limit: 10, totalPages: 0 },
        );
      } else {
        setPromotions([]);
        setError(res.message ?? '목록을 불러올 수 없습니다.');
      }
    } catch {
      setPromotions([]);
      setError('목록을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  return { promotions, pagination, isLoading, error, refresh: fetchList };
}

/** 광고 상세 조회 */
export function usePromotionDetail(promotionId: string | null) {
  const [promotion, setPromotion] = useState<AcademyPromotion | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(promotionId));
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!promotionId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get<AcademyPromotion>(`/academy-promotions/${promotionId}`);
      if (res.success && res.data) {
        setPromotion(res.data);
      } else {
        setPromotion(null);
        setError(res.message ?? '광고를 불러올 수 없습니다.');
      }
    } catch {
      setPromotion(null);
      setError('광고를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [promotionId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  return { promotion, isLoading, error, refresh: fetchDetail };
}

/** 광고 등록/수정/삭제 */
export function usePromotionMutations() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createPromotion = useCallback(
    async (data: PromotionFormInput): Promise<AcademyPromotion | null> => {
      setIsSubmitting(true);
      try {
        const res = await api.post<AcademyPromotion>('/academy-promotions', data);
        return res.success && res.data ? res.data : null;
      } catch {
        return null;
      } finally {
        setIsSubmitting(false);
      }
    },
    [],
  );

  const updatePromotion = useCallback(
    async (
      promotionId: string,
      data: Partial<PromotionFormInput>,
    ): Promise<AcademyPromotion | null> => {
      setIsSubmitting(true);
      try {
        const res = await api.put<AcademyPromotion>(
          `/academy-promotions/${promotionId}`,
          data,
        );
        return res.success && res.data ? res.data : null;
      } catch {
        return null;
      } finally {
        setIsSubmitting(false);
      }
    },
    [],
  );

  const deletePromotion = useCallback(async (promotionId: string): Promise<boolean> => {
    setIsSubmitting(true);
    try {
      const res = await api.delete(`/academy-promotions/${promotionId}`);
      return res.success;
    } catch {
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  return { createPromotion, updatePromotion, deletePromotion, isSubmitting };
}
