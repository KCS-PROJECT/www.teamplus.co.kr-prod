/**
 * useAuthGuard Hook (공통 인증 가드 + API 호출 래퍼)
 *
 * Web/Admin/App 3개 플랫폼이 동일한 시그니처로 사용하는 공통 훅.
 *
 * 기능:
 * 1. `isAuthenticated` 즉시 판별
 * 2. `requireLogin()` — 미로그인 시 알림 + 로그인 화면 이동 + returnTo 저장
 * 3. `callApi()` — 전처리(가드) → API 호출 → 후처리(현재 bypass, 향후 확장)
 *
 * @example
 *   const { isAuthenticated, requireLogin, callApi } = useAuthGuard();
 *
 *   // 단순 가드
 *   if (!requireLogin()) return;
 *
 *   // API 호출 (가드 + 전/후처리 자동)
 *   const data = await callApi(() => api.get<MyData>('/some-endpoint'));
 */

'use client';

import { useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigation } from '@/components/ui/NavLink';
import { useToast } from '@/components/ui/Toast';
import { MESSAGES } from '@/lib/messages';

const LOGIN_PATH = '/login';

export interface RequireLoginOptions {
  /** 미로그인 시 알림 메시지 (기본: MESSAGES.authGuard.required) */
  message?: string;
  /** 로그인 후 돌아올 경로 (기본: 현재 pathname + search) */
  returnTo?: string;
  /** 알림 표시 여부 (기본: true) */
  showToast?: boolean;
  /** 로그인 화면 자동 이동 여부 (기본: true) */
  navigate?: boolean;
}

/**
 * API 호출 전후처리 옵션
 *
 * NOTE: `onAfter` 는 현재 bypass(no-op) 형태로 호출되며, 향후 분석/로깅·캐시 갱신·
 * 메트릭 수집 등 공통 후처리를 추가할 때 단일 진입점이 된다.
 */
export interface CallApiOptions<T> {
  /** 호출 전 추가 가드 (false 반환 시 호출 자체를 skip — null 반환) */
  onBefore?: () => boolean | Promise<boolean>;
  /** 호출 후 후처리 — 결과 변환·로깅·캐시 무효화 등 */
  onAfter?: (result: T) => void | Promise<void>;
  /** 에러 후처리 — 토스트는 자동 표시되지 않으므로 필요 시 직접 처리 */
  onError?: (error: unknown) => void | Promise<void>;
  /** 미로그인 가드 메시지 옵션 */
  guard?: RequireLoginOptions;
  /** 미인증이어도 호출 허용 (Public API용) */
  skipAuth?: boolean;
}

export interface UseAuthGuardResult {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: ReturnType<typeof useAuth>['user'];
  /** 로그인 여부 즉시 확인. 미로그인 시 알림+이동, true/false 반환 */
  requireLogin: (options?: RequireLoginOptions) => boolean;
  /**
   * API 호출 공통 래퍼 (전처리 → 가드 → 호출 → 후처리)
   * - 미로그인 시 null 반환 (호출 안 됨)
   * - 정상 호출 시 결과 반환
   * - 에러 발생 시 throw (onError 가 있으면 호출 후 throw)
   */
  callApi: <T>(
    fn: () => Promise<T>,
    options?: CallApiOptions<T>,
  ) => Promise<T | null>;
  /** 로그인 화면으로 직접 이동 (returnTo 자동 부착) */
  redirectToLogin: (returnTo?: string) => void;
}

function buildLoginUrl(returnTo: string | undefined): string {
  if (!returnTo) return LOGIN_PATH;
  const sep = LOGIN_PATH.includes('?') ? '&' : '?';
  return `${LOGIN_PATH}${sep}redirect=${encodeURIComponent(returnTo)}`;
}

export function useAuthGuard(): UseAuthGuardResult {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { navigate } = useNavigation();
  const { toast } = useToast();
  const pathname = usePathname();

  const buildCurrentReturnTo = useCallback((): string => {
    if (typeof window === 'undefined') return pathname || '/';
    const search = window.location.search;
    return `${pathname || '/'}${search}`;
  }, [pathname]);

  const redirectToLogin = useCallback(
    (returnTo?: string) => {
      // 공개 진입점(/signup, /identity, /onboarding, /splash, /)에서는
      // 로그인 가드가 호출돼도 /login 으로 이동하지 않는다. 회원가입 도중
      // 백그라운드 가드 발동으로 입력 폼이 통째로 날아가는 회귀 방지.
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
      const target = returnTo ?? buildCurrentReturnTo();
      navigate(buildLoginUrl(target));
    },
    [buildCurrentReturnTo, navigate],
  );

  const requireLogin = useCallback(
    (options: RequireLoginOptions = {}): boolean => {
      if (isAuthenticated) return true;

      const {
        message = MESSAGES.authGuard.required,
        returnTo,
        showToast = true,
        navigate: shouldNavigate = true,
      } = options;

      if (showToast) {
        toast.warning(message, {
          description: MESSAGES.authGuard.requiredDescription,
          duration: 2500,
        });
      }
      if (shouldNavigate) {
        redirectToLogin(returnTo);
      }
      return false;
    },
    [isAuthenticated, redirectToLogin, toast],
  );

  const callApi = useCallback(
    async <T>(
      fn: () => Promise<T>,
      options: CallApiOptions<T> = {},
    ): Promise<T | null> => {
      const { onBefore, onAfter, onError, guard, skipAuth = false } = options;

      // 0) 추가 사용자 정의 전처리
      if (onBefore) {
        const ok = await onBefore();
        if (!ok) return null;
      }

      // 1) 인증 가드 (skipAuth 가 아닌 경우)
      if (!skipAuth && !requireLogin(guard)) {
        return null;
      }

      // 2) 실제 API 호출
      let result: T;
      try {
        result = await fn();
      } catch (e) {
        if (onError) {
          await onError(e);
        }
        throw e;
      }

      // 3) 후처리 (현재 단순 위임 — bypass. 향후 공통 후처리 추가 지점)
      if (onAfter) {
        await onAfter(result);
      }

      return result;
    },
    [requireLogin],
  );

  return {
    isAuthenticated,
    isLoading,
    user,
    requireLogin,
    callApi,
    redirectToLogin,
  };
}

export default useAuthGuard;
