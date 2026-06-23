"use client";

/**
 * Auth Context
 * 인증 상태 관리 컨텍스트
 */

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useNavigation } from "@/components/ui/NavLink";
import {
  getDashboardPathByUserType,
  normalizeUserType,
} from "@/lib/auth-routing";
import authService, {
  type AuthUser,
  type LoginRequest,
  type SignupRequest,
  type LoginResponse,
  type SignupResponse,
} from "@/services/auth";
import { hybridAuth } from "@/services/hybrid-auth";
import {
  decodeAccessTokenClaims,
  isAccessTokenExpired,
} from "@/lib/jwt";
import { ensureFreshAccessToken } from "@/services/api-client";
import { resetAuthGuardRedirectFlag } from "@/services/api-lifecycle-defaults";
import { TOKEN_EXPIRED_EVENT } from "@/services/web-token-storage";
import { invalidateAppMenusCache } from "@/hooks/useAppMenus";
import { clearSelectedChildStorage } from "@/lib/selected-child-storage";
import type { ApiResponse, UserType } from "@/types";
import { devError, devLog, devWarn } from "@/lib/logger";

// ============================================
// 헬퍼 함수
// ============================================

function normalizeAuthUser(user: AuthUser): AuthUser {
  // v2 (2026-04-22): `?? 'parent'` 하드코딩 폴백 제거.
  // 백엔드 UserType enum 은 9개(SYSTEM/OPER/ADMIN/DIRECTOR/ACADEMY_DIRECTOR/
  // COACH/PARENT/TEEN/CHILD) 이며, 여기서 알 수 없는 값을 'parent' 로 덮어쓰면
  // 실제로 ADMIN/SYSTEM/OPER 로 로그인해도 sessionStorage 에 userType='parent'
  // 로 영구 저장되어 이후 모든 리다이렉트가 /parent 로 가는 치명적 버그가 발생한다.
  // 이제는 원본 소문자 값을 그대로 유지하고, 정규화가 실패한 경우에도 원본을 보존해
  // getDashboardPathByUserType 의 fallback('/') 으로 처리한다.
  const normalizedUserType =
    normalizeUserType(user.userType) ??
    (user.userType?.toString().toLowerCase() as UserType);
  return {
    ...user,
    userType: normalizedUserType,
  };
}

// ============================================
// Context 타입 정의
// ============================================

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: (data: LoginRequest) => Promise<ApiResponse<LoginResponse>>;
  signup: (data: SignupRequest) => Promise<ApiResponse<SignupResponse>>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  clearError: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

// ============================================
// Provider 컴포넌트
// ============================================

interface AuthProviderProps {
  children: ReactNode;
}

// 모듈 스코프 싱글턴: AuthProvider 다중 마운트(React StrictMode 포함) 시에도
// 단 한 번만 인증 로드가 수행되도록 보장하기 위해 모듈 레벨에서 관리한다.
let globalLoadAttempted = false;
let activeLoadPromise: Promise<void> | null = null;

// 세션 스토리지 키
const AUTH_CACHE_KEY = "teamplus_auth_profile";

