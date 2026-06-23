/**
 * Auth Service
 * 인증 관련 API 호출 서비스
 */

import { api } from "./api-client";
import { hybridAuth } from "./hybrid-auth";
import { encryptCredentials } from "@/lib/crypto";
import type { ApiResponse, UserType } from "@/types";
import { devError, devWarn } from "@/lib/logger";

// ============================================
// 인증 관련 타입 정의
// ============================================

/** 로그인 요청 */
export interface LoginRequest {
  email: string;
  password: string;
  /**
   * 단일 세션 정책 — 다른 기기 사용 중(409 SESSION_EXISTS) 확인 모달에서
   * "기존 접속 종료" 선택 시 true 로 재요청. 기존 세션을 즉시 강제 종료한다.
   */
  force?: boolean;
}

/**
 * 로그인 응답
 * - 정상 로그인: accessToken/refreshToken/user 포함
 * - 2026-04-29: 자녀 PIN 인증 폐지로 childPinGate 필드 제거.
 *   미승인 자녀(TeamMember.approvalStatus !== 'approved')는 백엔드에서
 *   BadRequestException 으로 차단되므로 success=false 응답으로 처리됨.
 */
export interface LoginResponse {
  accessToken?: string;
  refreshToken?: string;
  user?: AuthUser;
}

/** 회원가입 요청 */
export interface SignupRequest {
  // 본인인증 자동채움(B안, 2026-05-26) — 본인인증 필수 역할은 미입력 시 백엔드가 verification 으로 채움.
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string;
  password: string;
  userType?: UserType;
  zipCode?: string;
  address?: string;
  addressDetail?: string;
  /** 팀 감독 가입 시 필수 — 팀 코드는 가입 시 받지 않음(추후 팀 관리에서 등록) */
  clubInfo?: {
    clubName: string;
    location?: string;
    venueId?: string;
  };
  /** 오픈클래스 감독 가입 시 필수 (설계서 §4.6) */
  academyInfo?: {
    name: string;
    region?: string;
  };
  /** 코치/학부모 가입 시 선택한 팀 ID (TeamPickerModal 선택 결과). teamCode 보다 우선 */
  teamId?: string;
  /** [Legacy] 코치/학부모 팀 코드 — teamId 미입력 시 fallback */
  teamCode?: string;
  /**
   * 본인인증 완료 후 받은 requestId.
   * PARENT/COACH/DIRECTOR/ACADEMY_DIRECTOR 가입 시 필수 (NEW-02, 2026-05-22).
   * 백엔드가 status=completed + verifiedAt 30분 내 + 이름/CI 일치를 검증.
   */
  identityVerificationId?: string;
  agreements: {
    terms: boolean;
    privacy: boolean;
    marketing: boolean;
  };
}

/** 회원가입 응답 */
export interface SignupResponse {
  userId: string;
  message: string;
}

/** 아이디 찾기 요청 */
export interface FindIdRequest {
  firstName: string;
  lastName: string;
  phone: string;
}

/** 아이디 찾기 응답 */
export interface FindIdResponse {
  email: string;
  createdAt: string;
}

/** 비밀번호 재설정 요청 (인증코드 발송) */
export interface SendResetCodeRequest {
  email: string;
}

/** 비밀번호 재설정 요청 (새 비밀번호 설정) */
export interface ResetPasswordRequest {
  email: string;
  code: string;
  newPassword: string;
}

/** 인증된 사용자 정보 */
export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  name: string;
  phone?: string;
  userType: UserType;
  isVerified: boolean;
  /** 프로필 이미지 URL (User.avatar_url 컬럼 기반, Backend `/auth/profile` 응답 필드) */
  avatarUrl?: string | null;
  createdAt: string;
  /** 마지막 갱신 시각 (User.updated_at). 프로필 사진 등 cache-bust 용도 */
  updatedAt?: string | null;
}

// ============================================
// Auth API 서비스
// ============================================

/**
 * 토큰 저장 헬퍼 함수 (중복 로직 제거)
 * hybridAuth를 사용하여 환경에 따라 적절한 저장소에 저장
 * - Native: Flutter Secure Storage
 * - Web: localStorage
 *
 * 추가: 미들웨어 인증을 위해 Cookie에도 저장
 *
 * @param accessToken 액세스 토큰
 * @param refreshToken 리프레시 토큰
 */
