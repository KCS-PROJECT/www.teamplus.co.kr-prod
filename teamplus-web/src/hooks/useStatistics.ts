'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/services/api-client';

import { StatCardVariant } from '@/components/dashboard/StatCard';
import { devError } from '@/lib/logger';

interface StatItem {
  title: string;
  value: number;
  unit: string;
  icon: string;
  variant?: StatCardVariant;
}

/** GET /api/v1/dashboard/summary 응답 */
interface DashboardSummary {
  attendanceRate?: number;
  activeMembers?: number;
  upcomingMatches?: number;
}

/** GET /api/v1/dashboard/activities 응답 */
interface DashboardActivities {
  activities?: Array<{ message?: string; description?: string }>;
  items?: Array<{ message?: string; description?: string }>;
}

export function useStatistics() {
  const [stats, setStats] = useState<StatItem[]>([]);
  const [activities, setActivities] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    try {
      const [summaryRes, activitiesRes] = await Promise.all([
        api.get<DashboardSummary>('/dashboard/summary'),
        api.get<DashboardActivities>('/dashboard/activities'),
      ]);

      if (summaryRes.success && summaryRes.data) {
        const d = summaryRes.data;
        setStats([
          { title: '이번 주 참석률', value: d.attendanceRate ?? 0, unit: '%', icon: 'task_alt', variant: 'primary' },
          { title: '활동 선수', value: d.activeMembers ?? 0, unit: '명', icon: 'groups' },
          { title: '다음 경기', value: d.upcomingMatches ?? 0, unit: '건', icon: 'sports_hockey' },
        ]);
      } else {
        setStats([]);
      }

      if (activitiesRes.success && activitiesRes.data) {
        const raw = activitiesRes.data.activities ?? activitiesRes.data.items ?? [];
        setActivities(raw.map((a) => a.message ?? a.description ?? '').filter(Boolean));
      } else {
        setActivities([]);
      }
    } catch (error) {
      devError('Failed to fetch statistics:', error);
      setStats([]);
      setActivities([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, activities, isLoading, refresh: fetchStats };
}
