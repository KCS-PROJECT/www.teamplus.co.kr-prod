'use client';

import { useState, useCallback, useEffect } from 'react';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';

// ─── Types ──────────────────────────────────────────
export interface ClassListItem {
  id: string;
  className: string;
  description?: string;
  trainingType?: string;
  instructorName: string;
  capacity: number;
  ageMin?: number;
  ageMax?: number;
  levelRequired?: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
  enrolledCount?: number;
}

interface ClassApiItem {
  id: string;
  className?: string;
  name?: string;
  title?: string;
  description?: string;
  trainingType?: string;
  instructorName?: string;
  coachName?: string;
  capacity?: number;
  maxStudents?: number;
  ageMin?: number;
  ageMax?: number;
  levelRequired?: string;
  level?: string;
  startTime?: string;
  endTime?: string;
  isActive?: boolean;
  status?: string;
  enrolledCount?: number;
  studentCount?: number;
}

export type ClassStatusFilter = 'all' | 'active' | 'inactive';

/** 백엔드 응답을 프론트엔드 ClassListItem으로 변환 */
function toClassListItem(item: ClassApiItem): ClassListItem {
  return {
    id: item.id,
    className: item.className ?? item.name ?? item.title ?? '',
    description: item.description,
    trainingType: item.trainingType,
    instructorName: item.instructorName ?? item.coachName ?? '',
    capacity: item.capacity ?? item.maxStudents ?? 0,
    ageMin: item.ageMin,
    ageMax: item.ageMax,
    levelRequired: item.levelRequired ?? item.level,
    startTime: item.startTime ?? '',
    endTime: item.endTime ?? '',
    isActive: item.isActive ?? (item.status === 'ACTIVE'),
    enrolledCount: item.enrolledCount ?? item.studentCount ?? 0,
  };
}

export function useClassList() {
  const [classes, setClasses] = useState<ClassListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ClassStatusFilter>('all');

  const fetchClasses = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Step 1: 코치의 팀 ID 조회
      const clubRes = await api.get<Array<{ id: string }>>('/teams/managed/list');
      if (!clubRes.success || !clubRes.data?.[0]) {
        setClasses([]);
        return;
      }
      const clubId = clubRes.data[0].id;

      // Step 2: 수업 목록 조회
      const res = await api.get<{
        data?: ClassApiItem[];
        classes?: ClassApiItem[];
        items?: ClassApiItem[];
      }>(`/teams/${clubId}/classes`);

      if (res.success && res.data) {
        const d = res.data;
        const items = d.data ?? d.classes ?? d.items ?? (Array.isArray(d) ? d : []);
        setClasses((items as ClassApiItem[]).map(toClassListItem));
      } else {
        setClasses([]);
      }
    } catch {
      setError(MESSAGES.error.general);
      setClasses([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  // 필터링
  const filtered = classes.filter((c) => {
    if (filter === 'active') return c.isActive;
    if (filter === 'inactive') return !c.isActive;
    return true;
  });

  const counts = {
    all: classes.length,
    active: classes.filter((c) => c.isActive).length,
    inactive: classes.filter((c) => !c.isActive).length,
  };

  return {
    classes: filtered,
    allClasses: classes,
    counts,
    isLoading,
    error,
    filter,
    setFilter,
    refresh: fetchClasses,
  };
}
