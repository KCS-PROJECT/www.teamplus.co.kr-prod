/**
 * useWaitlist - 대기자 명단 TanStack Query 훅
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { waitlistService } from '../services/waitlist.service';
import { CreateWaitlistRequest, WaitlistFilterParams, WaitlistStatus } from '../types/waitlist';

const WAITLIST_QUERY_KEYS = {
  all: ['waitlist'] as const,
  list: (params?: WaitlistFilterParams) => ['waitlist', 'list', params] as const,
  byClass: (classId: string) => ['waitlist', 'class', classId] as const,
};

/**
 * 대기자 목록 조회
 */
export function useWaitlistEntries(params?: WaitlistFilterParams) {
  return useQuery({
    queryKey: WAITLIST_QUERY_KEYS.list(params),
    queryFn: () => waitlistService.getWaitlistEntries(params),
    staleTime: 30_000,
  });
}

/**
 * 수업별 대기자 목록
 */
export function useWaitlistByClass(classId: string) {
  return useQuery({
    queryKey: WAITLIST_QUERY_KEYS.byClass(classId),
    queryFn: () => waitlistService.getWaitlistByClass(classId),
    enabled: !!classId,
    staleTime: 30_000,
  });
}

/**
 * 대기자 등록
 */
export function useCreateWaitlistEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateWaitlistRequest) =>
      waitlistService.createWaitlistEntry(data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: WAITLIST_QUERY_KEYS.all });
      queryClient.invalidateQueries({
        queryKey: WAITLIST_QUERY_KEYS.byClass(variables.classId),
      });
    },
  });
}

/**
 * 대기자 상태 변경
 */
export function useUpdateWaitlistStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, status }: { entryId: string; status: WaitlistStatus }) =>
      waitlistService.updateWaitlistStatus(entryId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WAITLIST_QUERY_KEYS.all });
    },
  });
}

/**
 * 대기자 삭제
 */
export function useDeleteWaitlistEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) => waitlistService.deleteWaitlistEntry(entryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WAITLIST_QUERY_KEYS.all });
    },
  });
}
