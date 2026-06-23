'use client';

/**
 * usePlayerPortfolio (Task #32 I-1)
 *
 * 선수 이력 카드 통합 뷰를 위해 두 엔드포인트를 병렬로 조회한다.
 *   - GET /api/v1/awards/portfolio/:memberId   → 수업 이력 + 수상
 *   - GET /api/v1/tournaments/player-stats/:memberId → 대회 + 합산 스탯
 *
 * 권한:
 *   - PARENT 본인 자녀만 조회 가능 (BE 검증)
 *   - 각 엔드포인트 중 하나가 실패해도 다른 쪽 데이터는 반환한다.
 */

import { useCallback, useEffect, useState } from 'react';
import { awardsService } from '@/services/awards.service';
import { getPlayerTournamentStats } from '@/services/tournament.service';
import { MESSAGES } from '@/lib/messages';
import type {
  PlayerPortfolio,
  PlayerTournamentStats,
} from '@/types/portfolio';

interface UsePlayerPortfolioReturn {
  /** 수업·수상 포트폴리오 */
  portfolio: PlayerPortfolio | null;
  /** 대회 참가 이력 + 스탯 */
  tournamentStats: PlayerTournamentStats | null;
  isLoading: boolean;
  errorMessage: string | null;
  refresh: () => Promise<void>;
}

export function usePlayerPortfolio(
  memberId: string | null | undefined,
): UsePlayerPortfolioReturn {
  const [portfolio, setPortfolio] = useState<PlayerPortfolio | null>(null);
  const [tournamentStats, setTournamentStats] =
    useState<PlayerTournamentStats | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!memberId) {
      setPortfolio(null);
      setTournamentStats(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const [portfolioRes, statsRes] = await Promise.all([
      awardsService.getPortfolio(memberId),
      getPlayerTournamentStats(memberId),
    ]);

    // 포트폴리오(수업/수상)
    if (portfolioRes.success && portfolioRes.data) {
      setPortfolio(portfolioRes.data);
    } else {
      setPortfolio(null);
    }

    // 대회 스탯
    if (statsRes.success && statsRes.data) {
      setTournamentStats(statsRes.data);
    } else {
      setTournamentStats(null);
    }

    // 둘 다 실패해야 에러로 간주
    if (!portfolioRes.success && !statsRes.success) {
      const firstMsg =
        portfolioRes.error?.message ??
        statsRes.error?.message ??
        MESSAGES.common.loadFailed;
      setErrorMessage(firstMsg);
    }

    setIsLoading(false);
  }, [memberId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    portfolio,
    tournamentStats,
    isLoading,
    errorMessage,
    refresh,
  };
}
