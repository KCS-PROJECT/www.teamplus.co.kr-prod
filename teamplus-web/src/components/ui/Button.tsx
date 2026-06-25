'use client';

import { cn } from '@/lib/utils';
import { ButtonHTMLAttributes, forwardRef } from 'react';
import { Spinner, type SpinnerProps } from './Spinner';

// ButtonBase - 간단한 버튼 래퍼 컴포넌트
const ButtonBase = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement>
>(({ children, ...props }, ref) => {
  return (
    <button type="button" ref={ref} {...props}>
      {children}
    </button>
  );
});
ButtonBase.displayName = 'ButtonBase';

/**
 * Button Component - TEAMPLUS Design System
 * Design 7 Principles Applied:
 * - No gradients, solid colors only
 * - No backdrop-blur
 * - Human-made design feel
 *
 * Flicker Prevention:
 * - Loading state uses opacity transition instead of DOM structure change
 * - No scale transform (uses brightness instead)
 */

// Button Variant 타입 정의
type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';

// Spinner 색상 매핑 (타입 안전성 확보)
const SPINNER_COLOR_MAP: Record<ButtonVariant, SpinnerProps['color']> = {
  primary: 'white',
  secondary: 'primary',
  outline: 'primary',
  ghost: 'primary',
  danger: 'white',
  success: 'white',
} as const;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  loading?: boolean;
  /** ICETIMES 시안 스킨(하우머치 스타일). false(기본)면 기존 디자인 1:1 보존. */
  iceTheme?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      fullWidth = false,
      loading = false,
      iceTheme = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles = cn(
      'relative inline-flex items-center justify-center',
      'font-semibold rounded-lg',
      'transition-colors duration-200',
      'focus:outline-none focus:ring-2 focus:ring-offset-2 focus-visible-disabled',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      // active:scale 대신 brightness로 피드백 제공 (깜박임 방지)
      'active:brightness-95'
    );

    // ── ICETIMES 시안(하우머치 스타일) ──────────────────────────────
    // primary=it-blue-500 / secondary=outline(it-blue-600 + it-line-strong)
    // lg=h54/16px, md=h48/15px. radius 12px(rounded-w-md).
    const iceBase = cn(
      'relative inline-flex items-center justify-center gap-2',
      'font-bold tracking-tight rounded-w-md',
      'transition-[filter] duration-150',
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 focus-visible:ring-offset-2 focus-visible-disabled',
      'disabled:opacity-[0.42] disabled:cursor-not-allowed',
      'active:brightness-95'
    );

    const iceVariants: Record<ButtonVariant, string> = {
      primary: cn('bg-it-blue-500 text-white', 'hover:brightness-110'),
      secondary: cn(
        'bg-transparent text-it-blue-600 dark:text-it-blue-300 border-[1.5px] border-it-line-strong dark:border-it-ink-700',
        'hover:bg-it-fill dark:hover:bg-it-ink-800'
      ),
      outline: cn(
        'bg-transparent text-it-blue-600 dark:text-it-blue-300 border-[1.5px] border-it-blue-500',
        'hover:bg-it-blue-500/5'
      ),
      ghost: cn('bg-transparent text-it-ink-600 dark:text-it-ink-200', 'hover:bg-it-fill dark:hover:bg-it-ink-800'),
      danger: cn('bg-it-red-500 text-white', 'hover:brightness-110'),
      success: cn('bg-success text-white', 'hover:brightness-110'),
    };

    const iceSizes = {
      sm: 'px-3.5 h-[38px] text-w-small min-h-[38px]', // 38px
      md: 'px-[18px] h-12 text-[15px] min-h-[48px]', // 48px
      lg: 'px-[22px] h-[54px] text-base min-h-[54px]', // 54px
    };

    const variants = {
      primary: cn(
        'bg-ice-500 text-white',
        'hover:bg-ice-700',
        'focus:ring-ice-500/50'
      ),
      secondary: cn(
        'bg-wline-2 text-wtext-1',
        'hover:bg-wline',
        'dark:bg-rink-700 dark:text-white',
        'dark:hover:bg-rink-500',
        'focus:ring-ice-500/30'
      ),
      outline: cn(
        'border-2 border-ice-500 text-ice-500',
        'hover:bg-ice-500/5',
        'dark:border-ice-500-light dark:text-ice-500-light',
        'dark:hover:bg-ice-500/10',
        'focus:ring-ice-500/50'
      ),
      ghost: cn(
        'text-wtext-2 dark:text-rink-100',
        'hover:bg-wline-2 dark:hover:bg-rink-800',
        'focus:ring-ice-500/30'
      ),
      danger: cn(
        'bg-error text-white',
        'hover:bg-red-700',
        'focus:ring-error/50'
      ),
      success: cn(
        'bg-success text-white',
        'hover:bg-green-700',
        'focus:ring-success/50'
      ),
    };

    // WCAG 2.1 AAA: 최소 44px 터치 타겟 확보
    const sizes = {
      sm: 'px-4 h-11 text-sm min-h-[44px]', // 44px height
      md: 'px-5 h-12 text-sm min-h-[48px]', // 48px height
      lg: 'px-6 h-14 text-base min-h-[56px]', // 56px height
    };

    return (
      <ButtonBase
        ref={ref}
        className={cn(
          iceTheme ? iceBase : baseStyles,
          iceTheme ? iceVariants[variant] : variants[variant],
          iceTheme ? iceSizes[size] : sizes[size],
          fullWidth && 'w-full',
          className
        )}
        disabled={disabled || loading}
        {...props}
      >
        {/* 로딩 스피너 - 항상 존재하되 loading일 때만 표시 (깜박임 방지) */}
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center gap-2 transition-opacity duration-150",
            loading ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
          aria-hidden={!loading}
        >
          <Spinner size="xs" color={SPINNER_COLOR_MAP[variant]} />
          <span>로딩 중...</span>
        </span>

        {/* 기존 children - loading일 때 숨김 (깜박임 방지) */}
        <span
          className={cn(
            "transition-opacity duration-150",
            loading ? "opacity-0 invisible" : "opacity-100"
          )}
        >
          {children}
        </span>
      </ButtonBase>
    );
  }
);

