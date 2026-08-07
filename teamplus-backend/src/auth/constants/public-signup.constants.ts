import { UserType } from "@prisma/client";

/**
 * 공개 가입(`@Public` `POST /auth/register` · `POST /auth/signup`) **역할 allowlist**.
 *
 * [2026-08-06 SECURITY · R14-C1] 기존에는 denylist(CHILD/TEEN 만 차단) 였다.
 *   `@IsEnum(UserType)` 이 전체 9종을 통과시키고 서비스도 CHILD/TEEN 만 막았기 때문에
 *   `userType: "ADMIN"` 요청 하나로 **본인인증 없이 관리자 계정이 생성**됐다
 *   (ADMIN/SYSTEM/OPER 는 `IDENTITY_REQUIRED_TYPES` 에도 없어 인증이 면제된다).
 *
 * denylist 는 "목록에 없는 역할 = 자동 허용" 이라 역할이 추가될 때마다 구멍이 생긴다.
 * **allowlist 가 SoT** 이며, DTO 검증과 서비스 가드가 이 상수를 함께 참조한다.
 *
 * 허용되지 않는 역할의 정식 발급 경로:
 *   · COACH                → 감독의 코치 등록 `AdminService.createCoach()` (`POST /admin/coaches`)
 *   · CHILD / TEEN         → 보호자 경유 `ChildrenService.createChild()`
 *   · ADMIN / SYSTEM / OPER → 운영자 콘솔 `POST /admin/admins` (SYSTEM/OPER 전용)
 */
export const PUBLIC_SIGNUP_ALLOWED_USER_TYPES = [
  UserType.PARENT,
  UserType.DIRECTOR,
  UserType.ACADEMY_DIRECTOR,
] as const;

export type PublicSignupUserType =
  (typeof PUBLIC_SIGNUP_ALLOWED_USER_TYPES)[number];

/**
 * `POST /auth/register` **엔드포인트 한정** 허용 역할.
 *
 * [2026-08-06 · Codex Round 2 지적 2] `RegisterDto` 에는 `clubInfo`/`academyInfo` 필드가 없고
 * 전역 `ValidationPipe` 가 `forbidNonWhitelisted:true` 라 해당 값을 보낼 수도 없다.
 * 그런데 서비스는 DIRECTOR 에 `clubInfo`, ACADEMY_DIRECTOR 에 `academyInfo` 를 **필수**로 요구한다.
 * → 이 경로로는 **PARENT 만 성공**할 수 있으므로 계약을 그대로 명시한다.
 *   감독·오픈클래스 감독 가입은 중첩 정보를 받는 `POST /auth/signup` 을 사용한다.
 *   (실측: 웹은 `/auth/signup`, 앱은 `/auth/register`(PARENT) 사용 — 깨지는 클라이언트 없음)
 */
export const REGISTER_ENDPOINT_ALLOWED_USER_TYPES = [UserType.PARENT] as const;

/** 전역 허용이지만 해당 엔드포인트 계약에는 없는 역할에 대한 안내. */
export function endpointContractDenialMessage(
  userType: UserType | string | undefined | null,
): string {
  if (
    userType === UserType.DIRECTOR ||
    userType === UserType.ACADEMY_DIRECTOR
  ) {
    return "감독·오픈클래스 감독 가입은 팀/오픈클래스 정보가 필요합니다. 회원가입 화면(/auth/signup)을 이용해주세요.";
  }
  return "이 경로로는 가입할 수 없는 회원 유형입니다.";
}

/** 공개 가입 허용 역할인지 판정. */
export function isPublicSignupAllowedUserType(
  userType: UserType | string | undefined | null,
): boolean {
  if (!userType) return false;
  return (PUBLIC_SIGNUP_ALLOWED_USER_TYPES as readonly string[]).includes(
    userType,
  );
}

/**
 * 거부 사유 문구 — 역할별로 **정식 경로를 안내**한다.
 * (단순 "허용되지 않음"만 반환하면 사용자가 다음 행동을 알 수 없다)
 */
export function publicSignupDenialMessage(
  userType: UserType | string | undefined | null,
): string {
  switch (userType) {
    case UserType.CHILD:
    case UserType.TEEN:
      // 2026-06-18 앱심사대응(가족정책) 문구 유지 — App Store/Google Play 심사 기준
      return "자녀(아동/청소년) 회원가입은 보호자 계정에서만 가능합니다. 학부모로 가입 후 '내 자녀 추가'에서 등록해주세요.";
    case UserType.COACH:
      return "코치 계정은 감독의 코치 등록을 통해서만 생성할 수 있습니다.";
    case UserType.ADMIN:
    case UserType.SYSTEM:
    case UserType.OPER:
      return "관리자 계정은 운영자 콘솔에서만 발급됩니다.";
    default:
      return "가입할 수 없는 회원 유형입니다.";
  }
}
