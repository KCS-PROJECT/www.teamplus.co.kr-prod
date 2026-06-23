"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/services/api-client";

/**
 * 2026-05-12: 출석 도메인 훅 모음 (3-state 단순화 + 수업별 일정 이력 페이징).
 *
 * 회의록(`backdata/20260423_teamplus.txt`) 결정 반영:
 *   - 25:03 "왔다 안 왔다" — 출석 상태 2-state (present/absent) + 미확인(unchecked)
 *   - 24:54 "내 수업에 얘 안 왔네" — 수업별 일정 이력 페이지 신설
 *   - 22:31 "엄마가 밖에서 출석 누르면" — 시점별 모드 분기 ([scheduleId] 페이지)
 *
 * Backend:
 *   POST   /api/v1/attendance/coach/manual-mark         (출석 마킹/수정)
 *   DELETE /api/v1/attendance/coach/:attendanceId        (처리 취소 + 결제권 복원)
 *   GET    /api/v1/attendance/class/:classId/schedules   (수업별 이력 + 페이징)
 *   GET    /api/v1/attendance/class/:classId/schedules/upcoming (예정 lazy load)
 */

// ─── 도메인 타입 ────────────────────────────────────────────
export type CoachAttendanceStatus = "present" | "absent" | "unchecked";

export type CheckedInVia = "qr_scan" | "parent_button" | "coach_manual" | null;

export interface CoachStudentAttendance {
  attendanceId: string | null;
  memberId: string;
  memberName: string;
  attendanceStatus: CoachAttendanceStatus;
  checkedInVia: CheckedInVia;
  checkedInAt: string | null;
  updatedAt: string | null;
}

export interface CoachScheduleAttendance {
  scheduleId: string;
  classId: string;
  className: string;
  scheduledDate: string;
  startHHMM: string;
  students: CoachStudentAttendance[];
}

// ─── 수업별 일정 이력 응답 ─────────────────────────────────
export interface ClassScheduleHistoryItem {
  scheduleId: string;
  scheduledDate: string;
  /** 회차 시각 text "HH:mm" — 표시 시각 SoT(scheduledDate timestamp 는 부정확). 레거시 회차는 null. */
  startTime?: string | null;
  endTime?: string | null;
  present: number;
  absent: number;
  unchecked: number;
  total: number;
  rate: number;
}

export interface ClassScheduleHistoryResponse {
  classInfo: {
    classId: string;
    className: string;
    coachName: string;
    studentCount: number;
    completedCount: number;
    totalScheduleCount: number;
    /** [Phase C] 선불/후불 — 출석관리 화면이 정산/출석횟수 섹션을 택일 노출. */
    billingMode: "PREPAID" | "POSTPAID";
  };
  stats: {
    totalSchedules: number;
    completedCount: number;
    avgAttendanceRate: number;
    totalPresent: number;
    totalAbsent: number;
  };
  inProgress: ClassScheduleHistoryItem[];
  completed: {
    items: ClassScheduleHistoryItem[];
    nextCursor: string | null;
    hasMore: boolean;
  };
  upcomingCount: number;
}

export interface ClassScheduleUpcomingItem {
  scheduleId: string;
  scheduledDate: string;
  /** 회차 시각 text "HH:mm" — 표시 시각 SoT. 레거시 회차는 null. */
  startTime?: string | null;
  endTime?: string | null;
  total: number;
}

