/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TEAMPLUS Attendance Service
 * 출석 관리 API 호출 (체크인, 이력 조회)
 */

import { api } from './api-client';
import { getApiErrorStatus, getApiErrorMessage } from '@/lib/api-error';
import {
  Attendance,
  CheckInRequest,
  AttendanceHistoryFilter,
  MemberCredit,
  PaginationParams,
  Status,
} from '../types';

/**
 * 출석 체크인 (QR 코드 스캔)
 * @param scheduleId - 수업 일정 ID
 * @param memberId - 멤버 ID
 * @param qrCode - QR 코드 데이터
 * @returns 출석 정보
 */
export const checkIn = async (
  scheduleId: string,
  memberId: string,
  qrCode: string
): Promise<Attendance> => {
  try {
    const data: CheckInRequest = { scheduleId, memberId, qrCode };
    const attendance = await api.post<Attendance>('/attendance/check-in', data);
    return attendance;
  } catch (error: unknown) {
    console.error('[Attendance Service] 출석 체크인 실패:', error);

    const errorMessage = getApiErrorMessage(error, '출석 체크인에 실패했습니다.');
    if (errorMessage?.includes('already')) {
      throw new Error('이미 출석 체크인했습니다.');
    } else if (errorMessage?.includes('credit')) {
      throw new Error('크레딧이 부족합니다. 수업권을 구매해주세요.');
    } else if (errorMessage?.includes('qr')) {
      throw new Error('QR 코드가 올바르지 않습니다.');
    } else if (errorMessage?.includes('schedule')) {
      throw new Error('수업 일정을 찾을 수 없습니다.');
    } else if (errorMessage?.includes('cancelled')) {
      throw new Error('취소된 수업입니다.');
    } else {
      throw new Error(errorMessage || '출석 체크인에 실패했습니다.');
    }
  }
};

/**
 * 출석 이력 조회
 * @param filter - 필터 조건 (멤버 ID, 일정 ID, 날짜 범위, 상태)
 * @param params - 페이지네이션 파라미터
 * @returns 출석 이력 목록
 */
