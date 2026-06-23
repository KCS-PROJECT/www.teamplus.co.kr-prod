'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { dashboardService } from '@/services/dashboard';
import { devWarn } from '@/lib/logger';

export interface ChildInfo {
  id: string;
  name: string;
  grade: string;
  attendanceRate: number;
  nextClass: string;
  nextClassTime: string;
  profileEmoji: string;
  remainingCredits: number;
}

export interface AttendanceDay {
  date: string;
  dayLabel: string;
  attended: boolean;
}

export interface NoticeItem {
  id: string;
  title: string;
  date: string;
  isNew: boolean;
}

export interface UpcomingClassItem {
  tag: string;
  title: string;
  time: string;
  teacher: string;
  location?: string;
  imageUrl?: string;
}

export interface DashboardData {
  parentName: string;
  creditData: {
    current: number;
    expiryDate: string;
  };
  nextClass: {
    tag: string;
    title: string;
    time: string;
    teacher: string;
    imageUrl?: string;
  };
  upcomingClasses: UpcomingClassItem[];
  recentActivities: Array<{
    icon: string;
    text: string;
    time: string;
    iconColor: string;
  }>;
  children: ChildInfo[];
  weeklyAttendance: AttendanceDay[];
  notices: NoticeItem[];
}

/**
 * 학부모 대시보드 데이터 Hook (실제 API 연결)
 */
export function useDashboardData() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchDashboardData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await dashboardService.getParentDashboard();
      if (response && response.data) {
        const apiData = response.data;
        setData({
          // 폴백 문자열에 "님" 포함 금지 — AppBar 가 "{name}님" 자동 부착
          parentName: apiData.parentName ?? apiData.name ?? '회원',
          creditData: {
            current: apiData.creditData?.current ?? apiData.credits ?? apiData.credit ?? 0,
            expiryDate: apiData.creditData?.expiryDate ?? apiData.expiryDate ?? '-',
          },
          nextClass: apiData.nextClass ?? {
            tag: '수업',
            title: '예정된 수업이 없습니다',
            time: '-',
            teacher: '-',
          },
          upcomingClasses: (apiData.upcomingSchedules ?? apiData.upcomingClasses ?? []).slice(0, 5).map((s: Record<string, unknown>) => ({
            tag: (s.tag as string) ?? '수업',
            title: (s.className as string) ?? (s.title as string) ?? '수업',
            time: (s.time as string) ?? (s.scheduledDate ? new Date(s.scheduledDate as string).toLocaleDateString('ko-KR', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '-'),
            teacher: (s.teacher as string) ?? (s.coachName as string) ?? '-',
            location: (s.location as string) ?? '',
          })),
          recentActivities: apiData.recentActivities ?? [],
          children: apiData.children ?? [],
          weeklyAttendance: apiData.weeklyAttendance ?? [],
          notices: apiData.notices ?? [],
        });
        setError(null);
      } else {
        throw new Error('No data received from API');
      }
    } catch (err) {
      devWarn('Dashboard API failed:', err);
      setError(new Error('데이터를 불러올 수 없습니다.'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Strict Mode dev 환경 useEffect 더블 호출로 인한 중복 fetch 차단.
  // production 환경에서는 useEffect가 1회만 실행되므로 영향이 없다.
  const initialFetchedRef = useRef(false);
  useEffect(() => {
    if (initialFetchedRef.current) return;
    initialFetchedRef.current = true;
    fetchDashboardData();
  }, [fetchDashboardData]);

  return { data, isLoading, error, refresh: fetchDashboardData };
}
