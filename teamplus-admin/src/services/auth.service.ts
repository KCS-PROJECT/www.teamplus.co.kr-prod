/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TEAMPLUS Auth Service
 * 인증 관련 API 호출 (로그인, 회원가입, 로그아웃, 토큰 갱신)
 */

import {
  api,
  setTokens,
  clearTokens,
  getAccessToken,
  isTokenExpired,
} from "./api-client";
import { encryptCredentials } from "@/lib/crypto";
import { getApiErrorMessage, isAxiosError } from "@/lib/api-error";
import {
  User,
  AuthResponse,
  RegisterRequest,
  RefreshTokenResponse,
} from "../types";

/**
 * 로그인
 * @param email - 이메일
 * @param password - 비밀번호
 * @returns 인증 응답 (사용자 정보 + 토큰)
 */
export const login = async (
  email: string,
  password: string,
): Promise<AuthResponse> => {
  try {
    // 1단계: 클라이언트에서 암호화
    const plaintext = JSON.stringify({ email, password });
    const encryptedPayload = await encryptCredentials(plaintext);

    // 2단계: 암호화된 페이로드로 ADM 전용 로그인 엔드포인트 호출
    // chldiv=ADM 상수는 서버 엔드포인트 경로(/auth/admin/login)로 결정되며,
    // 클라이언트가 조작할 수 없도록 페이로드로 전달하지 않는다.
    const response = await api.post<AuthResponse>("/auth/admin/login", {
      encryptedData: encryptedPayload.encryptedData,
      iv: encryptedPayload.iv,
      authTag: encryptedPayload.authTag,
    });

    // 3단계: 토큰 저장
    setTokens(response.accessToken, response.refreshToken);

    // 사용자 정보 로컬스토리지 저장 (옵션)
    if (typeof window !== "undefined") {
      localStorage.setItem("teamplus_user", JSON.stringify(response.user));
    }

    return response;
  } catch (error: unknown) {
    console.error("[Auth Service] 로그인 실패:", error);
    // 백엔드는 AllExceptionsFilter 가 `data.message` 로 상세 사유를 전달.
    // (chldiv 게이트 차단 시 "해당 화면에서는 로그인할 수 없는 계정입니다.")
    // 레거시 `data.error.message` 경로도 함께 지원.
    throw new Error(
      getApiErrorMessage(
        error,
        "로그인에 실패했습니다. 이메일과 비밀번호를 확인해주세요.",
      ),
    );
  }
};

/**
 * 회원가입
 * @param userData - 회원가입 데이터
 * @returns 인증 응답 (사용자 정보 + 토큰)
 */
export const register = async (
  userData: RegisterRequest,
): Promise<AuthResponse> => {
  try {
    // 1단계: 이메일/비밀번호 암호화
    const plaintext = JSON.stringify({
      email: userData.email,
      password: userData.password,
    });
    const encryptedPayload = await encryptCredentials(plaintext);

    // 2단계: 암호화된 페이로드를 포함하여 API 요청
    const response = await api.post<AuthResponse>("/auth/register", {
      ...userData,
      encryptedData: encryptedPayload.encryptedData,
      iv: encryptedPayload.iv,
      authTag: encryptedPayload.authTag,
    });

    // 3단계: 토큰 저장
    setTokens(response.accessToken, response.refreshToken);

    // 사용자 정보 로컬스토리지 저장 (옵션)
    if (typeof window !== "undefined") {
      localStorage.setItem("teamplus_user", JSON.stringify(response.user));
    }

    return response;
  } catch (error: unknown) {
    console.error("[Auth Service] 회원가입 실패:", error);

    // 에러 메시지 처리
    const errorMessage = isAxiosError(error)
      ? error.response?.data?.error?.message
      : undefined;
    if (errorMessage?.includes("email")) {
      throw new Error("이미 사용 중인 이메일입니다.");
    } else if (errorMessage?.includes("phone")) {
      throw new Error("이미 사용 중인 전화번호입니다.");
    } else {
      throw new Error(
        errorMessage || "회원가입에 실패했습니다. 다시 시도해주세요.",
      );
    }
  }
};

/**
 * 로그아웃
 * - 마지막 로그아웃 시간 저장
 * - 로컬스토리지에서 토큰 및 사용자 정보 삭제
 * - 로그인 페이지로 리다이렉트
 * @param reason - 로그아웃 사유 (선택: 'manual' | 'session_timeout' | 'token_expired')
 */
export const logout = (
  reason: "manual" | "session_timeout" | "token_expired" = "manual",
): void => {
  try {
    if (typeof window !== "undefined") {
      // 마지막 로그아웃 정보 저장
      const logoutInfo = {
        timestamp: new Date().toISOString(),
        reason,
      };
      localStorage.setItem("teamplus_last_logout", JSON.stringify(logoutInfo));

      // 토큰 삭제
      clearTokens();

      // 사용자 정보 삭제
      localStorage.removeItem("teamplus_user");

      if (process.env.NODE_ENV === "development") {
        console.log(
          `[Auth Service] 로그아웃 완료 - 사유: ${reason}, 시간: ${logoutInfo.timestamp}`,
        );
      }

      // 로그인 페이지로 리다이렉트
      window.location.href = "/login";
    }
  } catch (error) {
    console.error("[Auth Service] 로그아웃 중 오류:", error);
  }
};

