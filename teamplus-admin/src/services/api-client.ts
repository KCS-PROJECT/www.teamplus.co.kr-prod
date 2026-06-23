/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TEAMPLUS API Client
 * Axios 기반 HTTP 클라이언트 with JWT 자동 첨부 및 에러 핸들링
 */

import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  AxiosError,
  InternalAxiosRequestConfig,
} from "axios";
import { ApiResponse, ApiError } from "../types";
import { env } from "@/lib/env";
import {
  apiLifecycle,
  generateRequestId,
  registerDefaultAdminLifecycleHooks,
  isPublicApiPath,
  AUTH_REQUIRED_CODE,
  AuthRequiredError,
  type LifecycleRequestContext,
} from "./api-lifecycle";

// Admin lifecycle 기본 훅 등록 (모듈 로드 시 1회)
if (typeof window !== "undefined") {
  apiLifecycle.setClientVersion(
    process.env.NEXT_PUBLIC_APP_VERSION ?? "admin-dev",
  );
  registerDefaultAdminLifecycleHooks();
}

/**
 * API 클라이언트 설정
 */
const API_CONFIG = {
  baseURL: env.NEXT_PUBLIC_API_URL,
  timeout: 30000, // 30초
  // [A-1 2026-06-07] httpOnly refresh 쿠키 송수신 활성화 (백엔드 CORS credentials:true 호환)
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
};

/**
 * 토큰 저장소 키
 */
const TOKEN_KEYS = {
  ACCESS_TOKEN: "teamplus_access_token",
  REFRESH_TOKEN: "teamplus_refresh_token",
} as const;

// ==================== JWT Token Utilities ====================

/**
 * JWT 토큰 페이로드 타입
 */
interface JwtPayload {
  sub?: string;
  email?: string;
  exp?: number;
  iat?: number;
  [key: string]: any;
}

/**
 * JWT 토큰 디코딩 (Base64 → JSON)
 * @param token - JWT 토큰 문자열
 * @returns 디코딩된 페이로드 또는 null
 */
export const decodeJwtToken = (token: string): JwtPayload | null => {
  try {
    // JWT는 header.payload.signature 형식
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    // Base64URL → Base64 변환
    const base64Payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");

    // Base64 디코딩
    const jsonPayload = decodeURIComponent(
      atob(base64Payload)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );

    return JSON.parse(jsonPayload) as JwtPayload;
  } catch (error) {
    console.error("[JWT] 토큰 디코딩 실패:", error);
    return null;
  }
};

/**
 * JWT 토큰 만료 여부 확인
 * @param token - JWT 토큰 문자열
 * @param bufferSeconds - 만료 전 여유 시간 (초, 기본 30초)
 * @returns true면 만료됨, false면 유효함
 */
export const isTokenExpired = (
  token: string | null,
  bufferSeconds: number = 30,
): boolean => {
  if (!token) return true;

  const payload = decodeJwtToken(token);
  if (!payload || !payload.exp) return true;

  // 현재 시간 (초 단위)
  const currentTime = Math.floor(Date.now() / 1000);

  // 만료 시간 - 버퍼 시간
  const expirationTime = payload.exp - bufferSeconds;

  return currentTime >= expirationTime;
};

/**
 * JWT 토큰 남은 시간 (초)
 * @param token - JWT 토큰 문자열
 * @returns 남은 시간 (초), 만료된 경우 0
 */
export const getTokenRemainingTime = (token: string | null): number => {
  if (!token) return 0;

  const payload = decodeJwtToken(token);
  if (!payload || !payload.exp) return 0;

  const currentTime = Math.floor(Date.now() / 1000);
  const remainingTime = payload.exp - currentTime;

  return Math.max(0, remainingTime);
};

/**
 * Axios 인스턴스 생성
 */
const apiClient: AxiosInstance = axios.create(API_CONFIG);

// ==================== Token Management ====================

/**
 * 로컬스토리지에서 액세스 토큰 가져오기
 */
export const getAccessToken = (): string | null => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEYS.ACCESS_TOKEN);
};

/**
 * 로컬스토리지에서 리프레시 토큰 가져오기
 */
export const getRefreshToken = (): string | null => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEYS.REFRESH_TOKEN);
};

