'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ScheduleItemProps } from '@/components/dashboard/ScheduleItem';
import { PendingMemberItemProps } from '@/components/dashboard/PendingMemberItem';
import type { TodoItem } from '@/components/coach/TodoList';
import { dashboardService, type NextClassDetailData } from '@/services/dashboard';
import { api } from '@/services/api-client';
import { devWarn } from '@/lib/logger';

export interface CoachRevenueData {
  monthlyTotal: number;
  weeklyData: Array<{ label: string; value: number; isToday?: boolean }>;
}

export interface CoachPriorityTask {
  icon: string;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle: string;
  href?: string;
}

export interface CoachDashboardData {
  coachName: string;
  stats: {
    todayClasses: number;
    nextClassTime: string;
    pendingApprovals: number;
    monthlyAttendance: number;
    attendanceTrend: string;
    totalMembers: number;
    newMembers: number;
    attendanceCount: number;
    attendanceTotal: number;
  };
  schedules: ScheduleItemProps[];
  pendingMembers: Omit<PendingMemberItemProps, 'onApprove' | 'onReject'>[];
  todoItems: TodoItem[];
  nextClassDetail: NextClassDetailData;
  revenue?: CoachRevenueData;
  priorityTasks: CoachPriorityTask[];
}

/**
 * API 응답이 todoItems를 주지 않을 때 기존 통계/일정으로 파생
 * 항상 최소 1개 이상의 할 일을 반환하여 빈 섹션을 방지
 */
function deriveTodoItems(
  pendingApprovals: number,
  todayClasses: number,
  schedules: ScheduleItemProps[]
): TodoItem[] {
  const items: TodoItem[] = [];
  if (pendingApprovals > 0) {
    items.push({
      icon: 'person_add',
      iconBg: 'bg-orange-100 dark:bg-orange-900/30',
      iconColor: 'text-orange-700 dark:text-orange-400',
      title: '회원 승인 필요',
      description: `대기 중인 회원 ${pendingApprovals}명`,
      href: '/coach-members',
    });
  }
  const upcomingCount = schedules.filter(
    (s) => s.status === 'upcoming' || s.status === 'current'
  ).length;
  if (todayClasses > 0 || upcomingCount > 0) {
    items.push({
      icon: 'add_a_photo',
      iconBg: 'bg-blue-100 dark:bg-blue-900/30',
      iconColor: 'text-blue-700 dark:text-blue-400',
      title: '수업 사진 업로드',
      description: `오늘 수업 ${todayClasses || upcomingCount}건`,
      href: '/coach-schedules',
    });
  }
  // 데이터가 전혀 없을 때도 항상 1개 이상 표시 (섹션 유지)
  if (items.length === 0) {
    items.push({
      icon: 'calendar_month',
      iconBg: 'bg-blue-100 dark:bg-blue-900/30',
      iconColor: 'text-blue-700 dark:text-blue-400',
      title: '오늘의 일정 확인',
      description: '예정된 수업과 이벤트를 확인해보세요',
      href: '/coach-calendar',
    });
    items.push({
      icon: 'groups',
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
      iconColor: 'text-emerald-700 dark:text-emerald-400',
      title: '담당 학생 관리',
      description: '학생 목록을 점검해보세요',
      href: '/coach-members',
    });
  }
  return items;
}

/**
 * API 응답이 nextClassDetail을 주지 않을 때 schedules에서 파생
 * schedules가 비어있어도 placeholder 카드를 반환하여 섹션 유지
 */
function deriveNextClassDetail(
  schedules: ScheduleItemProps[]
): NextClassDetailData {
  const next =
    schedules.find((s) => s.status === 'current') ??
    schedules.find((s) => s.status === 'upcoming');
  if (!next) {
    return {
      time: '오늘 예정 수업 없음',
      title: '새 수업 일정을 등록해보세요',
      students: [],
      totalStudents: 0,
    };
  }
  return {
    time: next.time,
    title: next.title,
    students: [],
    totalStudents: next.attendees ?? 0,
  };
}

/**
 * 통계 데이터에서 우선 처리 항목을 자동 파생
 * 승인 대기 > 오늘 수업 > 출석률 저조 순서로 우선순위 부여
 */
