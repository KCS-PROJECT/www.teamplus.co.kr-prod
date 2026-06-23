'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiRequest } from '@/services/api-client';

// ─── 타입 ─────────────────────────────────────────────
export interface TodayClass {
  title: string;
  time: string;
  coach: string;
}

export interface WeekDay {
  date: number;
  dayOfWeek: string;
  attended: boolean | null;
}

export interface BadgeInfo {
  emoji: string;
  label: string;
  earned: boolean;
}

// ─── 신규 타입 (2026-04-28 student 대시보드 통합) ─────
export interface StudentCreditSummary {
  totalRemaining: number;
  expiringWithin30Days: number;
  usedThisMonth: number;
}

export interface StudentAttendanceTrendItem {
  month: string; // "2026-04"
  rate: number; // 0~100
  present: number;
  total: number;
}

export interface StudentUpcomingSchedule {
  scheduleId: string;
  classId: string;
  className: string;
  /** ISO */
  scheduledDate: string;
  trainingType: string | null;
  /** 본인 출석 상태 (null = 미체크) */
  attendanceStatus: string | null;
}

// ─── 백엔드 응답 타입 (W3 통합 엔드포인트) ─────────────
interface ChildHomeResponse {
  clubName: string | null;
  coachName: string | null;
  todayClass: {
    title: string;
    startTime: string; // "18:00"
    endTime: string; // "20:00"
    coach: string;
  } | null;
  weekRecords: Array<{
    date: string; // ISO
    status: string; // present | absent | late | cancelled
  }>;
  streakCount: number;
  // W6: NoticeSection용 공지
  latestNotices?: Array<{
    id: string;
    title: string;
    targetType?: string | null;
    createdAt: string;
    pinned?: boolean;
  }>;
  // 2026-04-28 (2차 통합): student 대시보드 보강 — 학부모와 동일 구조
  creditSummary?: StudentCreditSummary;
  attendanceTrend?: StudentAttendanceTrendItem[];
  upcomingSchedules?: StudentUpcomingSchedule[];
}

export interface ChildHomeNoticeItem {
  id: string;
  title: string;
  targetType?: string | null;
  createdAt: string;
  pinned?: boolean;
}

interface AttendanceRecord {
  scheduledDate: string;
  attendanceStatus: string;
}

// ─── 헬퍼 ────────────────────────────────────────────
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function buildWeekDays(records: AttendanceRecord[]): WeekDay[] {
  const now = new Date();
  const result: WeekDay[] = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const record = records.find((r) => r.scheduledDate.startsWith(dateStr));
    const attended = record
      ? record.attendanceStatus === 'present' || record.attendanceStatus === 'late'
      : i === 0
        ? null
        : false;

    result.push({
      date: d.getDate(),
      dayOfWeek: DAY_LABELS[d.getDay()],
      attended,
    });
  }

  return result;
}

