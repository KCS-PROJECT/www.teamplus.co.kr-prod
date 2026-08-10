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
  /**
   * [R3-01] 히스토리 기록 방식 (기본 'push').
   * 'replace' = 현재 히스토리 층을 교체 — 이전글/다음글처럼 **같은 화면 안에서 항목만
   * 바꿔가는 이동**에 사용한다. push 로 쌓으면 뒤로가기가 방문 항목을 전부 되짚게 된다.
   * 실제 `<a href>` 시맨틱(새 탭·링크 복사·스크린 리더 link 역할)은 그대로 유지되며,
   * 일반 무수정 좌클릭만 replace 로 위임되고 수정키·비주 클릭은 네이티브 링크 동작을 따른다.
   */
  historyMode?: 'push' | 'replace';
}

export const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(
  (
    {
      href,
      children,
      showSpinner = true,
      onClick,
      target,
      historyMode = 'push',
      ...props
    },
    ref
  ) => {
    const pathname = usePathname();
    // useNavigation 으로 네비게이션 통합 — startLoading + 인증 가드 + 쿠키 정리 + router.push 가
    // 단일 모듈에서 일관 처리되도록 한다 (`@/hooks/useNavigation` 가 SoT).
    const { navigate, replace } = useNavigationHook();

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

        // [R3-01] 수정키·비주 클릭은 네이티브 링크 동작에 맡긴다 — 새 탭(Ctrl/Cmd)만이 아니라
        // 새 창(Shift)·브라우저 기본(Alt)·휠 클릭(button!==0)도 가로채면 안 된다.
        // (기존 가드는 Ctrl/Cmd 만 제외해 Shift/Alt 클릭이 같은 탭 push 로 잡히던 결함 동반 수정)
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;

        // 기본 Link 동작 막고 useNavigation 으로 위임 (인증 가드/쿠키 정리/스피너 일괄 처리)
        e.preventDefault();
        // v18 (2026-05-22): message 인자 전달 금지. LoadingPuck 은 단일 그래픽만 표시.
        if (historyMode === 'replace') {
          await replace(hrefString, { showSpinner });
        } else {
          await navigate(hrefString, { showSpinner });
        }
      },
      [onClick, target, isCurrentPage, showSpinner, hrefString, historyMode, navigate, replace]
    );

    return (
      <Link
        ref={ref}
        href={href}
        onClick={handleClick}
        target={target}
        // JS 인터셉트가 닿지 않는 경로(예: 스크립트 미로딩)에서도 히스토리 계약이 유지되도록
        // next/link 네이티브 동작에도 동일 모드를 전달한다.
        replace={historyMode === 'replace'}
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
