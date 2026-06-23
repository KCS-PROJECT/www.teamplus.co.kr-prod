import { UserType } from "@prisma/client";

/**
 * 로그인 분기 상수 (Client Login Division)
 *
 * - APP: 일반 사용자용 화면 (teamplus-web, teamplus-app Flutter WebView, tbot 테스트 하네스)
 * - ADM: 관리자 대시보드 (teamplus-admin)
 *
 * 이 상수는 서버 엔드포인트에서 직접 주입되며 클라이언트 페이로드로 받지 않는다.
 * 즉, POST /api/v1/auth/login → chldiv='APP', POST /api/v1/auth/admin/login → chldiv='ADM'
 * 클라이언트가 chldiv를 조작할 수 없도록 엔드포인트 경로로만 결정된다.
 */
export const CHLDIV = {
  APP: "APP",
  ADM: "ADM",
} as const;

export type Chldiv = (typeof CHLDIV)[keyof typeof CHLDIV];

/**
 * chldiv 별 허용 UserType 매트릭스.
 *
 * - APP: 일반 사용자 + 레거시 ADMIN (admin@teamplus.com 등 기존 테스트 계정 호환)
 * - ADM: SYSTEM, OPER 만. ADMIN 은 명시적으로 제외 (역할 분리 원칙).
 */
export const CHLDIV_ALLOWED_USER_TYPES: Record<
  Chldiv,
  ReadonlySet<UserType>
> = {
  [CHLDIV.APP]: new Set<UserType>([
    UserType.PARENT,
    UserType.COACH,
    UserType.DIRECTOR,
    UserType.ADMIN,
    UserType.ACADEMY_DIRECTOR,
  ]),
  [CHLDIV.ADM]: new Set<UserType>([UserType.SYSTEM, UserType.OPER]),
};

/**
 * 주어진 chldiv 에 대해 userType 이 로그인 가능한지 판정.
 */
export const isUserTypeAllowedForChldiv = (
  chldiv: Chldiv,
  userType: UserType,
): boolean => CHLDIV_ALLOWED_USER_TYPES[chldiv].has(userType);

/**
 * 관리자 레벨 역할 (RBAC 체크 공용 헬퍼).
 * - ADMIN: 레거시 최고관리자 (APP 로그인 호환)
 * - SYSTEM: ADM 전용 시스템 최고관리자
 * - OPER: ADM 전용 운영자
 *
 * 기존 `userType === 'ADMIN'` 체크를 점진적으로 이 헬퍼로 대체할 것.
 */
export const ADMIN_LIKE_USER_TYPES: readonly UserType[] = [
  UserType.ADMIN,
  UserType.SYSTEM,
  UserType.OPER,
] as const;

export const isAdminRole = (
  userType: UserType | string | null | undefined,
): boolean => {
  if (!userType) return false;
  return (ADMIN_LIKE_USER_TYPES as readonly string[]).includes(userType);
};

/**
 * 잘못된 화면에서 로그인을 시도했을 때의 사용자 메시지.
 * - 보안상 "존재하지 않는 계정" 과 같은 힌트를 주지 않는다.
 */
export const CHLDIV_MISMATCH_MESSAGE =
  "해당 화면에서는 로그인할 수 없는 계정입니다.";