/**
 * 마지막 로그아웃 정보 조회
 * @returns 로그아웃 정보 또는 null
 */
export const getLastLogoutInfo = (): {
  timestamp: string;
  reason: string;
} | null => {
  if (typeof window === "undefined") return null;

  try {
    const info = localStorage.getItem("teamplus_last_logout");
    if (!info) return null;
    return JSON.parse(info);
  } catch {
    return null;
  }
};

/**
 * 토큰 갱신
 * @returns 새로운 액세스 토큰
 * @throws 토큰 갱신 실패 시 에러
 */
export const refreshToken = async (): Promise<string> => {
  try {
    const refreshToken = localStorage.getItem("teamplus_refresh_token");

    if (!refreshToken) {
      throw new Error("리프레시 토큰이 없습니다.");
    }

    const response = await api.post<RefreshTokenResponse>("/auth/refresh", {
      refreshToken,
    });

    // [2026-06-04] 백엔드 Token Rotation 대응 — 새 access + 새 refresh 토큰 모두 저장.
    //   기존엔 refresh 토큰을 재사용(setTokens(.., refreshToken))해 백엔드가 revoke 한
    //   이전 토큰을 다음 갱신에 다시 보내 reuse→401(강제 로그아웃)이 발생했다.
    //   응답에 refreshToken 이 없을 때만(레거시 호환) 기존 값을 폴백 사용한다.
    setTokens(response.accessToken, response.refreshToken ?? refreshToken);

    return response.accessToken;
  } catch (error: unknown) {
    console.error("[Auth Service] 토큰 갱신 실패:", error);

    // 토큰 갱신 실패 시 로그아웃
    logout();

    throw new Error("세션이 만료되었습니다. 다시 로그인해주세요.");
  }
};

/**
 * 현재 로그인한 사용자 정보 가져오기
 * @returns 사용자 정보 또는 null (로그인하지 않은 경우)
 */
export const getCurrentUser = (): User | null => {
  if (typeof window === "undefined") return null;

  try {
    const userJson = localStorage.getItem("teamplus_user");
    if (!userJson) return null;

    return JSON.parse(userJson) as User;
  } catch (error) {
    console.error("[Auth Service] 사용자 정보 파싱 실패:", error);
    return null;
  }
};

/**
 * 로그인 여부 확인 (토큰 만료 검증 포함)
 * @returns 로그인 상태
 */
export const isAuthenticated = (): boolean => {
  const token = getAccessToken();
  const user = getCurrentUser();

  // 토큰 또는 사용자 정보가 없으면 미인증
  if (!token || !user) {
    return false;
  }

  // 토큰 만료 확인 (순수 체크만 — 토큰 삭제는 API 인터셉터의 refresh 실패 시에만 수행)
  if (isTokenExpired(token)) {
    if (process.env.NODE_ENV === "development") {
      console.log(
        "[Auth Service] 액세스 토큰 만료 — API 인터셉터가 refresh 처리 예정",
      );
    }
    return false;
  }

  return true;
};

/**
 * 사용자 프로필 조회 (API 호출)
 * @returns 최신 사용자 정보
 */
export const getProfile = async (): Promise<User> => {
  try {
    const user = await api.get<User>("/auth/profile");

    // 로컬스토리지 업데이트
    if (typeof window !== "undefined") {
      localStorage.setItem("teamplus_user", JSON.stringify(user));
    }

    return user;
  } catch (error: unknown) {
    console.error("[Auth Service] 프로필 조회 실패:", error);
    throw new Error(
      getApiErrorMessage(error, "프로필 조회에 실패했습니다."),
    );
  }
};

/**
 * 사용자 프로필 수정
 * @param updates - 수정할 필드
 * @returns 수정된 사용자 정보
 */
export const updateProfile = async (
  updates: Partial<Pick<User, "name" | "phone">>,
): Promise<User> => {
  try {
    const user = await api.patch<User>("/auth/profile", updates);

    // 로컬스토리지 업데이트
    if (typeof window !== "undefined") {
      localStorage.setItem("teamplus_user", JSON.stringify(user));
    }

    return user;
  } catch (error: unknown) {
    console.error("[Auth Service] 프로필 수정 실패:", error);
    throw new Error(
      getApiErrorMessage(error, "프로필 수정에 실패했습니다."),
    );
  }
};

/**
 * 비밀번호 변경
 * @param currentPassword - 현재 비밀번호
 * @param newPassword - 새 비밀번호
 */
export const changePassword = async (
  currentPassword: string,
  newPassword: string,
): Promise<void> => {
  try {
    await api.post("/auth/change-password", {
      currentPassword,
      newPassword,
    });
  } catch (error: unknown) {
    console.error("[Auth Service] 비밀번호 변경 실패:", error);

    const errorMessage = isAxiosError(error)
      ? error.response?.data?.error?.message
      : undefined;
    if (errorMessage?.includes("current")) {
      throw new Error("현재 비밀번호가 일치하지 않습니다.");
    } else {
      throw new Error(errorMessage || "비밀번호 변경에 실패했습니다.");
    }
  }
};

/**
 * Auth Service Export
 */
export const authService = {
  login,
  register,
  logout,
  refreshToken,
  getCurrentUser,
  isAuthenticated,
  getProfile,
  updateProfile,
  changePassword,
  getLastLogoutInfo,
};

export default authService;
/* eslint-disable @typescript-eslint/no-explicit-any */
