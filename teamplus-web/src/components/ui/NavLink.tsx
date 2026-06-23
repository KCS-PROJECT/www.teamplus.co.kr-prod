'use client';

import Link, { LinkProps } from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, forwardRef, ReactNode, MouseEvent, AnchorHTMLAttributes } from 'react';
import {
  useNavigation as useNavigationHook,
  type NavigateOptions,
  type UseNavigationReturn,
} from '@/hooks/useNavigation';

/**
 * NavLink Component - TEAMPLUS Design System
 *
 * Next.js Link를 감싸서 페이지 이동 시 자동으로 스피너를 표시합니다.
 *
 * 기능:
 * 1. 클릭 시 전체 화면 스피너 표시
 * 2. 현재 페이지 클릭 시 스피너 미표시
 * 3. 새 탭(target="_blank") 클릭 시 스피너 미표시
 * 4. pathname 변경 시 자동으로 스피너 해제 (LoadingContext)
 *
 * @example
 * // 기본 사용
 * <NavLink href="/dashboard">대시보드</NavLink>
 *
 * // 커스텀 로딩 메시지
 * <NavLink href="/profile" loadingMessage="프로필 로딩 중...">
 *   프로필
 * </NavLink>
 *
 * // 스피너 비활성화
 * <NavLink href="/external" showSpinner={false}>외부 링크</NavLink>
 */

interface NavLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps>, LinkProps {
  children: ReactNode;
  /** 스피너 표시 여부 (기본값: true) */
  showSpinner?: boolean;
  /**
   * (deprecated · v18 2026-05-22) — LoadingPuck 은 텍스트를 렌더하지 않으므로
   * 이 prop 은 무시됩니다. 단일 fullsize 팝업 정책 유지를 위해 시각적으로 영향 없음.
   */
  loadingMessage?: string;
}

export const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(
  (
    {
      href,
      children,
      showSpinner = true,
      onClick,
      target,
      ...props
    },
    ref
  ) => {
    const pathname = usePathname();
    // useNavigation 으로 네비게이션 통합 — startLoading + 인증 가드 + 쿠키 정리 + router.push 가
    // 단일 모듈에서 일관 처리되도록 한다 (`@/hooks/useNavigation` 가 SoT).
    const { navigate } = useNavigationHook();

    // href를 문자열로 변환
    const hrefString = typeof href === 'string' ? href : href.pathname || '';

    // 현재 페이지인지 확인
    const isCurrentPage = pathname === hrefString || pathname?.startsWith(hrefString + '/');

    const handleClick = useCallback(
      async (e: MouseEvent<HTMLAnchorElement>) => {
        // 기존 onClick 핸들러 호출
        onClick?.(e);

        // 이미 기본 동작이 막혔으면 스피너 표시 안함
        if (e.defaultPrevented) return;

        // 새 탭에서 열기면 스피너 표시 안함
        if (target === '_blank') return;

        // 현재 페이지면 스피너 표시 안함
        if (isCurrentPage) return;

        // Ctrl/Cmd 클릭 (새 탭)이면 스피너 표시 안함
        if (e.ctrlKey || e.metaKey || e.button !== 0) return;

        // 기본 Link 동작 막고 useNavigation 으로 위임 (인증 가드/쿠키 정리/스피너 일괄 처리)
        e.preventDefault();
        // v18 (2026-05-22): message 인자 전달 금지. LoadingPuck 은 단일 그래픽만 표시.
        await navigate(hrefString, { showSpinner });
      },
      [onClick, target, isCurrentPage, showSpinner, hrefString, navigate]
    );

    return (
      <Link
        ref={ref}
        href={href}
        onClick={handleClick}
        target={target}
        scroll={false} // position: sticky/fixed 요소와의 충돌 방지 (깜박임 해결)
        {...props}
      >
        {children}
      </Link>
    );
  }
);

NavLink.displayName = 'NavLink';

/**
 * useNavigation re-export — 하위 호환.
 *
 * **신규 코드는 `@/hooks/useNavigation` 에서 직접 import 권장.**
 * NavLink import 경로를 통한 useNavigation 호출은 기존 사용처 호환성을 위해 유지된다.
 */
export const useNavigation = useNavigationHook;
export type { NavigateOptions, UseNavigationReturn };

export default NavLink;
