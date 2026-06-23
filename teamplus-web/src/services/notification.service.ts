import { api } from '@/services/api-client';
import type { ApiResponse } from '@/types';

/**
 * 팀 멤버 푸시 알림 서비스 — 코치/감독이 자기 팀 회원에게 발송.
 *
 * 백엔드 계약 (확정):
 *  - GET  /notifications/team/:teamId/recipients
 *      → ApiResponse<{ members; parents; managers }> (각각 Recipient[])
 *  - POST /notifications/team/:teamId/push
 *      → ApiResponse<{ success: true; sentCount: number }>
 *  - 권한 없거나 대상이 팀 무관이면 403.
 *
 * 모든 호출은 api-client (`@/services/api-client`) 의 ApiResponse 패턴을 따른다.
 */

/** 발송 대상 단건 — members(선수) · parents(학부모) · managers(감독/코치) 공통 */
export interface PushRecipient {
  userId: string;
  name: string;
  role: string;
}

/** 발송 대상 풀 — 그룹별로 분리되어 반환 */
export interface TeamPushRecipients {
  /** 선수 등 직접 멤버 */
  members: PushRecipient[];
  /** 선수의 학부모 */
  parents: PushRecipient[];
  /** 감독/코치 */
  managers: PushRecipient[];
}

/** 발송 요청 페이로드 */
export interface TeamPushPayload {
  /** 수신자 userId 배열 (1~200명) */
  userIds: string[];
  /** 알림 제목 (≤50자) */
  title: string;
  /** 알림 내용 (≤200자) */
  message: string;
  /** 내부 이동 경로 (선택) — '/' 로 시작하는 내부 경로만 허용 */
  linkUrl?: string;
}

/** 발송 결과 */
export interface TeamPushResult {
  success: true;
  sentCount: number;
}

/**
 * 발송 대상 풀 조회.
 * @param teamId 발송 팀 ID
 */
export async function getTeamPushRecipients(
  teamId: string,
): Promise<ApiResponse<TeamPushRecipients>> {
  return api.get<TeamPushRecipients>(
    `/notifications/team/${encodeURIComponent(teamId)}/recipients`,
  );
}

/**
 * 팀 멤버에게 푸시 알림 발송.
 * @param teamId  발송 팀 ID
 * @param payload 수신자/제목/내용
 */
export async function sendTeamPush(
  teamId: string,
  payload: TeamPushPayload,
): Promise<ApiResponse<TeamPushResult>> {
  return api.post<TeamPushResult>(
    `/notifications/team/${encodeURIComponent(teamId)}/push`,
    payload,
  );
}
