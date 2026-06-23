/**
 * Member Level Service (Task #40 C-5 — Web/Director)
 *
 * Backend: src/member-level/member-level.controller.ts
 *   - GET   /api/v1/member-level/pending?season=
 *   - PATCH /api/v1/member-level/:historyId/approve
 *   - PATCH /api/v1/member-level/:historyId/override   body { newLevel: 1|2|3 }
 *   - POST  /api/v1/member-level/run                   (ADMIN only)
 *
 * 용도: 감독(DIRECTOR/ACADEMY_DIRECTOR)이 모바일 웹에서 자동 계산된 등급 변경 요청을
 *       승인하거나 직접 변경(오버라이드)하는 데 사용.
 */

import { api } from '@/services/api-client';
import type { ApiResponse } from '@/types/api';

export type MemberLevelTier = 1 | 2 | 3;

export type MemberLevelStatus =
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'DIRECTOR_OVERRIDE'
  | 'REJECTED';

/**
 * 서버 응답 형태 — `level-calculator.service.ts#getPendingApprovals`
 */
export interface PendingLevelApproval {
  id: string;
  userId: string;
  previousLevel: number;
  newLevel: number;
  previousName: string;
  newName: string;
  status: MemberLevelStatus;
  /**
   * `score=75.0:att=80:tour=70:coach=75:memberId=xxx` 형태 인코딩.
   * `parseReason()` 으로 구조화된 객체로 변환해서 사용.
   */
  reason: string | null;
  season: string | null;
  changedAt: string;
  user: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  } | null;
}

export interface ParsedReason {
  composite?: number;
  attendance?: number;
  tournament?: number;
  coach?: number;
  memberId?: string;
}

/** `reason` 문자열을 구조화된 점수 객체로 변환 */
export function parseReason(reason: string | null | undefined): ParsedReason {
  if (!reason) return {};

  const parts = reason.split(':').filter(Boolean);
  const out: ParsedReason = {};

  for (const part of parts) {
    const [rawKey, rawValue] = part.split('=');
    if (!rawKey || rawValue === undefined) continue;
    const key = rawKey.trim();
    const value = rawValue.trim();

    switch (key) {
      case 'score':
        out.composite = Number(value);
        break;
      case 'att':
        out.attendance = Number(value);
        break;
      case 'tour':
        out.tournament = Number(value);
        break;
      case 'coach':
        out.coach = Number(value);
        break;
      case 'memberId':
        out.memberId = value;
        break;
      default:
        break;
    }
  }

  return out;
}

/** 1=하위, 2=중위, 3=상위 */
export function tierLabel(tier: number): string {
  if (tier === 3) return '상위';
  if (tier === 2) return '중위';
  return '하위';
}

/** 현재 시즌 ("2024-2025" 포맷, 9월~다음해 8월) */
export function currentSeason(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return month >= 9 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

/** 최근 N개 시즌 목록 (기본 3개) */
export function recentSeasons(count: number = 3): string[] {
  const list: string[] = [];
  const now = new Date();
  const thisYear = now.getFullYear();
  const baseYear = now.getMonth() + 1 >= 9 ? thisYear : thisYear - 1;
  for (let i = 0; i < count; i++) {
    const y = baseYear - i;
    list.push(`${y}-${y + 1}`);
  }
  return list;
}

export const memberLevelService = {
  /** 승인 대기 목록 조회 */
  getPendingApprovals(
    season?: string,
  ): Promise<ApiResponse<PendingLevelApproval[]>> {
    const path = season
      ? `/member-level/pending?season=${encodeURIComponent(season)}`
      : '/member-level/pending';
    return api.get<PendingLevelApproval[]>(path);
  },

  /** 자동 계산 결과 승인 */
  approveLevel(historyId: string): Promise<ApiResponse<{ message: string }>> {
    return api.patch<{ message: string }>(
      `/member-level/${encodeURIComponent(historyId)}/approve`,
    );
  },

  /** 자동 계산 결과 오버라이드 (감독이 직접 지정) */
  overrideLevel(
    historyId: string,
    newLevel: MemberLevelTier,
  ): Promise<ApiResponse<{ message: string }>> {
    return api.patch<{ message: string }>(
      `/member-level/${encodeURIComponent(historyId)}/override`,
      { newLevel },
    );
  },

  /** 월간 배치 수동 실행 (ADMIN 전용 — director는 403) */
  runCalculation(): Promise<ApiResponse<{ processed: number; total: number }>> {
    return api.post<{ processed: number; total: number }>('/member-level/run');
  },
};

export default memberLevelService;
