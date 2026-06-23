// [정리 2026-06-10] 소셜 로그인 라우트(POST /auth/social/:provider) 제거에 따라
//   SocialLoginDto / SocialLoginParamDto 클래스 삭제.
//   SocialUserInfo 는 auth.service 내부(레거시 연동 조회·탈퇴 revoke 경로)에서 사용하므로 유지.

/** 소셜 서비스에서 조회한 사용자 정보 */
export interface SocialUserInfo {
  provider: string;
  socialId: string;
  email: string | null;
  name: string | null;
  profileImage: string | null;
}
