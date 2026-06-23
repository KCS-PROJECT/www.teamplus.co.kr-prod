/**
 * 해외 원정 관련 타입 정의
 * NestJS overseas-trips 백엔드 DTO와 동기화
 */

// ==================== Status Types ====================

export type TripStatus =
  | "draft"
  | "open"
  | "closed"
  | "ongoing"
  | "completed"
  | "cancelled";

export type RegistrationStatus =
  | "pending"
  | "confirmed"
  | "deposit_paid"
  | "cancelled"
  | "waitlisted";

// ==================== API Response Types ====================

/**
 * 2026-05-20 Phase C-D — alias dual emit 제거 완료. canonical only.
 *   백엔드 매퍼/DTO 모두 `team` 만 emit. `clubId`/`club` 필드 제거.
 *   참조: docs/Guides/CLAUDE_STANDARDS.md "API 응답 매퍼 — Dual Emit 패턴" 섹션.
 */
export interface OverseasTrip {
  id: string;
  title: string;
  country: string;
  city: string;
  description: string | null;
  startDate: string;
  endDate: string;
  registrationDeadline: string;
  maxParticipants: number;
  ageGroup: string | null;
  estimatedCost: string | null;
  depositAmount: string | null;
  depositDeadline: string | null;
  flightInfo: string | null;
  hotelInfo: string | null;
  transportInfo: string | null;
  itinerary: string | null;
  status: TripStatus;
  contactPhone: string | null;
  contactEmail: string | null;
  createdAt: string;
  updatedAt: string;
  /** 팀(클럽) 정보 — `mapToOverseasTripResponse` 응답 표준. */
  team?: {
    id: string;
    name: string;
  };
  createdBy?: {
    id: string;
    email: string;
    phone: string | null;
  };
  registrations?: TripRegistration[];
  _count?: {
    registrations: number;
  };
}

export interface TripRegistration {
  id: string;
  tripId: string;
  memberId: string;
  childId: string | null;
  parentId: string;
  status: RegistrationStatus;
  depositPaidAt: string | null;
  depositAmount: string | null;
  passportVerified: boolean;
  passportExpiryDate: string | null;
  specialRequirements: string | null;
  emergencyContact: string | null;
  emergencyPhone: string | null;
  cancelReason: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  member?: {
    id: string;
    playerName: string;
    playerAge: number;
    userId: string;
  };
  parent?: {
    id: string;
    email: string | null;
    phone: string | null;
  };
  child?: {
    id: string;
    email: string | null;
    phone: string | null;
  };
  trip?: {
    id: string;
    title: string;
    status: TripStatus;
  };
}

export interface MyTripItem {
  registration: {
    id: string;
    status: RegistrationStatus;
    depositPaidAt: string | null;
    depositAmount: string | null;
    passportVerified: boolean;
    createdAt: string;
  };
  trip: OverseasTrip;
}

// ==================== Request Types ====================

export interface CreateTripRegistrationParams {
  memberId: string;
  childId?: string;
  parentId: string;
  specialRequirements?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
}

// ==================== UI Helper Types ====================

export interface TripStatistics {
  trip: {
    id: string;
    title: string;
    maxParticipants: number;
    status: TripStatus;
    registrationDeadline: string;
  };
  statistics: {
    totalRegistrations: number;
    pending: number;
    confirmed: number;
    depositPaid: number;
    cancelled: number;
    waitlisted: number;
    passportVerified: number;
    remainingSlots: number;
  };
}