function derivePriorityTasks(
  pendingApprovals: number,
  todayClasses: number,
  attendanceRate: number,
  newMembers: number,
): CoachPriorityTask[] {
  const tasks: CoachPriorityTask[] = [];

  if (pendingApprovals > 0) {
    tasks.push({
      icon: 'person_add',
      iconBg: 'bg-orange-100 dark:bg-orange-900/30',
      iconColor: 'text-orange-600 dark:text-orange-400',
      title: `회원 승인 ${pendingApprovals}건 대기`,
      subtitle: '빠른 승인이 필요합니다',
      href: '/coach-members',
    });
  }

  if (todayClasses > 0) {
    tasks.push({
      icon: 'school',
      iconBg: 'bg-blue-100 dark:bg-blue-900/30',
      iconColor: 'text-blue-600 dark:text-blue-400',
      title: `오늘 수업 ${todayClasses}건 준비`,
      subtitle: '수업 자료 및 출석부를 확인해주세요',
      href: '/coach-schedules',
    });
  }

  if (attendanceRate < 80) {
    tasks.push({
      icon: 'warning',
      iconBg: 'bg-amber-100 dark:bg-amber-900/30',
      iconColor: 'text-amber-600 dark:text-amber-400',
      title: `출석률 ${attendanceRate}% — 관리 필요`,
      subtitle: '미출석 학생에게 연락해보세요',
      // 2026-05-12: /attendance-manage 는 ?classId 필수 → 수업 목록 경유.
      href: '/classes-manage',
    });
  }

  if (newMembers > 0) {
    tasks.push({
      icon: 'group_add',
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      title: `신규 회원 ${newMembers}명 등록`,
      subtitle: '환영 메시지를 보내보세요',
      href: '/coach-members',
    });
  }

  // 항목이 없으면 기본 항목 1개 추가
  if (tasks.length === 0) {
    tasks.push({
      icon: 'check_circle',
      iconBg: 'bg-green-100 dark:bg-green-900/30',
      iconColor: 'text-green-600 dark:text-green-400',
      title: '처리할 항목이 없습니다',
      subtitle: '모든 업무가 정상적으로 처리되었습니다',
    });
  }

  return tasks;
}

