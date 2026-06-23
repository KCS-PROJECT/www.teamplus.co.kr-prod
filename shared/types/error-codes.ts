/**
 * TEAMPLUS 에러 코드 통합 정의
 * Source of Truth: teamplus-backend/src/common/filters/http-exception.filter.ts
 *
 * Backend가 실제로 반환하는 모든 에러 코드 + 프론트엔드 전용 코드를 포함합니다.
 */

export const ErrorCode = {
  // ==================== Backend 에러 코드 ====================

  // 인증 (JWT)
  INVALID_TOKEN: "INVALID_TOKEN",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",

  // Validation
  VALIDATION_ERROR: "VALIDATION_ERROR",
  HTTP_ERROR: "HTTP_ERROR",

  // Database (Prisma)
  DUPLICATE_ENTRY: "DUPLICATE_ENTRY",
  FOREIGN_KEY_ERROR: "FOREIGN_KEY_ERROR",
  NOT_FOUND: "NOT_FOUND",
  DB_VALIDATION_ERROR: "DB_VALIDATION_ERROR",
  DATA_TOO_LONG: "DATA_TOO_LONG",
  REQUIRED_FIELD_MISSING: "REQUIRED_FIELD_MISSING",

  // 시스템
  INTERNAL_ERROR: "INTERNAL_ERROR",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",

  // ==================== 프론트엔드 전용 에러 코드 ====================

  // 인증
  AUTH_EXPIRED: "AUTH_EXPIRED",
  AUTH_INVALID: "AUTH_INVALID",
  AUTH_REQUIRED: "AUTH_REQUIRED",

  // 권한
  PERMISSION_DENIED: "PERMISSION_DENIED",

  // 리소스
  ALREADY_EXISTS: "ALREADY_EXISTS",

  // 요청
  BAD_REQUEST: "BAD_REQUEST",

  // 네트워크
  NETWORK_ERROR: "NETWORK_ERROR",
  TIMEOUT_ERROR: "TIMEOUT_ERROR",
  CONNECTION_ERROR: "CONNECTION_ERROR",

  // 서버
  SERVER_ERROR: "SERVER_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",

  // 기타
  CANCELLED: "CANCELLED",

  // ==================== 비즈니스 에러 코드 ====================

  INSUFFICIENT_CREDITS: "INSUFFICIENT_CREDITS",
  CLASS_FULL: "CLASS_FULL",
  PAYMENT_FAILED: "PAYMENT_FAILED",
  ALREADY_CHECKED_IN: "ALREADY_CHECKED_IN",
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

/** 에러 코드별 한국어 메시지 */
export const ErrorMessages: Record<string, string> = {
  // Backend
  [ErrorCode.INVALID_TOKEN]: "유효하지 않은 인증 토큰입니다.",
  [ErrorCode.TOKEN_EXPIRED]: "인증 토큰이 만료되었습니다.",
  [ErrorCode.VALIDATION_ERROR]: "입력값을 확인해주세요.",
  [ErrorCode.HTTP_ERROR]: "요청 처리 중 오류가 발생했습니다.",
  [ErrorCode.DUPLICATE_ENTRY]: "이미 존재하는 데이터입니다.",
  [ErrorCode.FOREIGN_KEY_ERROR]: "참조하는 데이터가 존재하지 않습니다.",
  [ErrorCode.NOT_FOUND]: "요청한 데이터를 찾을 수 없습니다.",
  [ErrorCode.DB_VALIDATION_ERROR]: "데이터베이스 검증 오류가 발생했습니다.",
  [ErrorCode.DATA_TOO_LONG]: "입력된 데이터가 너무 깁니다.",
  [ErrorCode.REQUIRED_FIELD_MISSING]: "필수 입력 항목이 누락되었습니다.",
  [ErrorCode.INTERNAL_ERROR]: "서버 오류가 발생했습니다.",
  [ErrorCode.UNKNOWN_ERROR]: "알 수 없는 오류가 발생했습니다.",

  // 프론트엔드
  [ErrorCode.AUTH_EXPIRED]: "인증이 만료되었습니다. 다시 로그인해주세요.",
  [ErrorCode.AUTH_INVALID]: "인증에 실패했습니다.",
  [ErrorCode.AUTH_REQUIRED]: "로그인이 필요합니다.",
  [ErrorCode.PERMISSION_DENIED]: "접근 권한이 없습니다.",
  [ErrorCode.ALREADY_EXISTS]: "이미 존재하는 데이터입니다.",
  [ErrorCode.BAD_REQUEST]: "잘못된 요청입니다.",
  [ErrorCode.NETWORK_ERROR]: "네트워크 연결을 확인해주세요.",
  [ErrorCode.TIMEOUT_ERROR]: "요청 시간이 초과되었습니다.",
  [ErrorCode.CONNECTION_ERROR]: "서버에 연결할 수 없습니다.",
  [ErrorCode.SERVER_ERROR]:
    "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
  [ErrorCode.SERVICE_UNAVAILABLE]: "서비스를 일시적으로 사용할 수 없습니다.",
  [ErrorCode.CANCELLED]: "요청이 취소되었습니다.",

  // 비즈니스
  [ErrorCode.INSUFFICIENT_CREDITS]: "크레딧이 부족합니다.",
  [ErrorCode.CLASS_FULL]: "수업 정원이 초과되었습니다.",
  [ErrorCode.PAYMENT_FAILED]: "결제에 실패했습니다.",
  [ErrorCode.ALREADY_CHECKED_IN]: "이미 출석 체크인이 완료되었습니다.",
};
