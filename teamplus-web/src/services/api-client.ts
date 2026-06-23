/**
 * API Client
 * 백엔드 API 호출을 위한 클라이언트
 *
 * 경로 B: Web → Native Bridge → Backend (기본)
 * 경로 A: Web → Backend (웹 브라우저 fallback)
 */

import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosError,
  InternalAxiosRequestConfig,
} from "axios";
import {
  api as nativeApi,
  initApiResponseListener,
  ApiRequestError,
} from "./native-bridge";
import { hybridAuth } from "./hybrid-auth";
import { isNativeApp } from "@/lib/environment";
import { recordServerTime } from "@/lib/server-clock";
import { env } from "@/lib/env";
import type { ApiResponse, ApiError } from "@/types";
import { ApiErrorCode, createApiError, httpStatusToApiError } from "@/types";
import { withRetry, type RetryOptions } from "./retry";
import { devLog, devError } from "@/lib/logger";
import { isJwtFormat } from "@/lib/jwt-format";
import {
  isTokenExpired,
  getTokenExpiryMs,
  getTokenRemainingCookieSec,
} from "@/lib/token-utils";
import {
  apiLifecycle,
  generateRequestId,
  isPublicApiPath,
  AuthRequiredError,
  AUTH_REQUIRED_CODE,
  type LifecycleRequestContext,
} from "./api-lifecycle";
import { beginLoadingDataRequest } from "./loading-data-tracker";

// ============================================
// View ID 추적 — 어느 화면/컴포넌트에서 API 호출이 일어났는지 서버 로그에 기록
// (v8.7 2026-05-23 신규 — 사용자 요구: 메뉴 클릭·이벤트 시 화면 식별)
// ============================================
// 호출자가 명시적으로 등록한 viewId. useViewId 훅 또는 setCurrentViewId 직접 호출.
// 우선순위: AxiosRequestConfig.viewId > currentViewId > pathname fallback
let currentViewId: string | null = null;

/** 현재 화면/컴포넌트 viewId 등록 (예: 'teamplus-web/src/components/classes/PackageEditSheet.tsx') */
export function setCurrentViewId(viewId: string | null): void {
  currentViewId = viewId && viewId.length > 0 ? viewId : null;
}

/** 현재 등록된 viewId 조회 (디버깅용) */
export function getCurrentViewId(): string | null {
  return currentViewId;
}

/**
 * pathname → viewId 자동 추정 (수동 등록이 없을 때 fallback)
 * 예: pathname '/classes-manage' → 'teamplus-web/src/app/classes-manage/page.tsx'
 * 단, route group(`(coach)` 등)은 pathname에 없으므로 추정 정확도는 페이지 단위까지만.
 *
 * [v8.7.1 2026-05-23] 동적 라우트 세그먼트 정규화:
 *   런타임 pathname `/team/cmoib0iel0009yhh72air2euy` 같이 cuid/uuid/숫자 ID가
 *   그대로 박힌 경로가 viewId로 기록되는 회귀를 차단. 다음 패턴을 `[id]` 로 치환:
 *     · cuid  (예: `cmoib0iel0009yhh72air2euy`)  — `c` + 24자 [a-z0-9]
 *     · uuid  (예: `123e4567-e89b-12d3-a456-...`) — RFC 4122 8-4-4-4-12
 *     · 순수 숫자 (예: `12345`)
 *   정확한 라우트 그룹(`(common)` 등)까지 식별하려면 페이지에서 `useViewId()` 호출 권장.
 */
const CUID_PATTERN = /^c[a-z0-9]{24}$/i;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_ID_PATTERN = /^\d+$/;

function normalizeDynamicSegments(path: string): string {
  return path
    .split("/")
    .map((seg) => {
      if (!seg) return seg;
      if (CUID_PATTERN.test(seg)) return "[id]";
      if (UUID_PATTERN.test(seg)) return "[id]";
      if (NUMERIC_ID_PATTERN.test(seg)) return "[id]";
      return seg;
    })
    .join("/");
}

function inferViewIdFromPathname(): string | null {
  if (typeof window === "undefined") return null;
  const path = window.location.pathname;
  if (!path || path === "/") return "teamplus-web/src/app/page.tsx";
  // 경로 끝의 trailing slash 제거 + 동적 세그먼트 정규화
  const clean = normalizeDynamicSegments(path.replace(/\/+$/, ""));
  return `teamplus-web/src/app${clean}/page.tsx`;
}

// ============================================
// 세션 정보 헤더 주입 (v8.8 2026-05-23 — 사용자 요구)
// ============================================
// 백엔드 로그에 "누가 호출했는지" 확인하기 위한 세션 식별값을 모든 요청에 자동 첨부.
// Public 라우트(/api/v1/venues 등)는 JWT Guard 가 우회되어 req.user 가 undefined →
// userId="anonymous" 로만 노출되던 회귀를 해결한다.
//
// 보안 원칙: 이 헤더 값은 **로깅 전용** 이며, 백엔드는 절대 인가(authorization)에
// 사용하지 않는다. 실제 인증은 여전히 JWT/Bearer 토큰으로만 검증. 클라이언트가
// 헤더를 임의 값으로 위조해도 보안 영향 없음(단지 로그가 부정확해질 뿐).
const AUTH_CACHE_KEY = "teamplus_auth_profile";
interface SessionProfile {
  id?: string;
  email?: string;
  userType?: string;
  name?: string;
}
function getSessionProfile(): SessionProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(AUTH_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionProfile;
  } catch {
    return null;
  }
}

// ============================================
// Token Refresh State Management (통합 갱신 시스템)
// ============================================
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;
let refreshSubscribers: Array<{
  resolve: (token: string) => void;
  reject: (error: Error) => void;
}> = [];

/**
 * 토큰 갱신 완료 시 대기 중인 요청들에게 새 토큰 전달
 */
