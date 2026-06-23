import { SetMetadata } from "@nestjs/common";

/**
 * UserType - Prisma 스키마와 동기화된 사용자 역할 타입
 * @see prisma/schema.prisma UserType enum
 */
export type UserType =
  | "SYSTEM" // 시스템 최고관리자 (ADM 전용)
  | "OPER" // 운영자 (ADM 전용)
  | "ADMIN" // 시스템 관리자 (레거시 · APP 호환)
  | "DIRECTOR" // 감독 (클럽 총괄)
  | "ACADEMY_DIRECTOR" // 아카데미 감독
  | "COACH" // 코치 (수업 담당)
  | "PARENT" // 학부모 (보호자)
  | "TEEN" // 10세 이상 학생 (청소년)
  | "CHILD"; // 10세 미만 학생 (아동)

export const ROLES_KEY = "roles";
export const Roles = (...roles: UserType[]) => SetMetadata(ROLES_KEY, roles);
