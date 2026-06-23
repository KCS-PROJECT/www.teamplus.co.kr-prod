'use client';

import { memo, forwardRef } from 'react';
import { NavLink } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

/**
 * ChildBigButton - WCAG AAA 대형 터치 버튼 (72x72dp 최소)
 *
 * 아동(4-7세) 접근성: min-h-[72px], text-lg+, font-bold, rounded-2xl
 * 7:1 대비율 충족하는 솔리드 배경색 사용
 *
 * 사용처: 모든 child 페이지의 주요 CTA 버튼
 */

type ChildBigButtonVariant = 'primary' | 'amber' | 'green' | 'orange' | 'outline';

const VARIANT_STYLES: Record<ChildBigButtonVariant, string> = {
  primary:
    'bg-ice-500 hover:bg-ice-700 text-white',
  amber:
    'bg-amber-500 hover:bg-amber-600 text-white',
  green:
    'bg-green-500 hover:bg-green-600 text-white',
  orange:
    'bg-orange-500 hover:bg-orange-600 text-white',
  outline:
    'bg-white dark:bg-rink-800 border-2 border-wline dark:border-rink-700 text-wtext-2 dark:text-rink-100 hover:bg-wbg dark:hover:bg-rink-700',
};

interface ChildBigButtonBaseProps {
  /** 버튼 텍스트 */
  children: React.ReactNode;
  /** 버튼 스타일 변형 */
  variant?: ChildBigButtonVariant;
  /** Material Symbols 아이콘 이름 */
  icon?: string;
  /** 전체 너비 여부 */
  fullWidth?: boolean;
  /** 비활성화 */
  disabled?: boolean;
  /** 추가 className */
  className?: string;
  /** 접근성 라벨 */
  'aria-label'?: string;
}

interface ChildBigButtonAsButton extends ChildBigButtonBaseProps {
  /** 링크 대상 없으면 button */
  href?: never;
  /** 클릭 핸들러 */
  onClick?: () => void;
}

interface ChildBigButtonAsLink extends ChildBigButtonBaseProps {
  /** 링크 대상 */
  href: string;
  onClick?: never;
}

type ChildBigButtonProps = ChildBigButtonAsButton | ChildBigButtonAsLink;

export const ChildBigButton = memo(
  forwardRef<HTMLButtonElement | HTMLAnchorElement, ChildBigButtonProps>(
    function ChildBigButton(
      {
        children,
        variant = 'primary',
        icon,
        fullWidth = true,
        disabled = false,
        className = '',
        href,
        onClick,
        'aria-label': ariaLabel,
      },
      ref,
    ) {
      const baseClass = cn(
        'min-h-[72px] text-card-title-child font-bold rounded-2xl',
        'flex items-center justify-center gap-2',
        'active:brightness-95 transition-colors',
        VARIANT_STYLES[variant],
        fullWidth && 'w-full',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      );

      const content = (
        <>
          {icon && (
            <Icon
              name={icon}
              className="text-2xl"
              aria-hidden="true"
            />
          )}
          <span>{children}</span>
        </>
      );

      if (href && !disabled) {
        return (
          <NavLink
            ref={ref as React.Ref<HTMLAnchorElement>}
            href={href}
            className={baseClass}
            aria-label={ariaLabel}
          >
            {content}
          </NavLink>
        );
      }

      return (
        <button
          ref={ref as React.Ref<HTMLButtonElement>}
          type="button"
          onClick={onClick}
          disabled={disabled}
          className={baseClass}
          aria-label={ariaLabel}
        >
          {content}
        </button>
      );
    },
  ),
);
