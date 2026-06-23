/**
 * useTournamentRegistrations - 대회 등록 TanStack Query 훅
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tournamentRegistrationService } from '../services/tournament-registration.service';
import {
  CreateTournamentRegistrationRequest,
  TournamentRegistrationFilterParams,
  TournamentRegistrationStatus,
} from '../types/tournament-registration';

const TOURNAMENT_REG_QUERY_KEYS = {
  all: ['tournament-registrations'] as const,
  list: (params?: TournamentRegistrationFilterParams) =>
    ['tournament-registrations', 'list', params] as const,
  byTournament: (tournamentId: string) =>
    ['tournament-registrations', 'tournament', tournamentId] as const,
  feePreview: (tournamentId: string, memberId: string) =>
    ['tournament-registrations', 'fee-preview', tournamentId, memberId] as const,
};

/**
 * 대회 등록 목록 조회
 */
export function useTournamentRegistrations(params?: TournamentRegistrationFilterParams) {
  return useQuery({
    queryKey: TOURNAMENT_REG_QUERY_KEYS.list(params),
    queryFn: () => tournamentRegistrationService.getTournamentRegistrations(params),
    staleTime: 60_000,
  });
}

/**
 * 대회별 등록 목록
 */
export function useRegistrationsByTournament(tournamentId: string) {
  return useQuery({
    queryKey: TOURNAMENT_REG_QUERY_KEYS.byTournament(tournamentId),
    queryFn: () =>
      tournamentRegistrationService.getRegistrationsByTournament(tournamentId),
    enabled: !!tournamentId,
    staleTime: 60_000,
  });
}

/**
 * 참가비 미리보기
 */
export function useFeePreview(tournamentId: string, memberId: string) {
  return useQuery({
    queryKey: TOURNAMENT_REG_QUERY_KEYS.feePreview(tournamentId, memberId),
    queryFn: () =>
      tournamentRegistrationService.getFeePreview(tournamentId, memberId),
    enabled: !!tournamentId && !!memberId,
    staleTime: 60_000,
  });
}

/**
 * 대회 등록
 */
export function useCreateTournamentRegistration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTournamentRegistrationRequest) =>
      tournamentRegistrationService.createTournamentRegistration(data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: TOURNAMENT_REG_QUERY_KEYS.all });
      queryClient.invalidateQueries({
        queryKey: TOURNAMENT_REG_QUERY_KEYS.byTournament(variables.tournamentId),
      });
    },
  });
}

/**
 * 등록 상태 변경
 */
export function useUpdateRegistrationStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      registrationId,
      status,
    }: {
      registrationId: string;
      status: TournamentRegistrationStatus;
    }) =>
      tournamentRegistrationService.updateRegistrationStatus(registrationId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TOURNAMENT_REG_QUERY_KEYS.all });
    },
  });
}

/**
 * 등록 취소
 */
export function useCancelTournamentRegistration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (registrationId: string) =>
      tournamentRegistrationService.cancelTournamentRegistration(registrationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TOURNAMENT_REG_QUERY_KEYS.all });
    },
  });
}