Button.displayName = 'Button';

/**
 * IconButton Component - TEAMPLUS Design System
 * For circular icon-only buttons (notifications, close, settings)
 */
interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      className,
      variant = 'default',
      size = 'md',
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles = cn(
      'inline-flex items-center justify-center rounded-full',
      'transition-colors duration-200',
      'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ice-500/50 focus-visible-disabled',
      // active:scale 대신 brightness로 피드백 제공 (깜박임 방지)
      'active:brightness-95'
    );

    const variants = {
      default: cn(
        'bg-wline-2 text-wtext-2',
        'hover:bg-wline',
        'dark:bg-rink-800 dark:text-rink-100',
        'dark:hover:bg-rink-700'
      ),
      ghost: cn(
        'text-wtext-2 dark:text-rink-300',
        'hover:bg-wline-2 dark:hover:bg-rink-800'
      ),
      outline: cn(
        'border border-wline text-wtext-2',
        'hover:bg-wbg',
        'dark:border-rink-700 dark:text-rink-100',
        'dark:hover:bg-rink-800'
      ),
    };

    // WCAG 2.1 AAA: 최소 44px 터치 타겟 확보
    const sizes = {
      sm: 'w-11 h-11', // 44px - WCAG minimum
      md: 'w-12 h-12', // 48px
      lg: 'w-14 h-14', // 56px
    };

    return (
      <ButtonBase
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {children}
      </ButtonBase>
    );
  }
);

IconButton.displayName = 'IconButton';

/**
 * Floating Action Button - TEAMPLUS Design System
 * For primary floating actions (QR scan, add, etc.)
 */
interface FabProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'md' | 'lg';
  variant?: 'primary' | 'secondary';
}

export const Fab = forwardRef<HTMLButtonElement, FabProps>(
  ({ className, size = 'lg', variant = 'primary', children, ...props }, ref) => {
    const sizes = {
      md: 'w-12 h-12',
      lg: 'w-14 h-14',
    };

    const variants = {
      primary: cn(
        'bg-ice-500 text-white',
        'hover:bg-ice-700',
        'focus:ring-ice-500/30'
      ),
      secondary: cn(
        'bg-white text-ice-500 border border-wline',
        'hover:bg-wbg',
        'dark:bg-rink-800 dark:text-ice-500-light dark:border-rink-700',
        'focus:ring-ice-500/30/30'
      ),
    };

    return (
      <ButtonBase
        ref={ref}
        className={cn(
          'rounded-full shadow-md',
          'flex items-center justify-center',
          'transition-all duration-200',
          'hover:shadow-md',
          // active:scale 대신 brightness로 피드백 제공 (깜박임 방지)
          'active:brightness-95',
          'focus:outline-none focus:ring-4 focus-visible-disabled',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {children}
      </ButtonBase>
    );
  }
);

Fab.displayName = 'Fab';

/**
 * QuickActionButton Component - TEAMPLUS Design System
 * For dashboard quick action grid (수업 결제, 출석 내역, etc.)
 */
interface QuickActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  label: string;
  iconBgColor?: string;
  hasNotification?: boolean;
}

export const QuickActionButton = forwardRef<HTMLButtonElement, QuickActionButtonProps>(
  (
    {
      className,
      icon,
      label,
      iconBgColor = 'bg-blue-50',
      hasNotification = false,
      ...props
    },
    ref
  ) => {
    return (
      <ButtonBase
        ref={ref}
        className={cn(
          'flex flex-col items-center justify-center p-5',
          'bg-white dark:bg-rink-800',
          'rounded-xl border border-wline-2 dark:border-rink-700',
          'shadow-card hover:shadow-card-hover',
          'hover:border-ice-500/20',
          'transition-all duration-200',
          // active:scale 대신 brightness로 피드백 제공 (깜박임 방지)
          'active:brightness-95',
          className
        )}
        {...props}
      >
        <div className={cn(
          'w-12 h-12 rounded-full flex items-center justify-center mb-3',
          iconBgColor
        )}>
          {icon}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-wtext-1 dark:text-white font-semibold text-sm">
            {label}
          </span>
          {hasNotification && (
            <span className="w-1.5 h-1.5 rounded-full bg-error" />
          )}
        </div>
      </ButtonBase>
    );
  }
);

QuickActionButton.displayName = 'QuickActionButton';
