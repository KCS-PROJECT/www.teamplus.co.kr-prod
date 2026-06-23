/**
 * RSVP (예약 응답) 타입 정의
 *
 * ⚠️ 주의: 이 enum 값은 Backend/Web의 RsvpStatus와 다릅니다.
 * - Backend/Web: 'ATTENDING' | 'DECLINED' | 'NO_RESPONSE' (대문자)
 * - Admin: 'pending' | 'confirmed' | 'declined' | 'waitlisted' | 'cancelled' (소문자)
 * - 공통 타입: @shared/types/enums.ts 의 RsvpStatus 참조
 * TODO: Backend API 응답 형식에 맞춰 통일 필요
 */

export enum RsvpStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  DECLINED = 'declined',
  WAITLISTED = 'waitlisted',
  CANCELLED = 'cancelled',
}

export interface RsvpResponse {
  id: string;
  scheduleId: string;
  memberId: string;
  member?: {
    id: string;
    playerName: string;
  };
  status: RsvpStatus;
  respondedAt?: string;
  memo?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RsvpSummary {
  scheduleId: string;
  confirmedCount: number;
  declinedCount: number;
  pendingCount: number;
  waitlistedCount: number;
  totalCapacity: number;
}

export interface CreateRsvpRequest {
  scheduleId: string;
  memberId: string;
  status: RsvpStatus;
  memo?: string;
}

export interface UpdateRsvpRequest {
  status: RsvpStatus;
  memo?: string;
}
