/**
 * <AuthRequired /> — 컴포넌트 가드 (Admin)
 *
 * @example
 *   <AuthRequired>
 *     <SecretContent />
 *   </AuthRequired>
 */

'use client';

import { ReactNode, useEffect, useRef } from 'react';
import useAuthGuard from '../../hooks/useAuthGuard';
import { MESSAGES } from '../../lib/messages';

interface AuthRequiredProps {
  children: ReactNode;
  loadingFallback?: ReactNode;
  fallback?: ReactNode;
  redirect?: boolean;
  returnTo?: string;
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
  const { isAuthenticated, requireLogin } = useAuthGuard();
  const triggeredRef = useRef(false);

  useEffect(() => {
    if (isAuthenticated) return;
    if (triggeredRef.current) return;
    if (!redirect) return;

    triggeredRef.current = true;
    requireLogin({
      message: message ?? MESSAGES.authGuard.loginRequiredForAction,
      returnTo,
    });
  }, [isAuthenticated, redirect, requireLogin, message, returnTo]);

  if (!isAuthenticated) {
    return <>{loadingFallback ?? fallback}</>;
  }
  return <>{children}</>;
}

export default AuthRequired;