function onTokenRefreshed(newToken: string): void {
  refreshSubscribers.forEach(({ resolve }) => resolve(newToken));
  refreshSubscribers = [];
}

/**
 * 토큰 갱신 실패 시 대기 중인 요청들에게 에러 전달
 */
function onRefreshFailed(error: Error): void {
  refreshSubscribers.forEach(({ reject }) => reject(error));
  refreshSubscribers = [];
}

/**
 * 토큰 갱신 대기 (이미 갱신 중이면 결과 대기)
 */
function waitForTokenRefresh(): Promise<string> {
  return new Promise((resolve, reject) => {
    refreshSubscribers.push({ resolve, reject });
  });
}

/**
 * 통합 토큰 갱신 함수 (모든 갱신 요청을 하나로 처리)
 * Race condition 방지를 위해 단일 Promise 사용
 */
async function refreshAccessToken(): Promise<string | null> {
  // 이미 갱신 중이면 해당 Promise 재사용
  if (isRefreshing && refreshPromise) {
    try {
      return await waitForTokenRefresh();
    } catch {
      return null;
    }
  }

  isRefreshing = true;

  refreshPromise = (async () => {
    try {
      const tokenInfo = await hybridAuth.getToken();
      if (!tokenInfo?.refreshToken) {
        // 미인증 상태 (정상): 리프레시 토큰 없음 → 에러/clearToken 없이 조용히 처리
        onRefreshFailed(new Error("unauthenticated"));
        return null;
      }

      // [2026-05-14] JWT 형식 사전 검증 — 백엔드 RefreshTokenDto @IsJWT 가
      //   garbage 토큰을 받아 400 BadRequest 사이클을 일으키지 않도록 차단.
      //   invalid format 이면 stale 토큰 자동 정리 + 재로그인 유도.
      if (!isJwtFormat(tokenInfo.refreshToken)) {
        devError(
          "[API Client] refresh token invalid JWT format — clearing stale token",
        );
        await hybridAuth.clearToken();
        if (typeof document !== "undefined") {
          document.cookie = "teamplus_access_token=; path=/; max-age=0";
          document.cookie = "teamplus_refresh_token=; path=/; max-age=0";
        }
        onRefreshFailed(new Error("invalid_refresh_token"));
        return null;
      }

      devLog("[API Client] 토큰 갱신 시작");

      const refreshResponse = await axios.post<{
        accessToken: string;
        refreshToken: string;
      }>(
        `${API_BASE_URL}/api/v1/auth/refresh`,
        { refreshToken: tokenInfo.refreshToken },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 10000, // 10초 타임아웃
        },
      );

      const { accessToken, refreshToken } = refreshResponse.data;

      // 새 토큰 저장
      await hybridAuth.saveToken({ accessToken, refreshToken });

      // Cookie에도 저장 (미들웨어 인증용)
      // [2026-05-13 Phase B-1] cookie 만료를 JWT exp 기반으로 동기화 →
      //   "쿠키는 살아있는데 토큰은 만료" 미들웨어 회귀 차단. exp 없으면 폴백 7일.
      if (typeof document !== "undefined") {
        const remainingSec = getTokenRemainingCookieSec(accessToken);
        const maxAge = remainingSec > 0 ? remainingSec : 60 * 60 * 24 * 7;
        // [2026-06-10 SECURITY] HTTPS 에서 Secure 플래그 부착 — 평문 전송 차단.
        const secure = location.protocol === "https:" ? "; Secure" : "";
        document.cookie = `teamplus_access_token=${accessToken}; path=/; max-age=${maxAge}; SameSite=Lax${secure}`;
        // [2026-06-15 SECURITY] refresh 토큰은 JS 접근 쿠키로 쓰지 않는다 — 백엔드 refresh
        //   응답이 httpOnly refresh 쿠키(path=/)를 재설정하며 미들웨어가 그것으로 판정한다.
      }

      devLog("[API Client] 토큰 갱신 성공");

      onTokenRefreshed(accessToken);
      return accessToken;
    } catch (error) {
      // 실제 갱신 실패 (만료된 리프레시 토큰, 네트워크 오류 등)
      devError("[API Client] 토큰 갱신 실패:", error);
      onRefreshFailed(
        error instanceof Error ? error : new Error("Token refresh failed"),
      );

      // WEB-032 연장 (2026-04-22): 401 (서버가 명시적으로 세션 무효 판정)만 clearToken.
      // 타임아웃·5xx·네트워크 오류는 토큰 유지 → 다음 요청에서 자연 재시도.
      const status = (error as AxiosError)?.response?.status;
      if (status === 401) {
        await hybridAuth.clearToken();
        if (typeof document !== "undefined") {
          document.cookie = "teamplus_access_token=; path=/; max-age=0";
          document.cookie = "teamplus_refresh_token=; path=/; max-age=0";
        }
      }

      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// SoT · src/lib/env.ts 의 env.NEXT_PUBLIC_API_URL 을 단일 출처로 사용.
// fallback 은 env.ts 의 PORTS.backend(5003) 에서 결정된다.
const API_BASE_URL = env.NEXT_PUBLIC_API_URL;

// Native 앱 환경에서 API 응답 리스너 초기화
if (typeof window !== "undefined") {
  // 클라이언트 사이드에서만 실행
  setTimeout(() => {
    if (isNativeApp()) {
      initApiResponseListener();
    }
  }, 0);
}

// ============================================
// 요청 옵션 타입 (확장)
// ============================================
export interface RequestOptions extends AxiosRequestConfig {
  /**
   * 동기/비동기 선택 (Native 환경에서만 적용)
   * - true (기본값): 비동기 - UI 블로킹 없이 백그라운드 처리
   * - false: 동기 - 결과가 올 때까지 대기
   */
  async?: boolean;
  /**
   * Retry 옵션 (웹 브라우저 fallback 환경에서만 적용)
   * Native 환경에서는 Flutter의 RetryInterceptor가 처리
   */
  retry?: RetryOptions | boolean;
  /**
   * Idempotency-Key 명시 — 결제 orderNumber 같은 도메인 key 를 그대로 사용해야 할 때.
   * 미지정 시 POST/PUT/PATCH 요청은 자동으로 `crypto.randomUUID()` 가 부착된다.
   * GET/DELETE 등은 부착되지 않음.
   */
  idempotencyKey?: string;
}

// ============================================
// Axios 인스턴스 (웹 브라우저 fallback용)
// ============================================
export const apiClient: AxiosInstance = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  timeout: 30000,
  // [A-1 2026-06-07] httpOnly refresh 쿠키 송수신 활성화. 백엔드 CORS 는
  //   credentials:true + origin reflect 라 호환. (브라우저 경로 한정 — WebView 는 네이티브 브릿지)
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

// ============================================
// In-Flight GET Dedup (Strict Mode 더블 호출 자동 차단)
// [추가 2026-05-16]
//
// React 18+ Strict Mode 는 dev 환경에서 모든 useEffect 를 의도적으로 2회 실행한다.
// 각 fetch hook 이 `initialFetchedRef` 가드를 명시하지 않으면 동일 GET 요청이
// 2회 발사되어 네트워크 탭에 중복 호출이 누적된다 (사용자 보고: child-home 초기
// 진입 시 notices/badges/ranking/list/parents/classes 등 모든 데이터가 2회 호출).
//
// 본 dedup 은 "현재 비행 중인" 동일 GET 요청을 단일 promise 로 공유한다.
// — 첫 요청이 resolve / reject 되는 시점까지 동일 url+params 의 추가 요청은
//   기존 promise 를 그대로 반환받아 추가 네트워크 호출이 발생하지 않는다.
// — 첫 promise settle 후 Map 에서 제거 → 이후 명시적 refresh / refetch 는 정상.
//
// POST/PUT/PATCH/DELETE 는 멱등하지 않으므로 dedup 대상이 아니다.
//
// 재발 방지: 모든 GET 진입점(api.get, apiRequest GET) 에서 본 헬퍼를 사용.
// 신규 hook 추가 시 별도 가드 작성 없이도 자동으로 보호된다.
// ============================================
const inFlightGets = new Map<string, Promise<ApiResponse<unknown>>>();

function serializeForKey(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "object") return String(value);
  try {
    const obj = value as Record<string, unknown>;
    return Object.keys(obj)
      .sort()
      .map((k) => `${k}=${serializeForKey(obj[k])}`)
      .join("&");
  } catch {
    return "";
  }
}

function makeGetDedupKey(url: string, params?: unknown): string {
  return `${url}|${serializeForKey(params)}`;
}

/**
 * 비행 중인 동일 GET 요청이 있으면 동일 promise 반환, 없으면 factory 실행.
 * - settle 후 캐시에서 자동 제거.
 * - 응답 결과는 캐시되지 않는다 (캐시는 별도 layer 책임).
 */
async function dedupInFlightGet<T>(
  url: string,
  params: unknown,
  factory: () => Promise<ApiResponse<T>>,
): Promise<ApiResponse<T>> {
  const key = makeGetDedupKey(url, params);
  const existing = inFlightGets.get(key) as Promise<ApiResponse<T>> | undefined;
  if (existing) return existing;

  const promise = (async () => {
    try {
      return await factory();
    } finally {
      inFlightGets.delete(key);
    }
  })();
  inFlightGets.set(key, promise as Promise<ApiResponse<unknown>>);
  return promise;
}

type LoadingTrackedAxiosConfig = AxiosRequestConfig & {
  _finishLoadingDataRequest?: () => void;
};

function startLoadingDataTracking(
  config: LoadingTrackedAxiosConfig,
  ctx: LifecycleRequestContext,
): void {
  config._finishLoadingDataRequest = beginLoadingDataRequest({
    id: ctx.requestId,
    method: ctx.method,
    url: ctx.url,
  });
}

function finishLoadingDataTracking(config?: AxiosRequestConfig | null): void {
  const tracked = config as LoadingTrackedAxiosConfig | undefined;
  tracked?._finishLoadingDataRequest?.();
  if (tracked) {
    tracked._finishLoadingDataRequest = undefined;
  }
}

async function withLoadingDataTracking<T>(
  method: string,
  url: string,
  fn: () => Promise<T>,
): Promise<T> {
  const finish = beginLoadingDataRequest({ method, url });
  try {
    return await fn();
  } finally {
    finish();
  }
}

/**
 * JWT 토큰에서 만료 시간 추출
 */
/**
 * 선제적 토큰 갱신 (만료 5분 전에 갱신)
 * 통합된 refreshAccessToken 함수 사용
 *
 * [2026-05-13 Phase B-1] 토큰 만료 판단을 `@/lib/token-utils.isTokenExpired` 로
 *   단일화. 이전에는 본 파일과 `web-token-storage.ts` 가 각자 5분 버퍼 로직을
 *   복제하여 한쪽만 수정 시 회귀 발생.
 */
async function preemptiveTokenRefresh(): Promise<string | null> {
  try {
    const tokenInfo = await hybridAuth.getToken();
    if (!tokenInfo?.accessToken || !tokenInfo?.refreshToken) return null;

    // 토큰이 곧 만료되는 경우에만 갱신 (default 5분 버퍼)
    if (!isTokenExpired(tokenInfo.accessToken)) {
      return tokenInfo.accessToken;
    }

    // 통합된 갱신 함수 사용 (race condition 방지)
    return await refreshAccessToken();
  } catch {
    // 선제적 갱신 실패는 무시 (401 응답 시 재시도됨)
    return null;
  }
}

/**
 * 외부에서 호출 가능한 선제적 갱신 — AuthContext 의 백그라운드 인터벌과
 * navigation guard 에서 사용한다.
 *
 * 2026-05-08: cookie 만료 vs localStorage refresh 미동기화로 미들웨어가
 * `/login?redirect=...` 로 보내는 회귀 차단을 위해 export.
 */
export async function ensureFreshAccessToken(): Promise<string | null> {
  return preemptiveTokenRefresh();
}

// 요청 인터셉터: 토큰 자동 추가 + 선제적 갱신 + Lifecycle 전처리
apiClient.interceptors.request.use(
  async (config) => {
    // === API Lifecycle — 전처리 공통 ===
    const requestId =
      (config.headers?.["X-Request-ID"] as string | undefined) ??
      generateRequestId();
    config.headers.set("X-Request-ID", requestId);
    config.headers.set("X-Client-Platform", apiLifecycle.getPlatform());
    config.headers.set("X-Client-Version", apiLifecycle.getClientVersion());

    // === X-View-Id — 어느 화면/컴포넌트에서 호출되었는지 추적 (v8.7) ===
    // 우선순위: config.viewId (호출별 override) > currentViewId (useViewId 등록값) > pathname fallback
    const cfgViewId = (config as AxiosRequestConfig & { viewId?: string })
      .viewId;
    const resolvedViewId =
      cfgViewId ?? currentViewId ?? inferViewIdFromPathname();
    if (resolvedViewId) {
      config.headers.set("X-View-Id", resolvedViewId);
    }

    // === X-Session-* — 세션 식별 헤더 (v8.8 2026-05-23) ===
    //   사용자 요구: "누가 거래를 요청했는지" 모든 로그에서 확인 가능해야 함.
    //   Public 라우트는 JWT Guard 가 우회되어 req.user 가 undefined → 백엔드 로그
    //   userId="anonymous" 로만 보였던 회귀를 해소. sessionStorage 의 profile 캐시를
    //   읽어 X-Session-User-Id / -Role / -Email 헤더로 첨부.
    //
    //   **보안**: 로깅 전용. 백엔드는 이 헤더를 절대 인가에 사용하지 않으며,
    //   실제 인증은 여전히 JWT 로만 검증 — 위조해도 보안 영향 0.
    const sessionProfile = getSessionProfile();
    if (sessionProfile?.id) {
      config.headers.set("X-Session-User-Id", sessionProfile.id);
    }
    if (sessionProfile?.userType) {
      config.headers.set(
        "X-Session-User-Role",
        sessionProfile.userType.toString().toLowerCase(),
      );
    }
    if (sessionProfile?.email) {
      // 이메일은 PII — 디버깅 가치를 위해 포함하되 prod 로그 retention 정책에 주의.
      config.headers.set("X-Session-User-Email", sessionProfile.email);
    }

    // [2026-05-13 Phase B-2] Idempotency-Key 자동 부착 (POST/PUT/PATCH).
    //   결제·자녀 등록·출석 체크인 등 재시도 시 중복 생성 위험 차단.
    //   호출자가 `options.idempotencyKey` 로 도메인 키(예: orderNumber) 명시 가능.
    //   GET/DELETE 는 자연스럽게 멱등 메서드라 부착하지 않는다.
    const method = (config.method ?? "GET").toUpperCase();
    if (["POST", "PUT", "PATCH"].includes(method)) {
      if (!config.headers.get("X-Idempotency-Key")) {
        const opts = config as AxiosRequestConfig & { idempotencyKey?: string };
        const key =
          opts.idempotencyKey ??
          (typeof crypto !== "undefined" &&
          typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
        config.headers.set("X-Idempotency-Key", key);
      }
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
    await apiLifecycle.runBeforeRequest(lifecycleCtx);
    startLoadingDataTracking(config, lifecycleCtx);

    const requestUrl = config.url ?? "";
    const isPublic = isPublicApiPath(requestUrl);

    // 공개 API는 인증 헤더와 선제적 토큰 갱신을 모두 건너뛴다.
    // 만료된 로컬 토큰이 남아 있어도 /app/settings 같은 부팅 필수 요청이
    // /auth/refresh Network Error 로그에 끌려가지 않도록 분리한다.
    if (isPublic) {
      return config;
    }

    // 인증 엔드포인트(로그인/회원가입/토큰 갱신/비밀번호/소셜/중복 확인/아동 인증)는
    // 토큰 첨부·선제적 갱신을 모두 건너뛴다.
    // - 어차피 새 토큰을 받거나 인증이 불필요한 요청.
    // - stale 토큰으로 인한 불필요한 /auth/refresh 연쇄 호출이 본 요청까지 Network Error로 전파되는 회귀를 차단.
    // - 응답 인터셉터의 authEndpoints 화이트리스트(line 364-374)와 짝을 맞춘다.
    const AUTH_BYPASS_PATTERNS = [
      "/auth/login",
      "/auth/register",
      "/auth/signup",
      "/auth/refresh",
      "/auth/find-id",
      "/auth/find-account",
      "/auth/password",
      "/auth/check-email",
      "/auth/check-phone",
      "/child-auth/",
    ];
    if (AUTH_BYPASS_PATTERNS.some((p) => requestUrl.includes(p))) {
      return config;
    }

    try {
      // hybridAuth는 환경에 따라 Native Bridge 또는 localStorage에서 토큰 조회
      const tokenInfo = await hybridAuth.getToken();

      // === 로그인 가드 ===
      // 토큰이 없고 Public API도 아니면 즉시 차단하여 서버 왕복 방지
      if (!tokenInfo?.accessToken && !isPublic) {
        throw new AuthRequiredError(requestUrl, requestId);
      }

      if (tokenInfo?.accessToken) {
        // [2026-05-13 Phase B-1] 토큰 만료 판단 단일 SoT(`@/lib/token-utils`) 사용.
        //   - 즉시 만료: buffer=0 (현 시점 이후)
        //   - 선제 갱신: default buffer=5분
        const expiry = getTokenExpiryMs(tokenInfo.accessToken);
        const isExpired = expiry ? Date.now() > expiry : false;

        if (isExpired && tokenInfo.refreshToken) {
          const newToken = await refreshAccessToken();
          if (newToken) {
            config.headers.Authorization = `Bearer ${newToken}`;
            return config;
          }
          // 토큰이 곧 만료되면 선제적 갱신 시도
        } else if (isTokenExpired(tokenInfo.accessToken)) {
          const newToken = await preemptiveTokenRefresh();
          if (newToken) {
            config.headers.Authorization = `Bearer ${newToken}`;
            return config;
          }
        }

        // 유효한 토큰 사용 (만료되지 않은 경우)
        if (!isExpired) {
          config.headers.Authorization = `Bearer ${tokenInfo.accessToken}`;
        }
      }
    } catch (err) {
      // AuthRequiredError는 rethrow하여 요청을 차단하고 onError 훅이 감지하도록 함
      if (err instanceof AuthRequiredError) {
        finishLoadingDataTracking(config);
        throw err;
      }
      // 그 외 토큰 조회 실패는 swallow — auth 헤더 없이 진행 (Public 엔드포인트 대응)
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);


// 응답 인터셉터: 401 에러 시 토큰 자동 갱신 + Lifecycle 후처리
apiClient.interceptors.response.use(
  (response) => {
    finishLoadingDataTracking(response.config);
    // 서버 시각 동기화 — 출석 윈도우 등 분 단위 판정이 기기 시계 대신 서버 기준을 쓰도록.
    recordServerTime(response.headers?.["x-server-time"] as string | undefined);
    // === API Lifecycle — 성공 응답 후처리 ===
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
  async (error: AxiosError<ApiError>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
      _lifecycle?: LifecycleRequestContext;
    };
    finishLoadingDataTracking(originalRequest);

    // 응답 본문의 errorCode 추출 — 백엔드 AllExceptionsFilter 는 `errorCode` 필드로,
    // 일부 경로는 `code` 필드로 전달하므로 둘 다 확인한다.
    const responseData = error.response?.data as
      | (ApiError & { errorCode?: string })
      | undefined;
    const responseErrorCode = responseData?.errorCode ?? responseData?.code;

    const status = error.response?.status;

    // 계정이 삭제·탈퇴된 경우 — refresh 가 성공해도 다음 호출에서 또 401.
    const isInvalidAccount =
      responseErrorCode === "USER_NOT_FOUND" ||
      responseErrorCode === "WITHDRAWN_ACCOUNT";
    // 인증 엔드포인트(login/refresh/register)의 401은 토큰 갱신 시도하지 않음.
    const authEndpoints = ["/auth/refresh", "/auth/login", "/auth/register"];
    const isAuthEndpoint = authEndpoints.some((endpoint) =>
      originalRequest?.url?.includes(endpoint),
    );

    // [2026-06-05] 401 이고 refresh 재시도가 가능하면 onError(=teamplus:api-unauthorized)
    //   발사를 refresh 결과가 나올 때까지 **보류**한다.
    //   기존엔 401 시점에 즉시 api-unauthorized → SessionExpiredModal 이 떠서, refresh 가
    //   성공해도 사용자가 로그아웃되던 "주기적 자동 로그아웃" 회귀가 있었다.
    const is401Retryable =
      status === 401 &&
      !!originalRequest &&
      !originalRequest._retry &&
      !isInvalidAccount &&
      !isAuthEndpoint;

    // === API Lifecycle — 에러 후처리 발사 헬퍼 ===
    const fireOnError = () => {
      const lifecycleCtx = originalRequest?._lifecycle;
      if (!lifecycleCtx) return;
      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      void apiLifecycle.runOnError({
        ...lifecycleCtx,
        status,
        durationMs: Math.round(now - lifecycleCtx.startAt),
        serverTime: error.response?.headers?.["x-server-time"] as
          | string
          | undefined,
        error,
        message: responseData?.message ?? error.message,
        code: responseErrorCode,
      });
    };

    // refresh 재시도 대상이 아니면 즉시 발사 (비401·재시도불가·인증엔드포인트·계정무효 등).
    if (!is401Retryable) {
      fireOnError();
    }

    // 계정 삭제·탈퇴 — 토큰 정리 후 /login 위임 (onError 는 위에서 이미 발사됨).
    if (status === 401 && isInvalidAccount) {
      try {
        await hybridAuth.clearToken();
      } catch {
        // 토큰 정리 실패는 무시
      }
      if (typeof document !== "undefined") {
        document.cookie = "teamplus_access_token=; path=/; max-age=0";
        document.cookie = "teamplus_refresh_token=; path=/; max-age=0";
      }
      return Promise.reject(error);
    }

    // 인증 엔드포인트 401 은 갱신 시도 없이 전파.
    if (status === 401 && isAuthEndpoint) {
      return Promise.reject(error);
    }

    // 401 + 재시도 가능 → 토큰 갱신 시도 (성공 시 api-unauthorized 미발사).
    if (is401Retryable) {
      originalRequest._retry = true;

      try {
        // 통합된 갱신 함수 사용 (race condition 방지)
        const newToken = await refreshAccessToken();

        if (!newToken) {
          // 갱신 실패 — api-unauthorized(reason=expired) 발사만 한다.
          //   SessionExpiredGate 가 자동 로그아웃 안내 모달을 띄우고, 사용자가
          //   '재로그인' 버튼으로 직접 이동을 선택한다. 여기서 window.location 으로
          //   하드 리다이렉트하면 모달이 한순간 깜빡이고 곧바로 /login 으로 튕기는
          //   문제가 있어 제거했다 (안내 모달 일원화).
          fireOnError();
          return Promise.reject(error);
        }

        // 원래 요청 재시도 (갱신 성공 → 로그아웃 이벤트 발사하지 않음).
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
        }
        return apiClient(originalRequest);
      } catch (refreshError) {
        fireOnError();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);

// ============================================
// Axios 에러를 표준 ApiError로 변환
// ============================================
/**
 * 백엔드 validation error 배열에서 사용자에게 표시할 메시지를 추출한다.
 * - 에러 1건: 그대로 사용
 * - 에러 N건: "첫 번째 메시지 (외 N-1건)"
 * - 에러 없음: null 반환
 */
function extractValidationMessage(
  errors: unknown,
): {
  message: string;
  fieldErrors: Array<{ field: string; message: string }>;
} | null {
  if (!Array.isArray(errors) || errors.length === 0) {
    return null;
  }
  const fieldErrors = errors.filter(
    (e): e is { field: string; message: string } =>
      typeof e === "object" &&
      e !== null &&
      typeof (e as Record<string, unknown>).message === "string",
  );
  if (fieldErrors.length === 0) {
    return null;
  }
  const first = fieldErrors[0].message;
  const message =
    fieldErrors.length === 1
      ? first
      : `${first} (외 ${fieldErrors.length - 1}건)`;
  return { message, fieldErrors };
}

function convertAxiosError(error: AxiosError<ApiError>): ApiError {
  // 서버 응답이 있는 경우
  if (error.response) {
    const { status, data } = error.response;

    // 서버에서 표준 형식으로 응답한 경우
    // NestJS는 'code' 또는 'errorCode' 필드를 사용할 수 있음
    if (
      data &&
      typeof data === "object" &&
      ("code" in data || "errorCode" in data) &&
      "message" in data
    ) {
      const errorData = data as unknown as Record<string, unknown>;

      // DTO 검증(class-validator) 실패 시 백엔드가 message를 "입력값 검증에 실패했습니다."로
      // 덮어쓰고 실제 field-level 에러는 errors 배열에 담는다. 여기서 그 배열을 풀어 사용자에게
      // 의미있는 첫 번째 메시지를 노출한다. (backend: teamplus-backend/src/common/filters/http-exception.filter.ts)
      const validation = extractValidationMessage(errorData.errors);
      const finalMessage = validation ? validation.message : data.message;

      return {
        code: (errorData.errorCode as string) ?? data.code,
        message: finalMessage,
        statusCode: status,
        details: validation
          ? { fieldErrors: validation.fieldErrors }
          : (errorData.details as Record<string, unknown> | undefined),
      };
    }

    // HTTP 상태 코드로 에러 생성
    // 서버 메시지 추출 (타입 가드 이후에도 안전하게)
    const serverMessage =
      data && typeof data === "object" && "message" in data
        ? String((data as Record<string, unknown>).message)
        : undefined;
    return httpStatusToApiError(status, serverMessage);
  }

  // 네트워크 오류 (서버 응답 없음)
  if (error.code === "ECONNABORTED") {
    return createApiError(ApiErrorCode.TIMEOUT_ERROR);
  }

  if (error.code === "ERR_NETWORK") {
    return createApiError(ApiErrorCode.NETWORK_ERROR);
  }

  return createApiError(ApiErrorCode.NETWORK_ERROR, error.message);
}

// ============================================
// 기본 Retry 옵션 (웹 브라우저용)
// ============================================
const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  retryableStatusCodes: [500, 502, 503, 504],
  useJitter: true,
};

// ============================================
// Axios 직접 호출 (경로 A: Web → Backend)
// ============================================
export async function apiRequest<T>(
  config: AxiosRequestConfig & { retry?: RetryOptions | boolean },
): Promise<ApiResponse<T>> {
  // Native 환경: api 객체로 라우팅 (Flutter Bridge 경유)
  // 이렇게 하면 Android 에뮬레이터에서 localhost 대신 Flutter Dio의
  // 올바른 호스트(AppEnvironment)로 자동 라우팅됨
  if (isNativeApp()) {
    const method = (config.method ?? "GET").toUpperCase();
    const url = config.url ?? "";
    const options: RequestOptions = {
      params: config.params,
      retry: config.retry,
    };

    switch (method) {
      case "GET":
        return api.get<T>(url, options);
      case "POST":
        return api.post<T>(url, config.data, options);
      case "PUT":
        return api.put<T>(url, config.data, options);
      case "PATCH":
        return api.patch<T>(url, config.data, options);
      case "DELETE":
        return api.delete<T>(url, options);
      default:
        return {
          success: false,
          error: createApiError(
            ApiErrorCode.UNKNOWN_ERROR,
            `Unsupported HTTP method: ${method}`,
          ),
        };
    }
  }

  const { retry, ...axiosConfig } = config;

  // Retry 옵션 설정
  const shouldRetry = retry !== false;
  const retryOptions: RetryOptions | undefined = shouldRetry
    ? typeof retry === "object"
      ? { ...DEFAULT_RETRY_OPTIONS, ...retry }
      : DEFAULT_RETRY_OPTIONS
    : undefined;

  const executeRequest = async () => {
    const response = await apiClient.request<T>(axiosConfig);
    return response;
  };

  try {
    const response = retryOptions
      ? await withRetry(executeRequest, {
          ...retryOptions,
        })
      : await executeRequest();

    return unwrapEnvelope<T>(response.data);
  } catch (error) {
    // 전처리 가드에서 throw된 AuthRequiredError — 표준 ApiError로 변환 후 lifecycle 통지
    if (error instanceof AuthRequiredError) {
      void apiLifecycle.runOnError({
        requestId: error.requestId ?? "unknown",
        method: (axiosConfig.method ?? "GET").toUpperCase(),
        url: axiosConfig.url ?? error.url,
        startAt: Date.now(),
        durationMs: 0,
        platform: apiLifecycle.getPlatform(),
        clientVersion: apiLifecycle.getClientVersion(),
        meta: {},
        status: 401,
        error,
        message: error.message,
        code: AUTH_REQUIRED_CODE,
      });
      return {
        success: false,
        error: {
          code: AUTH_REQUIRED_CODE,
          message: error.message,
          statusCode: 401,
        },
      };
    }
    const axiosError = error as AxiosError<ApiError>;
    return {
      success: false,
      error: convertAxiosError(axiosError),
    };
  }
}

// ============================================
// 응답 envelope unwrap
// ============================================
/**
 * [2026-05-14 fix] 백엔드 응답 envelope unwrap.
 *
 * 백엔드 NestJS ResponseInterceptor 가 모든 응답을 `{success, data, error}` 형태로
 * wrapping 하므로 axios `response.data` 는 이미 envelope 형태이다. apiRequest 가
 * 이를 그대로 `{success: true, data: response.data}` 로 반환하면 호출자는
 * `response.data.user` 대신 `response.data.data.user` 를 접근해야 하는 이중 wrap
 * 회귀가 발생해 로그인을 비롯한 모든 envelope 응답 처리가 실패한다.
 *
 * Native Bridge 경로(native-bridge.ts:1440-1467)는 이미 unwrap 처리가 적용되어 있어
 * Web axios 경로에도 동일 처리를 한다. envelope 가 아닌 raw 응답은 그대로 통과.
 */
function unwrapEnvelope<T>(rawBody: unknown): ApiResponse<T> {
  if (
    rawBody &&
    typeof rawBody === "object" &&
    !Array.isArray(rawBody) &&
    "success" in rawBody &&
    typeof (rawBody as { success?: unknown }).success === "boolean"
  ) {
    const envelope = rawBody as {
      success: boolean;
      data?: T;
      error?: ApiError;
    };
    if (envelope.success === false) {
      return {
        success: false,
        error:
          envelope.error ??
          createApiError(
            ApiErrorCode.UNKNOWN_ERROR,
            "알 수 없는 오류가 발생했습니다.",
          ),
      };
    }
    return { success: true, data: envelope.data };
  }
  // envelope 형식 아닌 raw 응답은 그대로 통과 (배열·primitive 응답 등).
  return { success: true, data: rawBody as T };
}

// ============================================
// Native API 에러 변환 유틸리티
// ============================================
function convertNativeError(error: unknown): ApiError {
  // ApiRequestError인 경우 (native-bridge.ts에서 생성)
  if (error instanceof ApiRequestError) {
    return error.apiError;
  }

  // 일반 Error인 경우
  if (error instanceof Error) {
    return createApiError(ApiErrorCode.UNKNOWN_ERROR, error.message);
  }

  // 기타 에러
  return createApiError(ApiErrorCode.UNKNOWN_ERROR, String(error));
}

/**
 * Native Bridge 경로가 실패했을 때 Web axios로 fallback할지 판단.
 * 구조적 실패(타임아웃/네트워크/Bridge 미가용)에 한정 — 4xx 같은 서버 판정은 그대로 전파.
 */
function shouldFallbackToWebAxios(err: ApiError): boolean {
  if (!err?.code) return false;
  // TIMEOUT_ERROR: Bridge가 응답을 못 돌려줌 (Flutter hang 등)
  // NETWORK_ERROR: Bridge 자체 사용 불가 or 통신 오류
  return (
    err.code === ApiErrorCode.TIMEOUT_ERROR ||
    err.code === ApiErrorCode.NETWORK_ERROR
  );
}

/**
 * Web axios 직접 호출 (Native 분기 우회)
 * Bridge fallback 전용 — Native 경로 실패 시 WebView 내부에서 직접 HTTP 호출.
 */
async function apiRequestWebDirect<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  data?: unknown,
  options?: RequestOptions,
): Promise<ApiResponse<T>> {
  const { retry, ...axiosConfig } = options ?? {};
  const shouldRetry = retry !== false;
  const retryOptions: RetryOptions | undefined = shouldRetry
    ? typeof retry === "object"
      ? { ...DEFAULT_RETRY_OPTIONS, ...retry }
      : DEFAULT_RETRY_OPTIONS
    : undefined;

  const executeRequest = async () =>
    apiClient.request<T>({ ...axiosConfig, method, url, data });

  try {
    const response = retryOptions
      ? await withRetry(executeRequest, retryOptions)
      : await executeRequest();
    return unwrapEnvelope<T>(response.data);
  } catch (error) {
    const axiosError = error as AxiosError<ApiError>;
    return { success: false, error: convertAxiosError(axiosError) };
  }
}

// ============================================
// 로그인 가드 (Native Bridge 경로 공통 선행 체크)
// ============================================
/**
 * 토큰 없음 + Public API 아님 → AUTH_REQUIRED 에러 응답 즉시 반환.
 * 토큰 조회는 hybridAuth (Native: FlutterBridge / Web: localStorage) 동일 경로 사용.
 */
async function ensureAuthenticatedOrPublic<T>(
  url: string,
): Promise<ApiResponse<T> | null> {
  if (isPublicApiPath(url)) return null;
  try {
    const tokenInfo = await hybridAuth.getToken();
    if (tokenInfo?.accessToken) return null;
  } catch {
    // 토큰 조회 자체 실패 — 미인증으로 간주
  }
  // lifecycle onError 훅에도 통지 (로그인 유도 담당)
  void apiLifecycle.runOnError({
    requestId: generateRequestId(),
    method: "AUTH_GUARD",
    url,
    startAt: Date.now(),
    durationMs: 0,
    platform: apiLifecycle.getPlatform(),
    clientVersion: apiLifecycle.getClientVersion(),
    meta: { source: "pre-request-guard" },
    status: 401,
    error: new AuthRequiredError(url),
    message: "로그인이 필요합니다.",
    code: AUTH_REQUIRED_CODE,
  });
  return {
    success: false,
    error: {
      code: AUTH_REQUIRED_CODE,
      message: "로그인이 필요합니다.",
      statusCode: 401,
    },
  };
}

// ============================================
// 통합 API 객체 (경로 자동 선택)
// ============================================
export const api = {
  /**
   * GET 요청
   * @param url - API 엔드포인트
   * @param options - 요청 옵션 (async: boolean)
   *
   * @example
   * // 비동기 (기본값)
   * const teams = await api.get('/teams/my/list');
   *
   * // 동기
   * const profile = await api.get('/auth/profile', { async: false });
   */
  async get<T>(url: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    // [추가 2026-05-16] 단일 진입점에서 in-flight GET dedup → Strict Mode 중복 호출 차단
    return dedupInFlightGet<T>(url, options?.params, async () => {
      const guard = await ensureAuthenticatedOrPublic<T>(url);
      if (guard) return guard;

      if (isNativeApp()) {
        return withLoadingDataTracking("GET", url, async () => {
          try {
            const data = await nativeApi.get<T>(url, options?.params, {
              async: options?.async ?? true,
            });
            return { success: true, data };
          } catch (error) {
            const apiError = convertNativeError(error);
            // Bridge 타임아웃/네트워크 에러 시 Web axios로 자동 fallback (Flutter hang 대응)
            if (shouldFallbackToWebAxios(apiError)) {
              if (process.env.NODE_ENV !== "production") {
                devLog(
                  "[api.get] Native bridge failed, falling back to web axios",
                  { url, code: apiError.code },
                );
              }
              return apiRequestWebDirect<T>("GET", url, undefined, options);
            }
            return { success: false, error: apiError };
          }
        });
      }
      return apiRequest<T>({
        ...options,
        method: "GET",
        url,
        retry: options?.retry,
      });
    });
  },

  /**
   * POST 요청
   */
  async post<T>(
    url: string,
    data?: unknown,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> {
    const guard = await ensureAuthenticatedOrPublic<T>(url);
    if (guard) return guard;

    if (isNativeApp()) {
      return withLoadingDataTracking("POST", url, async () => {
        try {
          const result = await nativeApi.post<T>(url, data, {
            async: options?.async ?? true,
          });
          return { success: true, data: result };
        } catch (error) {
          const apiError = convertNativeError(error);
          if (shouldFallbackToWebAxios(apiError)) {
            if (process.env.NODE_ENV !== "production") {
              devLog(
                "[api.post] Native bridge failed, falling back to web axios",
                { url, code: apiError.code },
              );
            }
            return apiRequestWebDirect<T>("POST", url, data, options);
          }
          return { success: false, error: apiError };
        }
      });
    }
    return apiRequest<T>({
      ...options,
      method: "POST",
      url,
      data,
      retry: options?.retry,
    });
  },

  /**
   * PUT 요청
   */
  async put<T>(
    url: string,
    data?: unknown,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> {
    const guard = await ensureAuthenticatedOrPublic<T>(url);
    if (guard) return guard;

    if (isNativeApp()) {
      return withLoadingDataTracking("PUT", url, async () => {
        try {
          const result = await nativeApi.put<T>(url, data, {
            async: options?.async ?? true,
          });
          return { success: true, data: result };
        } catch (error) {
          const apiError = convertNativeError(error);
          if (shouldFallbackToWebAxios(apiError)) {
            if (process.env.NODE_ENV !== "production") {
              devLog(
                "[api.put] Native bridge failed, falling back to web axios",
                { url, code: apiError.code },
              );
            }
            return apiRequestWebDirect<T>("PUT", url, data, options);
          }
          return { success: false, error: apiError };
        }
      });
    }
    return apiRequest<T>({
      ...options,
      method: "PUT",
      url,
      data,
      retry: options?.retry,
    });
  },

  /**
   * PATCH 요청
   */
  async patch<T>(
    url: string,
    data?: unknown,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> {
    const guard = await ensureAuthenticatedOrPublic<T>(url);
    if (guard) return guard;

    if (isNativeApp()) {
      return withLoadingDataTracking("PATCH", url, async () => {
        try {
          const result = await nativeApi.patch<T>(url, data, {
            async: options?.async ?? true,
          });
          return { success: true, data: result };
        } catch (error) {
          const apiError = convertNativeError(error);
          if (shouldFallbackToWebAxios(apiError)) {
            if (process.env.NODE_ENV !== "production") {
              devLog(
                "[api.patch] Native bridge failed, falling back to web axios",
                { url, code: apiError.code },
              );
            }
            return apiRequestWebDirect<T>("PATCH", url, data, options);
          }
          return { success: false, error: apiError };
        }
      });
    }
    return apiRequest<T>({
      ...options,
      method: "PATCH",
      url,
      data,
      retry: options?.retry,
    });
  },

  /**
   * DELETE 요청
   */
  async delete<T>(
    url: string,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> {
    const guard = await ensureAuthenticatedOrPublic<T>(url);
    if (guard) return guard;

    if (isNativeApp()) {
      return withLoadingDataTracking("DELETE", url, async () => {
        try {
          const resultRaw = await nativeApi.delete<T>(url, {
            async: options?.async ?? true,
          });
          return { success: true, data: resultRaw };
        } catch (error) {
          const apiError = convertNativeError(error);
          if (shouldFallbackToWebAxios(apiError)) {
            if (process.env.NODE_ENV !== "production") {
              devLog(
                "[api.delete] Native bridge failed, falling back to web axios",
                { url, code: apiError.code },
              );
            }
            return apiRequestWebDirect<T>("DELETE", url, undefined, options);
          }
          return { success: false, error: apiError };
        }
      });
    }
    return apiRequest<T>({
      ...options,
      method: "DELETE",
      url,
      retry: options?.retry,
    });
  },
};

export default api;