/**
 * 토큰 저장 (localStorage + Cookie)
 * - localStorage: 클라이언트사이드 API 요청용
 * - Cookie: Next.js Middleware 서버사이드 인증 체크용
 */
export const setTokens = (accessToken: string, refreshToken: string): void => {
  if (typeof window === "undefined") return;

  // localStorage 저장 (클라이언트용)
  localStorage.setItem(TOKEN_KEYS.ACCESS_TOKEN, accessToken);
  localStorage.setItem(TOKEN_KEYS.REFRESH_TOKEN, refreshToken);

  // 쿠키 저장 (미들웨어 인증 체크용)
  // max-age: 86400 = 1일 (24시간)
  // SameSite=Lax: CSRF 보호하면서 일반 네비게이션 허용
  // Secure: HTTPS 환경에서만 부착 — 운영자 토큰 평문 전송 방지
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `teamplus_access_token=${accessToken}; path=/; max-age=86400; SameSite=Lax${secure}`;
  document.cookie = `teamplus_refresh_token=${refreshToken}; path=/; max-age=604800; SameSite=Lax${secure}`; // 7일
};

/**
 * 토큰 삭제 (로그아웃 시) - localStorage + Cookie 모두 삭제
 */
export const clearTokens = (): void => {
  if (typeof window === "undefined") return;

  // localStorage 삭제
  localStorage.removeItem(TOKEN_KEYS.ACCESS_TOKEN);
  localStorage.removeItem(TOKEN_KEYS.REFRESH_TOKEN);

  // 쿠키 삭제 (max-age=0으로 즉시 만료)
  document.cookie = "teamplus_access_token=; path=/; max-age=0";
  document.cookie = "teamplus_refresh_token=; path=/; max-age=0";
};

// ==================== Request Interceptor ====================

/**
 * 요청 인터셉터: JWT 토큰 자동 첨부 + Lifecycle 전처리
 */
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken();
    const requestUrl = config.url ?? "";

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // === Admin API Lifecycle — 전처리 ===
    const requestId =
      (config.headers?.["X-Request-ID"] as string | undefined) ??
      generateRequestId();
    config.headers.set("X-Request-ID", requestId);
    config.headers.set("X-Client-Platform", apiLifecycle.getPlatform());
    config.headers.set("X-Client-Version", apiLifecycle.getClientVersion());

    // === 로그인 가드 ===
    // 토큰 없음 + Public 경로 아님 → 네트워크 호출 차단하고 AUTH_REQUIRED로 즉시 실패
    if (!token && !isPublicApiPath(requestUrl)) {
      throw new AuthRequiredError(requestUrl, requestId);
    }

    const lifecycleCtx: LifecycleRequestContext = {
      requestId,
      method: (config.method ?? "GET").toUpperCase(),
      url: config.url ?? "",
      startAt:
        typeof performance !== "undefined" ? performance.now() : Date.now(),
      platform: apiLifecycle.getPlatform(),
      clientVersion: apiLifecycle.getClientVersion(),
      meta: {},
    };
    (
      config as AxiosRequestConfig & { _lifecycle?: LifecycleRequestContext }
    )._lifecycle = lifecycleCtx;
    void apiLifecycle.runBeforeRequest(lifecycleCtx);

    return config;
  },
  (error: AxiosError) => {
    console.error("[API Request Error]", error);
    return Promise.reject(error);
  },
);

// ==================== Response Interceptor ====================

/**
 * 토큰 갱신 진행 중 여부
 */
let isRefreshing = false;

/**
 * 토큰 갱신 대기 중인 요청들
 */
let failedQueue: Array<{
  resolve: (value?: any) => void;
  reject: (reason?: any) => void;
}> = [];

/**
 * 대기 중인 요청 처리
 */
const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });

  failedQueue = [];
};

/**
 * 토큰 갱신 없이 즉시 실패 처리해야 하는 URL 패턴
 */
const AUTH_ENDPOINTS = [
  "/auth/login",
  "/auth/admin/login",
  "/auth/register",
  "/auth/refresh",
];

/**
 * 응답 인터셉터: 에러 핸들링 및 토큰 갱신
 */
