/**
 * Waitlist (대기자) 타입 정의
 * TEAMPLUS 수업 정원 초과 시 대기자 관리 시스템
 */

/** 대기자 상태 */
export type WaitlistStatus = 'WAITING' | 'PROMOTED' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED';

/** 대기자 항목 */
export interface WaitlistEntry {
  id: string;
  classId: string;
  memberId: string;
  memberName: string;
  status: WaitlistStatus;
  position: number;
  joinedAt: string;
  promotedAt?: string;
  confirmDeadline?: string;
  cancelledAt?: string;
}

/** 대기 현황 (사용자 화면용) */
export interface WaitlistStatusInfo {
  classId: string;
  className: string;
  capacity: number;
  enrolled: number;
  isFull: boolean;
  myPosition?: number;
  totalWaiting: number;
  myStatus?: WaitlistStatus;
  confirmDeadline?: string;
}

/** 대기 등록 요청 DTO */
export interface WaitlistJoinRequest {
  classId: string;
  memberId: string;
}

/** 대기 취소 요청 DTO */
export interface WaitlistCancelRequest {
  waitlistId: string;
}
