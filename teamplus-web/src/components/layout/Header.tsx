'use client';

import { Icon } from '@/components/ui/Icon';
import { GlobalMenu } from './GlobalMenu';
import { PageAppBar } from './PageAppBar';
import { ReactNode, useState, useCallback } from 'react';
import { useNavigation } from '@/components/ui/NavLink';

/**
 * Header.tsx — BackHeader 전용 thin wrapper (2026-05-07 v4.0)
 *
 * 본 파일은 PageAppBar 통합 후 **BackHeader 만** 유지하기 위한 축소 버전이다.
 * (Header / PageHeader / composeRight 헬퍼는 v3.0 에서 제거 — 호출처 0 또는 PageAppBar 직접 호출로 마이그레이션)
 *
 * BackHeader 가 별도 wrapper 로 유지되는 이유:
 *   - rightAction (ReactNode 자유 JSX) 와 showMenu (햄버거) 를 동시에 노출하는 합성 패턴이
 *     PageAppBar 의 우선순위 규칙(rightAction 명시 시 메뉴 자동 사라짐)과 충돌
 *   - GlobalMenu 자체 마운트 + forceNative=true 디폴트(Flutter WebView MainShellScreen
 *     의 정적 showAppBar:false 환경에서 헤더 사라짐 회귀 차단)
 *   - 사용처 12 건 — 일괄 마이그레이션 시 회귀 위험 높음 → wrapper 유지
 *
 * 신규 코드는 가능한 한 `PageAppBar` 직접 사용 권장. BackHeader 는 위 합성 패턴이
 * 필요한 경우에만 유지.
 */

interface BackHeaderProps {
  title: string;
  onBack?: () => void;
  backHref?: string;
  rightAction?: ReactNode;
  showMenu?: boolean;
  className?: string;
  forceNative?: boolean;
}

export function BackHeader({
  title,
  onBack,
  backHref,
  rightAction,
  showMenu = true,
  className,
  forceNative = true,
}: BackHeaderProps) {
  const { navigate } = useNavigation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleBack = useCallback(() => {
    if (onBack) onBack();
    else if (backHref) navigate(backHref);
  }, [onBack, backHref, navigate]);

  // [2026-05-09] rightAction 명시 시 기존 합성 패턴 유지 (rightAction + 햄버거).
  //   미지정 시 PageAppBar default 변형(= detail 패턴) 의 우측 3 액션
  //   (시계/종/메뉴) 자동 노출 — 모든 BackHeader 사용 페이지가 공통 SoT 적용.
  if (rightAction) {
    const composedRight = (
      <div className="flex items-center gap-1">
        {rightAction}
        {showMenu && (
          <button
            type="button"
            onClick={() => setIsMenuOpen(true)}
            className="flex size-10 -mr-2 items-center justify-center rounded-full text-wtext-1 dark:text-white hover:bg-wline-2 dark:hover:bg-rink-800 transition-colors duration-200 motion-reduce:transition-none active:brightness-95"
            aria-label="전체 메뉴 열기"
            aria-expanded={isMenuOpen}
          >
            <Icon name="menu" className="text-[24px]" aria-hidden="true" />
          </button>
        )}
      </div>
    );
    return (
      <>
        <PageAppBar
          title={title}
          onBack={handleBack}
          rightAction={composedRight}
          showMenu={false}
          forceNative={forceNative}
          className={className}
        />
        {showMenu && <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />}
      </>
    );
  }

  // rightAction 미지정 — PageAppBar default(=detail) 자동 적용 → 시계/종/메뉴 3 액션 노출
  return (
    <PageAppBar
      title={title}
      onBack={handleBack}
      showMenu={showMenu}
      forceNative={forceNative}
      className={className}
    />
  );
}
