/**
 * RSVP (참석/불참 사전응답) 타입 정의
 * TEAMPLUS 수업·훈련·경기 참석 응답 시스템
 */

/** RSVP 응답 상태 */
export type RsvpStatus = 'ATTENDING' | 'DECLINED' | 'NO_RESPONSE';

/** RSVP 응답 단건 */
export interface RsvpResponse {
  id: string;
  scheduleId: string;
  memberId: string;
  memberName: string;
  status: RsvpStatus;
  declineReason?: string;
  respondedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

/** RSVP 요약 통계 */
export interface RsvpSummary {
  scheduleId: string;
  attending: number;
  declined: number;
  noResponse: number;
  total: number;
  attendingMembers: RsvpMemberInfo[];
  declinedMembers: RsvpMemberInfo[];
  noResponseMembers: RsvpMemberInfo[];
}

/** RSVP 회원 간략 정보 */
export interface RsvpMemberInfo {
  memberId: string;
  memberName: string;
  status: RsvpStatus;
  declineReason?: string;
  respondedAt?: string;
}

/** RSVP 일정 정보 (카드 표시용) */
export interface RsvpScheduleInfo {
  scheduleId: string;
  date: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  trainingType: string;
  title: string;
  location: string;
  rsvpDeadline?: string;
  isExpired: boolean;
}

/** RSVP 응답 요청 DTO */
export interface RsvpSubmitRequest {
  scheduleId: string;
  status: 'ATTENDING' | 'DECLINED';
  declineReason?: string;
}
