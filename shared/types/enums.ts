/**
 * TEAMPLUS 공통 Enum 정의
 * Source of Truth: teamplus-backend/prisma/schema.prisma
 *
 * 모든 프로젝트(web, admin, backend, app)에서 이 파일의 값을 기준으로 합니다.
 * Flutter(Dart)는 이 파일의 값을 수동 반영합니다.
 */

// ==================== UserType ====================

export const UserType = {
  ADMIN: "ADMIN",
  DIRECTOR: "DIRECTOR",
  ACADEMY_DIRECTOR: "ACADEMY_DIRECTOR",
  COACH: "COACH",
  PARENT: "PARENT",
  TEEN: "TEEN",
  CHILD: "CHILD",
} as const;

export type UserType = (typeof UserType)[keyof typeof UserType];

/** 프론트엔드 소문자 매핑 (기존 코드 호환) */
export const UserTypeLower = {
  admin: "admin",
  director: "director",
  academy_director: "academy_director",
  coach: "coach",
  parent: "parent",
  teen: "teen",
  child: "child",
} as const;

export type UserTypeLower = (typeof UserTypeLower)[keyof typeof UserTypeLower];

// ==================== RSVP ====================

/** RSVP 응답 상태 (Backend 기준) */
export const RsvpStatus = {
  ATTENDING: "ATTENDING",
  DECLINED: "DECLINED",
  NO_RESPONSE: "NO_RESPONSE",
} as const;

export type RsvpStatus = (typeof RsvpStatus)[keyof typeof RsvpStatus];

/** RSVP 제출 시 사용 가능한 상태 (NO_RESPONSE 제외) */
export type RsvpSubmitStatus = "ATTENDING" | "DECLINED";

// ==================== Waitlist ====================

/** 대기자 상태 (Backend 기준) */
export const WaitlistStatus = {
  WAITING: "WAITING",
  CONFIRMED: "CONFIRMED",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
} as const;

export type WaitlistStatus =
  (typeof WaitlistStatus)[keyof typeof WaitlistStatus];

// ==================== Approval / Payment / Attendance ====================

export const ApprovalStatus = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;

export type ApprovalStatus =
  (typeof ApprovalStatus)[keyof typeof ApprovalStatus];

export const PaymentStatus = {
  PENDING: "pending",
  COMPLETED: "completed",
  FAILED: "failed",
  REFUNDED: "refunded",
  CANCELLED: "cancelled",
} as const;

export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

// 2026-05-12: 회의록 결정으로 3-state 단순화 (late/excused 제거).
export const AttendanceStatus = {
  PRESENT: "present",
  ABSENT: "absent",
  UNCHECKED: "unchecked",
} as const;

export type AttendanceStatus =
  (typeof AttendanceStatus)[keyof typeof AttendanceStatus];

// ==================== Prisma Enum (쇼핑몰/채팅/훈련) ====================

export const DiscountType = {
  FIXED: "FIXED",
  PERCENTAGE: "PERCENTAGE",
} as const;

export type DiscountType = (typeof DiscountType)[keyof typeof DiscountType];

export const CouponTarget = {
  ALL: "ALL",
  CATEGORY: "CATEGORY",
  PRODUCT: "PRODUCT",
} as const;

export type CouponTarget = (typeof CouponTarget)[keyof typeof CouponTarget];

export const PointActionType = {
  EARN: "EARN",
  USE: "USE",
  EXPIRE: "EXPIRE",
  ADJUST: "ADJUST",
  REFUND: "REFUND",
} as const;

export type PointActionType =
  (typeof PointActionType)[keyof typeof PointActionType];

export const ChatRoomType = {
  DIRECT: "DIRECT",
  GROUP: "GROUP",
  CLASS: "CLASS",
  CLUB: "CLUB",
  SUPPORT: "SUPPORT",
} as const;

export type ChatRoomType = (typeof ChatRoomType)[keyof typeof ChatRoomType];

export const ChatMessageType = {
  TEXT: "TEXT",
  IMAGE: "IMAGE",
  FILE: "FILE",
  SYSTEM: "SYSTEM",
  NOTICE: "NOTICE",
} as const;

export type ChatMessageType =
  (typeof ChatMessageType)[keyof typeof ChatMessageType];

export const TrainingType = {
  LESSON: "LESSON",
  REGULAR_TRAINING: "REGULAR_TRAINING",
  REGULAR_CLASS: "REGULAR_CLASS",
  GROUP_CLASS: "GROUP_CLASS",
  GAME: "GAME",
  FUN: "FUN",
  CAMP: "CAMP",
  PICKUP: "PICKUP",
} as const;

export type TrainingType = (typeof TrainingType)[keyof typeof TrainingType];
