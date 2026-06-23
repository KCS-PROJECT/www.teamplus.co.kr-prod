/**
 * API 관련 공통 타입 정의
 * Flutter와 Next.js에서 공통으로 사용
 */

// API 응답 기본 형태
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  message?: string;
}

// ============================================
// 표준 에러 코드 정의
// ============================================
export const ApiErrorCode = {
  // 인증 관련
  AUTH_EXPIRED: "AUTH_EXPIRED", // 토큰 만료
  AUTH_INVALID: "AUTH_INVALID", // 인증 실패
  AUTH_REQUIRED: "AUTH_REQUIRED", // 인증 필요

  // 권한 관련
  PERMISSION_DENIED: "PERMISSION_DENIED", // 권한 없음

  // 리소스 관련
  NOT_FOUND: "NOT_FOUND", // 리소스 없음
  ALREADY_EXISTS: "ALREADY_EXISTS", // 이미 존재

  // 요청 관련
  VALIDATION_ERROR: "VALIDATION_ERROR", // 입력값 오류
  BAD_REQUEST: "BAD_REQUEST", // 잘못된 요청

  // 네트워크 관련
  NETWORK_ERROR: "NETWORK_ERROR", // 네트워크 연결 실패
  TIMEOUT_ERROR: "TIMEOUT_ERROR", // 요청 타임아웃
  CONNECTION_ERROR: "CONNECTION_ERROR", // 연결 오류

  // 서버 관련
  SERVER_ERROR: "SERVER_ERROR", // 서버 오류
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE", // 서비스 불가

  // 자녀 PIN 인증
  CHILD_PIN_REQUIRED: "CHILD_PIN_REQUIRED", // 자녀 PIN 인증 필요

  // 기타
  UNKNOWN_ERROR: "UNKNOWN_ERROR", // 알 수 없는 오류
  CANCELLED: "CANCELLED", // 요청 취소됨
} as const;

export type ApiErrorCodeType = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

// ============================================
// 표준 에러 인터페이스
// ============================================
export interface ApiError {
  /** 에러 코드 (예: 'AUTH_EXPIRED', 'NETWORK_ERROR') */
  code: ApiErrorCodeType | string;
  /** 사용자 친화적 메시지 (한국어) */
  message: string;
  /** HTTP 상태 코드 (400, 401, 500 등) */
  statusCode?: number;
  /** 추가 정보 (validation errors 등) */
  details?: Record<string, unknown>;
}

// ============================================
// 에러 메시지 매핑
// ============================================
export const ApiErrorMessages: Record<string, string> = {
  [ApiErrorCode.AUTH_EXPIRED]: "인증이 만료되었습니다. 다시 로그인해주세요.",
  [ApiErrorCode.AUTH_INVALID]: "인증에 실패했습니다.",
  [ApiErrorCode.AUTH_REQUIRED]: "로그인이 필요합니다.",
  [ApiErrorCode.PERMISSION_DENIED]: "접근 권한이 없습니다.",
  [ApiErrorCode.NOT_FOUND]: "요청한 데이터를 찾을 수 없습니다.",
  [ApiErrorCode.ALREADY_EXISTS]: "이미 존재하는 데이터입니다.",
  [ApiErrorCode.VALIDATION_ERROR]: "입력값을 확인해주세요.",
  [ApiErrorCode.BAD_REQUEST]: "잘못된 요청입니다.",
  [ApiErrorCode.NETWORK_ERROR]: "네트워크 연결을 확인해주세요.",
  [ApiErrorCode.TIMEOUT_ERROR]: "요청 시간이 초과되었습니다.",
  [ApiErrorCode.CONNECTION_ERROR]: "서버에 연결할 수 없습니다.",
  [ApiErrorCode.SERVER_ERROR]:
    "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
  [ApiErrorCode.SERVICE_UNAVAILABLE]: "서비스를 일시적으로 사용할 수 없습니다.",
  [ApiErrorCode.CHILD_PIN_REQUIRED]: "자녀 계정 PIN 인증이 필요합니다.",
  [ApiErrorCode.UNKNOWN_ERROR]: "알 수 없는 오류가 발생했습니다.",
  [ApiErrorCode.CANCELLED]: "요청이 취소되었습니다.",
};