async function saveTokens(
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  // 1. hybridAuth에 저장 (localStorage 또는 Native Storage)
  await hybridAuth.saveToken({ accessToken, refreshToken });

  // 2. Cookie에도 저장 (미들웨어 인증용)
  // 미들웨어는 서버 사이드에서 실행되므로 Cookie를 통해 토큰 확인
  if (typeof document !== "undefined") {
    // 7일간 유효한 쿠키 설정 (path=/ 로 모든 경로에서 접근 가능)
    const maxAge = 60 * 60 * 24 * 7; // 7 days in seconds
    // [2026-06-10 SECURITY] HTTPS 에서는 Secure 플래그 부착 — HTTP 다운그레이드/SSL stripping 시 평문 전송 차단.
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `teamplus_access_token=${accessToken}; path=/; max-age=${maxAge}; SameSite=Lax${secure}`;
    // [2026-06-15 SECURITY] refresh 토큰은 더 이상 JS 접근 쿠키로 쓰지 않는다(XSS 탈취면 축소).
    //   백엔드 로그인/refresh 응답이 httpOnly refresh 쿠키(path=/, 동일 호스트)를 설정하고,
    //   미들웨어는 그 httpOnly 쿠키로 refresh 존재를 판정한다. (localStorage refresh 제거는
    //   별도 단계 — 프로덕션 쿠키 토폴로지 검증 후.)
  }
}

/**
 * 로그인
 *
 * E2E 암호화:
 * 1. 클라이언트: 이메일/비밀번호 → AES-256-GCM 암호화
 * 2. 전송: HTTPS + 암호화된 페이로드
 * 3. 서버: 암호화된 데이터 → AES-256-GCM 복호화 → 비밀번호 검증
 */
export async function login(
  data: LoginRequest,
): Promise<ApiResponse<LoginResponse>> {
  // 1. 암호화 로그인 시도
  // crypto 는 모듈 최상단에서 정적 import — 매 로그인마다 발생하던
  // 동적 chunk fetch(30~80ms) 제거. login 페이지 전용 청크에 포함되므로
  // 다른 페이지 번들에는 영향 없음.
  try {
    const plaintext = JSON.stringify({
      email: data.email,
      password: data.password,
      // force 는 암호화 페이로드에 포함 — EncryptedLoginDto whitelist 유지
      ...(data.force ? { force: true } : {}),
    });
    const encryptedPayload = await encryptCredentials(plaintext);

    const response = await api.post<LoginResponse>("/auth/login", {
      encryptedData: encryptedPayload.encryptedData,
      iv: encryptedPayload.iv,
      authTag: encryptedPayload.authTag,
    });

    if (
      response.success &&
      response.data?.accessToken &&
      response.data?.refreshToken
    ) {
      await saveTokens(response.data.accessToken, response.data.refreshToken);
    }
    return response;
  } catch (encryptError) {
    if (process.env.NODE_ENV === "development") {
      devWarn(
        "[Auth] Encryption unavailable, using plain login:",
        encryptError,
      );
    }
  }

  // 2. 폴백: 암호화 실패 시 개발 전용 평문 로그인.
  // `/auth/login` 은 EncryptedLoginDto 전용이라 평문 body 를 보내면 ValidationPipe 에서
  // BadRequestException 이 발생한다. 프로덕션에서는 평문 fallback 을 절대 사용하지 않는다.
  if (process.env.NODE_ENV === "production") {
    return {
      success: false,
      error: {
        code: "ENCRYPTION_UNAVAILABLE",
        message: "로그인 보안 초기화에 실패했습니다. 앱을 다시 실행해주세요.",
      },
    };
  }

  try {
    const response = await api.post<LoginResponse>("/auth/login/dev", {
      email: data.email,
      password: data.password,
    });

    if (
      response.success &&
      response.data?.accessToken &&
      response.data?.refreshToken
    ) {
      await saveTokens(response.data.accessToken, response.data.refreshToken);
    }
    return response;
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      devError("[Auth] Login failed:", error);
    }
    return {
      success: false,
      error: {
        code: "LOGIN_ERROR",
        message: "로그인 중 오류가 발생했습니다. 다시 시도해주세요.",
      },
    };
  }
}

