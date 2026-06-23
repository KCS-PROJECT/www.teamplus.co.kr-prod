'use client';

import { useState, useCallback, useEffect } from 'react';
import { api } from '@/services/api-client';
import { devError } from '@/lib/logger';

interface ClassRecord {
  id: string;
  title: string;
  coach: string;
  schedule: string;
  status: string;
}

/** 백엔드 GET /api/v1/teams/:teamId/classes 응답 아이템 */
interface ClassApiItem {
  id: string;
  name?: string;
  title?: string;
  coachName?: string;
  coach?: { name?: string };
  schedule?: string;
  scheduleSummary?: string;
  status?: string;
  enrollmentStatus?: string;
}

/** 백엔드 응답을 프론트엔드 ClassRecord로 변환 */
function toClassRecord(item: ClassApiItem): ClassRecord {
  return {
    id: item.id,
    title: item.name ?? item.title ?? '',
    coach: item.coachName ?? item.coach?.name ?? '',
    schedule: item.schedule ?? item.scheduleSummary ?? '',
    status: item.enrollmentStatus ?? item.status ?? '',
  };
}

export function useClasses(teamId?: string) {
  const [classList, setClassList] = useState<ClassRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchClasses = useCallback(async () => {
    setIsLoading(true);
    try {
      if (!teamId) {
        setClassList([]);
        return;
      }

      const response = await api.get<{
        data?: ClassApiItem[];
        classes?: ClassApiItem[];
        items?: ClassApiItem[];
      }>(`/teams/${teamId}/classes`);

      if (response.success && response.data) {
        const d = response.data;
        const items = d.data ?? d.classes ?? d.items ?? (Array.isArray(d) ? d : []);
        setClassList((items as ClassApiItem[]).map(toClassRecord));
      } else {
        setClassList([]);
      }
    } catch (error) {
      devError('Failed to fetch classes:', error);
      setClassList([]);
    } finally {
      setIsLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  return {
    classList,
    isLoading,
    refresh: fetchClasses
  };
}
