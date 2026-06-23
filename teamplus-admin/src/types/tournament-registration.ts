/**
 * 대회 등록 타입 정의
 */

export enum TournamentRegistrationStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  WAITLISTED = 'waitlisted',
}

export interface TournamentRegistration {
  id: string;
  tournamentId: string;
  tournament?: {
    id: string;
    name: string;
  };
  memberId: string;
  member?: {
    id: string;
    playerName: string;
  };
  teamId?: string;
  status: TournamentRegistrationStatus;
  registeredAt: string;
  feeAmount?: number;
  paymentId?: string;
  memo?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FeePreview {
  baseAmount: number;
  discountAmount: number;
  finalAmount: number;
  feeBreakdown: {
    label: string;
    amount: number;
  }[];
}

export interface CreateTournamentRegistrationRequest {
  tournamentId: string;
  memberId: string;
  teamId?: string;
  memo?: string;
}

export interface TournamentRegistrationFilterParams {
  tournamentId?: string;
  status?: TournamentRegistrationStatus;
  page?: number;
  pageSize?: number;
}
