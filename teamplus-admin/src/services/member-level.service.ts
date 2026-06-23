/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Member Level Service (Task #40 C-5)
 *
 * Backend: src/member-level/member-level.controller.ts
 *   - GET   /api/v1/member-level/pending?season=
 *   - PATCH /api/v1/member-level/:historyId/approve
 *   - PATCH /api/v1/member-level/:historyId/override   body { newLevel: 1|2|3 }
 *   - POST  /api/v1/member-level/run                   (ADMIN)
 *
 * 용도: 자동 계산된 등급 변경 요청을 감독이 승인/오버라이드하는 UI 전용 서비스.
 */

import { api } from './api-client';
import { getApiErrorMessage } from '@/lib/api-error';

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

export interface RunCalculationResult {
  processed: number;
  total: number;
}

async function getPendingApprovals(season?: string): Promise<PendingLevelApproval[]> {
  try {
    const path = season
      ? `/member-level/pending?season=${encodeURIComponent(season)}`
      : '/member-level/pending';
    return await api.get<PendingLevelApproval[]>(path);
  } catch (error: unknown) {
    console.error('[MemberLevel Service] 대기 목록 조회 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '등급 승인 대기 목록을 불러오지 못했습니다.'),
    );
  }
}

async function approveLevel(historyId: string): Promise<{ message: string }> {
  try {
    return await api.patch<{ message: string }>(
      `/member-level/${encodeURIComponent(historyId)}/approve`,
    );
  } catch (error: unknown) {
    console.error('[MemberLevel Service] 승인 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '등급 승인 처리에 실패했습니다.'),
    );
  }
}

async function overrideLevel(
  historyId: string,
  newLevel: MemberLevelTier,
): Promise<{ message: string }> {
  try {
    return await api.patch<{ message: string }>(
      `/member-level/${encodeURIComponent(historyId)}/override`,
      { newLevel },
    );
  } catch (error: unknown) {
    console.error('[MemberLevel Service] 오버라이드 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '등급 변경 처리에 실패했습니다.'),
    );
  }
}

async function runCalculation(): Promise<RunCalculationResult> {
  try {
    return await api.post<RunCalculationResult>('/member-level/run');
  } catch (error: unknown) {
    console.error('[MemberLevel Service] 수동 계산 실행 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '등급 계산 실행에 실패했습니다.'),
    );
  }
}

export const memberLevelService = {
  getPendingApprovals,
  approveLevel,
  overrideLevel,
  runCalculation,
};

export default memberLevelService;