export interface ClassScheduleUpcomingResponse {
  items: ClassScheduleUpcomingItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ─── Mutation 결과 ─────────────────────────────────────────
interface MarkResult {
  ok: true;
  attendanceStatus: CoachAttendanceStatus;
  action: "created" | "updated";
}
interface MarkError {
  ok: false;
  message: string;
}

export interface BulkMarkResult {
  successCount: number;
  failedCount: number;
  failures: Array<{ memberId: string; message: string }>;
}

// ─── Hook 1: 출석 변경 mutation ────────────────────────────
/**
 * 수업별 페이지(/attendance/[scheduleId]) 등에서 사용하는 출석 변경 함수 모음.
 * 페이지가 자체적으로 상태/리로드를 관리하므로 본 훅은 mutation 만 제공.
 */
export function useCoachAttendanceMutations() {
  const markAttendance = useCallback(
    async (
      scheduleId: string,
      memberId: string,
      attendanceStatus: Exclude<CoachAttendanceStatus, "unchecked">,
      modifiedReason?: string,
    ): Promise<MarkResult | MarkError> => {
      const res = await apiRequest<{
        attendanceId: string;
        attendanceStatus: CoachAttendanceStatus;
        action: "created" | "updated";
      }>({
        method: "POST",
        url: "/attendance/coach/manual-mark",
        data: { scheduleId, memberId, attendanceStatus, modifiedReason },
        retry: false,
      });
      if (res.success && res.data) {
        return {
          ok: true,
          attendanceStatus: res.data.attendanceStatus,
          action: res.data.action,
        };
      }
      return {
        ok: false,
        message: res.error?.message ?? "출석 처리에 실패했습니다.",
      };
    },
    [],
  );

  const clearAttendance = useCallback(
    async (attendanceId: string): Promise<MarkResult | MarkError> => {
      const res = await apiRequest<{
        attendanceId: string;
        cleared: true;
        creditRestored: boolean;
      }>({
        method: "DELETE",
        url: `/attendance/coach/${attendanceId}`,
        retry: false,
      });
      if (res.success && res.data) {
        return { ok: true, attendanceStatus: "unchecked", action: "updated" };
      }
      return {
        ok: false,
        message: res.error?.message ?? "처리 취소에 실패했습니다.",
      };
    },
    [],
  );

  /**
   * 일괄 출석 마킹 — N명을 같은 상태로 병렬 처리.
   * 백엔드 endpoint 변경 0 (기존 manual-mark 재활용, Promise.all).
   * 부분 실패 허용 — failures 배열로 실패 학생 반환.
   */
  const markBulk = useCallback(
    async (
      scheduleId: string,
      memberIds: string[],
      attendanceStatus: Exclude<CoachAttendanceStatus, "unchecked">,
    ): Promise<BulkMarkResult> => {
      const results = await Promise.all(
        memberIds.map(async (memberId) => {
          const res = await apiRequest<{
            attendanceId: string;
            attendanceStatus: CoachAttendanceStatus;
            action: "created" | "updated";
          }>({
            method: "POST",
            url: "/attendance/coach/manual-mark",
            data: { scheduleId, memberId, attendanceStatus },
            retry: false,
          });
          return {
            memberId,
            ok: res.success,
            message: res.error?.message ?? "",
          };
        }),
      );
      const failures = results
        .filter((r) => !r.ok)
        .map((r) => ({
          memberId: r.memberId,
          message: r.message || "처리 실패",
        }));
      return {
        successCount: results.length - failures.length,
        failedCount: failures.length,
        failures,
      };
    },
    [],
  );

  return { markAttendance, clearAttendance, markBulk };
}

// ─── Hook 2: 수업별 일정 출석 이력 (페이징) ─────────────────
/**
 * /attendance-manage?classId=X 페이지에서 사용.
 * - 초기 로드: 진행 중 + 완료 첫 페이지 + 예정 카운트
 * - loadMoreCompleted: 완료 섹션 무한 스크롤
 * - loadUpcoming: 예정 섹션 lazy load (펼침 시)
 */
export function useClassAttendanceHistory(classId: string | null) {
  const [data, setData] = useState<ClassScheduleHistoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInitial = useCallback(async () => {
    if (!classId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    const res = await apiRequest<ClassScheduleHistoryResponse>({
      method: "GET",
      url: `/attendance/class/${classId}/schedules`,
    });
    if (res.success && res.data) {
      setData(res.data);
    } else {
      setError(res.error?.message ?? "출석 이력을 불러오지 못했습니다.");
      setData(null);
    }
    setIsLoading(false);
  }, [classId]);

  useEffect(() => {
    void fetchInitial();
  }, [fetchInitial]);

  // 완료 섹션 추가 페이지 로드 (무한 스크롤)
  const loadMoreCompleted = useCallback(async () => {
    if (!classId || !data?.completed.hasMore || isLoadingMore) return;
    setIsLoadingMore(true);
    const res = await apiRequest<ClassScheduleHistoryResponse>({
      method: "GET",
      url: `/attendance/class/${classId}/schedules?cursor=${encodeURIComponent(data.completed.nextCursor ?? "")}`,
    });
    if (res.success && res.data) {
      const next = res.data;
      setData((prev) =>
        prev
          ? {
              ...prev,
              completed: {
                items: [...prev.completed.items, ...next.completed.items],
                nextCursor: next.completed.nextCursor,
                hasMore: next.completed.hasMore,
              },
            }
          : next,
      );
    }
    setIsLoadingMore(false);
  }, [classId, data, isLoadingMore]);

  // 예정 섹션 lazy load — 펼침 시 호출
  const loadUpcoming = useCallback(
    async (cursor?: string): Promise<ClassScheduleUpcomingResponse | null> => {
      if (!classId) return null;
      const url = `/attendance/class/${classId}/schedules/upcoming${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`;
      const res = await apiRequest<ClassScheduleUpcomingResponse>({
        method: "GET",
        url,
      });
      if (res.success && res.data) {
        return res.data;
      }
      return null;
    },
    [classId],
  );

  return {
    data,
    isLoading,
    isLoadingMore,
    error,
    refresh: fetchInitial,
    loadMoreCompleted,
    loadUpcoming,
  };
}
