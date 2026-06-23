/**
 * Awards (수상 이력) 타입
 * Backend: src/awards/{controller,dto,service}
 *   - PlayerAward (개인 수상)
 *   - POST/PATCH /api/v1/awards/player (PARENT 허용)
 *   - GET /api/v1/awards/player?memberId&awardType&season
 *   - GET /api/v1/awards/portfolio/:memberId
 *   - GET /api/v1/users/me/portfolio?clubId= (내 포트폴리오, C-4)
 */

export interface MyPortfolioResponse {
  memberId: string | null;
  club: { id: string; clubName: string } | null;
  classHistories: {
    id: string;
    startDate: string;
    endDate: string | null;
    totalSessions: number | null;
    attendedSessions: number | null;
    attendanceRate: number | null;
    status: string;
    finalScore: number | null;
    certificateUrl: string | null;
    coachComment: string | null;
    class: { id: string; className: string; levelRequired: string | null } | null;
  }[];
  playerAwards: PlayerAward[];
}

export const AWARD_TYPES = [
  'mvp',
  'best_scorer',
  'best_goalie',
  'most_improved',
  'sportsmanship',
  'skill',
  'attendance',
  'special',
] as const;

export type AwardType = (typeof AWARD_TYPES)[number];

export interface PlayerAward {
  id: string;
  memberId: string;
  awardName: string;
  awardType: AwardType | string;
  description?: string | null;
  awardedAt: string; // ISO date
  tournamentId?: string | null;
  matchId?: string | null;
  season?: string | null;
  awardedBy?: string | null;
  certificateUrl?: string | null;
  imageUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
  /** Portfolio 조회 시 포함 가능 */
  tournament?: {
    id: string;
    tournamentName?: string;
    name?: string;
  } | null;
  match?: {
    id: string;
    matchName?: string;
  } | null;
}

export interface CreatePlayerAwardPayload {
  memberId: string;
  awardName: string;
  awardType: AwardType | string;
  awardedAt: string;
  description?: string;
  tournamentId?: string;
  matchId?: string;
  season?: string;
  awardedBy?: string;
  certificateUrl?: string;
  imageUrl?: string;
}

export type UpdatePlayerAwardPayload = Partial<
  Omit<CreatePlayerAwardPayload, 'memberId'>
>;