export const getAttendanceHistory = async (
  filter?: AttendanceHistoryFilter,
  params?: PaginationParams
): Promise<Attendance[]> => {
  try {
    const queryParams = { ...filter, ...params };
    const attendances = await api.get<Attendance[]>('/attendance/history', {
      params: queryParams,
    });
    return attendances;
  } catch (error: unknown) {
    console.error('[Attendance Service] 출석 이력 조회 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '출석 이력을 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * 멤버별 출석 이력 조회
 * @param memberId - 멤버 ID
 * @param startDate - 시작 날짜 (옵션, ISO 8601)
 * @param endDate - 종료 날짜 (옵션, ISO 8601)
 * @param params - 페이지네이션 파라미터
 * @returns 출석 이력 목록
 */
export const getAttendanceByMember = async (
  memberId: string,
  startDate?: string,
  endDate?: string,
  params?: PaginationParams
): Promise<Attendance[]> => {
  const filter: AttendanceHistoryFilter = { memberId, startDate, endDate };
  return getAttendanceHistory(filter, params);
};

/**
 * 수업 일정별 출석 조회 (코치)
 * @param scheduleId - 수업 일정 ID
 * @param params - 페이지네이션 파라미터
 * @returns 출석 이력 목록
 */
export const getAttendanceBySchedule = async (
  scheduleId: string,
  params?: PaginationParams
): Promise<Attendance[]> => {
  const filter: AttendanceHistoryFilter = { scheduleId };
  return getAttendanceHistory(filter, params);
};

/**
 * 단일 출석 조회
 * @param attendanceId - 출석 ID
 * @returns 출석 상세 정보
 */
export const getAttendance = async (
  attendanceId: string
): Promise<Attendance> => {
  try {
    const attendance = await api.get<Attendance>(`/attendance/${attendanceId}`);
    return attendance;
  } catch (error: unknown) {
    console.error('[Attendance Service] 출석 조회 실패:', error);

    if (getApiErrorStatus(error) === 404) {
      throw new Error('출석 정보를 찾을 수 없습니다.');
    }

    throw new Error(
      getApiErrorMessage(error, '출석 정보를 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * 출석 상태 수정 (코치 전용)
 * @param attendanceId - 출석 ID
 * @param status - 출석 상태 (present | absent | cancelled)
 * @returns 수정된 출석 정보
 */
export const updateAttendanceStatus = async (
  attendanceId: string,
  status: Status.PRESENT | Status.ABSENT | Status.CANCELLED
): Promise<Attendance> => {
  try {
    const attendance = await api.patch<Attendance>(
      `/attendance/${attendanceId}`,
      { attendanceStatus: status }
    );
    return attendance;
  } catch (error: unknown) {
    console.error('[Attendance Service] 출석 상태 수정 실패:', error);

    if (getApiErrorStatus(error) === 403) {
      throw new Error('출석 상태 수정 권한이 없습니다.');
    }

    throw new Error(
      getApiErrorMessage(error, '출석 상태 수정에 실패했습니다.')
    );
  }
};

/**
 * 출석 취소 (코치 전용 - 결석 처리)
 * @param attendanceId - 출석 ID
 * @returns 취소된 출석 정보
 */
export const cancelAttendance = async (
  attendanceId: string
): Promise<Attendance> => {
  return updateAttendanceStatus(attendanceId, Status.CANCELLED);
};

/**
 * 멤버 크레딧 조회
 * @param memberId - 멤버 ID
 * @returns 크레딧 정보 (총 크레딧, 사용 크레딧, 잔여 크레딧)
 */
export const getMemberCredit = async (
  memberId: string
): Promise<MemberCredit> => {
  try {
    const credit = await api.get<MemberCredit>(`/members/${memberId}/credit`);
    return credit;
  } catch (error: unknown) {
    console.error('[Attendance Service] 크레딧 조회 실패:', error);

    if (getApiErrorStatus(error) === 404) {
      throw new Error('크레딧 정보를 찾을 수 없습니다.');
    }

    throw new Error(
      getApiErrorMessage(error, '크레딧 정보를 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * 모든 멤버 크레딧 조회 (코치/관리자)
 * @param clubId - 클럽 ID
 * @returns 모든 멤버의 크레딧 정보
 */
export const getAllMemberCredits = async (
  clubId: string
): Promise<MemberCredit[]> => {
  try {
    const credits = await api.get<MemberCredit[]>(
      `/teams/${clubId}/credits`
    );
    return credits;
  } catch (error: unknown) {
    console.error('[Attendance Service] 크레딧 조회 실패:', error);

    if (getApiErrorStatus(error) === 403) {
      throw new Error('크레딧 조회 권한이 없습니다.');
    }

    throw new Error(
      getApiErrorMessage(error, '크레딧 정보를 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * 출석 통계 조회 (멤버별)
 * @param memberId - 멤버 ID
 * @param startDate - 시작 날짜 (ISO 8601)
 * @param endDate - 종료 날짜 (ISO 8601)
 * @returns 출석 통계 (출석률, 총 출석, 총 결석)
 */
export const getAttendanceStatistics = async (
  memberId: string,
  startDate?: string,
  endDate?: string
): Promise<{
  totalAttendances: number;
  presentCount: number;
  absentCount: number;
  cancelledCount: number;
  attendanceRate: number; // 출석률 (%)
}> => {
  try {
    const params: Record<string, unknown> = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;

    const stats = await api.get<{
      totalAttendances: number;
      presentCount: number;
      absentCount: number;
      cancelledCount: number;
      attendanceRate: number;
    }>(`/attendance/statistics/${memberId}`, { params });

    return stats;
  } catch (error: unknown) {
    console.error('[Attendance Service] 출석 통계 조회 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '출석 통계를 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * 클럽별 출석 통계 조회 (코치/관리자)
 * @param clubId - 클럽 ID
 * @param startDate - 시작 날짜 (ISO 8601)
 * @param endDate - 종료 날짜 (ISO 8601)
 * @returns 클럽 전체 출석 통계
 */
export const getClubAttendanceStatistics = async (
  clubId: string,
  startDate?: string,
  endDate?: string
): Promise<{
  totalAttendances: number;
  presentCount: number;
  absentCount: number;
  cancelledCount: number;
  averageAttendanceRate: number;
  memberStatistics: Array<{
    memberId: string;
    playerName: string;
    attendanceRate: number;
  }>;
}> => {
  try {
    const params: Record<string, unknown> = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;

    const stats = await api.get<{
      totalAttendances: number;
      presentCount: number;
      absentCount: number;
      cancelledCount: number;
      averageAttendanceRate: number;
      memberStatistics: Array<{
        memberId: string;
        playerName: string;
        attendanceRate: number;
      }>;
    }>(`/teams/${clubId}/attendance-statistics`, { params });

    return stats;
  } catch (error: unknown) {
    console.error('[Attendance Service] 클럽 출석 통계 조회 실패:', error);

    if (getApiErrorStatus(error) === 403) {
      throw new Error('통계 조회 권한이 없습니다.');
    }

    throw new Error(
      getApiErrorMessage(error, '출석 통계를 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * Attendance Service Export
 */
export const attendanceService = {
  checkIn,
  getAttendanceHistory,
  getAttendanceByMember,
  getAttendanceBySchedule,
  getAttendance,
  updateAttendanceStatus,
  cancelAttendance,
  getMemberCredit,
  getAllMemberCredits,
  getAttendanceStatistics,
  getClubAttendanceStatistics,
};

export default attendanceService;
/* eslint-disable @typescript-eslint/no-explicit-any */
