/**
 * TEAMPLUS 공통 Validation 규칙
 * Source of Truth: teamplus-backend/src/auth/dto/*.dto.ts
 *
 * Backend DTO의 validation 데코레이터와 동일한 규칙을 정의합니다.
 * 프론트엔드 폼 검증에서 이 규칙을 사용하면 Backend와 일관된 검증이 보장됩니다.
 */

/** 이메일 검증 정규식 */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 휴대폰 번호 검증 정규식 (Backend DTO와 동일) */
export const PHONE_REGEX = /^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/;

/** 비밀번호 검증 정규식: 영문 + 숫자 + 특수문자, 8자 이상 (Backend DTO와 동일) */
export const PASSWORD_REGEX =
  /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/;

/** 필드별 최대 길이 제한 (Backend DTO 기준) */
export const MAX_LENGTHS = {
  address: 200,
  zipCode: 10,
  className: 50,
  coachName: 30,
  academyName: 50,
} as const;

/** 수업 정원 */
export const CAPACITY = {
  min: 1,
  max: 100,
} as const;

/** 비밀번호 최소 길이 */
export const PASSWORD_MIN_LENGTH = 8;

/** Validation 에러 메시지 (한국어, Backend DTO 메시지와 동일) */
export const VALIDATION_MESSAGES = {
  email: {
    required: "이메일을 입력해주세요.",
    invalid: "유효한 이메일 주소를 입력해주세요.",
  },
  phone: {
    required: "휴대폰 번호를 입력해주세요.",
    invalid: "유효한 휴대폰 번호 형식이 아닙니다. (예: 01012345678)",
  },
  password: {
    required: "비밀번호를 입력해주세요.",
    minLength: "비밀번호는 최소 8자 이상이어야 합니다.",
    pattern: "비밀번호는 영문, 숫자, 특수문자를 포함해야 합니다.",
    mismatch: "비밀번호가 일치하지 않습니다.",
  },
  address: {
    maxLength: "주소는 200자 이하이어야 합니다.",
  },
  zipCode: {
    maxLength: "우편번호는 10자 이하이어야 합니다.",
  },
} as const;
