/**
 * Player Portfolio 타입 (Task #32 I-1)
 *
 * Backend: GET /api/v1/awards/portfolio/:memberId
 * Backend: GET /api/v1/tournaments/player-stats/:memberId
 *
 * 선수 이력 카드 통합 뷰에서 사용하는 응답 DTO 를 정의한다.
 */

import type { PlayerAward } from '@/types/awards';

/**
 * Awards Portfolio 응답
 * - classHistories: 출석 요약(클래스 등록 이력)
 * - playerAwards: 개인 수상 기록
 * - summary: 집계
 */
export interface PortfolioClassHistoryItem {
  id: string;
  startDate: string;
  endDate: string | null;
  totalSessions: number;
  attendedSessions: number;
  attendanceRate: number;
  status: string;
  finalScore?: number | null;
  certificateUrl?: string | null;
  class?: {
    id: string;
    className?: string | null;
    levelRequired?: number | null;
  } | null;
}

export interface PortfolioMember {
  id: string;
  user?: {
    id?: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  } | null;
  club?: {
    id: string;
    clubName?: string | null;
  } | null;
}

export interface PortfolioSummary {
  totalClasses: number;
  completedClasses: number;
  activeClasses: number;
  totalAwards: number;
}

export interface PlayerPortfolio {
  member?: PortfolioMember | null;
  classHistories: PortfolioClassHistoryItem[];
  playerAwards: PlayerAward[];
  summary: PortfolioSummary;
}

/**
 * Tournament Player Stats 응답
 * - player: 기본 정보 + 포지션/등번호
 * - totalStats: 전체 합계
 * - tournaments: 대회별 참여/스탯
 */
export interface PlayerPosition {
  team: string;
  teamShortName?: string | null;
  position?: string | null;
  jerseyNumber?: number | null;
}

export interface PlayerTotalStats {
  goals: number;
  assists: number;
  points: number;
  penalties: number;
  penaltyMinutes: number;
  gamesPlayed: number;
  gameWinners?: number;
  powerPlayGoals?: number;
  shortHandedGoals?: number;
}

export interface TournamentStatsEntry {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
  stats: {
    goals: number;
    assists: number;
    points: number;
    penalties: number;
    penaltyMinutes: number;
    gamesPlayed: number;
    gameWinners: number;
    powerPlayGoals: number;
    shortHandedGoals: number;
  };
}

export interface PlayerTournamentStats {
  player: {
    memberId: string;
    playerName?: string | null;
    playerLevel?: string | null;
    positions?: PlayerPosition[];
  };
  totalStats: PlayerTotalStats;
  tournaments: TournamentStatsEntry[];
}
