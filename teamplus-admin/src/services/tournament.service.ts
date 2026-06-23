/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TEAMPLUS Tournament Service
 * 대회 관리 API 호출 (대회 CRUD + 참가자 명단)
 */

import { api } from './api-client';
import { getApiErrorMessage } from '@/lib/api-error';

export type TournamentStatus = 'scheduled' | 'ongoing' | 'finished' | 'cancelled';
export type TournamentFeeType = 'PER_GAME' | 'TOTAL_FIXED';
/** 결제 모드 — PREPAID(선불) | POSTPAID(후불, 종료 후 일괄 청구). 기본 PREPAID. */
export type TournamentBillingMode = 'PREPAID' | 'POSTPAID';

export interface Tournament {
  id: string;
  name: string;
  description: string | null;
  clubId: string | null;
  rinkId: string | null;
  startDate: string;
  endDate: string;
  status: TournamentStatus;
  billingMode: TournamentBillingMode;
  /**
   * 참가 자격 출생연도 개별 집합 (예: [2014, 2016, 2019]). 백엔드 `Tournament.eligibleBirthYears(Int[])`.
   * 비어있으면([] 또는 미존재) 기존 eligibleBirthYearFrom/To 범위로 폴백한다.
   */
  eligibleBirthYears?: number[] | null;
  eligibleBirthYearFrom: number | null;
  eligibleBirthYearTo: number | null;
  feePerGame: number | null;
  totalGames: number | null;
  feeType: TournamentFeeType | null;
  maxParticipants: number | null;
  registrationDeadline: string | null;
  club?: { id: string; clubName: string } | null;
  _count?: { matches: number; registrations: number };
}

export interface CreateTournamentRequest {
  name: string;
  description?: string;
  clubId?: string;
  startDate: string;
  endDate: string;
  status: TournamentStatus;
  billingMode?: TournamentBillingMode;
  eligibleBirthYearFrom?: number;
  eligibleBirthYearTo?: number;
  feePerGame?: number;
  totalGames?: number;
  feeType: TournamentFeeType;
  maxParticipants?: number;
  registrationDeadline?: string;
}

/** 후불 정산 확정 응답 — confirmTournamentSettlement 결과. */
export interface ConfirmTournamentSettlementResponse {
  tournamentId: string;
  billedCount: number;
  feePerPerson: number;
  totalAmount: number;
}

export type UpdateTournamentRequest = Partial<CreateTournamentRequest>;

export interface TournamentRegistration {
  id: string;
  tournamentId: string;
  memberId: string;
  status: string;
  gamesCount: number | null;
  totalFee: number | null;
  paymentStatus: string | null;
  createdAt: string;
  member?: {
    id: string;
    name: string;
    birthYear: number | null;
    phone?: string | null;
    clubId?: string | null;
    club?: { clubName: string } | null;
  } | null;
}

/**
 * 대회 목록 조회
 */
export const getTournaments = async (clubId?: string): Promise<Tournament[]> => {
  try {
    const data = await api.get<Tournament[]>('/tournaments', {
      params: clubId ? { clubId } : undefined,
    });
    return Array.isArray(data) ? data : [];
  } catch (error: unknown) {
    console.error('[Tournament Service] 목록 조회 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '대회 목록을 불러오는 데 실패했습니다.'),
    );
  }
};

/**
 * 대회 상세 조회
 */
export const getTournamentById = async (id: string): Promise<Tournament> => {
  try {
    return await api.get<Tournament>(`/tournaments/${id}`);
  } catch (error: unknown) {
    console.error('[Tournament Service] 상세 조회 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '대회 정보를 불러오는 데 실패했습니다.'),
    );
  }
};

/**
 * 대회 등록
 */
export const createTournament = async (
  data: CreateTournamentRequest,
): Promise<Tournament> => {
  try {
    return await api.post<Tournament>('/tournaments', data);
  } catch (error: unknown) {
    console.error('[Tournament Service] 등록 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '대회 등록에 실패했습니다.'),
    );
  }
};

/**
 * 대회 수정
 */
export const updateTournament = async (
  id: string,
  data: UpdateTournamentRequest,
): Promise<Tournament> => {
  try {
    return await api.patch<Tournament>(`/tournaments/${id}`, data);
  } catch (error: unknown) {
    console.error('[Tournament Service] 수정 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '대회 수정에 실패했습니다.'),
    );
  }
};

/**
 * 대회 삭제
 */
export const deleteTournament = async (id: string): Promise<void> => {
  try {
    await api.delete(`/tournaments/${id}`);
  } catch (error: unknown) {
    console.error('[Tournament Service] 삭제 실패:', error);
    throw new Error(
      getApiErrorMessage(
        error,
        '대회 삭제에 실패했습니다. 경기가 등록된 대회는 삭제할 수 없습니다.',
      ),
    );
  }
};

/**
 * 대회 상태 변경
 */
export const changeTournamentStatus = async (
  id: string,
  status: TournamentStatus,
): Promise<Tournament> => {
  try {
    return await api.patch<Tournament>(`/tournaments/${id}/status`, { status });
  } catch (error: unknown) {
    console.error('[Tournament Service] 상태 변경 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '대회 상태 변경에 실패했습니다.'),
    );
  }
};

/**
 * 대회 참가자 명단 조회
 */
export const getTournamentRegistrations = async (
  tournamentId: string,
): Promise<TournamentRegistration[]> => {
  try {
    const data = await api.get<TournamentRegistration[]>(
      `/tournaments/${tournamentId}/registrations`,
    );
    return Array.isArray(data) ? data : [];
  } catch (error: unknown) {
    console.error('[Tournament Service] 참가자 명단 조회 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '참가자 명단을 불러오는 데 실패했습니다.'),
    );
  }
};

/**
 * 후불 대회 정산 확정 (DIRECTOR/COACH/ADMIN)
 *
 * 종료된 후불(POSTPAID) 대회의 1인당 참가비를 입력해 미결제 참가자 전원에게 일괄 청구한다.
 * 멱등 — 같은 대회를 재호출해도 미결제(UNPAID/PENDING) 건만 갱신, 결제 완료(PAID) 건은 보존.
 */
export const confirmTournamentSettlement = async (
  tournamentId: string,
  feePerPerson: number,
): Promise<ConfirmTournamentSettlementResponse> => {
  try {
    return await api.post<ConfirmTournamentSettlementResponse>(
      `/tournaments/${tournamentId}/postpaid/confirm`,
      { feePerPerson },
    );
  } catch (error: unknown) {
    console.error('[Tournament Service] 후불 정산 확정 실패:', error);
    throw new Error(getApiErrorMessage(error, '대회 정산에 실패했습니다.'));
  }
};

export const tournamentService = {
  getTournaments,
  getTournamentById,
  createTournament,
  updateTournament,
  deleteTournament,
  changeTournamentStatus,
  getTournamentRegistrations,
  confirmTournamentSettlement,
};

export default tournamentService;