// ─── Hook ─────────────────────────────────────────────
export function useChildHome(isAuthenticated = true) {
  const [todayClass, setTodayClass] = useState<TodayClass | null>(null);
  const [weekDays, setWeekDays] = useState<WeekDay[]>([]);
  const [streakCount, setStreakCount] = useState(0);
  // W6
  const [latestNotices, setLatestNotices] = useState<ChildHomeNoticeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 2026-04-28 (2차 통합): student 대시보드 보강 필드
  const [creditSummary, setCreditSummary] = useState<StudentCreditSummary>({
    totalRemaining: 0,
    expiringWithin30Days: 0,
    usedThisMonth: 0,
  });
  const [attendanceTrend, setAttendanceTrend] = useState<
    StudentAttendanceTrendItem[]
  >([]);
  const [upcomingSchedules, setUpcomingSchedules] = useState<
    StudentUpcomingSchedule[]
  >([]);

  const fetchData = useCallback(async () => {
    if (!isAuthenticated) {
      setTodayClass(null);
      setWeekDays(buildWeekDays([]));
      setStreakCount(0);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // W3: 단일 통합 엔드포인트 호출 (3 RTT → 1 RTT)
      const res = await apiRequest<ChildHomeResponse>({
        method: 'GET',
        url: '/dashboard/child-home',
        retry: false,
      });

      if (!res.success || !res.data) {
        setTodayClass(null);
        setWeekDays(buildWeekDays([]));
        setStreakCount(0);
        setIsLoading(false);
        return;
      }

      const data = res.data;

      // 오늘 수업
      if (data.todayClass) {
        setTodayClass({
          title: data.todayClass.title,
          time: `${data.todayClass.startTime} ~ ${data.todayClass.endTime}`,
          coach: data.todayClass.coach,
        });
      } else {
        setTodayClass(null);
      }

      // 주간 출석 (서버가 이미 최근 7일 기록 제공)
      setWeekDays(
        buildWeekDays(
          data.weekRecords.map((r) => ({
            scheduledDate: r.date,
            attendanceStatus: r.status,
          })),
        ),
      );

      // 연속 출석 스트릭 (서버 계산값)
      setStreakCount(data.streakCount ?? 0);

      // W6: 공지사항
      setLatestNotices(data.latestNotices ?? []);

      // 2026-04-28 (2차 통합): student 대시보드 보강 필드 매핑
      setCreditSummary(
        data.creditSummary ?? {
          totalRemaining: 0,
          expiringWithin30Days: 0,
          usedThisMonth: 0,
        },
      );
      setAttendanceTrend(data.attendanceTrend ?? []);
      setUpcomingSchedules(data.upcomingSchedules ?? []);
    } catch {
      setTodayClass(null);
      setError('데이터를 불러오는 중 오류가 발생했습니다.');
      setWeekDays(buildWeekDays([]));
      setStreakCount(0);
      setCreditSummary({
        totalRemaining: 0,
        expiringWithin30Days: 0,
        usedThisMonth: 0,
      });
      setAttendanceTrend([]);
      setUpcomingSchedules([]);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  // Strict Mode dev 환경 useEffect 더블 호출로 인한 중복 fetch 차단.
  // production 환경에서는 useEffect가 1회만 실행되므로 영향이 없다.
  // 인증 상태 변경 시에는 dependency 변화로 fetchData identity가 바뀌므로
  // 필요시 새 effect가 실행된다.
  const initialFetchedRef = useRef(false);
  useEffect(() => {
    if (initialFetchedRef.current) return;
    initialFetchedRef.current = true;
    fetchData();
  }, [fetchData]);

  /**
   * 학생 본인 출석 체크 (Phase 2 · D-1=B — 2026-04-28).
   * 학부모 useParentHome.checkInChild 와 동일한 응답 형태로 student 페이지가
   * SelectedDayClassList 의 onCheckIn prop 을 그대로 받도록 한다.
   *
   * [2026-05-11] Optimistic UI 추가 — API 응답 즉시 upcomingSchedules 의 해당 schedule
   *  attendanceStatus 를 'present' 로 갱신.  fetchData 응답 (백그라운드) 전에도 UI 가
   *  "출석 완료" 로 즉시 전환되어 사용자가 처리 결과를 즉시 확인.
   */
  const checkInSelf = useCallback(
    async (
      scheduleId: string,
    ): Promise<
      | { ok: true; remainingSessions: number; className: string }
      | { ok: false; message: string }
    > => {
      const res = await apiRequest<{
        scheduleId: string;
        className: string;
        remainingSessions: number;
      }>({
        method: 'POST',
        url: '/attendance/self-check-in',
        data: { scheduleId },
        retry: false,
      });
      if (res.success && res.data) {
        // ① Optimistic UI — API 성공 즉시 출석 상태 'present' 반영 (UI 즉시 전환)
        setUpcomingSchedules((prev) =>
          prev.map((s) =>
            s.scheduleId === scheduleId
              ? { ...s, attendanceStatus: 'present' }
              : s,
          ),
        );
        // ② 백그라운드 fully 동기화 — 잔여 결제권 / 주간 출석 / 스트릭 등 반영
        await fetchData();
        return {
          ok: true,
          remainingSessions: res.data.remainingSessions,
          className: res.data.className,
        };
      }
      return {
        ok: false,
        message: res.error?.message ?? '출석 처리에 실패했습니다.',
      };
    },
    [fetchData],
  );

  return {
    todayClass,
    weekDays,
    streakCount,
    latestNotices,
    isLoading,
    error,
    refresh: fetchData,
    // 2026-04-28 (2차 통합): student 대시보드 보강 필드
    creditSummary,
    attendanceTrend,
    upcomingSchedules,
    // 2026-04-28 (D-1=B): 학생 본인 출석 체크
    checkInSelf,
  };
}
