/**
 * useTournaments - 대회 관리 TanStack Query 훅
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  tournamentService,
  type CreateTournamentRequest,
  type UpdateTournamentRequest,
  type TournamentStatus,
} from '../services/tournament.service';

const TOURNAMENT_QUERY_KEYS = {
  all: ['tournaments'] as const,
  list: (clubId?: string) => ['tournaments', 'list', clubId ?? null] as const,
  detail: (id: string) => ['tournaments', 'detail', id] as const,
  registrations: (id: string) => ['tournaments', id, 'registrations'] as const,
};

/**
 * 대회 목록 조회
 */
export function useTournaments(clubId?: string) {
  return useQuery({
    queryKey: TOURNAMENT_QUERY_KEYS.list(clubId),
    queryFn: () => tournamentService.getTournaments(clubId),
    staleTime: 60_000,
  });
}

/**
 * 대회 상세 조회
 */
export function useTournament(id: string) {
  return useQuery({
    queryKey: TOURNAMENT_QUERY_KEYS.detail(id),
    queryFn: () => tournamentService.getTournamentById(id),
    enabled: !!id,
    staleTime: 60_000,
  });
}

/**
 * 대회 참가자 명단 조회 (ADMIN/DIRECTOR/COACH)
 */
export function useTournamentRegistrations(tournamentId: string, enabled = true) {
  return useQuery({
    queryKey: TOURNAMENT_QUERY_KEYS.registrations(tournamentId),
    queryFn: () => tournamentService.getTournamentRegistrations(tournamentId),
    enabled: !!tournamentId && enabled,
    staleTime: 30_000,
  });
}

/**
 * 대회 생성
 */
export function useCreateTournament() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTournamentRequest) =>
      tournamentService.createTournament(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TOURNAMENT_QUERY_KEYS.all });
    },
  });
}

/**
 * 대회 수정
 */
export function useUpdateTournament() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTournamentRequest }) =>
      tournamentService.updateTournament(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: TOURNAMENT_QUERY_KEYS.all });
      queryClient.invalidateQueries({
        queryKey: TOURNAMENT_QUERY_KEYS.detail(variables.id),
      });
    },
  });
}

/**
 * 대회 삭제
 */
export function useDeleteTournament() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tournamentService.deleteTournament(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TOURNAMENT_QUERY_KEYS.all });
    },
  });
}

/**
 * 대회 상태 변경
 */
export function useChangeTournamentStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TournamentStatus }) =>
      tournamentService.changeTournamentStatus(id, status),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: TOURNAMENT_QUERY_KEYS.all });
      queryClient.invalidateQueries({
        queryKey: TOURNAMENT_QUERY_KEYS.detail(variables.id),
      });
    },
  });
}

/**
 * 후불 대회 정산 확정 (DIRECTOR/COACH/ADMIN)
 * 성공 시 대회 목록 + 해당 대회 참가자 명단 캐시 무효화.
 */
export function useConfirmTournamentSettlement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      tournamentId,
      feePerPerson,
    }: {
      tournamentId: string;
      feePerPerson: number;
    }) =>
      tournamentService.confirmTournamentSettlement(tournamentId, feePerPerson),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: TOURNAMENT_QUERY_KEYS.all });
      queryClient.invalidateQueries({
        queryKey: TOURNAMENT_QUERY_KEYS.registrations(variables.tournamentId),
      });
    },
  });
}

export { TOURNAMENT_QUERY_KEYS };
