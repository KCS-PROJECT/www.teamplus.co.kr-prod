/**
 * 대기자 명단 타입 정의
 *
 * ✅ 2026-04-22 B9 DTO 통일 완료
 *   - Backend `src/waitlist/dto/waitlist-response.dto.ts:33` 와 1:1 정렬
 *   - Backend: WAITING / CONFIRMED / CANCELLED / EXPIRED (대문자)
 *   - 이전 NOTIFIED / ENROLLED 는 Backend 에 없으므로 제거 (Admin UI 만의 보조 값이었음)
 *   - 추후 Backend 에 해당 상태 추가 시 동일 enum 에 추가하고 양쪽 동시 반영
 */

export enum WaitlistStatus {
  WAITING = 'WAITING',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

/**
 * 표시용 레이블 — UI 에서만 사용
 */
export const WAITLIST_STATUS_LABEL: Record<WaitlistStatus, string> = {
  [WaitlistStatus.WAITING]: '대기 중',
  [WaitlistStatus.CONFIRMED]: '확정',
  [WaitlistStatus.CANCELLED]: '취소',
  [WaitlistStatus.EXPIRED]: '만료',
};

export interface WaitlistEntry {
  id: string;
  classId: string;
  class?: {
    id: string;
    className: string;
  };
  memberId: string;
  member?: {
    id: string;
    playerName: string;
  };
  status: WaitlistStatus;
  position: number;
  notifiedAt?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWaitlistRequest {
  classId: string;
  memberId: string;
}

export interface WaitlistFilterParams {
  classId?: string;
  status?: WaitlistStatus;
  page?: number;
  pageSize?: number;
}