/**
 * 회원가입
 */
export async function signup(
  data: SignupRequest,
): Promise<ApiResponse<SignupResponse>> {
  return api.post<SignupResponse>("/auth/signup", data);
}

/** 회원 탈퇴 요청 (7일 유예) */
export interface WithdrawRequest {
  /** 이메일/비밀번호 계정 본인 확인용 비밀번호 */
  password?: string;
  /** 소셜 로그인 전용 계정 탈퇴 확인 문구 ('탈퇴합니다') */
  confirmText?: string;
  /** 탈퇴 사유 (선택) */
  reason?: string;
}

export interface WithdrawResponse {
  message: string;
  withdrawRequestedAt: string;
  gracePeriodEnd: string;
}

/**
 * 회원 탈퇴 요청
 * - 이메일 계정: password 전달 / 소셜 전용 계정: confirmText("탈퇴합니다") 전달
 * - 성공 시 서버에서 현재 세션(refresh token)이 즉시 폐기됨 → 호출부에서 로컬 토큰 정리 필요
 */
export async function withdraw(
  data: WithdrawRequest,
): Promise<ApiResponse<WithdrawResponse>> {
  return api.post<WithdrawResponse>("/auth/withdraw", data);
}

/**
 * 로그아웃
 * 서버 로그아웃 실패 시에도 로컬 토큰은 삭제하되, 에러 정보 반환
 */
export async function logout(): Promise<
  ApiResponse<{ serverLogoutSuccess: boolean }>
> {
  let serverLogoutSuccess = true;
  let serverError: { code: string; message: string } | undefined;

  try {
    // 서버에 로그아웃 요청
    const response = await api.post<void>("/auth/logout");
    if (!response.success) {
      serverLogoutSuccess = false;
      serverError = response.error;
      if (process.env.NODE_ENV === "development") {
        devWarn("[Auth] Server logout failed:", response.error);
      }
    }
  } catch (error) {
    // 서버 요청 실패 - 네트워크 오류 등
    serverLogoutSuccess = false;
    serverError = {
      code: "LOGOUT_SERVER_ERROR",
      message:
        error instanceof Error
          ? error.message
          : "서버 로그아웃 중 오류가 발생했습니다.",
    };
    if (process.env.NODE_ENV === "development") {
      devWarn("[Auth] Server logout error:", error);
    }
  }

  // 로컬 토큰 삭제 (서버 실패와 무관하게 항상 실행)
  // hybridAuth는 환경에 따라 Native/Web 저장소에서 토큰 삭제
  try {
    // Cookie 삭제 (미들웨어 인증용)
    if (typeof document !== "undefined") {
      document.cookie = "teamplus_access_token=; path=/; max-age=0";
      document.cookie = "teamplus_refresh_token=; path=/; max-age=0";
    }

    await hybridAuth.clearToken();
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      devError("[Auth] Failed to clear local token:", error);
    }
    return {
      success: false,
      error: {
        code: "TOKEN_CLEAR_ERROR",
        message: "로컬 인증 정보 삭제에 실패했습니다.",
      },
    };
  }

  // 서버 로그아웃 실패 시에도 로컬 토큰 삭제 성공이면 success로 처리
  // 단, 서버 로그아웃 결과를 data에 포함하여 caller가 인지할 수 있도록 함
  return {
    success: true,
    data: { serverLogoutSuccess },
    ...(serverError &&
      !serverLogoutSuccess && {
        error: serverError, // 참고용 에러 정보 (success: true이지만 서버 로그아웃은 실패)
      }),
  };
}

/**
 * 아이디 찾기
 */
export async function findId(
  data: FindIdRequest,
): Promise<ApiResponse<FindIdResponse>> {
  return api.post<FindIdResponse>("/auth/find-id", data);
}

/**
 * [2026-06-17] 본인인증 기반 아이디 찾기 — 가입 이력 있으면 아이디 반환, 없으면 found:false.
 */
export async function findIdByIdentity(data: {
  identityVerificationId: string;
}): Promise<
  ApiResponse<{ found: boolean; loginId?: string; createdAt?: string }>
> {
  return api.post<{ found: boolean; loginId?: string; createdAt?: string }>(
    "/auth/find-id-by-identity",
    data,
  );
}