export function resetAuthStateForTests(): void {
  globalLoadAttempted = false;
  activeLoadPromise = null;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { replace } = useNavigation();
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
    error: null,
  });

  const hasAttemptedLoad = useRef(false);

  /**
   * 사용자 정보 로드 (중복 호출 및 세션 캐싱 최적화)
   */
  const loadUser = useCallback(async (forceRefresh = false) => {
    // 1. 이미 시도했고 강제 새로고침이 아니면 스킵
    if (!forceRefresh && (globalLoadAttempted || hasAttemptedLoad.current)) {
      setState((prev) =>
        prev.isLoading ? { ...prev, isLoading: false } : prev,
      );
      return;
    }

    // 2. 이미 진행 중인 요청이 있으면 해당 Promise 공유.
    //    ⚠️ resolved 된 Promise 가 참조로 남아있는 경우 대비: 대기 후 state 동기화 강제.
    //    (HMR / Fast Refresh 시 activeLoadPromise 가 stale 상태로 남아 "로딩 중..." 에서 멈추던 이슈 방어)
    if (activeLoadPromise) {
      await activeLoadPromise;
      setState((prev) =>
        prev.isLoading ? { ...prev, isLoading: false } : prev,
      );
      return;
    }

    // 3. 로드 시작
    const performLoad = async () => {
      if (process.env.NODE_ENV === "development") {
        devLog("[AuthContext] loadUser 시작");
      }

      try {
        // 토큰이 없으면 캐시가 남아 있어도 비로그인 상태로 처리
        const tokenInfo = await hybridAuth.getToken();
        if (!tokenInfo?.accessToken) {
          sessionStorage.removeItem(AUTH_CACHE_KEY);
          setState({
            user: null,
            isLoading: false,
            isAuthenticated: false,
            error: null,
          });
          return;
        }

        // 토큰이 있을 때만 세션 캐시 사용
        if (!forceRefresh) {
          try {
            const cached = sessionStorage.getItem(AUTH_CACHE_KEY);
            if (cached) {
              const cachedUser = normalizeAuthUser(JSON.parse(cached));
              setState({
                user: cachedUser,
                isLoading: false,
                isAuthenticated: true,
                error: null,
              });
              if (process.env.NODE_ENV === "development") {
                devLog("[AuthContext] 캐시된 프로필 사용");
              }
              return;
            }
          } catch (e) {
            devError("[AuthContext] 캐시 읽기 실패:", e);
            sessionStorage.removeItem(AUTH_CACHE_KEY);
          }
        }

        // [2026-05-30 perf · WV-01] 캐시 미스라도 access token 을 동기 디코드해
        //   즉시 unblock. 역할 layout 의 LoadingPuck 가 getProfile 왕복(120~600ms)
        //   동안 화면을 막던 것을 토큰 디코드(<1ms)로 해제한다. middleware 가 이미
        //   동일 토큰을 같은 방식(atob + exp + RBAC)으로 검증·통과시킨 상태이므로
        //   신규 노출 경로는 없다. avatarUrl/email/updatedAt 등 미포함 필드는 아래
        //   getProfile() 가 곧바로 보정하며, getProfile 실패 시의 미인증 처리는
        //   기존 분기를 그대로 따른다(임시 user 자동 revert). forceRefresh(역할/권한
        //   재조회)일 때는 임시값을 건너뛰고 정식 await 만 수행한다.
        if (!forceRefresh) {
          const claims = decodeAccessTokenClaims(tokenInfo.accessToken);
          if (claims && !isAccessTokenExpired(claims)) {
            const tempUser = normalizeAuthUser({
              id: claims.sub,
              email: claims.email ?? "",
              firstName: "",
              lastName: "",
              name: claims.name ?? "",
              userType: claims.userType as UserType,
              isVerified: true,
              avatarUrl: null,
              createdAt: "",
              updatedAt: null,
            });
            setState({
              user: tempUser,
              isLoading: false,
              isAuthenticated: true,
              error: null,
            });
          }
        }

        const response = await authService.getProfile();

        if (response.success && response.data) {
          const normalizedUser = normalizeAuthUser(response.data);

          // 세션 스토리지에 UI 표시에 필요한 필드 캐시
          // 2026-04-22: email 추가 — 캐시 복원 후 drawer/profile 이메일 "미등록" 표시 방지.
          //   sessionStorage는 탭 단위 격리 + XSS 방어는 DOMPurify로 별도 보장 → 민감도 수용 가능.
          sessionStorage.setItem(
            AUTH_CACHE_KEY,
            JSON.stringify({
              id: normalizedUser.id,
              name: normalizedUser.name,
              email: normalizedUser.email,
              userType: normalizedUser.userType,
              avatarUrl: normalizedUser.avatarUrl,
              // updatedAt 캐싱 — 프로필 사진 변경 시 cache-bust 의 기준값.
              // 다른 탭/페이지 진입 시 stale 캐시로 인한 이전 사진 표시 방지.
              updatedAt: normalizedUser.updatedAt,
            }),
          );

          setState({
            user: normalizedUser,
            isLoading: false,
            isAuthenticated: true,
            error: null,
          });
        } else {
          setState({
            user: null,
            isLoading: false,
            isAuthenticated: false,
            error:
              response.error?.statusCode === 429
                ? "요청이 너무 많습니다."
                : null,
          });
          sessionStorage.removeItem(AUTH_CACHE_KEY);
        }
      } catch (err) {
        setState({
          user: null,
          isLoading: false,
          isAuthenticated: false,
          error: "인증 확인 실패",
        });
        sessionStorage.removeItem(AUTH_CACHE_KEY);
      } finally {
        globalLoadAttempted = true;
        hasAttemptedLoad.current = true;
        activeLoadPromise = null;
      }
    };

    activeLoadPromise = performLoad();
    return activeLoadPromise;
  }, []);

  /**
   * 초기 로드
   */
  useEffect(() => {
    let isMounted = true;
    const initAuth = async () => {
      if (!isMounted) return;
      await loadUser();
    };
    initAuth();
    return () => {
      isMounted = false;
    };
  }, [loadUser]);

  /**
   * 토큰 만료 / API 인증 실패 이벤트 리스너
   *
   * - `teamplus:token-expired`: 토큰 저장소에서 만료 감지
   * - `teamplus:api-unauthorized`: apiLifecycle onError 훅이 401/AUTH_REQUIRED 감지
   *   (로그인 페이지 리다이렉트는 훅에서 이미 수행 — 여기서는 내부 상태만 정리)
   */
  useEffect(() => {
    const clearAuthState = () => {
      sessionStorage.removeItem(AUTH_CACHE_KEY);
      globalLoadAttempted = false;
      hasAttemptedLoad.current = false;
      setState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        error: null,
      });
    };

    const handleTokenExpired = () => {
      clearAuthState();
      // 공개 진입점(/signup, /identity, /onboarding, /splash, /)에서는
      // /login 으로 이동하지 않는다. 이전 세션의 만료 access token 이
      // storage 에 남아있는 상태로 비로그인 페이지의 API 호출이 trigger
      // 되면 첫 시도에서 폼이 통째로 /login 으로 강제 이동되던 회귀 방지.
      if (typeof window !== "undefined") {
        const pathname = window.location.pathname;
        if (
          pathname === "/" ||
          pathname.startsWith("/splash") ||
          pathname.startsWith("/onboarding") ||
          pathname.startsWith("/signup") ||
          pathname.startsWith("/identity")
        ) {
          return;
        }
      }
      replace("/login");
    };

    const handleApiUnauthorized = (e: Event) => {
      const reason = (e as CustomEvent<{ reason?: string }>).detail?.reason;
      // 세션 만료(expired)는 SessionExpiredModal(자동 로그아웃 안내)이 소유한다.
      //   여기서 auth 상태를 비우면 layout 가드(useRequireRole/useRequireAuth)가
      //   isAuthenticated=false 를 감지해 /login 으로 soft navigate → 모달이
      //   한순간 깜빡이고 화면이 튕긴다. 모달의 '재로그인'(하드 이동) 또는
      //   '닫기'(현재 화면 유지)에 판단을 맡기고 상태는 건드리지 않는다.
      if (reason === "expired") return;
      // required(미인증 접근) 등은 기존대로 정리 — lifecycle 훅이 리다이렉트 수행.
      clearAuthState();
    };

    window.addEventListener(TOKEN_EXPIRED_EVENT, handleTokenExpired);
    window.addEventListener("teamplus:api-unauthorized", handleApiUnauthorized);
    return () => {
      window.removeEventListener(TOKEN_EXPIRED_EVENT, handleTokenExpired);
      window.removeEventListener(
        "teamplus:api-unauthorized",
        handleApiUnauthorized,
      );
    };
  }, [replace]);

  /**
   * 백그라운드 토큰 갱신 — cookie(미들웨어용) 와 localStorage(client용) 동기화 보장.
   *
   * 2026-05-08: access token 만료(15분) 가 cookie 에 반영되어 사용자가 메뉴 클릭 시
   * 미들웨어가 `/login?redirect=...` 로 보내는 회귀 차단. API 호출이 없는 상태에서도
   * 4분마다 선제적 갱신을 시도해 cookie JWT 가 항상 유효하도록 한다.
   */
  useEffect(() => {
    if (!state.isAuthenticated) return;
    const intervalMs = 4 * 60 * 1000; // 4분
    const id = setInterval(() => {
      void ensureFreshAccessToken().catch(() => {
        // 실패는 무시 — 다음 사이클이나 401 시점에 재시도됨
      });
    }, intervalMs);
    // 마운트 직후 1회 즉시 실행 — 캐시 복원 후 첫 네비게이션이 타이트할 때 보호
    void ensureFreshAccessToken().catch(() => {});
    return () => clearInterval(id);
  }, [state.isAuthenticated]);

  /**
   * 로그인
   */
  const login = useCallback(
    async (data: LoginRequest): Promise<ApiResponse<LoginResponse>> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      const response = await authService.login(data);

      // 2026-04-29: 자녀 PIN 인증 폐지로 childPinGate early-return 제거.
      // 자녀(CHILD/TEEN) 미승인 케이스는 백엔드가 BadRequest 로 차단(success=false 처리)하므로
      // 본 분기에 도달하지 않음. 모든 성공 응답은 일반 토큰/user 흐름으로 처리.
      if (response.success && response.data && response.data.user) {
        // 로그인 성공 시 리다이렉트 플래그 리셋 (apiLifecycle 가드 루프)
        resetAuthGuardRedirectFlag();

        const normalizedUser = normalizeAuthUser(response.data.user);

        // 캐시 업데이트 (loadUser 저장 지점과 동일 필드 유지)
        sessionStorage.setItem(
          AUTH_CACHE_KEY,
          JSON.stringify({
            id: normalizedUser.id,
            name: normalizedUser.name,
            email: normalizedUser.email,
            userType: normalizedUser.userType,
            avatarUrl: normalizedUser.avatarUrl,
          }),
        );

        globalLoadAttempted = true;
        hasAttemptedLoad.current = true;
        setState({
          user: normalizedUser,
          isLoading: false,
          isAuthenticated: true,
          error: null,
        });
      } else {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: response.error?.message || "로그인에 실패했습니다.",
        }));
      }
      return response;
    },
    [],
  );

  /**
   * 회원가입
   */
  const signup = useCallback(
    async (data: SignupRequest): Promise<ApiResponse<SignupResponse>> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const response = await authService.signup(data);
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: response.success
            ? null
            : response.error?.message || "회원가입에 실패했습니다.",
        }));
        return response;
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: "회원가입에 실패했습니다.",
        }));
        throw err;
      }
    },
    [],
  );

  /**
   * 로그아웃
   *
   * 처리 순서가 중요하다 — (common)/(coach)/(parent) 그룹 layout 의 useRequireAuth 가드는
   * `isLoading: true` 또는 `isAuthenticated: false` 일 때 빈 div / null 을 렌더한다.
   * 따라서 다음 순서를 지켜 "로그아웃 중 흰 화면 멈춤" 버그를 방지한다.
   *
   *  1) `setState({ isLoading: true })` 를 호출하지 않는다 — 호출하면 layout 이 빈 회색
   *     div 를 렌더한 채로 `await authService.logout()` 응답을 기다리게 되며, 백엔드가
   *     hang/throw 하면 `isLoading: false` 복귀가 영영 일어나지 않아 화면이 멈춘다.
   *  2) 클라이언트 상태(sessionStorage·메뉴 캐시·React state) 를 먼저 정리한다 —
   *     `replace('/login')` 직후 /login 페이지의 useGuestOnly 가드가 발화할 때
   *     `isAuthenticated` 가 아직 true 면 즉시 대시보드로 되돌아가는 race 가 발생하므로
   *     반드시 setState 를 replace 전에 수행한다.
   *  3) `replace('/login')` — useNavigation 의 startLoading 이 풀스크린 로더를 표시하여
   *     layout 의 `if (!isAuthenticated) return null` 흰 영역을 가린다.
   *  4) 백엔드 `/auth/logout` 은 `try/catch` 로 감싸 실패/hang 이 사용자 흐름을 막지 않게 한다.
   *     서버 세션 정리는 best-effort 이며, 클라이언트 로컬 토큰은 authService.logout 내부에서
   *     hybridAuth.clearToken() 으로 이미 처리된다.
   */
  const logout = useCallback(async () => {
    // 1) 로컬 캐시·React state 정리 (네비게이션 보다 먼저 — useGuestOnly race 방지)
    sessionStorage.removeItem(AUTH_CACHE_KEY);
    invalidateAppMenusCache();
    // 학부모 선택 자녀 영속값 정리 — userId 스코프 키 제거(다음 로그인 사용자와 분리).
    clearSelectedChildStorage(state.user?.id);
    globalLoadAttempted = false;
    hasAttemptedLoad.current = false;
    setState({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      error: null,
    });

    // 2) /login 으로 즉시 이동 — useNavigation 의 startLoading 이 풀스크린 로더 표시
    replace("/login");

    // 3) 서버 로그아웃은 best-effort — 실패해도 사용자는 이미 /login 에 도달
    try {
      await authService.logout();
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        devWarn("[AuthContext] Server logout failed (ignored):", error);
      }
    }
  }, [replace, state.user?.id]);

  /**
   * 사용자 정보 새로고침 — 역할/권한 변경 가능성이 있으므로 메뉴 캐시도 함께 무효화.
   */
  const refreshUser = useCallback(async () => {
    globalLoadAttempted = false;
    hasAttemptedLoad.current = false;
    invalidateAppMenusCache();
    await loadUser(true);
  }, [loadUser]);

  /**
   * 에러 초기화
   */
  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, signup, logout, refreshUser, clearError }),
    [state, login, signup, logout, refreshUser, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Hooks...
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}

