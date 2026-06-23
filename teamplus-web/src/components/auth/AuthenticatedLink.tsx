/**
 * <AuthenticatedLink /> — 인증된 사용자만 이동 가능한 공통 링크
 *
 * 어떤 화면에서든 "로그인 필요" 가드가 들어가는 버튼/링크를 한 줄로 처리합니다.
 *
 * 기능:
 * - state(`useAuth`) + storage(`hybridAuth.getToken`) 이중 검증
 * - 인증됨 → NavLink 와 동일한 spinner-routing 으로 이동
 * - 미인증/토큰 비어있음 → modal.alert → /login?redirect={href} 자동 이동
 * - 로그인 성공 후 원래 경로(href) 로 복귀 (login page 의 redirect 처리)
 *
 * @example
 *   <AuthenticatedLink
 *     href="/qr-scan"
 *     className="..."
 *     ariaLabel="QR 출석하기"
 *   >
 *     <Icon name="qr_code_scanner" />
 *     <span>출석하기</span>
 *   </AuthenticatedLink>
 */

'use client';

import { ReactNode, useCallback } from 'react';
import { useNavigation } from '@/components/ui/NavLink';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { useModal } from '@/components/ui/Modal/ModalContext';
import { hybridAuth } from '@/services/hybrid-auth';
import { MESSAGES } from '@/lib/messages';

export interface AuthenticatedLinkProps {
  /** 이동할 경로 (인증 통과 시) */
  href: string;
  /** 버튼 내용 (icon, text 등) */
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  /** 미인증 다이얼로그 제목 (기본: MESSAGES.authGuard.required) */
  guardTitle?: string;
  /** 미인증 다이얼로그 본문 (기본: MESSAGES.authGuard.loginRequiredForAction) */
  guardMessage?: string;
  /** 추가 onClick (인증 통과 후 navigate 직전 호출). false 반환 시 이동 취소 */
  onBeforeNavigate?: () => boolean | Promise<boolean>;
  /** 비활성 상태 */
  disabled?: boolean;
}

export function AuthenticatedLink({
  href,
  children,
  className,
  ariaLabel,
  guardTitle,
  guardMessage,
  onBeforeNavigate,
  disabled = false,
}: AuthenticatedLinkProps) {
  const { isAuthenticated, redirectToLogin } = useAuthGuard();
  const { navigate } = useNavigation();
  const { modal } = useModal();

  const handleClick = useCallback(async () => {
    if (disabled) return;

    // state + storage 이중 검증 (DevTools 토큰 삭제 등 캐시 불일치 대응)
    const tokenInfo = await hybridAuth.getToken();
    const hasToken = Boolean(tokenInfo?.accessToken);

    if (isAuthenticated && hasToken) {
      if (onBeforeNavigate) {
        const ok = await onBeforeNavigate();
        if (!ok) return;
      }
      navigate(href);
      return;
    }

    // 미인증 또는 토큰 사라짐 — 알럿 후 로그인 화면 (returnTo = href)
    await modal.alert({
      variant: 'warning',
      icon: 'lock',
      title: guardTitle ?? MESSAGES.authGuard.required,
      message: guardMessage ?? MESSAGES.authGuard.loginRequiredForAction,
      buttonText: '로그인 하기',
    });
    redirectToLogin(href);
  }, [
    disabled,
    isAuthenticated,
    onBeforeNavigate,
    navigate,
    href,
    modal,
    guardTitle,
    guardMessage,
    redirectToLogin,
  ]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={className}
      aria-label={ariaLabel}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export default AuthenticatedLink;
