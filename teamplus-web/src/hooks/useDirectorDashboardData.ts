'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { CoachProgress } from '@/components/dashboard/CoachProgressItem';
import { UpcomingEvent } from '@/components/dashboard/DirectorEventItem';
import { PendingMemberItemProps } from '@/components/dashboard/PendingMemberItem';
import { dashboardService, type DirectorDashboardApiData } from '@/services/dashboard';
import { api } from '@/services/api-client';
import { devWarn } from '@/lib/logger';

export interface TeamStats {
  attendanceRate: number;
  attendanceChange: number;
  totalMembers: number;
  presentMembers: number;
  absentMembers: number;
  trainingRate: number;
  trainingChange: number;
}

export interface RevenueData {
  monthlyTotal: number;
  dailyTotal: number;
  goalRate: number;
  monthOverMonth: number;
  weeklyData: Array<{ label: string; value: number; isToday?: boolean }>;
  monthlyData: Array<{ label: string; value: number }>;
}

export interface RecentPayment {
  name: string;
  description: string;
  amount: string;
  time: string;
}

export interface PriorityTaskItem {
  icon: string;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle: string;
  href?: string;
}

export interface RecentClassItem {
  id: string;
  className: string;
  instructorName: string;
  category: string | null;
  trainingType: string | null;
  capacity: number;
  startTime: string;
  endTime: string;
  clubName: string;
}

export interface DirectorDashboardData {
  directorName: string;
  stats: TeamStats;
  coaches: CoachProgress[];
  events: UpcomingEvent[];
  pendingMemberCount: number;
  pendingMembers: Omit<PendingMemberItemProps, 'onApprove' | 'onReject'>[];
  revenue: RevenueData;
  recentPayments: RecentPayment[];
  priorityTasks: PriorityTaskItem[];
  /** [추가 2026-04-30] 홈 "수업 현황" 섹션 — 최근 등록된 수업 5건 */
  recentClasses: RecentClassItem[];
}

// [삭제 2026-04-29] EMPTY_REVENUE / [] mock 상수 제거 — 사용자 요청
const EMPTY_REVENUE: RevenueData = {
  monthlyTotal: 0,
  dailyTotal: 0,
  goalRate: 0,
  monthOverMonth: 0,
  weeklyData: [],
  monthlyData: [],
};

/**
 * 대시보드 상태 기반 우선 처리 항목 동적 생성
 */
function buildPriorityTasks(
  pendingCount: number,
  stats?: { attendanceRate?: number; totalMembers?: number },
): PriorityTaskItem[] {
  const tasks: PriorityTaskItem[] = [];

  if (pendingCount > 0) {
    tasks.push({
      icon: 'how_to_reg',
      iconBg: 'bg-orange-50 dark:bg-orange-900/20',
      iconColor: 'text-orange-600 dark:text-orange-400',
      title: `신규 회원 ${pendingCount}명 승인 대기`,
      subtitle: '빠른 승인이 필요합니다',
      href: '/director-approvals',
    });
  }

  if (stats?.attendanceRate !== undefined && stats.attendanceRate < 80) {
    tasks.push({
      icon: 'warning',
      iconBg: 'bg-red-50 dark:bg-red-900/20',
      iconColor: 'text-red-600 dark:text-red-400',
      title: '출석률 저조 알림',
      subtitle: `현재 출석률 ${stats.attendanceRate}% (목표 80%)`,
      href: '/statistics',
    });
  }

  // 기본 항목: 항상 표시
  tasks.push({
    icon: 'credit_card',
    iconBg: 'bg-blue-50 dark:bg-blue-900/20',
    iconColor: 'text-primary dark:text-blue-400',
    title: '미수금 확인',
    subtitle: '이번 달 미결제 현황 확인',
    href: '/director-payments',
  });

  return tasks;
}

