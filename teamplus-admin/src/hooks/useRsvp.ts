/**
 * useRsvp - RSVP TanStack Query 훅
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { rsvpService } from '../services/rsvp.service';
import { CreateRsvpRequest, UpdateRsvpRequest, RsvpStatus } from '../types/rsvp';
import { PaginationParams } from '../types';

const RSVP_QUERY_KEYS = {
  all: ['rsvp'] as const,
  bySchedule: (scheduleId: string, params?: PaginationParams & { status?: RsvpStatus }) =>
    ['rsvp', 'schedule', scheduleId, params] as const,
  summary: (scheduleId: string) => ['rsvp', 'summary', scheduleId] as const,
};

/**
 * 일정별 RSVP 목록 조회
 */
export function useRsvpsBySchedule(
  scheduleId: string,
  params?: PaginationParams & { status?: RsvpStatus }
) {
  return useQuery({
    queryKey: RSVP_QUERY_KEYS.bySchedule(scheduleId, params),
    queryFn: () => rsvpService.getRsvpsBySchedule(scheduleId, params),
    enabled: !!scheduleId,
    staleTime: 30_000,
  });
}

/**
 * RSVP 요약 조회
 */
export function useRsvpSummary(scheduleId: string) {
  return useQuery({
    queryKey: RSVP_QUERY_KEYS.summary(scheduleId),
    queryFn: () => rsvpService.getRsvpSummary(scheduleId),
    enabled: !!scheduleId,
    staleTime: 30_000,
  });
}

/**
 * RSVP 생성
 */
export function useCreateRsvp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateRsvpRequest) => rsvpService.createRsvp(data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: RSVP_QUERY_KEYS.bySchedule(variables.scheduleId),
      });
      queryClient.invalidateQueries({
        queryKey: RSVP_QUERY_KEYS.summary(variables.scheduleId),
      });
    },
  });
}

/**
 * RSVP 수정
 */
export function useUpdateRsvp(scheduleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ rsvpId, data }: { rsvpId: string; data: UpdateRsvpRequest }) =>
      rsvpService.updateRsvp(rsvpId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: RSVP_QUERY_KEYS.bySchedule(scheduleId),
      });
      queryClient.invalidateQueries({
        queryKey: RSVP_QUERY_KEYS.summary(scheduleId),
      });
    },
  });
}

/**
 * RSVP 삭제
 */
export function useDeleteRsvp(scheduleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rsvpId: string) => rsvpService.deleteRsvp(rsvpId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: RSVP_QUERY_KEYS.bySchedule(scheduleId),
      });
      queryClient.invalidateQueries({
        queryKey: RSVP_QUERY_KEYS.summary(scheduleId),
      });
    },
  });
}
