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
  /** 대회 기간 — null = 일정 미정(경기 일정 미확정). */
  startDate: string | null;
  endDate: string | null;
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
  /** 삭제 불가 사유(백엔드 tournament-delete-block.util). null = 삭제 가능, 키 없음 = 판정 미제공. */
  deleteBlockedReason?:
    | 'FINISHED'
    | 'HAS_PAYMENT'
    | 'HAS_MATCH_RECORDS'
    | 'STARTED'
    | 'HAS_APPLICANTS'
    | null;
  /** 삭제 불가 사유 문구 — 휴지통 툴팁에 그대로 쓴다. */
  deleteBlockedMessage?: string | null;
}

export interface CreateTournamentRequest {
  name: string;
  description?: string;
  clubId?: string;
  /** null = 일정 미정 대회 생성(수정 시 null 전송 = 기간 해제). */
  startDate: string | null;
  endDate: string | null;
  billingMode?: TournamentBillingMode;
  eligibleBirthYearFrom?: number;
  eligibleBirthYearTo?: number;
  feePerGame?: number;
  totalGames?: number;
  feeType: TournamentFeeType;
  maxParticipants?: number;
  registrationDeadline?: string;
}

export type UpdateTournamentRequest = Partial<CreateTournamentRequest>;

/** GET /tournaments/:id/registrations 의 registrations[] 원소. 참가자는 자녀(child) 우선, 없으면 신청자(user). */
export interface TournamentRegistration {
  id: string;
  userId: string;
  childId: string | null;
  gamesCount: number | null;
  calculatedFee: number | string | null;
  /** UNPAID | PENDING | PAID | CANCELLED | REFUNDED */
  paymentStatus: string | null;
  registeredAt: string;
  user?: { id: string; firstName?: string | null; lastName?: string | null } | null;
  child?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    childProfile?: { birthDate?: string | null } | null;
  } | null;
}

interface TournamentRegistrationsResponse {
  tournamentId: string;
  total: number;
  registrations: TournamentRegistration[];
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
      getApiErrorMessage(error, '대회 삭제에 실패했습니다.'),
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
    const data = await api.get<TournamentRegistrationsResponse>(
      `/tournaments/${tournamentId}/registrations`,
    );
    return Array.isArray(data?.registrations) ? data.registrations : [];
  } catch (error: unknown) {
    console.error('[Tournament Service] 참가자 명단 조회 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '참가자 명단을 불러오는 데 실패했습니다.'),
    );
  }
};

export const tournamentService = {
  getTournaments,
  getTournamentById,
  updateTournament,
  deleteTournament,
  getTournamentRegistrations,
};

export default tournamentService;