// ============================================
// 에러 생성 유틸리티
// ============================================
export function createApiError(
  code: ApiErrorCodeType | string,
  message?: string,
  statusCode?: number,
  details?: Record<string, unknown>,
): ApiError {
  return {
    code,
    message:
      message ||
      ApiErrorMessages[code] ||
      ApiErrorMessages[ApiErrorCode.UNKNOWN_ERROR],
    statusCode,
    details,
  };
}

// HTTP 상태 코드 → ApiError 변환
export function httpStatusToApiError(
  statusCode: number,
  serverMessage?: string,
): ApiError {
  switch (statusCode) {
    case 400:
      return createApiError(ApiErrorCode.BAD_REQUEST, serverMessage, 400);
    case 401:
      return createApiError(ApiErrorCode.AUTH_EXPIRED, serverMessage, 401);
    case 403:
      return createApiError(ApiErrorCode.PERMISSION_DENIED, serverMessage, 403);
    case 404:
      return createApiError(ApiErrorCode.NOT_FOUND, serverMessage, 404);
    case 409:
      return createApiError(ApiErrorCode.ALREADY_EXISTS, serverMessage, 409);
    case 422:
      return createApiError(ApiErrorCode.VALIDATION_ERROR, serverMessage, 422);
    case 500:
    case 502:
    case 503:
      return createApiError(
        ApiErrorCode.SERVER_ERROR,
        serverMessage,
        statusCode,
      );
    case 504:
      return createApiError(ApiErrorCode.TIMEOUT_ERROR, serverMessage, 504);
    default:
      return createApiError(
        ApiErrorCode.UNKNOWN_ERROR,
        serverMessage,
        statusCode,
      );
  }
}

// 페이지네이션 요청
export interface PaginationRequest {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

// 페이지네이션 응답
export interface PaginationResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// 사용자 타입 — 백엔드 Prisma UserType enum 과 1:1 매핑 (9개).
// SYSTEM/OPER 는 ADM 전용(어드민 콘솔)이지만 teamplus-web 에서도 타입으로 인식해야
// `?? 'parent'` 폴백 없이 정확한 대시보드 라우팅이 가능하다.
export type UserType =
  | "system"
  | "oper"
  | "admin"
  | "director"
  | "academy_director"
  | "coach"
  | "parent"
  | "teen"
  | "child";

// 승인 상태
export type ApprovalStatus = "pending" | "approved" | "rejected";

// 결제 상태
export type PaymentStatus =
  | "pending"
  | "completed"
  | "failed"
  | "refunded"
  | "cancelled";

// 출석 상태 (2026-05-12 회의록 결정 — 3-state 단순화)
export type AttendanceStatus = "present" | "absent" | "unchecked";

// 수강신청 상태
export type EnrollmentStatus =
  | "pending"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "cancelled";

// 수강신청 타입
export type EnrollmentRequestType = "parent_direct" | "child_request";

// 기본 엔티티 인터페이스
export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt?: string;
}

// 사용자 기본 정보
export interface UserInfo extends BaseEntity {
  email: string;
  phone?: string;
  userType: UserType;
  isVerified: boolean;
}

// 자녀 정보
export interface ChildInfo extends BaseEntity {
  name: string;
  birthDate?: string;
  gender?: "male" | "female";
  parentId: string;
}

// 팀 기본 정보
export interface ClubInfo extends BaseEntity {
  clubCode: string;
  clubName: string;
  description?: string;
  coachId: string;
}

// 수업 기본 정보
export interface ClassInfo extends BaseEntity {
  clubId: string;
  className: string;
  description?: string;
  ageMin?: number;
  ageMax?: number;
  capacity: number;
}
