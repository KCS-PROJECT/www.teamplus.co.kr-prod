/**
 * <AuthRequired /> — 컴포넌트 가드
 *
 * 인증이 필요한 영역을 감싸면, 미인증 시 fallback 또는 자동 로그인 페이지 이동.
 *
 * @example
 *   <AuthRequired>
 *     <SecretContent />
 *   </AuthRequired>
 *
 *   // 미인증 시 메시지만 표시 (이동 안 함)
 *   <AuthRequired redirect={false} fallback={<LoginPrompt />}>
 *     <SecretContent />
 *   </AuthRequired>
 */

'use client';

import { ReactNode, useEffect, useRef } from 'react';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { MESSAGES } from '@/lib/messages';

interface AuthRequiredProps {
  children: ReactNode;
  /** 로딩 중 표시 (기본: 빈 div) */
  loadingFallback?: ReactNode;
  /** 미인증 시 표시 (redirect=false 일 때만 의미 있음) */
  fallback?: ReactNode;
  /** 미인증 시 자동 로그인 화면 이동 (기본 true) */
  redirect?: boolean;
  /** 로그인 후 돌아올 경로 (기본: 현재 경로) */
  returnTo?: string;
  /** 알림 메시지 (기본: MESSAGES.authGuard.required) */
  message?: string;
}

export function AuthRequired({
  children,
  loadingFallback,
  fallback = null,
  redirect = true,
  returnTo,
  message,
}: AuthRequiredProps) {
  const { isAuthenticated, isLoading, requireLogin } = useAuthGuard();
  const triggeredRef = useRef(false);

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) return;
    if (triggeredRef.current) return;
    if (!redirect) return;

    triggeredRef.current = true;
    requireLogin({
      message: message ?? MESSAGES.authGuard.loginRequiredForAction,
      returnTo,
    });
  }, [isAuthenticated, isLoading, redirect, requireLogin, message, returnTo]);

  if (isLoading) {
    return <>{loadingFallback ?? <div className="min-h-[120px]" aria-hidden />}</>;
  }
  if (!isAuthenticated) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
}

export default AuthRequired;