export function useCoachDashboardData() {
  const [data, setData] = useState<CoachDashboardData | null>(null);
  // 섹션별 독립 로딩 (단일 isLoading 대체)
  const [dashLoading, setDashLoading] = useState(true);
  const [revenueLoading, setRevenueLoading] = useState(true);

  const fetchCoachData = useCallback(async () => {
    setDashLoading(true);
    setRevenueLoading(true);

    // 대시보드 fetch — 메인 data 구조를 담당
    const fetchDashboard = async () => {
      try {
        const response = await dashboardService.getCoachDashboard();
        if (!response || !response.data) throw new Error('No data');

        const apiData = response.data;
        const schedules = apiData.schedules ?? [];
        const pendingApprovals = apiData.stats?.pendingApprovals ?? 0;
        const todayClasses = apiData.stats?.todayClasses ?? 0;
        const monthlyAttendance = apiData.stats?.monthlyAttendance ?? 0;
        const newMembers = apiData.stats?.newMembers ?? 0;

        // functional setState — 이미 도착한 revenue 를 덮어쓰지 않도록 prev.revenue 보존
        setData((prev) => ({
          // 폴백 문자열에 "님" 포함 금지 — AppBar 가 "{name}님" 자동 부착
          coachName: apiData.coachName || apiData.name || '코치',
          stats: {
            todayClasses,
            nextClassTime: apiData.stats?.nextClassTime ?? '-',
            pendingApprovals,
            monthlyAttendance,
            attendanceTrend: apiData.stats?.attendanceTrend ?? '0%',
            totalMembers: apiData.stats?.totalMembers ?? 0,
            newMembers,
            attendanceCount: apiData.stats?.attendanceCount ?? 0,
            attendanceTotal: apiData.stats?.attendanceTotal ?? 0,
          },
          schedules,
          pendingMembers: apiData.pendingMembers ?? [],
          todoItems:
            apiData.todoItems && apiData.todoItems.length > 0
              ? apiData.todoItems
              : deriveTodoItems(pendingApprovals, todayClasses, schedules),
          nextClassDetail:
            apiData.nextClassDetail ?? deriveNextClassDetail(schedules),
          revenue: prev?.revenue,
          priorityTasks: derivePriorityTasks(pendingApprovals, todayClasses, monthlyAttendance, newMembers),
        }));
      } catch (error) {
        devWarn('Coach Dashboard API failed, using fallback:', error);
        // fallback ISO 도 오늘 날짜 + 시각으로 합성해 attendance-window 헬퍼와 호환
        const buildTodayIso = (h: number, m: number) => {
          const d = new Date();
          d.setHours(h, m, 0, 0);
          return d.toISOString();
        };
        const fallbackSchedules: ScheduleItemProps[] = [
          { time: '09:00 - 10:30', scheduledDate: buildTodayIso(9, 0), title: '기초 스케이팅', location: '링크 A', attendees: 8, status: 'completed' },
          { time: '14:00 - 15:30', scheduledDate: buildTodayIso(14, 0), title: '하키 드릴 심화', location: '링크 B', attendees: 12, status: 'current' },
          { time: '16:00 - 17:00', scheduledDate: buildTodayIso(16, 0), title: '개인 레슨 (박지민)', location: '보조 링크', status: 'upcoming' },
        ];
        const fallbackPending = 3;
        const fallbackTodayClasses = 5;
        setData((prev) => ({
          coachName: '김철수',
          stats: {
            todayClasses: fallbackTodayClasses,
            nextClassTime: '14:00',
            pendingApprovals: fallbackPending,
            monthlyAttendance: 85,
            attendanceTrend: '+2.5%',
            totalMembers: 42,
            newMembers: 4,
            attendanceCount: 17,
            attendanceTotal: 20,
          },
          schedules: fallbackSchedules,
          pendingMembers: [
            { name: '이영희', className: '초급반', schedule: '화/목' },
            { name: '최민수', className: '중급반', schedule: '주말' },
            { name: '박건우', className: '초급반', schedule: '월/수/금' },
          ],
          todoItems: deriveTodoItems(fallbackPending, fallbackTodayClasses, fallbackSchedules),
          nextClassDetail: deriveNextClassDetail(fallbackSchedules),
          // revenue 는 prev 보존 (이미 도착했을 수 있음) · 없으면 fallback
          revenue: prev?.revenue ?? {
            monthlyTotal: 2400000,
            weeklyData: [
              { label: '월', value: 3 },
              { label: '화', value: 5 },
              { label: '수', value: 2 },
              { label: '목', value: 4 },
              { label: '금', value: 6 },
              { label: '토', value: 8 },
              { label: '일', value: 5, isToday: true },
            ],
          },
          priorityTasks: derivePriorityTasks(fallbackPending, fallbackTodayClasses, 85, 4),
        }));
      } finally {
        setDashLoading(false);
      }
    };

    // Revenue fetch — 독립 · data 객체가 존재할 때만 revenue 필드 업데이트
    const fetchRevenue = async () => {
      try {
        const res = await api.get<{ monthlyTotal: number; weeklyData: Array<{ label: string; value: number; isToday?: boolean }> }>(
          '/dashboard/analytics/revenue',
          { params: { period: 'monthly' } },
        );
        if (res.success && res.data?.weeklyData && res.data.weeklyData.length > 0) {
          const revenue: CoachRevenueData = {
            monthlyTotal: res.data.monthlyTotal ?? 0,
            weeklyData: res.data.weeklyData,
          };
          // functional setState — data 가 null 이면 무시, 도착했다면 revenue 만 merge
          setData((prev) => (prev ? { ...prev, revenue } : prev));
        }
      } catch {
        /* revenue 는 optional — 실패 시 기존 값 유지 (dashboard fallback 에서 설정되어 있을 수 있음) */
      } finally {
        setRevenueLoading(false);
      }
    };

    // 2개 독립 병렬 시작
    void fetchDashboard();
    void fetchRevenue();
  }, []);

  // React 19 Strict Mode dev 환경 useEffect 더블 호출로 인한 중복 API
  // 호출을 차단하는 마운트 가드. production 환경에서는 useEffect가 1회만
  // 실행되므로 동작에 영향이 없다. 사용자 갱신 호출(`refresh` 등)은
  // ref 우회로 정상 작동한다.
  const initialFetchedRef = useRef(false);
  useEffect(() => {
    if (initialFetchedRef.current) return;
    initialFetchedRef.current = true;
    fetchCoachData();
  }, [fetchCoachData]);

  // 회원 수강신청 승인
  const approveMember = useCallback(async (enrollmentId: string) => {
    const response = await api.post(`/enrollments/${enrollmentId}/approve`);
    if (!response.success) {
      throw new Error(response.error?.message ?? '오류가 발생했습니다. 다시 시도해주세요.');
    }
    await fetchCoachData();
  }, [fetchCoachData]);

  // 회원 수강신청 거절
  const rejectMember = useCallback(async (enrollmentId: string, reason?: string) => {
    const response = await api.post(`/enrollments/${enrollmentId}/reject`, reason ? { reason } : undefined);
    if (!response.success) {
      throw new Error(response.error?.message ?? '오류가 발생했습니다. 다시 시도해주세요.');
    }
    await fetchCoachData();
  }, [fetchCoachData]);

  return {
    data,
    dashLoading,
    revenueLoading,
    // ⚠️ isLoading 은 LCP 결정 지표 — revenue 는 background fetch(분석 차트)이므로
    //    여기에 묶지 않는다. 묶으면 느린 /dashboard/analytics/revenue 응답이 LCP 를
    //    150~300ms 지연시킨다. revenue 진행 상태가 필요한 소비자는 revenueLoading 사용.
    isLoading: dashLoading,
    refresh: fetchCoachData,
    approveMember,
    rejectMember,
  };
}