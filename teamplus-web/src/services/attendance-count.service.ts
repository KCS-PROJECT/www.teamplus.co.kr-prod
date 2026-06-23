/**
 * attendance-count.service.ts (Phase C)
 *
 * 선불 수업 회원별 월 출석 횟수 조회 — 출석관리 화면 임베드(읽기 전용).
 * 백엔드:
 *   GET /api/v1/attendance/class/:classId/monthly-counts?yearMonth=YYYY-MM
 *       (COACH/DIRECTOR/ACADEMY_DIRECTOR/ADMIN)
 */
import { api } from "./api-client";

export interface MonthlyAttendanceCountItem {
  userId: string;
  name: string;
  attendanceCount: number;
}

export interface MonthlyAttendanceCounts {
  classId: string;
  yearMonth: string;
  billingMode: "PREPAID" | "POSTPAID";
  /** 정기 패키지 명목 회수(참고 표시용). 없으면 null. */
  nominalSessions: number | null;
  totalPresent: number;
  items: MonthlyAttendanceCountItem[];
}

export async function getMonthlyAttendanceCounts(
  classId: string,
  yearMonth: string,
): Promise<MonthlyAttendanceCounts | null> {
  const res = await api.get<MonthlyAttendanceCounts>(
    `/attendance/class/${encodeURIComponent(classId)}/monthly-counts?yearMonth=${encodeURIComponent(yearMonth)}`,
  );
  return res.success && res.data ? res.data : null;
}