/**
 * [2026-06-17] 본인인증 기반 비밀번호 재설정 — 임시 비밀번호를 입력한 이메일로 발송.
 *  휴대폰 본인인증(requestId) + 받을 이메일 입력 → 계정 확인 시 임시 비밀번호 발급 후 해당 메일로 발송.
 */
export async function findAccount(data: {
  identityVerificationId: string;
  email: string;
}): Promise<ApiResponse<{ message: string }>> {
  return api.post<{ message: string }>("/auth/find-account", data);
}

/**
 * 비밀번호 재설정 인증코드 발송
 */
export async function sendResetCode(
  data: SendResetCodeRequest,
): Promise<ApiResponse<{ message: string }>> {
  return api.post<{ message: string }>("/auth/password/send-code", data);
}

/**
 * 비밀번호 재설정
 */
export async function resetPassword(
  data: ResetPasswordRequest,
): Promise<ApiResponse<{ message: string }>> {
  return api.post<{ message: string }>("/auth/password/reset", data);
}

/**
 * 현재 사용자 정보 조회
 */
export async function getProfile(): Promise<ApiResponse<AuthUser>> {
  return api.get<AuthUser>("/auth/profile");
}

/**
 * 토큰 갱신
 * hybridAuth를 사용하여 환경에 맞는 저장소에서 토큰 조회/저장
 */
export async function refreshToken(): Promise<
  ApiResponse<{ accessToken: string; refreshToken: string }>
> {
  const tokenInfo = await hybridAuth.getToken();

  if (!tokenInfo?.refreshToken) {
    return {
      success: false,
      error: {
        code: "AUTH_REQUIRED",
        message: "로그인이 필요합니다.",
      },
    };
  }

  const response = await api.post<{
    accessToken: string;
    refreshToken: string;
  }>("/auth/refresh", { refreshToken: tokenInfo.refreshToken });

  // 성공 시 새 토큰 저장
  if (response.success && response.data) {
    await saveTokens(response.data.accessToken, response.data.refreshToken);
  }

  return response;
}

/**
 * 인증 상태 확인
 * hybridAuth를 사용하여 환경에 맞는 저장소에서 인증 상태 확인
 */
export async function checkAuth(): Promise<boolean> {
  return hybridAuth.isAuthenticated();
}

/**
 * 이메일 중복 확인
 */
export async function checkEmailExists(
  email: string,
): Promise<ApiResponse<{ exists: boolean }>> {
  return api.get<{ exists: boolean }>("/auth/check-email", {
    params: { email },
  });
}

/**
 * 휴대폰 번호 중복 확인
 */
export async function checkPhoneExists(
  phone: string,
): Promise<ApiResponse<{ exists: boolean }>> {
  return api.get<{ exists: boolean }>("/auth/check-phone", {
    params: { phone },
  });
}

/**
 * [추가 2026-05-12] 회원가입 이메일 인증 코드 발송.
 *   POST /auth/email/send-code { email }
 *   응답: { success: true, expiresIn: 300 }
 */
export async function sendEmailVerifyCode(
  email: string,
): Promise<{ success: boolean; expiresIn?: number; message?: string }> {
  const res = await api.post<{ success: boolean; expiresIn?: number }>(
    "/auth/email/send-code",
    { email },
  );
  if (res.success && res.data) {
    return { success: true, expiresIn: res.data.expiresIn };
  }
  return { success: false, message: res.error?.message };
}

/**
 * [추가 2026-05-12] 회원가입 이메일 인증 코드 검증.
 *   POST /auth/email/verify-code { email, code }
 *   응답: { success: true }
 */
export async function verifyEmailVerifyCode(
  email: string,
  code: string,
): Promise<{ success: boolean; message?: string }> {
  const res = await api.post<{ success: boolean }>("/auth/email/verify-code", {
    email,
    code,
  });
  if (res.success && res.data?.success) return { success: true };
  return { success: false, message: res.error?.message };
}

// 기본 export
const authService = {
  login,
  signup,
  logout,
  findId,
  findIdByIdentity,
  findAccount,
  sendResetCode,
  resetPassword,
  getProfile,
  refreshToken,
  checkAuth,
  checkEmailExists,
  checkPhoneExists,
  sendEmailVerifyCode,
  verifyEmailVerifyCode,
};

export default authService;