apiClient.interceptors.response.use(
  (response: AxiosResponse<ApiResponse<any>>) => {
    // === Admin API Lifecycle — 성공 응답 후처리 ===
    const lifecycleCtx = (
      response.config as AxiosRequestConfig & {
        _lifecycle?: LifecycleRequestContext;
      }
    )._lifecycle;
    if (lifecycleCtx) {
      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      void apiLifecycle.runAfterResponse({
        ...lifecycleCtx,
        status: response.status,
        durationMs: Math.round(now - lifecycleCtx.startAt),
        serverTime:
          (response.headers?.["x-server-time"] as string | undefined) ??
          undefined,
      });
    }

    return response;
  },
  async (error: AxiosError<ApiError> | AuthRequiredError) => {
    // 요청 인터셉터에서 throw된 AuthRequiredError — lifecycle 통지 후 즉시 reject
    if (error instanceof AuthRequiredError) {
      void apiLifecycle.runOnError({
        requestId: error.requestId ?? "unknown",
        method: "AUTH_GUARD",
        url: error.url,
        startAt: Date.now(),
        durationMs: 0,
        platform: apiLifecycle.getPlatform(),
        clientVersion: apiLifecycle.getClientVersion(),
        meta: { source: "pre-request-guard" },
        status: 401,
        error,
        message: error.message,
        code: AUTH_REQUIRED_CODE,
      });
      return Promise.reject(error);
    }

    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
      _lifecycle?: LifecycleRequestContext;
    };

    // 인증 관련 엔드포인트는 401 처리 제외 (무한 루프 방지)
    const isAuthEndpoint = AUTH_ENDPOINTS.some((endpoint) =>
      originalRequest?.url?.includes(endpoint),
    );

    // [2026-06-05] 401 이고 refresh 재시도가 가능하면 onError(= teamplus-admin:api-unauthorized
    //   + /login 자동 유도) 발사를 refresh 결과가 나올 때까지 보류한다.
    //   기존엔 401 시점에 즉시 로그아웃 유도가 발사되어, refresh 가 성공하거나 로그인 직후
    //   첫 요청이 401 일 때도 강제 로그아웃되던 회귀가 있었다.
    const is401Retryable =
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !isAuthEndpoint;

    // === Admin API Lifecycle — 에러 후처리 발사 헬퍼 ===
    const fireOnError = () => {
      const lifecycleCtx = originalRequest?._lifecycle;
      if (!lifecycleCtx) return;
      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      // 백엔드 응답 구조 방어적 처리 (ApiError wrapper 또는 평면 객체 혼용)
      const raw = error.response?.data as
        | {
            error?: { message?: string; code?: string };
            message?: string;
            code?: string;
          }
        | undefined;
      const message = raw?.error?.message ?? raw?.message ?? error.message;
      const code = raw?.error?.code ?? raw?.code;
      void apiLifecycle.runOnError({
        ...lifecycleCtx,
        status: error.response?.status,
        durationMs: Math.round(now - lifecycleCtx.startAt),
        serverTime: error.response?.headers?.["x-server-time"] as
          | string
          | undefined,
        error,
        message,
        code,
      });
    };

    // refresh 재시도 대상이 아니면 즉시 발사 (비401·재시도불가·인증엔드포인트 등).
    if (!is401Retryable) {
      fireOnError();
    }

    // 401 Unauthorized: 토큰 만료 (인증 엔드포인트 제외)
    if (is401Retryable) {
      if (isRefreshing) {
        // 토큰 갱신 중이면 대기열에 추가
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const currentRefreshToken = getRefreshToken();

      if (!currentRefreshToken) {
        // 리프레시 토큰이 없으면 — 이제서야 onError 발사 + 로그인 페이지로 리다이렉트.
        isRefreshing = false;
        fireOnError();
        if (
          typeof window !== "undefined" &&
          !window.location.pathname.includes("/login")
        ) {
          clearTokens();
          window.location.href =
            "/login?redirect=" + encodeURIComponent(window.location.pathname);
        }
        return Promise.reject(error);
      }

      try {
        // 토큰 갱신 API 호출
        const response = await axios.post<
          ApiResponse<{ accessToken: string; refreshToken?: string }>
        >(`${API_CONFIG.baseURL}/auth/refresh`, {
          refreshToken: currentRefreshToken,
        });

        // 백엔드 응답 구조 방어적 처리:
        // 직접 반환({ accessToken, refreshToken }) 또는 래퍼({ data: { accessToken, refreshToken } })
        const responseData = response.data as any;
        const accessToken =
          responseData?.data?.accessToken || responseData?.accessToken;
        const nextRefreshToken =
          responseData?.data?.refreshToken ||
          responseData?.refreshToken ||
          currentRefreshToken;

        if (!accessToken) {
          throw new Error("토큰 갱신 응답에 accessToken이 없습니다.");
        }

        // Refresh Token Rotation 대응: 서버가 새 refreshToken을 반환하면 함께 저장
        setTokens(accessToken, nextRefreshToken);

        // 대기 중인 요청들 처리
        processQueue(null, accessToken);

        // 원래 요청 재시도
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        // 2026-04-22: 401 (서버가 명시적으로 세션 무효 판정)만 clearTokens + redirect.
        // 타임아웃·5xx·네트워크 오류는 토큰 유지 → 다음 요청에서 자연 재시도.
        processQueue(refreshError as Error, null);

        const refreshStatus = (refreshError as AxiosError)?.response?.status;
        if (
          refreshStatus === 401 &&
          typeof window !== "undefined" &&
          !window.location.pathname.includes("/login")
        ) {
          // 세션 무효(refresh 401) — 이제서야 onError 발사 + 로그인 유도.
          fireOnError();
          clearTokens();
          window.location.href =
            "/login?redirect=" + encodeURIComponent(window.location.pathname);
        }

        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // 403 Forbidden: 권한 없음
    if (error.response?.status === 403) {
      console.error("[API Error] 권한이 없습니다.");
    }

    // 404 Not Found
    if (error.response?.status === 404) {
      console.error("[API Error] 리소스를 찾을 수 없습니다.");
    }

    // 500 Internal Server Error
    if (error.response?.status === 500) {
      console.error("[API Error] 서버 오류가 발생했습니다.");
    }

    // 네트워크 에러
    if (!error.response) {
      console.error("[API Error] 네트워크 연결을 확인해주세요.");
    }

    // 에러 로그 (개발 환경)
    if (process.env.NODE_ENV === "development") {
      console.error("[API Error]", {
        url: error.config?.url,
        method: error.config?.method,
        status: error.response?.status,
        data: error.response?.data,
      });
    }

    return Promise.reject(error);
  },
);

// ==================== API Client Methods ====================

/**
 * 응답 데이터 추출 (래퍼 유무 자동 처리)
 */
const extractData = <T>(responseData: any): T => {
  // ApiResponse 래퍼가 있는 경우: { success: true, data: {...} }
  if (
    responseData &&
    typeof responseData === "object" &&
    "data" in responseData &&
    responseData.success === true
  ) {
    return responseData.data as T;
  }
  // 직접 응답인 경우
  return responseData as T;
};

/**
 * GET 요청
 */
export const get = async <T>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<T> => {
  const response = await apiClient.get<T>(url, config);
  return extractData<T>(response.data);
};

/**
 * POST 요청
 */
export const post = async <T, D = any>(
  url: string,
  data?: D,
  config?: AxiosRequestConfig,
): Promise<T> => {
  const response = await apiClient.post<T>(url, data, config);
  return extractData<T>(response.data);
};

/**
 * PUT 요청
 */
export const put = async <T, D = any>(
  url: string,
  data?: D,
  config?: AxiosRequestConfig,
): Promise<T> => {
  const response = await apiClient.put<T>(url, data, config);
  return extractData<T>(response.data);
};

/**
 * PATCH 요청
 */
export const patch = async <T, D = any>(
  url: string,
  data?: D,
  config?: AxiosRequestConfig,
): Promise<T> => {
  const response = await apiClient.patch<T>(url, data, config);
  return extractData<T>(response.data);
};

/**
 * DELETE 요청
 */
export const del = async <T>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<T> => {
  const response = await apiClient.delete<T>(url, config);
  return extractData<T>(response.data);
};

// ==================== Export ====================

/**
 * API 클라이언트 인스턴스 (고급 사용)
 */
export default apiClient;

/**
 * API 클라이언트 메서드 모음
 */
export const api = {
  get,
  post,
  put,
  patch,
  delete: del,
  client: apiClient,
};