export function useRequireAuth(redirectTo: string = "/login") {
  const { isAuthenticated, isLoading } = useAuth();
  const { replace } = useNavigation();
  // useRef로 인증 리다이렉트 중복 방지 (React StrictMode 안전)
  const isRedirectingRef = useRef(false);
  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isRedirectingRef.current) {
      isRedirectingRef.current = true;
      replace(redirectTo);
      setTimeout(() => {
        isRedirectingRef.current = false;
      }, 2000);
    }
  }, [isAuthenticated, isLoading, redirectTo, replace]);
  return { isAuthenticated, isLoading };
}

export function useGuestOnly() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { replace } = useNavigation();
  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      replace(getDashboardPathByUserType(user.userType, "/"));
    }
  }, [isAuthenticated, isLoading, user, replace]);
  return { isAuthenticated, isLoading };
}

export function useRequireRole(allowedRoles: Array<UserType>) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { replace } = useNavigation();
  // useRef로 인증 리다이렉트 중복 방지 (React StrictMode 안전)
  const isRedirectingRef = useRef(false);
  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      if (!isRedirectingRef.current) {
        isRedirectingRef.current = true;
        replace("/login");
        setTimeout(() => {
          isRedirectingRef.current = false;
        }, 2000);
      }
      return;
    }
    if (user && !allowedRoles.includes(user.userType)) {
      replace(getDashboardPathByUserType(user.userType, "/"));
    }
  }, [user, isAuthenticated, isLoading, allowedRoles, replace]);

  return {
    user,
    isLoading,
    isAllowed:
      !isLoading &&
      isAuthenticated &&
      user &&
      allowedRoles.includes(user.userType),
  };
}

export default AuthContext;
