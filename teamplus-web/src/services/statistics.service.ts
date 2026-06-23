/**
 * Statistics Service — 팀 통계 데이터 계층
 *
 * 전략: Backend `/api/v1/statistics/team/:teamId` 호출 시도 후
 *       - 성공 & 시계열 매핑 가능: 실 데이터 사용
 *       - 실패 / clubId 없음: FALLBACK 데이터 사용 (개발·데모 모드)
 *
 * Backend 응답은 현재 summary 중심 (출석률·present/absent 합계)이므로
 * 시계열 매핑은 별도 엔드포인트 확장 시 교체 예정.
 */

import { api } from '@/services/api-client';
import type { ApiResponse } from '@/types/api';

// ─── Types ──────────────────────────────────────────
export type PeriodType = 'week' | 'month' | 'quarter' | 'year';

export interface WeeklyAttendance {
  week: string;
  rate: number;
}

export interface MonthlyRevenue {
  month: string;
  amount: number;
}

export interface MemberTrend {
  month: string;
  joined: number;
  left: number;
  total: number;
}

export interface ClassAttendance {
  className: string;
  rate: number;
  memberCount: number;
}

export interface ClubStatistics {
  period: PeriodType;
  attendance: WeeklyAttendance[];
  revenue: MonthlyRevenue[];
  memberTrend: MemberTrend[];
  classAttendance: ClassAttendance[];
}

// Backend raw summary (현재 엔드포인트 응답 형태)
interface ClubAttendanceSummaryRaw {
  attendanceRate: string;
  totalAttendances: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  classStats?: Array<{
    className: string;
    attendanceRate: string;
    memberCount: number;
  }>;
}

// ─── FALLBACK Data (period별) ───────────────────────
const ATTENDANCE_BY_PERIOD: Record<PeriodType, WeeklyAttendance[]> = {
  week: [
    { week: '1주', rate: 88 },
    { week: '2주', rate: 92 },
    { week: '3주', rate: 85 },
    { week: '4주', rate: 90 },
  ],
  month: [
    { week: '1월', rate: 82 },
    { week: '2월', rate: 85 },
    { week: '3월', rate: 89 },
    { week: '4월', rate: 91 },
  ],
  quarter: [
    { week: '1분기', rate: 85 },
    { week: '2분기', rate: 88 },
    { week: '3분기', rate: 90 },
    { week: '4분기', rate: 92 },
  ],
  year: [
    { week: '2023', rate: 80 },
    { week: '2024', rate: 85 },
    { week: '2025', rate: 89 },
    { week: '2026', rate: 92 },
  ],
};

const REVENUE_BY_PERIOD: Record<PeriodType, MonthlyRevenue[]> = {
  week: [
    { month: '1주', amount: 900000 },
    { month: '2주', amount: 1100000 },
    { month: '3주', amount: 950000 },
    { month: '4주', amount: 1250000 },
  ],
  month: [
    { month: '10월', amount: 3200000 },
    { month: '11월', amount: 3500000 },
    { month: '12월', amount: 3800000 },
    { month: '1월', amount: 3900000 },
    { month: '2월', amount: 4100000 },
    { month: '3월', amount: 4500000 },
  ],
  quarter: [
    { month: 'Q1', amount: 10800000 },
    { month: 'Q2', amount: 11600000 },
    { month: 'Q3', amount: 12400000 },
    { month: 'Q4', amount: 13200000 },
  ],
  year: [
    { month: '2023', amount: 42000000 },
    { month: '2024', amount: 45000000 },
    { month: '2025', amount: 49000000 },
    { month: '2026', amount: 52000000 },
  ],
};

const MEMBER_TREND_FALLBACK: MemberTrend[] = [
  { month: '1월', joined: 3, left: 1, total: 27 },
  { month: '2월', joined: 2, left: 0, total: 29 },
  { month: '3월', joined: 1, left: 0, total: 30 },
];

const CLASS_ATTENDANCE_FALLBACK: ClassAttendance[] = [
  { className: '루비덕스 와이드 A반', rate: 95, memberCount: 6 },
  { className: '루비덕스 와이드 B반', rate: 88, memberCount: 6 },
  { className: '루비덕스 블레이즈', rate: 90, memberCount: 10 },
  { className: '취미반 주말', rate: 72, memberCount: 5 },
  { className: '취미반 평일', rate: 68, memberCount: 3 },
];

// ─── 기간 범위 계산 ─────────────────────────────────
function getDateRange(period: PeriodType): {
  startDate: string;
  endDate: string;
} {
  const end = new Date();
  const start = new Date(end);
  const days =
    period === 'week' ? 7 : period === 'month' ? 30 : period === 'quarter' ? 90 : 365;
  start.setDate(end.getDate() - days);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

// ─── Public API ─────────────────────────────────────

/**
 * 팀 통계 조회
 * @param clubId - 팀 ID. 없으면 FALLBACK 반환
 * @param period - 집계 기간
 */
export async function getClubStatistics(
  clubId: string | null | undefined,
  period: PeriodType,
): Promise<ApiResponse<ClubStatistics>> {
  const fallback: ClubStatistics = {
    period,
    attendance: ATTENDANCE_BY_PERIOD[period],
    revenue: REVENUE_BY_PERIOD[period],
    memberTrend: MEMBER_TREND_FALLBACK,
    classAttendance: CLASS_ATTENDANCE_FALLBACK,
  };

  if (!clubId) {
    return { success: true, data: fallback };
  }

  try {
    const { startDate, endDate } = getDateRange(period);
    const res = await api.get<ClubAttendanceSummaryRaw>(
      `/statistics/team/${encodeURIComponent(clubId)}?startDate=${startDate}&endDate=${endDate}`,
    );

    if (res.success && res.data) {
      // Backend는 summary만 제공 — 시계열 미지원 시 FALLBACK 시계열 + 실제 수업별 데이터만 merge
      const mergedClassAttendance: ClassAttendance[] =
        res.data.classStats?.map((c) => ({
          className: c.className,
          rate: Number.parseFloat(c.attendanceRate) || 0,
          memberCount: c.memberCount,
        })) ?? CLASS_ATTENDANCE_FALLBACK;

      return {
        success: true,
        data: {
          period,
          attendance: ATTENDANCE_BY_PERIOD[period], // 시계열 엔드포인트 부재 시 FALLBACK 유지
          revenue: REVENUE_BY_PERIOD[period],
          memberTrend: MEMBER_TREND_FALLBACK,
          classAttendance: mergedClassAttendance,
        },
      };
    }
  } catch {
    // 네트워크/권한 오류 시 조용히 FALLBACK
  }

  return { success: true, data: fallback };
}