export function useDirectorDashboardData() {
  const [data, setData] = useState<DirectorDashboardData | null>(null);
  // [수정 2026-04-29] 4개 fetch → 1개 통합. clubsLoading/revenueLoading/activitiesLoading
  // 는 외부 호환을 위해 dashLoading 과 동일 값을 반환한다.
  const [dashLoading, setDashLoading] = useState(true);

  const fetchDirectorData = useCallback(async () => {
    setDashLoading(true);

    // ─── 단일 통합 대시보드 호출 ──────────────────────────
    // 백엔드 GET /dashboard/director 가 stats/coaches/events/pendingMembers/
    // pendingMemberCount/latestNotices 를 모두 포함해 반환한다.
    // 기존의 /teams/managed/list, /dashboard/analytics/revenue,
    // /dashboard/activities 호출은 director 홈에서 사용하지 않는 데이터였으므로 폐기.
    try {
      const response = await dashboardService.getDirectorDashboard();
      if (!response?.data) throw new Error('No data');
      const apiData = response.data as DirectorDashboardApiData & {
        pendingMemberCount?: number;
        pendingMembers?: Omit<PendingMemberItemProps, 'onApprove' | 'onReject'>[];
        recentClasses?: RecentClassItem[];
        latestNotices?: unknown;
      };
      const stats = {
        attendanceRate: apiData.stats?.attendanceRate ?? 0,
        attendanceChange: apiData.stats?.attendanceChange ?? 0,
        totalMembers: apiData.stats?.totalMembers ?? 0,
        presentMembers: apiData.stats?.presentMembers ?? 0,
        absentMembers: apiData.stats?.absentMembers ?? 0,
        trainingRate: apiData.stats?.trainingRate ?? 0,
        trainingChange: apiData.stats?.trainingChange ?? 0,
      };
      const pendingMembers = Array.isArray(apiData.pendingMembers) ? apiData.pendingMembers : [];
      const pendingMemberCount = apiData.pendingMemberCount ?? pendingMembers.length;
      setData({
        // 폴백 문자열에 "님" 포함 금지 — AppBar 가 "{name}님" 자동 부착
        directorName: apiData.directorName || apiData.name || '감독',
        stats,
        coaches: Array.isArray(apiData.coaches) ? apiData.coaches : [],
        events: Array.isArray(apiData.events) ? apiData.events : [],
        pendingMemberCount,
        pendingMembers,
        revenue: EMPTY_REVENUE,
        recentPayments: [],
        priorityTasks: buildPriorityTasks(pendingMemberCount, stats),
        recentClasses: Array.isArray(apiData.recentClasses) ? apiData.recentClasses : [],
      });
    } catch (error) {
      devWarn('Director Dashboard API failed:', error);
      setData((prev) => ({
        directorName: prev?.directorName ?? '감독',
        stats: prev?.stats ?? {
          attendanceRate: 0, attendanceChange: 0, totalMembers: 0,
          presentMembers: 0, absentMembers: 0, trainingRate: 0, trainingChange: 0,
        },
        coaches: prev?.coaches ?? [],
        events: prev?.events ?? [],
        pendingMemberCount: prev?.pendingMemberCount ?? 0,
        pendingMembers: prev?.pendingMembers ?? [],
        revenue: EMPTY_REVENUE,
        recentPayments: [],
        priorityTasks: buildPriorityTasks(prev?.pendingMemberCount ?? 0),
        recentClasses: prev?.recentClasses ?? [],
      }));
    } finally {
      setDashLoading(false);
    }
  }, []);

  // React 19 Strict Mode dev 환경 useEffect 더블 호출로 인한 4개 API × 2회
  // 중복 호출을 차단하는 마운트 가드. production 환경에서는 useEffect가 1회만
  // 실행되므로 동작에 영향이 없다. 사용자 갱신 호출(`refresh`/`approveMember`/
  // `rejectMember`)은 ref 우회로 정상 작동한다.
  const initialFetchedRef = useRef(false);
  useEffect(() => {
    if (initialFetchedRef.current) return;
    initialFetchedRef.current = true;
    fetchDirectorData();
  }, [fetchDirectorData]);

  // 회원 수강신청 승인
  const approveMember = useCallback(async (enrollmentId: string) => {
    const response = await api.post(`/enrollments/${enrollmentId}/approve`);
    if (!response.success) {
      throw new Error(response.error?.message ?? '오류가 발생했습니다. 다시 시도해주세요.');
    }
    await fetchDirectorData();
  }, [fetchDirectorData]);

  // 회원 수강신청 거절
  const rejectMember = useCallback(async (enrollmentId: string) => {
    const response = await api.post(`/enrollments/${enrollmentId}/reject`);
    if (!response.success) {
      throw new Error(response.error?.message ?? '오류가 발생했습니다. 다시 시도해주세요.');
    }
    await fetchDirectorData();
  }, [fetchDirectorData]);

  return {
    data,
    dashLoading,
    // [수정 2026-04-29] 4개 fetch → 1개 통합. 외부 호환을 위해 동일 값 반환.
    clubsLoading: dashLoading,
    revenueLoading: dashLoading,
    activitiesLoading: dashLoading,
    isLoading: dashLoading,
    refresh: fetchDirectorData,
    approveMember,
    rejectMember,
  };
}
