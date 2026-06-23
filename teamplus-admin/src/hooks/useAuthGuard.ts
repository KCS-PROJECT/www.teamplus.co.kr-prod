/**
 * useAuthGuard Hook (Admin · Web 와 동일 시그니처)
 *
 * 기능:
 * 1. `isAuthenticated` 즉시 판별
 * 2. `requireLogin()` — 미로그인 시 알림 + 로그인 화면 이동 + redirect 부착
 * 3. `callApi()` — 전처리(가드) → API 호출 → 후처리(현재 bypass)
 *
 * Admin 은 ToastProvider 가 없으므로 기본 알림은 `window.alert` 사용.
 * 사용자 정의 notifier 를 옵션으로 주입할 수 있다.
 *
 * @example
 *   const { isAuthenticated, requireLogin, callApi } = useAuthGuard();
 *   if (!requireLogin()) return;
 *   const data = await callApi(() => api.get<MyData>('/some-endpoint'));
 */

'use client';

import { useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { isAuthenticated as authIsAuthenticated, getCurrentUser } from '../services/auth.service';
import type { User } from '../types';
import { MESSAGES } from '../lib/messages';

const LOGIN_PATH = '/login';

export interface RequireLoginOptions {
  message?: string;
  returnTo?: string;
  showToast?: boolean;
  navigate?: boolean;
  /** 사용자 정의 알림 함수 (Admin 은 Toast 시스템이 없어 기본은 window.alert) */
  notifier?: (message: string) => void;
}

export interface CallApiOptions<T> {
  onBefore?: () => boolean | Promise<boolean>;
  onAfter?: (result: T) => void | Promise<void>;
  onError?: (error: unknown) => void | Promise<void>;
  guard?: RequireLoginOptions;
  skipAuth?: boolean;
}

export interface UseAuthGuardResult {
  isAuthenticated: boolean;
  user: User | null;
  requireLogin: (options?: RequireLoginOptions) => boolean;
  callApi: <T>(
    fn: () => Promise<T>,
    options?: CallApiOptions<T>,
  ) => Promise<T | null>;
  redirectToLogin: (returnTo?: string) => void;
}

function buildLoginUrl(returnTo: string | undefined): string {
  if (!returnTo) return LOGIN_PATH;
  const sep = LOGIN_PATH.includes('?') ? '&' : '?';
  return `${LOGIN_PATH}${sep}redirect=${encodeURIComponent(returnTo)}`;
}

function defaultNotifier(message: string): void {
  if (typeof window !== 'undefined') {
    // Admin 에는 Toast 시스템이 없어 기본은 alert. 호출부에서 오버라이드 가능.
    window.alert(message);
  }
}

export function useAuthGuard(): UseAuthGuardResult {
  const router = useRouter();
  const pathname = usePathname();

  const isAuthed = authIsAuthenticated();
  const user = getCurrentUser();

  const buildCurrentReturnTo = useCallback((): string => {
    if (typeof window === 'undefined') return pathname || '/';
    return `${pathname || '/'}${window.location.search}`;
  }, [pathname]);

  const redirectToLogin = useCallback(
    (returnTo?: string) => {
      const target = returnTo ?? buildCurrentReturnTo();
      router.push(buildLoginUrl(target));
    },
    [buildCurrentReturnTo, router],
  );

  const requireLogin = useCallback(
    (options: RequireLoginOptions = {}): boolean => {
      if (isAuthed) return true;

      const {
        message = MESSAGES.authGuard.required,
        returnTo,
        showToast = true,
        navigate: shouldNavigate = true,
        notifier = defaultNotifier,
      } = options;

      if (showToast) {
        notifier(message);
      }
      if (shouldNavigate) {
        redirectToLogin(returnTo);
      }
      return false;
    },
    [isAuthed, redirectToLogin],
  );

  const callApi = useCallback(
    async <T>(
      fn: () => Promise<T>,
      options: CallApiOptions<T> = {},
    ): Promise<T | null> => {
      const { onBefore, onAfter, onError, guard, skipAuth = false } = options;

      if (onBefore) {
        const ok = await onBefore();
        if (!ok) return null;
      }

      if (!skipAuth && !requireLogin(guard)) {
        return null;
      }

      let result: T;
      try {
        result = await fn();
      } catch (e) {
        if (onError) {
          await onError(e);
        }
        throw e;
      }

      // 후처리 (현재 bypass — 향후 공통 후처리 추가 지점)
      if (onAfter) {
        await onAfter(result);
      }

      return result;
    },
    [requireLogin],
  );

  return {
    isAuthenticated: isAuthed,
    user,
    requireLogin,
    callApi,
    redirectToLogin,
  };
}

export default useAuthGuard;
