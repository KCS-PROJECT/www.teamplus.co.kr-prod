/**
 * Awards Service (Task #26 C-4)
 *
 * Backend: src/awards/awards.controller.ts
 *   - POST   /api/v1/awards/player                 (ADMIN/DIRECTOR/COACH/PARENT)
 *   - PATCH  /api/v1/awards/player/:id             (ADMIN/DIRECTOR/COACH/PARENT)
 *   - DELETE /api/v1/awards/player/:id             (ADMIN/DIRECTOR only)
 *   - GET    /api/v1/awards/player?memberId&awardType&season
 *   - GET    /api/v1/awards/player/:id
 *   - GET    /api/v1/awards/portfolio/:memberId
 */

import { api } from '@/services/api-client';
import type { ApiResponse } from '@/types/api';
import type {
  PlayerAward,
  CreatePlayerAwardPayload,
  UpdatePlayerAwardPayload,
} from '@/types/awards';
import type { PlayerPortfolio } from '@/types/portfolio';

export interface ListAwardsQuery {
  memberId?: string;
  awardType?: string;
  season?: string;
}

/**
 * @deprecated `PlayerPortfolio` (in `@/types/portfolio`) 사용을 권장한다.
 * 기존 호출부 호환성을 위한 별칭.
 */
export type PortfolioResponse = PlayerPortfolio;

function buildListPath(query: ListAwardsQuery): string {
  const params = new URLSearchParams();
  if (query.memberId) params.set('memberId', query.memberId);
  if (query.awardType) params.set('awardType', query.awardType);
  if (query.season) params.set('season', query.season);
  const qs = params.toString();
  return qs ? `/awards/player?${qs}` : '/awards/player';
}

export const awardsService = {
  /** 수상 이력 목록 조회 */
  list(query: ListAwardsQuery = {}): Promise<ApiResponse<PlayerAward[]>> {
    return api.get<PlayerAward[]>(buildListPath(query));
  },

  /** 특정 자녀(TeamMember) 수상 이력 목록 */
  listByMember(
    memberId: string,
    opts?: Omit<ListAwardsQuery, 'memberId'>,
  ): Promise<ApiResponse<PlayerAward[]>> {
    return awardsService.list({ memberId, ...opts });
  },

  /** 수상 이력 단건 조회 */
  getById(id: string): Promise<ApiResponse<PlayerAward>> {
    return api.get<PlayerAward>(`/awards/player/${encodeURIComponent(id)}`);
  },

  /** 수상 이력 등록 (PARENT 허용) */
  create(payload: CreatePlayerAwardPayload): Promise<ApiResponse<PlayerAward>> {
    return api.post<PlayerAward>('/awards/player', payload);
  },

  /** 수상 이력 수정 (PARENT 허용) */
  update(
    id: string,
    payload: UpdatePlayerAwardPayload,
  ): Promise<ApiResponse<PlayerAward>> {
    return api.patch<PlayerAward>(
      `/awards/player/${encodeURIComponent(id)}`,
      payload,
    );
  },

  /** 수상 이력 삭제 (ADMIN/DIRECTOR만 가능, PARENT는 호출 시 403) */
  remove(id: string): Promise<ApiResponse<void>> {
    return api.delete<void>(`/awards/player/${encodeURIComponent(id)}`);
  },

  /** 통합 포트폴리오 조회 (수상 + 수업 이력 + 팀 수상) */
  getPortfolio(memberId: string): Promise<ApiResponse<PlayerPortfolio>> {
    return api.get<PlayerPortfolio>(
      `/awards/portfolio/${encodeURIComponent(memberId)}`,
    );
  },
};
