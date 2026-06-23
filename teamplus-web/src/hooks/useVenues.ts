'use client';

/**
 * useVenues / useVenueDetail — 구장 데이터 페칭 훅
 *
 * TEAMPLUS 프론트엔드 표준 훅 패턴(useState + useCallback + useEffect)을 준수하며,
 * TanStack Query 없이 동작합니다. 오프라인/에러 상태에도 안전한 폴백을 제공합니다.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { venueService, type ListVenuesParams } from '@/services/venueService';
import type {
  Venue,
  VenuePayload,
  VenueStatus,
  VenuePermissions,
} from '@/types/venue';
import { useAuth } from '@/contexts/AuthContext';
import { MESSAGES } from '@/lib/messages';

const EMPTY_LIST: Venue[] = [];

/**
 * 역할별 권한 계산 유틸 — 컴포넌트에서도 재사용 가능
 */
export function computeVenuePermissions(
  userType: string | null | undefined,
): VenuePermissions {
  const role = (userType ?? '').toLowerCase();
  const isAdmin = role === 'admin';
  const isDirector = role === 'director' || role === 'academy_director';
  const isCoach = role === 'coach';
  const canManage = isAdmin || isDirector || isCoach;

  return {
    canCreate: canManage,
    canUpdate: canManage,
    canDelete: isAdmin || isDirector,
    canToggleStatus: canManage,
    canUploadImage: canManage,
    canViewManage: canManage,
  };
}

/**
 * 구장 목록 페칭 훅
 */
export function useVenues(initialParams: ListVenuesParams = {}) {
  const [venues, setVenues] = useState<Venue[]>(EMPTY_LIST);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState<ListVenuesParams>(initialParams);

  const fetchVenues = useCallback(async (p: ListVenuesParams = params) => {
    setIsLoading(true);
    setError(null);
    const response = await venueService.listVenues({ limit: 20, ...p });
    if (response.success && response.data) {
      setVenues(response.data.data ?? EMPTY_LIST);
    } else {
      setError(response.error?.message ?? MESSAGES.venue.searchError);
      setVenues(EMPTY_LIST);
    }
    setIsLoading(false);
  }, [params]);

  useEffect(() => {
    void fetchVenues(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.search, params.city, params.page, params.limit]);

  const refresh = useCallback(() => fetchVenues(params), [fetchVenues, params]);

  return {
    venues,
    isLoading,
    error,
    params,
    setParams,
    refresh,
  };
}

/**
 * 구장 상세 페칭 훅
 */
export function useVenueDetail(id: string | null | undefined) {
  const [venue, setVenue] = useState<Venue | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(!!id);
  const [error, setError] = useState<string | null>(null);

  const fetchVenue = useCallback(async () => {
    if (!id) {
      setVenue(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    const response = await venueService.getVenue(id);
    if (response.success && response.data) {
      setVenue(response.data);
    } else {
      setError(response.error?.message ?? MESSAGES.venue.searchError);
      setVenue(null);
    }
    setIsLoading(false);
  }, [id]);

  useEffect(() => {
    void fetchVenue();
  }, [fetchVenue]);

  return { venue, isLoading, error, refresh: fetchVenue };
}

/**
 * 관리 작업 뮤테이션 훅
 */
export function useVenueMutations(onMutate?: () => void) {
  const [isSaving, setIsSaving] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const createVenue = useCallback(async (payload: VenuePayload) => {
    setIsSaving(true);
    setMutationError(null);
    const res = await venueService.createVenue(payload);
    setIsSaving(false);
    if (res.success && res.data) {
      onMutate?.();
      return { ok: true as const, venue: res.data };
    }
    const message = res.error?.message ?? MESSAGES.venue.result.saveError;
    setMutationError(message);
    return { ok: false as const, message };
  }, [onMutate]);

  const updateVenue = useCallback(
    async (id: string, payload: Partial<VenuePayload>) => {
      setIsSaving(true);
      setMutationError(null);
      const res = await venueService.updateVenue(id, payload);
      setIsSaving(false);
      if (res.success && res.data) {
        onMutate?.();
        return { ok: true as const, venue: res.data };
      }
      const message = res.error?.message ?? MESSAGES.venue.result.saveError;
      setMutationError(message);
      return { ok: false as const, message };
    },
    [onMutate],
  );

  const deleteVenue = useCallback(
    async (id: string) => {
      setIsSaving(true);
      setMutationError(null);
      const res = await venueService.deleteVenue(id);
      setIsSaving(false);
      if (res.success && res.data?.success) {
        onMutate?.();
        return { ok: true as const };
      }
      const message = res.error?.message ?? MESSAGES.venue.result.deleteError;
      setMutationError(message);
      return { ok: false as const, message };
    },
    [onMutate],
  );

  const updateStatus = useCallback(
    async (id: string, status: VenueStatus) => {
      setIsSaving(true);
      setMutationError(null);
      const res = await venueService.updateStatus(id, status);
      setIsSaving(false);
      if (res.success && res.data) {
        onMutate?.();
        return { ok: true as const, venue: res.data };
      }
      const message =
        res.error?.message ?? MESSAGES.venue.result.statusUpdateError;
      setMutationError(message);
      return { ok: false as const, message };
    },
    [onMutate],
  );

  return { isSaving, mutationError, createVenue, updateVenue, deleteVenue, updateStatus };
}

/**
 * 현재 사용자 권한을 계산해 반환 (단순 래퍼)
 */
export function useVenuePermissions(): VenuePermissions {
  const { user } = useAuth();
  return useMemo(
    () => computeVenuePermissions(user?.userType),
    [user?.userType],
  );
}
