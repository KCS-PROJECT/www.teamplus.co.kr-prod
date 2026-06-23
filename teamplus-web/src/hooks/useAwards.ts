'use client';

import { useCallback, useEffect, useState } from 'react';
import { awardsService, type ListAwardsQuery } from '@/services/awards.service';
import { MESSAGES } from '@/lib/messages';
import type {
  PlayerAward,
  CreatePlayerAwardPayload,
  UpdatePlayerAwardPayload,
} from '@/types/awards';

// ────────────────────────────────────────────
// useAwardsByMember — 특정 자녀 수상 이력 목록
// ────────────────────────────────────────────

interface UseAwardsByMemberReturn {
  awards: PlayerAward[];
  isLoading: boolean;
  errorMessage: string | null;
  refresh: () => Promise<void>;
}

export function useAwardsByMember(
  memberId: string | null | undefined,
  filters?: Omit<ListAwardsQuery, 'memberId'>,
): UseAwardsByMemberReturn {
  const [awards, setAwards] = useState<PlayerAward[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const awardType = filters?.awardType;
  const season = filters?.season;

  const refresh = useCallback(async () => {
    if (!memberId) {
      setAwards([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const response = await awardsService.listByMember(memberId, {
      awardType,
      season,
    });

    if (!response.success) {
      setAwards([]);
      setErrorMessage(response.error?.message || MESSAGES.awards.loadError);
      setIsLoading(false);
      return;
    }

    const data = Array.isArray(response.data) ? response.data : [];
    // 수상일 내림차순 정렬 (sort는 원본 불변 변환 — 스프레드로 복제)
    const sorted = [...data].sort((a, b) => {
      const ta = new Date(a.awardedAt).getTime() || 0;
      const tb = new Date(b.awardedAt).getTime() || 0;
      return tb - ta;
    });

    setAwards(sorted);
    setIsLoading(false);
  }, [memberId, awardType, season]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { awards, isLoading, errorMessage, refresh };
}

// ────────────────────────────────────────────
// useAward — 단건 조회 (수정 화면용)
// ────────────────────────────────────────────

interface UseAwardReturn {
  award: PlayerAward | null;
  isLoading: boolean;
  errorMessage: string | null;
  refresh: () => Promise<void>;
}

export function useAward(
  id: string | null | undefined,
): UseAwardReturn {
  const [award, setAward] = useState<PlayerAward | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!id) {
      setAward(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const response = await awardsService.getById(id);

    if (!response.success) {
      setAward(null);
      setErrorMessage(response.error?.message || MESSAGES.awards.loadError);
      setIsLoading(false);
      return;
    }

    setAward(response.data ?? null);
    setIsLoading(false);
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { award, isLoading, errorMessage, refresh };
}

// ────────────────────────────────────────────
// useAwardMutations — 생성/수정/삭제
// ────────────────────────────────────────────

interface UseAwardMutationsReturn {
  createAward: (payload: CreatePlayerAwardPayload) => Promise<PlayerAward | null>;
  updateAward: (
    id: string,
    payload: UpdatePlayerAwardPayload,
  ) => Promise<PlayerAward | null>;
  removeAward: (id: string) => Promise<boolean>;
  isSubmitting: boolean;
  errorMessage: string | null;
  clearError: () => void;
}

export function useAwardMutations(): UseAwardMutationsReturn {
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const clearError = useCallback(() => setErrorMessage(null), []);

  const createAward = useCallback(
    async (payload: CreatePlayerAwardPayload): Promise<PlayerAward | null> => {
      setIsSubmitting(true);
      setErrorMessage(null);

      const response = await awardsService.create(payload);
      setIsSubmitting(false);

      if (!response.success) {
        setErrorMessage(response.error?.message || MESSAGES.awards.createError);
        return null;
      }

      return response.data ?? null;
    },
    [],
  );

  const updateAward = useCallback(
    async (
      id: string,
      payload: UpdatePlayerAwardPayload,
    ): Promise<PlayerAward | null> => {
      setIsSubmitting(true);
      setErrorMessage(null);

      const response = await awardsService.update(id, payload);
      setIsSubmitting(false);

      if (!response.success) {
        setErrorMessage(response.error?.message || MESSAGES.awards.updateError);
        return null;
      }

      return response.data ?? null;
    },
    [],
  );

  const removeAward = useCallback(async (id: string): Promise<boolean> => {
    setIsSubmitting(true);
    setErrorMessage(null);

    const response = await awardsService.remove(id);
    setIsSubmitting(false);

    if (!response.success) {
      setErrorMessage(response.error?.message || MESSAGES.awards.deleteError);
      return false;
    }

    return true;
  }, []);

  return {
    createAward,
    updateAward,
    removeAward,
    isSubmitting,
    errorMessage,
    clearError,
  };
}
