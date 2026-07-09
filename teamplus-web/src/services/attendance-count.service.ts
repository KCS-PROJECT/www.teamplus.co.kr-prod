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
  /** 회원의 활성 수강 상품명 (Enrollment.classProductId 기준). 미연결 시 null. */
  productName?: string | null;
  /** 상품 결제 시점 — 'POSTPAID' 면 "후불" 라벨로 표시. */
  productBillingTiming?: string | null;
}

export interface MonthlyAttendanceCounts {
  classId: string;
  yearMonth: string;
  billingMode: "PREPAID" | "POSTPAID";
  /** @deprecated 표시 중단 — 백엔드가 항상 null 반환 (하위호환 키). */
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
