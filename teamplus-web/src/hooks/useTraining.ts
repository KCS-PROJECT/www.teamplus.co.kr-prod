'use client';

import { useState, useCallback, useEffect } from 'react';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';

// ─── Types ──────────────────────────────────────────

export const TRAINING_TYPES = [
  'REGULAR_TRAINING',
  'GAME',
  'FUN',
  'CAMP',
  'PICKUP',
] as const;

export type TrainingType = (typeof TRAINING_TYPES)[number];

export const TRAINING_TYPE_LABELS: Record<TrainingType, string> = {
  REGULAR_TRAINING: '정규훈련',
  GAME: '시합',
  FUN: '펀하키',
  CAMP: '캠프',
  PICKUP: '픽업게임',
};

export const TRAINING_TYPE_ICONS: Record<TrainingType, { icon: string; bg: string; color: string }> = {
  REGULAR_TRAINING: { icon: 'fitness_center', bg: 'bg-blue-50 dark:bg-blue-900/20', color: 'text-blue-600 dark:text-blue-400' },
  GAME: { icon: 'sports_hockey', bg: 'bg-red-50 dark:bg-red-900/20', color: 'text-red-600 dark:text-red-400' },
  FUN: { icon: 'emoji_events', bg: 'bg-amber-50 dark:bg-amber-900/20', color: 'text-amber-600 dark:text-amber-400' },
  CAMP: { icon: 'hiking', bg: 'bg-green-50 dark:bg-green-900/20', color: 'text-green-600 dark:text-green-400' },
  PICKUP: { icon: 'group_add', bg: 'bg-purple-50 dark:bg-purple-900/20', color: 'text-purple-600 dark:text-purple-400' },
};

export interface TrainingSession {
  id: string;
  clubId: string;
  className: string;
  description?: string;
  trainingType: TrainingType;
  instructorName: string;
  capacity: number;
  ageMin?: number;
  ageMax?: number;
  levelRequired?: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  _count?: {
    schedules: number;
    enrollments: number;
  };
}

export interface TrainingSchedule {
  id: string;
  scheduledDate: string;
  isCancelled: boolean;
  cancellationReason?: string;
  _count?: {
    attendances: number;
    rsvps: number;
  };
}

export interface TrainingDetail extends TrainingSession {
  club: {
    id: string;
    clubName: string;
    coach?: { id: string; firstName: string; lastName: string };
  };
  coachName: string;
  schedules: TrainingSchedule[];
}

export interface TrainingAttendance {
  id: string;
  memberId: string;
  userName: string;
  email: string;
  status: string;
  creditDeducted: boolean;
  checkedInAt: string | null;
}

export interface TrainingStats {
  clubId: string;
  month: string;
  totalTrainingSessions: number;
  typeBreakdown: Record<TrainingType, number>;
  monthlySchedules: number;
  monthlyCancelled: number;
  monthlyAttendance: number;
  completionRate: string;
}

// ─── Hook: 코치의 팀 ID 자동 조회 ─────────────────────

export function useMyClubId() {
  const [clubId, setClubId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<Array<{ id: string }>>('/teams/managed/list');
        if (res.success && res.data?.[0]) {
          setClubId(res.data[0].id);
        }
      } catch {
        // 무시
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  return { clubId, isLoading };
}

// ─── Hook: 훈련 목록 조회 ─────────────────────────────

export function useTrainingList(clubId: string | null) {
  const [data, setData] = useState<TrainingSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 0 });

  const fetchTrainings = useCallback(async (
    page = 1,
    trainingType?: string,
    search?: string,
  ) => {
    if (!clubId) return;
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('limit', '20');
      if (trainingType) params.append('trainingType', trainingType);
      if (search) params.append('search', search);

      const response = await api.get<{ data: TrainingSession[]; pagination: typeof pagination }>(
        `/training/club/${clubId}?${params.toString()}`,
      );

      if (response.success && response.data) {
        setData(response.data.data ?? []);
        setPagination(response.data.pagination ?? { total: 0, page: 1, limit: 20, totalPages: 0 });
      } else {
        setError(response.error?.message ?? MESSAGES.error.general);
      }
    } catch {
      setError(MESSAGES.error.network);
    } finally {
      setIsLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    fetchTrainings();
  }, [fetchTrainings]);

  return { data, isLoading, error, pagination, refresh: fetchTrainings };
}

// ─── Hook: 훈련 상세 조회 ─────────────────────────────

export function useTrainingDetail(trainingId: string | null) {
  const [data, setData] = useState<TrainingDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!trainingId) return;
    setIsLoading(true);
    setError(null);

    try {
      const response = await api.get<TrainingDetail>(`/training/${trainingId}`);

      if (response.success && response.data) {
        setData(response.data);
      } else {
        setError(response.error?.message ?? MESSAGES.error.general);
      }
    } catch {
      setError(MESSAGES.error.network);
    } finally {
      setIsLoading(false);
    }
  }, [trainingId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  return { data, isLoading, error, refresh: fetchDetail };
}

// ─── Hook: 훈련 통계 ────────────────────────────────

export function useTrainingStats(clubId: string | null) {
  const [stats, setStats] = useState<TrainingStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    if (!clubId) return;
    setIsLoading(true);

    try {
      const response = await api.get<TrainingStats>(`/training/stats/club/${clubId}`);
      if (response.success && response.data) {
        setStats(response.data);
      }
    } catch {
      // 통계 실패는 무시 (대시보드에서 optional 표시)
    } finally {
      setIsLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, isLoading, refresh: fetchStats };
}

// ─── API 액션 함수 ──────────────────────────────────

export async function createTraining(
  clubId: string,
  body: {
    className: string;
    description?: string;
    trainingType: string;
    instructorName: string;
    capacity: number;
    ageMin?: number;
    ageMax?: number;
    levelRequired?: string;
    startTime: string;
    endTime: string;
    scheduleDates?: string[];
  },
) {
  return api.post<TrainingSession>(`/training/${clubId}`, body);
}

export async function updateTraining(
  trainingId: string,
  body: Partial<{
    className: string;
    description: string;
    trainingType: string;
    instructorName: string;
    capacity: number;
    ageMin: number;
    ageMax: number;
    levelRequired: string;
    startTime: string;
    endTime: string;
    isActive: boolean;
  }>,
) {
  return api.patch<TrainingSession>(`/training/${trainingId}`, body);
}

export async function deleteTraining(trainingId: string) {
  return api.delete(`/training/${trainingId}`);
}

export async function addTrainingSchedules(
  trainingId: string,
  dates: string[],
) {
  return api.post(`/training/${trainingId}/schedules`, { dates });
}

export async function cancelTrainingSchedule(
  trainingId: string,
  scheduleId: string,
  cancellationReason?: string,
) {
  return api.put(`/training/${trainingId}/schedules/${scheduleId}/cancel`, {
    cancellationReason,
  });
}

export async function getScheduleAttendance(
  trainingId: string,
  scheduleId: string,
) {
  return api.get(`/training/${trainingId}/schedules/${scheduleId}/attendance`);
}

export async function markTrainingAttendance(
  trainingId: string,
  scheduleId: string,
  memberIds: string[],
) {
  return api.post(`/training/${trainingId}/schedules/${scheduleId}/attendance`, {
    memberIds,
  });
}
